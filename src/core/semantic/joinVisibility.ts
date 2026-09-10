/**
 * Phase 2b of the semantic-core roadmap (memory: project-semantic-core-roadmap).
 *
 * Computes, for each JOIN in a single `QueryModel`'s `ИЗ` clause, which table
 * ids are valid bare-field-ownership candidates for THAT join's own `ПО`
 * condition — i.e. the real lexical-scope visibility rules for JOIN chains,
 * as opposed to `qualifyBareFields.ts`'s current flat, whole-`model.tables`,
 * no-depth-awareness approximation.
 *
 * The rules below are NOT derived from reading the grammar or guessing — they
 * were live-verified against a real 1C instance (Phase 2a of this roadmap,
 * 2026-09-10) by feeding deliberately-crafted raw SDBL text through the real
 * query compiler's "Проверка" (compile-check) and reading its actual
 * "Ambiguous field"/"Field not found" errors:
 *
 * 1. A flat/left-associative run of depth-0 joins accumulates monotonically:
 *    join N sees the chain's root seed plus everything introduced by joins
 *    0..N-1 — but NOT anything introduced by a LATER join (no forward
 *    reference within the same chain).
 * 2. A right-nested join's own condition (`Join.depth > 0`, i.e. `A СОЕД B
 *    СОЕД C ПО c_bc ПО c_ab` — c_bc belongs to the B-C join) sees ONLY the
 *    tables within its own nested sub-chain, starting from its own local seed
 *    (B). It does NOT see the outer chain's seed (A) or anything introduced
 *    before it in the outer chain.
 * 3. The OUTER join that a nested sub-chain hangs off of (the A-B join above,
 *    whose condition c_ab is read AFTER c_bc) sees EVERYTHING: its own outer
 *    accumulated chain so far, plus the entire nested sub-chain (which has
 *    already "closed" from its own perspective by the time c_ab is resolved).
 *
 * Falls back to treating every table in `model.tables` as visible to every
 * join when the `ИЗ` clause has more than one disconnected root (comma-
 * separated sources, each starting its own chain) — real 1C's behavior for
 * that combination has not been verified yet, and this fallback exactly
 * matches this project's existing, corpus-proven `qualifyBareFields.ts`
 * assumption, so it can never regress below today's behavior, only sometimes
 * not yet improve on it.
 */
import type { QueryModel, Join, SelectedTable } from '../query/queryModel';

interface JoinTreeNode {
  join: Join;
  children: JoinTreeNode[];
}

/**
 * Reconstructs the join tree from `model.joins`'s preorder-with-depth encoding
 * (see `Join.depth`'s own doc in queryModel.ts: "Список joins — преордер
 * дерева: вложенные соединения идут сразу за своим внешним"). Standard
 * preorder-to-tree reconstruction: a stack indexed by depth, truncated back to
 * the current depth before attaching each node.
 */
function buildJoinTree(joins: readonly Join[]): JoinTreeNode[] {
  const roots: JoinTreeNode[] = [];
  const stack: JoinTreeNode[] = [];
  for (const j of joins) {
    const depth = j.depth ?? 0;
    const node: JoinTreeNode = { join: j, children: [] };
    stack.length = depth;
    const parent = depth > 0 ? stack[depth - 1] : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node); // depth 0, or a malformed depth with no matching ancestor — fail open as a root
    stack[depth] = node;
  }
  return roots;
}

/**
 * Every table besides the very first `ИЗ` source must be reachable as SOME
 * join's `joinedTableId` for the whole `ИЗ` clause to be one connected chain
 * (as opposed to comma-separated independent sources, each starting fresh).
 */
function isSingleConnectedChain(tables: readonly SelectedTable[], joins: readonly Join[]): boolean {
  if (tables.length <= 1) return true;
  const joinedIds = new Set(
    joins.map((j) => j.joinedTableId).filter((id): id is string => id !== undefined),
  );
  return tables.slice(1).every((t) => joinedIds.has(t.id));
}

/**
 * Resolves one run of sibling nodes at the same nesting depth (either the
 * top-level flat chain, or one right-nested sub-chain), accumulating
 * visibility monotonically across siblings per rule 1, recursing into each
 * node's own nested children first per rules 2-3. Returns the fully-
 * accumulated set at the end of this run, for the caller (the enclosing join,
 * if any) to merge into its own visibility per rule 3.
 */
function resolveChain(
  nodes: readonly JoinTreeNode[],
  seedTableId: string,
  result: Map<Join, ReadonlySet<string>>,
): Set<string> {
  let accumulated = new Set<string>([seedTableId]);
  for (const node of nodes) {
    const joinedId = node.join.joinedTableId;
    let childAccumulated = new Set<string>(joinedId !== undefined ? [joinedId] : []);
    if (node.children.length > 0 && joinedId !== undefined) {
      childAccumulated = resolveChain(node.children, joinedId, result);
    }
    const visible = new Set<string>([...accumulated, ...childAccumulated]);
    result.set(node.join, visible);
    accumulated = visible;
  }
  return accumulated;
}

/**
 * For each join in `model.joins`, the set of table ids that are valid
 * bare-field-ownership candidates for that join's own `ПО` condition. Empty
 * map if the model has no joins.
 */
export function computeJoinVisibility(model: QueryModel): ReadonlyMap<Join, ReadonlySet<string>> {
  const joins = model.joins ?? [];
  const result = new Map<Join, ReadonlySet<string>>();
  if (joins.length === 0) return result;

  if (!isSingleConnectedChain(model.tables, joins)) {
    const all = new Set(model.tables.map((t) => t.id));
    for (const j of joins) result.set(j, all);
    return result;
  }

  const rootSeed = model.tables[0]?.id;
  if (rootSeed === undefined) return result;
  resolveChain(buildJoinTree(joins), rootSeed, result);
  return result;
}
