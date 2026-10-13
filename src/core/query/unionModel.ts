import type { QueryModel, SelectedField, SelectedTabSectionField } from './queryModel';
import { synthesizedFieldAlias } from './queryModelUtils';
// `fieldExpr` остаётся генератор-owned (переотрисовывает произвольные выражения
// через `exprFormatter` — generation-specific форматирование, не model-level
// операция, см. `queryModelUtils.ts`) — единственная оставшаяся зависимость
// unionModel → sdblGenerator, обоснованная (не misplaced logic).
import { fieldExpr } from './sdblGenerator';
import { columnNames } from './columnNames';

/** Один запрос-участник объединения. */
export interface UnionMember {
  name: string;
  /** true → ОБЪЕДИНИТЬ (без дубликатов); false → ОБЪЕДИНИТЬ ВСЕ. */
  distinct: boolean;
  model: QueryModel;
}

/**
 * Один элемент списка выборки участника в ИСХОДНОМ порядке (selectOrder):
 * скалярное поле или проекция табличной части. Используется для позиционного
 * выравнивания столбцов объединения (проекция ТЧ — полноценный столбец, фаза 6.16).
 */
export type SelectElement =
  | { kind: 'field'; field: SelectedField }
  | { kind: 'ts'; tsf: SelectedTabSectionField };

/** One outer projection position; a tabular element retains its nested model. */
export interface ProjectionColumnFact {
  element: SelectElement;
  /** C30 result name; undefined for an unresolved wildcard, never a matching key. */
  outputName: string | undefined;
}

/**
 * Shared, non-persisted projection facts in print order. This is not a producer
 * schema: a known name does not prove expression validity or schema completeness.
 * Consumers retain their existing scalar-head/all-elements boundaries (A2).
 */
export function deriveProjectionFacts(model: QueryModel): ProjectionColumnFact[] {
  const elements = orderedSelectElements(model);
  const names = columnNames(model, elements);
  return elements.map((element, i) => ({ element, outputName: names[i] }));
}

/** Колонка объединения: общий псевдоним и выражение каждого участника (или null). */
export interface UnionColumn {
  alias: string;
  cells: (string | null)[];
}

/** Документ конструктора: набор запросов-участников объединения. */
export interface QueryDocument {
  members: UnionMember[];
}

/**
 * UNION/temp-table invariant: `queryType`/`tempTableName`
 * belong to the COMPOUND query (the whole `QueryDocument`), not to any one
 * union member — `ПОМЕСТИТЬ`/`ДОБАВИТЬ` has exactly one grammatical slot,
 * physically carried by member 0. Callers (e.g. package
 * temp-table continuity) should read through this accessor instead of
 * indexing `doc.members[0]` directly, so the "member 0 is the carrier"
 * detail stays in one place. Mirrors `compoundQueryType`/
 * `compoundTempTableName` in `webview/state/queryStore/snapshots.ts`, which
 * do the same thing for the live/active `QueryState` (a distinction that
 * doesn't apply here — `doc` is already a fully assembled document, e.g.
 * from `assembleBatch`/`assembleMembers`).
 */
export function compoundCarrierOf(doc: QueryDocument): { queryType: QueryModel['queryType']; tempTableName: string } {
  const m0 = doc.members[0]?.model;
  return { queryType: m0?.queryType ?? 'select', tempTableName: m0?.tempTableName ?? '' };
}

/**
 * Псевдоним поля для целей объединения/совпадения: явный `alias`, иначе
 * синтезированный конструктором (склейка сегментов у квалифицированного поля,
 * последний сегмент у голого — см. synthesizedFieldAlias); для произвольного
 * поля без псевдонима — сам текст выражения. `model` нужна для определения
 * ТЧ-источника при склейке; без неё — последний сегмент (legacy-вызовы).
 */
export function fieldAlias(field: SelectedField, model?: QueryModel): string {
  if (field.alias) return field.alias;
  if (field.expression) return field.expression;
  if (model) return synthesizedFieldAlias(model, field);
  return field.path.split('.').pop()!;
}

/**
 * Result-column names of the whole select list, by element (C30: `columnNames`, the
 * platform rule). A wildcard kept as written has no entry.
 */
export function selectElementNames(model: QueryModel): Map<SelectedField | SelectedTabSectionField, string> {
  const out = new Map<SelectedField | SelectedTabSectionField, string>();
  for (const { element: el, outputName } of deriveProjectionFacts(model)) {
    if (outputName !== undefined) out.set(el.kind === 'field' ? el.field : el.tsf, outputName);
  }
  return out;
}

/**
 * Псевдонимы столбцов выборки так, как их напечатает генератор (`buildFieldLines`):
 * C30 — одно правило платформы для всех потребителей (`columnNames`). Без `model`
 * (поля без источников) список считается отдельной выборкой. Нужен там, где псевдоним
 * ВИДЕН или ПЕЧАТАЕТСЯ как имя колонки (заголовки объединения, колонки ВТ), —
 * `fieldAlias` отдаёт для произвольного поля сам текст выражения (это ключ
 * совпадения, а не имя колонки). Звезда, оставленная как есть, имени колонки не имеет
 * и отдаётся своим текстом.
 */
export function selectColumnAliases(fields: SelectedField[], model?: QueryModel): string[] {
  const own = model && fields.every(f => model.fields.includes(f) || (model.trailingFields ?? []).includes(f));
  const names = selectElementNames(own ? model : ({ ...(model ?? {}), tables: model?.tables ?? [], fields, tabSectionFields: undefined, trailingFields: undefined } as QueryModel));
  return fields.map(f => names.get(f) ?? fieldAlias(f, model));
}

/**
 * Список элементов выборки участника в ИСХОДНОМ порядке выборки: скалярные поля
 * (`model.fields`), проекции ТЧ (`tabSectionFields`) и хвостовые поля
 * (`trailingFields`), упорядоченные по `selectOrder`. Голова (`model.fields`) идёт
 * первой; остальные перемежаются по selectOrder РОВНО как в buildFieldLines —
 * только когда он задан у ВСЕХ (чистая парсерная модель); иначе сохраняется
 * прежний бакет-порядок (все ТЧ, затем хвостовые поля).
 */
export function orderedSelectElements(model: QueryModel): SelectElement[] {
  const head: SelectElement[] = model.fields.map(field => ({ kind: 'field', field }));
  type Item = { order: number | undefined; seq: number; el: SelectElement };
  const rest: Item[] = [];
  let seq = 0;
  for (const tsf of model.tabSectionFields ?? []) {
    rest.push({ order: tsf.selectOrder, seq: seq++, el: { kind: 'ts', tsf } });
  }
  for (const field of model.trailingFields ?? []) {
    rest.push({ order: field.selectOrder, seq: seq++, el: { kind: 'field', field } });
  }
  if (rest.every(it => it.order !== undefined)) {
    rest.sort((a, b) => (a.order! - b.order!) || (a.seq - b.seq));
  }
  return [...head, ...rest.map(it => it.el)];
}

/**
 * Колонки вертикального объединения (ТОЛЬКО скалярные поля `model.fields`).
 *
 * 1С выравнивает столбцы объединения ПОЗИЦИОННО (по индексу), а не по псевдониму:
 *   - количество колонок = число полей у участника 0 (он задаёт «форму» union;
 *     при расхождении ширины берём максимум по всем участникам);
 *   - заголовок i-й колонки = псевдоним i-го поля участника 0;
 *   - `cells[k][i]` = выражение i-го поля участника k «как есть»; отсутствующее
 *     поле → null (→ NULL).
 *
 * Проекции ТЧ и хвостовые поля здесь НЕ учитываются — для объединений с проекцией
 * ТЧ генератор (`generateDocument`) строит строки из `orderedSelectElements`,
 * которые включают ТЧ как полноценный столбец (фаза 6.16). Эта функция оставлена
 * для скалярных объединений и обратной совместимости (UI/тесты).
 */
export function deriveUnionColumns(members: UnionMember[]): UnionColumn[] {
  const width = members.reduce((w, m) => Math.max(w, m.model.fields.length), 0);
  const head = members[0]?.model.fields ?? [];
  const headAliases = members[0] ? selectColumnAliases(head, members[0].model) : [];

  const columns: UnionColumn[] = [];
  for (let i = 0; i < width; i++) {
    const headField = head[i];
    columns.push({
      alias: headField ? headAliases[i] : `Поле${i + 1}`,
      cells: members.map(m => {
        const f = m.model.fields[i];
        return f ? fieldExpr(m.model, f) : null;
      }),
    });
  }

  return columns;
}

/**
 * Есть ли в каком-либо участнике объединения проекция ТЧ. Признак, что выравнивать
 * столбцы нужно по `orderedSelectElements` (включая ТЧ/хвостовые поля), а не по
 * `deriveUnionColumns` (только скалярные `model.fields`).
 */
export function unionHasTabSection(members: UnionMember[]): boolean {
  return members.some(m => (m.model.tabSectionFields?.length ?? 0) > 0);
}

/**
 * Есть ли в каком-либо участнике объединения ХВОСТОВЫЕ поля (`trailingFields`):
 * явные поля выборки, идущие ПОСЛЕ развёрнутой звезды `Алиас.*` (источник —
 * табличная часть/таблица). Скалярный путь `deriveUnionColumns` учитывает только
 * `model.fields` и такие хвостовые столбцы терял; при их наличии выравниваем по
 * `orderedSelectElements` (как и при проекции ТЧ).
 */
export function unionHasTrailing(members: UnionMember[]): boolean {
  return members.some(m => (m.model.trailingFields?.length ?? 0) > 0);
}

/** Псевдоним столбца-элемента участника-головы (поле → fieldAlias; ТЧ → её псевдоним). */
export function elementAlias(el: SelectElement, model: QueryModel): string {
  const name = selectElementNames(model).get(el.kind === 'field' ? el.field : el.tsf);
  if (name !== undefined) return name;
  return el.kind === 'field' ? fieldAlias(el.field, model) : (el.tsf.alias ?? el.tsf.tsName);
}
