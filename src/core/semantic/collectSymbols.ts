/**
 * Phase 3a of the semantic-core roadmap (memory: project-semantic-core-roadmap).
 *
 * Collects one `Symbol` per declared source alias (`SelectedTable.alias`) in a
 * `BatchDocument`, recursing into every subquery source so nested aliases get
 * their own symbols too. Each symbol's `path` locates it structurally (batch
 * statement → union member → table, recursing the same way into a table's own
 * `subquery`), reusing `ModelPath`'s existing segment kinds — a subquery source
 * needs no new segment kind: it's simply a `table` segment followed by another
 * `union`/`table` chain for what's inside it.
 *
 * Deliberately NOT wired into `SemanticIndex`/`createSemanticSnapshot` yet —
 * that wiring, plus building an actual `Scope` tree (mirroring `computeJoinVisibility`'s
 * join tree and the correlation ancestor chain), is Phase 3b's job, once
 * `resolveAliasAt(position)` exists to actually consume them. This phase only
 * proves symbols can be collected correctly; a bare per-snapshot counter is
 * enough for that (matches Refinement 3: identity only needs to be stable
 * WITHIN one snapshot, never across reparses).
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
    const tableSeg = path[i];
    if (tableSeg?.kind !== 'table') return undefined;
    const table: SelectedTable | undefined = model.tables[tableSeg.index];
    if (!table) return undefined;
    i++;
    if (i >= path.length) return table;
    doc = table.subquery;
  }
  return undefined;
}
