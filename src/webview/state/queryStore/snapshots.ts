import type { MetaTable } from '../../../core/metadata/types';
import type { Grouping, Indexing, Order, QueryModel, QueryType, SelectedField, Totals } from '../../../core/query/queryModel';
import { fieldAlias, type QueryDocument, type UnionMember } from '../../../core/query/unionModel';
import type { BatchDocument } from '../../../core/query/batchModel';
import type { BatchSnapshot, QueryState, SavedQuery } from '../queryStore';

/** Пустой построитель отчёта: все секции без строк. */
export function emptyBuilder() {
  return { fields: [], conditions: [], order: [], totals: [] };
}

/** Предзаполнение окна «Временная таблица» для существующего источника-ВТ. */
export function tempTableDialogInitial(state: QueryState, editId: string): { name: string; fields: { name: string }[] } | undefined {
  const sel = state.selectedTables.find(t => t.id === editId);
  if (!sel) return undefined;
  const meta = state.tables.find(t => t.fullName === sel.fullName);
  if (!meta) return undefined;
  return { name: sel.fullName, fields: meta.fields.map(f => ({ name: f.name })) };
}

/** Извлечь working set активного запроса в сериализуемый SavedQuery. */
export function snapshotActive(state: QueryState): SavedQuery {
  return {
    selectedTables: state.selectedTables, selectedFields: state.selectedFields, tabSectionFields: state.tabSectionFields,
    grouping: state.grouping, conditions: state.conditions, joins: state.joins, selection: state.selection,
    queryType: state.queryType, tempTableName: state.tempTableName, lockForUpdate: state.lockForUpdate,
    order: state.order, totals: state.totals, builder: state.builder, indexing: state.indexing,
    comments: state.queryComments,
  };
}

/** Восстановить плоские поля из снимка или пустых значений по умолчанию. */
export function restoreSaved(_state: QueryState, saved: SavedQuery | null): Partial<QueryState> {
  const base = saved ?? {
    selectedTables: [], selectedFields: [], tabSectionFields: [],
    grouping: { multiple: false, groupFields: [], groupSets: [], aggregates: [] } as Grouping,
    conditions: [], joins: [], selection: {}, queryType: 'select' as QueryType, tempTableName: '', lockForUpdate: [],
    order: { fields: [], auto: false } as Order,
    totals: { groupFields: [], totalFields: [], grand: false } as Totals,
    builder: emptyBuilder(), indexing: { indexes: [] } as Indexing, comments: undefined,
  };
  return {
    selectedTables: base.selectedTables, selectedFields: base.selectedFields, tabSectionFields: base.tabSectionFields,
    grouping: base.grouping, conditions: base.conditions, joins: base.joins, selection: base.selection,
    queryType: base.queryType, tempTableName: base.tempTableName, lockForUpdate: base.lockForUpdate,
    order: base.order, totals: base.totals, builder: base.builder, indexing: base.indexing,
    queryComments: base.comments, lockEnabled: base.lockForUpdate.length > 0,
    focusedSelectedTableId: null, focusedSelectedFieldIdx: null,
  };
}

export function buildModelFromFlat(flat: SavedQuery): QueryModel {
  return {
    tables: flat.selectedTables, fields: flat.selectedFields, tabSectionFields: flat.tabSectionFields,
    grouping: flat.grouping, conditions: flat.conditions, joins: flat.joins, selection: flat.selection,
    queryType: flat.queryType, tempTableName: flat.tempTableName, lockForUpdate: flat.lockForUpdate,
    order: flat.order, totals: flat.totals, builder: flat.builder, indexing: flat.indexing, comments: flat.comments,
  };
}

export function modelToFlat(model: QueryModel): SavedQuery {
  return {
    selectedTables: model.tables, selectedFields: model.fields, tabSectionFields: model.tabSectionFields ?? [],
    grouping: model.grouping ?? { multiple: false, groupFields: [], groupSets: [], aggregates: [] },
    conditions: model.conditions ?? [], joins: model.joins ?? [], selection: model.selection ?? {},
    queryType: model.queryType ?? 'select', tempTableName: model.tempTableName ?? '', lockForUpdate: model.lockForUpdate ?? [],
    order: model.order ?? { fields: [], auto: false }, totals: model.totals ?? { groupFields: [], totalFields: [], grand: false },
    builder: model.builder ?? emptyBuilder(), indexing: model.indexing ?? { indexes: [] }, comments: model.comments,
  };
}

export function docToSnapshot(doc: QueryDocument): BatchSnapshot {
  return { queryList: doc.members.map(m => ({ name: m.name, distinct: m.distinct })), activeQuery: 0, savedQueries: doc.members.map(m => modelToFlat(m.model)) };
}

export function assembleMembers(state: QueryState): UnionMember[] {
  return state.queryList.map((meta, i) => {
    const saved = i === state.activeQuery ? snapshotActive(state) : state.savedQueries[i];
    const flat = saved ?? snapshotActive(state);
    return { name: meta.name, distinct: meta.distinct, model: buildModelFromFlat(flat) };
  });
}

export function snapshotActiveBatch(state: QueryState): BatchSnapshot {
  const savedQueries = state.queryList.map((_, i) => i === state.activeQuery ? snapshotActive(state) : (state.savedQueries[i] ?? snapshotActive(state)));
  return { queryList: state.queryList, activeQuery: state.activeQuery, savedQueries };
}

export function restoreBatch(state: QueryState, snap: BatchSnapshot | null): Partial<QueryState> {
  if (snap === null) return { queryList: [{ name: 'Запрос 1', distinct: false }], activeQuery: 0, savedQueries: [null], ...restoreSaved(state, null) };
  const savedQueries: (SavedQuery | null)[] = snap.savedQueries.slice();
  savedQueries[snap.activeQuery] = null;
  return { queryList: snap.queryList, activeQuery: snap.activeQuery, savedQueries, ...restoreSaved(state, snap.savedQueries[snap.activeQuery]) };
}

export function batchMemberName(state: QueryState, i: number): string {
  const first = i === state.activeBatch
    ? (state.activeQuery === 0 ? snapshotActive(state) : state.savedQueries[0]!)
    : state.batchSaved[i]!.savedQueries[0];
  const model = buildModelFromFlat(first);
  if ((model.queryType === 'createTemp' || model.queryType === 'appendTemp') && model.tempTableName) return model.tempTableName;
  if (model.queryType === 'dropTemp') return `- ${model.tempTableName}`;
  return `Запрос пакета ${i + 1}`;
}

export function availableTempTables(state: QueryState): MetaTable[] {
  const out: MetaTable[] = [];
  const seenNames = new Set<string>();
  for (let i = 0; i < state.activeBatch; i++) {
    const snap = state.batchSaved[i];
    if (!snap) continue;
    const model = buildModelFromFlat(snap.savedQueries[0]);
    if (model.queryType !== 'createTemp' && model.queryType !== 'appendTemp') continue;
    const name = model.tempTableName;
    if (!name || seenNames.has(name.toUpperCase())) continue;
    seenNames.add(name.toUpperCase());
    const cols: string[] = [];
    const seenCols = new Set<string>();
    for (const f of model.fields) {
      const a = fieldAlias(f, model);
      if (!a || a === '*') continue;
      let alias = a;
      let n = 0;
      while (seenCols.has(alias.toUpperCase())) alias = `${a}${++n}`;
      seenCols.add(alias.toUpperCase());
      cols.push(alias);
    }
    out.push({ kind: 'ВременнаяТаблица', name, fullName: name, fields: cols.map(c => ({ name: c, kind: 'attribute', types: [] })) });
  }
  return out;
}

export function assembleBatch(state: QueryState): BatchDocument {
  return {
    members: state.batchSaved.map((snap, i) => {
      if (i === state.activeBatch) return { members: assembleMembers(state) };
      const batch = snap!;
      return { members: batch.queryList.map((meta, j) => ({ name: meta.name, distinct: meta.distinct, model: buildModelFromFlat(batch.savedQueries[j]) })) };
    }),
  };
}

/** Вернуть копию пакета без комментариев для генерации канонического текста. */
export function stripBatchComments(batch: BatchDocument): BatchDocument {
  return {
    members: batch.members.map(doc => ({
      members: doc.members.map(m => {
        const { comments: _drop, ...modelRest } = m.model;
        void _drop;
        return { ...m, model: { ...modelRest, fields: stripFieldComments(modelRest.fields) } };
      }),
    })),
  };
}

function stripFieldComments(fields: SelectedField[]): SelectedField[] {
  return fields.map(f => {
    if (f.commentLeading === undefined && f.commentTrailing === undefined) return f;
    const { commentLeading, commentTrailing, ...rest } = f;
    return rest;
  });
}
