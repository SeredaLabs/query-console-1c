/**
 * Phase 3b of the semantic-core roadmap (memory: project-semantic-core-roadmap).
 *
 * `resolveAliasAt(snapshot, position, alias)`: the first genuinely
 * position-aware alias resolver in this roadmap, wiring together everything
 * built in Phases 1b-3a:
 *  - `snapshot.sourceMapEvents` (Phase 1b/1b.2) to find which statement/union
 *    member/subquery — and, critically, which specific JOIN's own `ПО`
 *    condition (Phase 3b's own `joinCondition` source-map events) — the
 *    cursor position falls inside.
 *  - `computeJoinVisibility` (Phase 2b, live-verified against real 1C) to
 *    narrow the visible table set when position is inside a join condition
 *    specifically, rather than treating the whole query's tables as flatly
 *    visible everywhere.
 *  - `resolveNearestAncestorMatch` (Phase 2b, live-verified) for correlated
 *    outer-alias access from inside a subquery — nearest enclosing level
 *    wins, with fallback to farther levels only when nearer ones have no
 *    match at all.
 *  - `collectSourceAliasSymbols` (Phase 3a) for the actual symbol table.
 *
 * Deliberately NOT wired into hover/completion yet (Phase 3d/3e), and
 * deliberately NOT run in continuous shadow-mode against `hoverFieldInfo.ts`'s
 * existing flat lookup yet (Refinement 4/5 call for this before any cutover —
 * tracked as follow-up work, not silently skipped: see this phase's memory
 * entry). This module only proves the resolver itself is correct in
 * isolation, via direct unit tests mirroring the Phase 2a live-verified
 * fixtures.
 */
import type { BatchDocument } from '../query/batchModel';
import type { QueryDocument } from '../query/unionModel';
import type { QueryModel } from '../query/queryModel';
import type { AbsoluteSourceMapEvent } from '../query/sourceMap';
import { rangeContains } from '../query/sourceMap';
import type { Symbol, ModelPath, SemanticSnapshot } from './semanticSnapshot';
import type { Resolution } from './resolution';
import { resolveNearestAncestorMatch } from './correlation';
import { computeJoinVisibility } from './joinVisibility';
import { collectSourceAliasSymbols } from './collectSymbols';

interface ScopeLevel {
  model: QueryModel;
  path: ModelPath;
  /** Set when `position` falls inside THIS model's own join-condition text (index into `model.joins`). */
  joinIndex?: number;
}

function findEvent(
  events: readonly AbsoluteSourceMapEvent[],
  kind: AbsoluteSourceMapEvent['kind'],
  index: number,
  position: number,
): AbsoluteSourceMapEvent | undefined {
  return events.find((e) => e.kind === kind && e.index === index && rangeContains(e.range, position));
}

function makeLevel(
  model: QueryModel,
  path: ModelPath,
  events: readonly AbsoluteSourceMapEvent[],
  position: number,
): ScopeLevel {
  const joins = model.joins ?? [];
  for (let j = 0; j < joins.length; j++) {
    if (findEvent(events, 'joinCondition', j, position)) return { model, path, joinIndex: j };
  }
  return { model, path };
}

/** Recurses into the deepest matching subquery FIRST, so `chain` ends up innermost-first. */
function descend(
  doc: QueryDocument,
  path: ModelPath,
  events: readonly AbsoluteSourceMapEvent[],
  position: number,
  chain: ScopeLevel[],
): boolean {
  for (let u = 0; u < doc.members.length; u++) {
    if (!findEvent(events, 'unionMember', u, position)) continue;
    const model = doc.members[u].model;
    const modelPath: ModelPath = [...path, { kind: 'union', index: u }];

    for (let t = 0; t < model.tables.length; t++) {
      const table = model.tables[t];
      if (!table.subquery) continue;
      if (!findEvent(events, 'table', t, position)) continue;
      if (descend(table.subquery, [...modelPath, { kind: 'table', index: t }], events, position, chain)) {
        chain.push(makeLevel(model, modelPath, events, position));
        return true;
      }
    }

    chain.push(makeLevel(model, modelPath, events, position));
    return true;
  }
  return false;
}

/** Innermost-first chain of enclosing query levels for `position`, or `[]` if position isn't inside any known statement. */
function findScopeChain(batch: BatchDocument, events: readonly AbsoluteSourceMapEvent[], position: number): ScopeLevel[] {
  for (let stmtIndex = 0; stmtIndex < batch.members.length; stmtIndex++) {
    const stmtEvents = events.filter((e) => e.statementIndex === stmtIndex);
    if (stmtEvents.length === 0) continue;
    const chain: ScopeLevel[] = [];
    if (descend(batch.members[stmtIndex], [{ kind: 'batch', index: stmtIndex }], stmtEvents, position, chain)) {
      return chain;
    }
  }
  return [];
}

/** `SelectedTable.id` follows the parser-wide `'t' + index` convention (verified in `sdblParser.ts`'s `parseTableSource`). */
function tableIdFromPath(path: ModelPath): string | undefined {
  const last = path[path.length - 1];
  return last?.kind === 'table' ? 't' + last.index : undefined;
}

/** Symbols declared DIRECTLY at `scopePath` (one more segment, a `table`) — not in a deeper nested subquery. */
function localSymbolsFor(allSymbols: readonly Symbol[], scopePath: ModelPath): Symbol[] {
  return allSymbols.filter((s) => {
    const p = s.ref.path;
    if (p.length !== scopePath.length + 1) return false;
    for (let i = 0; i < scopePath.length; i++) {
      if (p[i].kind !== scopePath[i].kind || p[i].index !== scopePath[i].index) return false;
    }
    return p[p.length - 1].kind === 'table';
  });
}

/**
 * Resolves a bare alias reference at a raw-text `position` (absolute offset
 * into the original source, matching `snapshot.sourceMapEvents`'s coordinate
 * system) against the visible source aliases at that exact point.
 *
 * `'unknown'` (not an error) whenever the snapshot can't support this: a
 * non-`'complete'` snapshot has no trustworthy `sourceMapEvents` (see
 * `SemanticSnapshot.sourceMapEvents`'s own doc), and a `position` outside any
 * recorded statement/union member range is likewise `'unknown'`.
 */
export function resolveAliasAt(snapshot: SemanticSnapshot, position: number, alias: string): Resolution<Symbol> {
  if (snapshot.completeness !== 'complete') return { kind: 'unknown' };
  const chain = findScopeChain(snapshot.model, snapshot.sourceMapEvents, position);
  if (chain.length === 0) return { kind: 'unknown' };

  const allSymbols = collectSourceAliasSymbols(snapshot.model);
  const upperAlias = alias.toUpperCase();

  const ancestorLevels: Symbol[][] = chain.map((level) => {
    const locals = localSymbolsFor(allSymbols, level.path);
    if (level.joinIndex === undefined) return locals;
    const join = level.model.joins?.[level.joinIndex];
    const visibleIds = join ? computeJoinVisibility(level.model).get(join) : undefined;
    if (!visibleIds) return locals; // defensive fail-open — should not happen for a well-formed model
    return locals.filter((s) => {
      const id = tableIdFromPath(s.ref.path);
      return id !== undefined && visibleIds.has(id);
    });
  });

  return resolveNearestAncestorMatch((s) => s.alias.toUpperCase() === upperAlias, ancestorLevels);
}
