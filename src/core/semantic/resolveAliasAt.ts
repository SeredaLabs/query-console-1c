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
 *  - `snapshot.index.symbolsById` (Phase 3a's symbol table, materialized
 *    once in `buildSemanticSnapshotFromText` as of Phase 3d — no longer
 *    re-collected on every call here).
 *
 * Shadow-mode comparison against the old flat `findAliasTable` lookup
 * (Refinement 4/5's explicit gate) shipped and ran clean over the full golden
 * corpus before this resolver was wired into hover (Phase 3d,
 * `queryHoverProvider.ts`/`hoverFieldInfo.ts`). It is now the ONLY alias
 * resolver hover/completion use; the flat lookup survives only as a frozen
 * reference for the corpus regression sweep
 * (`tooling/corpus-verify/shadowMode.ts`, `legacyFindAliasTable.ts`).
 */
import type { BatchDocument } from '../query/batchModel';
import type { QueryDocument } from '../query/unionModel';
import type { QueryModel } from '../query/queryModel';
import type { AbsoluteSourceMapEvent, TextRange } from '../query/sourceMap';
import { rangeContains } from '../query/sourceMap';
import type { Symbol, ModelPath, SemanticSnapshot } from './semanticSnapshot';
import { hasTrustworthyPositions } from './semanticSnapshot';
import type { Resolution } from './resolution';
import { resolveNearestAncestorMatch } from './correlation';
import { computeJoinVisibility } from '../query/joinVisibility';

interface ScopeLevel {
  model: QueryModel;
  path: ModelPath;
  /** Set when `position` falls inside THIS model's own join-condition text (index into `model.joins`). */
  joinIndex?: number;
}

/**
 * Events of one nesting level inside one parent node. Kind + index repeat at every
 * level (and in sibling subqueries), so a level only sees events of its own
 * `depth` that lie inside the range of the node it was entered through.
 */
interface EventScope {
  depth: number;
  bound?: TextRange;
}

function findEvent(
  events: readonly AbsoluteSourceMapEvent[],
  scope: EventScope,
  kind: AbsoluteSourceMapEvent['kind'],
  index: number,
  position: number,
): AbsoluteSourceMapEvent | undefined {
  return events.find((e) =>
    e.kind === kind && e.index === index && (e.depth ?? 0) === scope.depth &&
    rangeContains(e.range, position) &&
    (!scope.bound || (e.range.start >= scope.bound.start && e.range.end <= scope.bound.end)));
}

function makeLevel(
  model: QueryModel,
  path: ModelPath,
  events: readonly AbsoluteSourceMapEvent[],
  scope: EventScope,
  position: number,
): ScopeLevel {
  const joins = model.joins ?? [];
  for (let j = 0; j < joins.length; j++) {
    if (findEvent(events, scope, 'joinCondition', j, position)) return { model, path, joinIndex: j };
  }
  return { model, path };
}

/** Recurses into the deepest matching subquery FIRST, so `chain` ends up innermost-first. */
function descend(
  doc: QueryDocument,
  path: ModelPath,
  events: readonly AbsoluteSourceMapEvent[],
  scope: EventScope,
  position: number,
  chain: ScopeLevel[],
): boolean {
  for (let u = 0; u < doc.members.length; u++) {
    if (!findEvent(events, scope, 'unionMember', u, position)) continue;
    const model = doc.members[u].model;
    const modelPath: ModelPath = [...path, { kind: 'union', index: u }];

    const children: { doc: QueryDocument; segment: ModelPath[number]; kind: AbsoluteSourceMapEvent['kind']; index: number }[] = [];
    model.tables.forEach((table, index) => {
      if (table.subquery) children.push({ doc: table.subquery, segment: { kind: 'table', index }, kind: 'table', index });
    });
    model.conditions?.forEach((c, index) => {
      if (c.subquery) children.push({ doc: c.subquery, segment: { kind: 'whereSubquery', index }, kind: 'whereSubquery', index });
    });
    model.having?.forEach((c, index) => {
      if (c.subquery) children.push({ doc: c.subquery, segment: { kind: 'havingSubquery', index }, kind: 'havingSubquery', index });
    });
    for (const child of children) {
      const event = findEvent(events, scope, child.kind, child.index, position);
      if (!event) continue;
      const childScope: EventScope = { depth: scope.depth + 1, bound: event.range };
      if (descend(child.doc, [...modelPath, child.segment], events, childScope, position, chain)) {
        chain.push(makeLevel(model, modelPath, events, scope, position));
        return true;
      }
    }

    chain.push(makeLevel(model, modelPath, events, scope, position));
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
    if (descend(batch.members[stmtIndex], [{ kind: 'batch', index: stmtIndex }], stmtEvents, { depth: 0 }, position, chain)) {
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
 * The `QueryModel` whose own text directly contains `position` (the innermost
 * scope level, same lookup `resolveAliasAt` itself does) — exported for other
 * position-aware checks that need "which model is this" without the rest of
 * alias-resolution (Phase 2x-1: `resolveOutputAliasReference.ts` uses this to
 * find the right model's `selectOutputAliases`). `undefined` for a snapshot
 * without trustworthy positions (`hasTrustworthyPositions`) or a position
 * outside any recorded scope, same as `resolveAliasAt`'s own fail-open cases.
 */
export function findModelAt(snapshot: SemanticSnapshot, position: number): QueryModel | undefined {
  if (!hasTrustworthyPositions(snapshot)) return undefined;
  return findScopeChain(snapshot.model, snapshot.sourceMapEvents, position)[0]?.model;
}

/**
 * Resolves a bare alias reference at a raw-text `position` (absolute offset
 * into the original source, matching `snapshot.sourceMapEvents`'s coordinate
 * system) against the visible source aliases at that exact point.
 *
 * `'unknown'` (not an error) whenever the snapshot can't support this: a
 * snapshot without trustworthy `sourceMapEvents` (`hasTrustworthyPositions` —
 * `'unavailable'`, or `'recovered'` whose repair shifted offsets), and a
 * `position` outside any recorded statement/union member range is likewise
 * `'unknown'`. A `'recovered'` snapshot WITH positions is fine here: alias
 * resolution only needs sources/joins, which the repair never touches.
 */
export function resolveAliasAt(snapshot: SemanticSnapshot, position: number, alias: string): Resolution<Symbol> {
  if (!hasTrustworthyPositions(snapshot)) return { kind: 'unknown' };
  const chain = findScopeChain(snapshot.model, snapshot.sourceMapEvents, position);
  if (chain.length === 0) return { kind: 'unknown' };

  // Materialized once in `buildSemanticSnapshotFromText` (Phase 3d) instead of
  // re-walking the whole `BatchDocument` on every call.
  const allSymbols = Array.from(snapshot.index.symbolsById.values());
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
