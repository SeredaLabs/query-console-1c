import type { QueryModel, SelectedField, SelectedTable } from './queryModel';
import type { MetadataResolver } from './metadataResolver';
import type { MetaTable } from '../metadata/types';
import { resolveFieldPath } from './fieldPathResolver';

/**
 * Суффикс `.*` («использовать дочерние») в блоках построителя `{ВЫБРАТЬ}`/`{ГДЕ}`/
 * `{УПОРЯДОЧИТЬ}`/`{ИТОГИ}` конструктор 1С сохраняет, пока поле может быть ссылкой
 * на объект (чьи реквизиты разворачивает СКД). Суффикс ОТБРАСЫВАЕТСЯ, когда поле
 * заведомо НЕ ссылочное.
 *
 * Поведение подтверждено живым оракулом (mcp validate_query):
 *  - `Т.Ссылка.* КАК А` (Ссылка — ссылочное) — `.*` СОХРАНЯЕТСЯ (с псевдонимом и
 *    без; и в `{ВЫБРАТЬ}`, и в `{ГДЕ}`);
 *  - `Т.Код.* КАК А` (Код — строка) — `.*` ОТБРАСЫВАЕТСЯ;
 *  - источник-параметр `&ИмяТаблицы` (поле нерезолвимо в принципе) — ОТБРАСЫВАЕТСЯ
 *    (корпус: КонвертацияОбъектовИнформационныхБаз bsl_5).
 *
 * Суффикс снимается ТОЛЬКО когда нессылочность ДОКАЗАНА: поле резолвится по
 * метаданным в нессылочный тип (`Код` — строка) ЛИБО источник — параметр `&Имя`
 * (поле нерезолвимо в принципе, корпус: КонвертацияОбъектов bsl_5). При любой иной
 * неопределённости (пробел в метаданных, нерезолвимая ВТ/представление/регистр)
 * `.*` СОХРАНЯЕТСЯ — чтобы неполнота YAML-метаданных не роняла корректные суффиксы
 * (register-измерения `Регистр.Организация.*` сохраняются). Без резолвера флаг не
 * трогаем (поведение webview/extension без метаданных прежнее, как у
 * `expandStarFields`).
 */
export function resolveBuilderStar(model: QueryModel, resolver?: MetadataResolver): void {
  if (!resolver) return;
  if (!model.builder) return;

  const ctx = new ResolveCtx(model, resolver);
  for (const group of [model.builder.fields, model.builder.conditions, model.builder.order, model.builder.totals]) {
    for (const f of group) {
      if (!f.child) continue;
      // Скобочная форма `(выражение).*` (condition): тип выражения по метаданным
      // не выводим — `.*` оставляем (корпус: ЕСТЬNULL(…).*, ЗНАЧЕНИЕ(…).*).
      if (f.condition) continue;
      const cls = ctx.classify(f.ref);
      if (cls === 'scalar' || cls === 'parameter') f.child = false;
    }
  }
}

/** Резолвер цепочки ссылки `Голова.Сегмент…` для решения о суффиксе `.*`. */
class ResolveCtx {
  private aliasToTable = new Map<string, SelectedTable>();
  private selectAlias = new Map<string, SelectedField>();

  constructor(private model: QueryModel, private resolver: MetadataResolver) {
    for (const t of model.tables) {
      if (t.alias) this.aliasToTable.set(t.alias.toUpperCase(), t);
    }
    for (const f of model.fields) {
      const a = f.alias ?? f.path;
      if (a) this.selectAlias.set(a.toUpperCase(), f);
    }
  }

  /**
   * true — ссылка `ref` ДОКАЗУЕМО резолвится в ссылочное поле (суффикс `.*`
   * сохраняется). При любой неопределённости (нерезолвимый источник/поле) — false.
   */
  /**
   * Решение о суффиксе `.*` для простой ссылки построителя. Возвращает:
   *  - 'reference'    — цепочка ДОКАЗУЕМО резолвится в ссылочное поле → сохранить;
   *  - 'scalar'       — цепочка резолвится в НЕссылочное поле → снять;
   *  - 'parameter'    — источник-параметр `&Имя` → снять (поле нерезолвимо в принципе);
   *  - 'unknown'      — нерезолвимо по иным причинам (ВТ/представление/пробел в
   *                     метаданных) → консервативно сохранить.
   * Снимаем `.*` только при ДОКАЗАННОЙ нессылочности либо источнике-параметре —
   * чтобы пробелы метаданных (нерезолвимые ВТ/регистры) не роняли корректные `.*`.
   */
  classify(ref: string): 'reference' | 'scalar' | 'parameter' | 'unknown' {
    const segs = ref.split('.');
    if (segs.length === 0) return 'unknown';
    const head = segs[0].toUpperCase();

    const t = this.aliasToTable.get(head);
    if (t) {
      if (t.subquery) {
        const sub = t.subquery.members[0]?.model;
        return sub ? this.fromSubquery(sub, segs.slice(1)) : 'unknown';
      }
      if (t.fullName.startsWith('&')) return 'parameter';
      const meta = this.metaFor(t.fullName);
      return meta ? this.walk(meta, segs.slice(1)) : 'unknown';
    }

    // Голая голова — псевдоним поля выборки этого же запроса (форма `{ВЫБРАТЬ}`).
    const sel = this.selectAlias.get(head);
    if (sel && !sel.expression) {
      return this.fromSelectField(sel, segs.slice(1));
    }
    return 'unknown';
  }

  private fromSelectField(sel: SelectedField, rest: string[]): 'reference' | 'scalar' | 'parameter' | 'unknown' {
    const src = this.model.tables.find(x => x.id === sel.tableId);
    if (!src) return 'unknown';
    if (src.subquery) {
      const sub = src.subquery.members[0]?.model;
      return sub ? this.fromSubquery(sub, [...sel.path.split('.'), ...rest]) : 'unknown';
    }
    if (src.fullName.startsWith('&')) return 'parameter';
    const meta = this.metaFor(src.fullName);
    return meta ? this.walk(meta, [...sel.path.split('.'), ...rest]) : 'unknown';
  }

  /** Резолв сегментов относительно выходных полей подзапроса. */
  private fromSubquery(subModel: QueryModel, segs: string[]): 'reference' | 'scalar' | 'parameter' | 'unknown' {
    if (segs.length === 0) return 'unknown';
    const ctx = new ResolveCtx(subModel, this.resolver);
    const out = ctx.selectAlias.get(segs[0].toUpperCase());
    if (!out || out.expression) return 'unknown';
    return ctx.fromSelectField(out, segs.slice(1));
  }

  /**
   * Идёт по сегментам от таблицы через ссылочные поля до финального типа.
   *
   * Делегирует в `resolveFieldPath` (semantic-core hardening) — раньше здесь была
   * ещё одна независимая копия findField/firstRef/walk-цикла (плюс hasReference
   * для пустого `segs`), идентичная `canonicalizeFieldCasing.ts`/
   * `dropRedundantGroupDerefs.ts`. `resolveFieldPath` уже воспроизводит и
   * синтетический `types: []` → `'unknown'` разбор, и пустой-`segs` случай
   * (голый `Alias.*` без сегмента поля) — оба подтверждены parity-тестами в
   * `fieldPathResolver.test.ts` против ЭТОГО метода до миграции.
   */
  private walk(meta: MetaTable, segs: string[]): 'reference' | 'scalar' | 'unknown' {
    return resolveFieldPath(meta, segs, this.resolver).kind;
  }

  /** Метаданные таблицы по fullName с учётом среза виртуальной таблицы регистра. */
  private metaFor(fullName: string): MetaTable | undefined {
    const direct = this.resolver.tableByFullName(fullName);
    if (direct) return direct;
    // `РегистрX.Имя.СрезПоследних|Остатки|Обороты|…` → базовый регистр.
    const m = fullName.match(/^(Регистр\p{L}+\.[^.]+)\.\p{L}+$/u);
    return m ? this.resolver.tableByFullName(m[1]) : undefined;
  }
}
