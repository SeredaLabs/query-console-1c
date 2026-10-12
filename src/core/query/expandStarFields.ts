import type { QueryModel, SelectedField, SelectedTabSectionField, SelectedTable } from './queryModel';
import type { MetadataResolver } from './metadataResolver';
import type { MetaTable } from '../metadata/types';
import { buildSelectAllModel } from './buildSelectAllModel';
import { isIdentifierName } from './sdblLexer';
import { columnNames, isSynthesizedAlias } from './columnNames';

/**
 * How a wildcard is expanded (C24 step 1a).
 *  - `preserve` (default, production Designer): a wildcard expands only when every
 *    column of its sources is proven from the batch text (a temp table created by
 *    `ПОМЕСТИТЬ` in this batch, a nested SELECT), and only when every wildcard of the
 *    select list does; otherwise the select list is left exactly as written. Nothing
 *    is ever removed. Metadata tables are not expanded (step 1b: completeness of the
 *    configuration metadata is not proven).
 *  - `analysis`: the model-only parse of hover/completion (`buildSemanticSnapshot`),
 *    never turned into query text. Expands like the constructor when the metadata
 *    resolves every source of every wildcard (so a temp table made by `*` keeps its
 *    columns for completion), otherwise as `preserve`; never removes a wildcard.
 *  - `constructor`: byte parity with the 1C query constructor (СхемаЗапроса) for the
 *    oracle and corpus tests only. It also REMOVES wildcards the constructor drops
 *    (parameter source, unknown table, `Т.Поле.*`), so it must never reach the
 *    Designer or any other production code.
 */
export type WildcardPolicy = 'preserve' | 'analysis' | 'constructor';

/**
 * Columns of a temp table created in the batch, by its registry entry — set only
 * when every column name is proven (see `provenColumnNames`). An inferred temp
 * table or one whose creator kept a wildcard has no entry.
 */
const provenTempTableColumns = new WeakMap<MetaTable, string[]>();

export function markProvenTempTable(table: MetaTable, columns: string[] | undefined): void {
  if (columns?.length) provenTempTableColumns.set(table, columns);
  else provenTempTableColumns.delete(table);
}

/** An explicit `КАК` of a select field (not a name the parser synthesized). */
function explicitAlias(f: SelectedField): string | undefined {
  return f.alias !== undefined && !isSynthesizedAlias(f) ? f.alias : undefined;
}

/**
 * The column names of a select list (member 0 of a nested SELECT or of a temp-table
 * creator), or `undefined` when they are not proven: the names are the platform's
 * (`columnNames`, C30), so they are proven unless the list has a wildcard, a
 * tabular-section projection or trailing columns, or two equal explicit names.
 */
export function provenColumnNames(model: QueryModel): string[] | undefined {
  if (model.tabSectionFields?.length || model.trailingFields?.length) return undefined;
  if (model.fields.some(f => isWildcardExpression(f.expression))) return undefined;
  const names = columnNames(model, model.fields.map(field => ({ kind: 'field' as const, field })));
  const seen = new Set<string>();
  for (const name of names) {
    if (name === undefined || !isIdentifierName(name) || seen.has(name.toUpperCase())) return undefined;
    seen.add(name.toUpperCase());
  }
  return names.length ? (names as string[]) : undefined;
}

/** Proven columns of one FROM source, or `undefined`. */
function provenSourceColumns(t: SelectedTable, resolver: MetadataResolver | undefined): string[] | undefined {
  if (t.subquery) {
    const m0 = t.subquery.members[0]?.model;
    return m0 ? provenColumnNames(m0) : undefined;
  }
  // A metadata name (`Справочник.X`, a virtual table), a parameter `&Т` or `#Т`
  // is not a batch temp table.
  if (t.virtual || !t.fullName || !isIdentifierName(t.fullName)) return undefined;
  const meta = resolver?.tableByFullName(t.fullName);
  return meta ? provenTempTableColumns.get(meta) : undefined;
}

/**
 * `preserve` expansion: all wildcards of the select list or none. Column names
 * follow the platform rule (`columnNames`, C30).
 */
function expandProvenWildcards(model: QueryModel, resolver: MetadataResolver | undefined): void {
  if (model.tabSectionFields?.length || model.trailingFields?.length) return;
  // An expression or aggregate without `КАК` is named later (`Поле{n}`, `<Поле>Представление`,
  // a parameter name) without regard to the expanded names: keep the wildcards.
  if (model.fields.some(f => !parseStar(f) && explicitAlias(f) === undefined && (f.expression !== undefined || f.func !== undefined || f.alias !== undefined))) return;

  const byAlias = new Map<string, SelectedTable>();
  for (const t of model.tables) if (t.alias) byAlias.set(t.alias.toUpperCase(), t);
  const plans = new Map<SelectedField, Array<{ tableId: string; columns: string[] }>>();
  for (const f of model.fields) {
    const star = parseStar(f);
    if (!star) continue;
    if (star.viaAttribute) return;
    const sources = star.alias ? [byAlias.get(star.alias.toUpperCase())] : model.tables;
    if (sources.length === 0) return;
    const plan: Array<{ tableId: string; columns: string[] }> = [];
    for (const t of sources) {
      const columns = t ? provenSourceColumns(t, resolver) : undefined;
      if (!t || !columns) return;
      plan.push({ tableId: t.id, columns });
    }
    plans.set(f, plan);
  }

  // The expanded columns are named with the other columns left to right, as the
  // platform does (`columnNames`), and keep that name as a synthesized one (sections
  // such as `ИТОГИ … ПО <имя>` refer to columns by name).
  const fields: SelectedField[] = [];
  const expanded = new Set<SelectedField>();
  for (const f of model.fields) {
    const plan = plans.get(f);
    if (!plan) { fields.push(f); continue; }
    for (const { tableId, columns } of plan) {
      for (const c of columns) {
        const column: SelectedField = { tableId, path: c, qualified: true };
        expanded.add(column);
        fields.push(column);
      }
    }
  }
  const names = columnNames(model, fields.map(field => ({ kind: 'field' as const, field })));
  fields.forEach((f, i) => {
    const name = names[i];
    if (expanded.has(f) && name !== undefined) { f.alias = name; f.aliasSynthesized = name; }
  });
  model.fields = fields;
}

/**
 * Развёртка `*` в списке выборки по метаданным (фаза 6.15.15).
 *
 * Конструктор 1С разворачивает звёздные поля выборки в ПОЛНЫЙ список колонок
 * таблицы:
 *   - `ВЫБРАТЬ *`            — звезда без префикса (единственный источник);
 *   - `Таблица.* КАК ПолеN`  — звезда с префиксом-псевдонимом источника.
 * Состав колонок берётся из `buildSelectAllModel` (тот же порядок, что у
 * конструктора: основные поля → табличные части → завершающие стандартные).
 *
 * Правила, выведенные по корпусу/оракулу:
 *  1. Источник-параметр (`&Имя`), временная таблица (`#Имя`) или таблица без
 *     метаданных — звезда НЕ разворачивается, а УДАЛЯЕТСЯ (раскрывается в ноль
 *     колонок). Если после удаления полей не осталось — весь запрос пуст.
 *  2. Поля вокруг звезды сохраняются на своих позициях; всё, что в исходном
 *     тексте идёт ПОСЛЕ звезды, выводится после завершающих полей развёртки
 *     (генератор печатает fields → табличные части → trailingFields).
 *  3. Дедуп псевдонимов: если псевдоним развёрнутой колонки уже занят явным
 *     полем выборки (или ранее развёрнутой колонкой), к нему добавляется числовой
 *     суффикс (`Наименование` → `Наименование1`). Явные поля приоритетнее.
 *
 * `Таблица.Поле.*` (звезда по реквизиту-ссылке) и звезда по неизвестному
 * псевдониму трактуются как неразрешимые — удаляются (правило 1). В корпусе таких
 * случаев нет; развёртка по типу реквизита потребовала бы обхода ссылок.
 */
export function expandStarFields(model: QueryModel, resolver?: MetadataResolver, policy: WildcardPolicy = 'preserve'): void {
  // Объединение и прочие участники обрабатываются вызывающим по отдельности —
  // здесь работаем с одним QueryModel.
  if (!hasStar(model.fields)) return;
  if (policy === 'preserve' || (policy === 'analysis' && !(resolver && everySourceResolves(model, resolver)))) {
    expandProvenWildcards(model, resolver);
    return;
  }
  // Без резолвера развёртка не выполняется: поведение прежнее (звезда остаётся
  // произвольным полем `* КАК ПолеN`). Так слой webview/extension без метаданных
  // не меняет вывод; развёртка включается только когда резолвер передан (приёмка).
  if (!resolver) return;

  // Псевдоним → fullName источника (регистронезависимо, как везде в 1С).
  const aliasToFull = new Map<string, string>();
  let soleFull: string | undefined;
  if (model.tables.length === 1 && !model.tables[0].subquery) {
    soleFull = model.tables[0].fullName;
  }
  for (const t of model.tables) {
    if (t.alias && !t.subquery) aliasToFull.set(t.alias.toUpperCase(), t.fullName);
  }

  // Зарезервированные псевдонимы — все ЯВНЫЕ (не-звёздные) поля выборки.
  // Конструктор переименовывает именно развёрнутую колонку при коллизии, явное
  // поле сохраняет свой псевдоним.
  const reserved = new Set<string>();
  for (const f of model.fields) {
    if (parseStar(f)) continue;
    const a = fieldAlias(f);
    if (a) reserved.add(a.toUpperCase());
  }

  const newFields: SelectedField[] = [];
  // Поля, выводимые после звёздной развёртки (табличные части + завершающие
  // стандартные + всё, что в тексте идёт после звезды). Накапливаются как только
  // встретилась хоть одна развёрнутая звезда.
  const tabSections: SelectedTabSectionField[] = [...(model.tabSectionFields ?? [])];
  const trailing: SelectedField[] = [];
  let sawExpandedStar = false;

  // Конструктор 1С разворачивает голую `*` ПО ИСТОЧНИКАМ секции ИЗ, и колонки каждого
  // источника идут единым блоком: основные поля → проекции табличных частей →
  // завершающие стандартные, ПЕРЕД колонками следующего источника (сверено по
  // оракулу: СотрудникиБазовый_21/22, ФизическиеЛица_1/2). Чтобы генератор сохранил
  // это перемежение (а не «всплытие» всех ТЧ в общий блок ПОСЛЕ всех скалярных полей),
  // присваиваем монотонный selectOrder всем элементам ПОСЛЕ первого блока основных
  // полей: проекции ТЧ и завершающие поля первого источника, а также ВСЕ колонки
  // (основные/ТЧ/завершающие) последующих источников отправляются в rest-бакеты
  // (tabSections / trailingFields) с возрастающим selectOrder. Основные поля первого
  // источника остаются в model.fields (генератор всегда печатает их первыми).
  let order = 0;
  // headOpen=true пока заполняем основные поля ПЕРВОГО развёрнутого источника
  // (попадают в model.fields без selectOrder). После первой проекции ТЧ / завершающего
  // поля / границы второго источника переключаемся на rest-бакеты с selectOrder.
  let headOpen = true;

  const pushAfter = (f: SelectedField): void => {
    if (sawExpandedStar) { trailing.push({ ...f, selectOrder: order++ }); headOpen = false; }
    else newFields.push(f);
  };

  // Развёртка звезды по ОДНОМУ источнику (`<alias>.*` или один из источников голой
  // `*`): добавляет колонки/ТЧ/завершающие в накопители. Возвращает true, если
  // источник разрешён и хоть что-то развёрнуто (нужно для пометки sawExpandedStar).
  const expandOne = (fullName: string | undefined, tableId: string | undefined): boolean => {
    // Реальная таблица приоритетна; источник-срез (`X.СрезПоследних`,
    // `X.Остатки`, …) разрешается через виртуальный слой резолвера. Состав колонок
    // среза берёт `buildSelectAllModel` из самой виртуальной MetaTable.
    const meta = fullName
      ? (resolver.tableByFullName(fullName) ?? resolver.virtualTableByFullName?.(fullName))
      : undefined;
    if (!meta || tableId === undefined) return false;
    const expanded = buildSelectAllModel(meta);
    for (const ef of expanded.fields) {
      const fld = makeField(ef, tableId, reserved);
      // Основные поля первого развёрнутого источника — в head (генератор печатает их
      // первыми); основные поля последующих источников — в rest c selectOrder, чтобы
      // они шли ПОСЛЕ проекций ТЧ / завершающих полей предыдущих источников.
      if (headOpen) newFields.push(fld);
      else trailing.push({ ...fld, selectOrder: order++ });
    }
    for (const ts of expanded.tabSectionFields ?? []) {
      tabSections.push({ ...ts, tableId, selectOrder: order++ });
    }
    for (const ef of expanded.trailingFields ?? []) {
      trailing.push({ ...makeField(ef, tableId, reserved), selectOrder: order++ });
    }
    // Первый развёрнутый источник полностью обработан — head закрыт: все колонки
    // последующих источников обязаны идти ПОСЛЕ него (перемежение по selectOrder).
    headOpen = false;
    return true;
  };

  // C24: резолвер без метаданных конфигурации (путь Designer) не знает реальных
  // таблиц. Неразрешённый источник-имя метаданных (`Справочник.X`, многосегментное)
  // для него НЕИЗВЕСТЕН, а не пуст — звезду по нему оставляем как есть, а не удаляем.
  // Односегментное имя — временная таблица: неопределённая ВТ даёт ноль колонок, как
  // у платформы (`ВЫБРАТЬ * ИЗ ВТ2` → пустой текст СхемаЗапроса).
  const unknownSource = (fullName: string | undefined): boolean =>
    resolver.metadataUnknown === true && fullName !== undefined && fullName.includes('.') &&
    !resolver.tableByFullName(fullName) && !resolver.virtualTableByFullName?.(fullName);

  // C24: a nested SELECT source has no metadata name; its columns are not resolved
  // here (step 1), so a wildcard over it is kept as written, never removed — the
  // platform expands it to the subquery's columns.
  const subqueryAliases = new Set(model.tables.filter(t => t.subquery && t.alias).map(t => t.alias!.toUpperCase()));
  const overSubquery = (alias: string | undefined): boolean => alias !== undefined && subqueryAliases.has(alias.toUpperCase());

  for (const f of model.fields) {
    const star = parseStar(f);
    if (!star) { pushAfter(f); continue; }
    if (overSubquery(star.alias)) { pushAfter(f); continue; }

    // Звезда по реквизиту-ссылке (`alias.field.*`) неразрешима — удаляем (правило 1).
    // Источник — неизвестное имя метаданных: тип реквизита неизвестен — оставляем (C24).
    if (star.viaAttribute) {
      if (star.alias && unknownSource(aliasToFull.get(star.alias.toUpperCase()))) pushAfter(f);
      continue;
    }

    if (star.alias) {
      // `<alias>.*` — разворачиваем единственный источник этого псевдонима.
      const fullName = aliasToFull.get(star.alias.toUpperCase());
      if (unknownSource(fullName)) { pushAfter(f); continue; }
      if (expandOne(fullName, findTableId(model, star.alias))) sawExpandedStar = true;
      continue;
    }

    // Голая `*` при неизвестном источнике или при источнике-подзапросе остаётся
    // целиком: частичная развёртка переставила бы колонки относительно платформы.
    if (model.tables.some(t => t.subquery || unknownSource(t.fullName))) { pushAfter(f); continue; }

    // Голая `*` — конструктор разворачивает ВСЕ источники секции ИЗ по порядку
    // (MCP-проба: `* ИЗ ВТ КАК А ЛЕВОЕ СОЕДИНЕНИЕ ВТ КАК Б` → колонки А, затем Б
    // с дедуп-суффиксом). Единственный источник — частный случай. Если ни один
    // источник не разрешился (все параметры/нет метаданных) — звезда удаляется.
    if (soleFull !== undefined) {
      if (expandOne(soleFull, model.tables[0]?.id)) sawExpandedStar = true;
      continue;
    }
    for (const t of model.tables) {
      if (t.subquery) continue;
      if (expandOne(t.fullName, t.id)) sawExpandedStar = true;
    }
  }

  model.fields = newFields;
  if (tabSections.length) model.tabSectionFields = tabSections;
  if (trailing.length) {
    model.trailingFields = [...trailing, ...(model.trailingFields ?? [])];
  }
}

/**
 * `analysis`: every wildcard has sources, none is a nested SELECT or `Т.Поле.*`, and
 * the resolver knows every source — the constructor algorithm then removes nothing.
 */
function everySourceResolves(model: QueryModel, resolver: MetadataResolver): boolean {
  const byAlias = new Map<string, SelectedTable>();
  for (const t of model.tables) if (t.alias) byAlias.set(t.alias.toUpperCase(), t);
  for (const f of model.fields) {
    const star = parseStar(f);
    if (!star) continue;
    if (star.viaAttribute) return false;
    const sources = star.alias ? [byAlias.get(star.alias.toUpperCase())] : model.tables;
    if (sources.length === 0) return false;
    for (const t of sources) {
      if (!t || t.subquery || !t.fullName) return false;
      if (!resolver.tableByFullName(t.fullName) && !resolver.virtualTableByFullName?.(t.fullName)) return false;
    }
  }
  return true;
}

/** Создаёт развёрнутое поле с дедупом псевдонима против `reserved`. */
function makeField(src: SelectedField, tableId: string, reserved: Set<string>): SelectedField {
  const base = src.alias ?? src.path;
  let alias = base;
  let n = 0;
  while (reserved.has(alias.toUpperCase())) {
    alias = `${base}${++n}`;
  }
  reserved.add(alias.toUpperCase());
  return { tableId, path: src.path, alias };
}

function hasStar(fields: SelectedField[]): boolean {
  return fields.some(f => parseStar(f) !== null);
}

interface StarInfo {
  /** Префикс-псевдоним источника (`Таблица.*`); undefined — голая `*`. */
  alias?: string;
  /** Звезда по реквизиту-ссылке (`Таблица.Поле.*`) — неразрешима. */
  viaAttribute: boolean;
}

/**
 * Распознаёт звёздное поле выборки. Звезда хранится в модели как произвольное
 * выражение (`expression`): `*`, `Алиас.*`, `Алиас.Поле.*`. Возвращает null,
 * если поле не звёздное.
 */
function parseStar(f: SelectedField): StarInfo | null {
  if (f.expression === undefined) return null;
  const e = f.expression.trim();
  if (e === '*') return { viaAttribute: false };
  // <head>(.<seg>)*.* — последний сегмент «*».
  if (!e.endsWith('*')) return null;
  const segs = e.split('.').map(s => s.trim());
  if (segs.length < 2 || segs[segs.length - 1] !== '*') return null;
  // Любой сегмент кроме последнего — одно имя по алфавиту лексера (A1).
  const head = segs.slice(0, -1);
  if (!head.every(isIdentifierName)) return null;
  return { alias: head[0], viaAttribute: head.length > 1 };
}

/**
 * Выражение поля выборки — звезда (`*`, `Алиас.*`, `Алиас.Поле.*`), по тем же
 * правилам, что и развёртка. Звезда не получает автопсевдоним и не занимает номер
 * `Поле{n}`: `* КАК Поле1` / `Т.* КАК Поле1` — синтаксическая ошибка платформы
 * (СхемаЗапроса, SL_kza 2026-10-11; C24).
 */
export function isWildcardExpression(expression: string | undefined): boolean {
  return expression !== undefined && parseStar({ tableId: '', path: '', expression }) !== null;
}

/** Псевдоним (или авто-псевдоним) явного поля для резервирования. */
function fieldAlias(f: SelectedField): string | undefined {
  if (f.alias !== undefined) return f.alias;
  if (f.expression !== undefined) return undefined; // авто `ПолеN` назначится позже
  return f.path.split('.').pop() ?? f.path;
}

function findTableId(model: QueryModel, alias: string): string | undefined {
  const up = alias.toUpperCase();
  return model.tables.find(t => t.alias?.toUpperCase() === up)?.id;
}
