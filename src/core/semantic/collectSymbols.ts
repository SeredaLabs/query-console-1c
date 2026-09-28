/**
 * Collects one `Symbol` per declared source alias (`SelectedTable.alias`) in a
 * `BatchDocument`, recursing into every subquery source so nested aliases get
 * their own symbols too. Each symbol's `path` locates it structurally (batch
 * statement → union member → table, recursing the same way into a table's own
 * `subquery`), reusing `ModelPath`'s existing segment kinds — a subquery source
 * needs no new segment kind: it's simply a `table` segment followed by another
 * `union`/`table` chain for what's inside it.
 *
 * Condition subqueries (`ГДЕ`/`ИМЕЮЩИЕ … В (ВЫБРАТЬ …)`) are walked the same way
 * under a `whereSubquery`/`havingSubquery` segment (S1).
 *
 * `buildSemanticSnapshotFromText` installs these symbols in `SemanticIndex`;
 * `resolveAliasAt` consumes them.
 * Identity only needs to be stable WITHIN one snapshot, never across reparses,
 * so a per-snapshot counter is sufficient.
 */
import type { BatchDocument } from '../query/batchModel';
import type { QueryDocument } from '../query/unionModel';
import type { QueryModel, SelectedTable } from '../query/queryModel';
import type { Symbol, ModelPath, SemanticNodeId } from './semanticSnapshot';

export function collectSourceAliasSymbols(batch: BatchDocument): Symbol[] {
  const symbols: Symbol[] = [];
  let nextId: SemanticNodeId = 0;
  batch.members.forEach((doc, batchIndex) => {
    collectFromDocument(doc, [{ kind: 'batch', index: batchIndex }], symbols, () => nextId++);
  });
  return symbols;
}

function collectFromDocument(
  doc: QueryDocument,
  path: ModelPath,
  out: Symbol[],
  allocateId: () => SemanticNodeId,
): void {
  doc.members.forEach((member, unionIndex) => {
    collectFromModel(member.model, [...path, { kind: 'union', index: unionIndex }], out, allocateId);
  });
}

function collectFromModel(
  model: QueryModel,
  path: ModelPath,
  out: Symbol[],
  allocateId: () => SemanticNodeId,
): void {
  model.tables.forEach((table, tableIndex) => {
    const tablePath: ModelPath = [...path, { kind: 'table', index: tableIndex }];
    if (table.alias) {
      const id = allocateId();
      out.push({
        id,
        alias: table.alias,
        ref: { kind: 'table', id, path: tablePath },
      });
    }
    if (table.subquery) {
      collectFromDocument(table.subquery, tablePath, out, allocateId);
    }
  });
  model.conditions?.forEach((c, index) => {
    if (c.subquery) collectFromDocument(c.subquery, [...path, { kind: 'whereSubquery', index }], out, allocateId);
  });
  model.having?.forEach((c, index) => {
    if (c.subquery) collectFromDocument(c.subquery, [...path, { kind: 'havingSubquery', index }], out, allocateId);
  });
}

/**
 * Walks a `Symbol`'s (or any `table`-kind `ModelRef`'s) `path` back to the
 * actual `SelectedTable` it names, descending through nested subqueries the
 * same way `collectFromModel` does. `undefined` for a malformed/foreign path
 * (e.g. one collected from a DIFFERENT `BatchDocument` instance — paths are
 * only meaningful against the exact batch they were collected from).
 */
export function resolveSymbolTable(batch: BatchDocument, path: ModelPath): SelectedTable | undefined {
  if (path[0]?.kind !== 'batch') return undefined;
  let doc: QueryDocument | undefined = batch.members[path[0].index];
  let i = 1;
  while (doc) {
    const unionSeg = path[i];
    if (unionSeg?.kind !== 'union') return undefined;
    const model: QueryModel | undefined = doc.members[unionSeg.index]?.model;
    if (!model) return undefined;
    i++;
    const seg = path[i];
    i++;
    if (seg?.kind === 'whereSubquery' || seg?.kind === 'havingSubquery') {
      doc = (seg.kind === 'whereSubquery' ? model.conditions : model.having)?.[seg.index]?.subquery;
      continue;
    }
    if (seg?.kind !== 'table') return undefined;
    const table: SelectedTable | undefined = model.tables[seg.index];
    if (!table) return undefined;
    if (i >= path.length) return table;
    doc = table.subquery;
  }
  return undefined;
}
