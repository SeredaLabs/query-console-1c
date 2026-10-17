/**
 * Computes, for each JOIN in a single `QueryModel`'s `ИЗ` clause, which table
 * ids are valid bare-field-ownership candidates for THAT join's own `ПО`
 * condition — i.e. the real lexical-scope visibility rules for JOIN chains.
 *
 * Lives in `src/core/query` (not `src/core/semantic`) because it depends only
 * on `QueryModel`/`Join`/`SelectedTable`, and BOTH
 * `src/core/semantic/resolveAliasAt.ts` AND `qualifyBareFields.ts` (the
 * parse-time bare-field qualification pass) need it; `src/core/semantic` may
 * depend on `src/core/query`, never the reverse.
 *
 * The rules below are NOT derived from reading the grammar or guessing — they
 * were live-verified against a real 1C instance (2026-09-10) by feeding deliberately-crafted raw SDBL text through the real
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
 * 4. Comma-separated roots (U3, СхемаЗапроса on SL_kza 8.3.15.1489,
 *    2026-10-15, `test/fixtures/platform/u3-comma-join-visibility.json`): a
 *    join condition sees only its OWN chain — a qualified or bare reference to
 *    another comma root is `Field not found`, whether that root is listed
 *    before or after the chain, and a bare name present in the own chain and
 *    in another root binds to the own chain. Each root's chain is resolved by
 *    rules 1–3 from that root.
 *
 * Joins without chain positions (`seedTableId`/`joinedTableId`, joins created
 * in the UI) keep the previous fallback for several roots: every table visible.
 */
import type { QueryModel, Join, SelectedTable } from './queryModel';

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
 * Rule 4: splits the top-level joins into one chain per comma root. A top-level
 * join continues a chain when its seed is a table that chain already contains
 * (the chain's root or any table it joined, nested ones included); otherwise its
 * seed starts a new chain.
 */
function resolveCommaRoots(roots: readonly JoinTreeNode[], result: Map<Join, ReadonlySet<string>>): void {
  const chains: Array<{ seed: string; tables: Set<string>; nodes: JoinTreeNode[] }> = [];
  const collect = (node: JoinTreeNode, into: Set<string>): void => {
    if (node.join.joinedTableId !== undefined) into.add(node.join.joinedTableId);
    for (const child of node.children) collect(child, into);
  };
  for (const node of roots) {
    const seed = node.join.seedTableId!;
    let chain = chains.find(c => c.tables.has(seed));
    if (!chain) {
      chain = { seed, tables: new Set([seed]), nodes: [] };
      chains.push(chain);
    }
    chain.nodes.push(node);
    collect(node, chain.tables);
  }
  for (const chain of chains) resolveChain(chain.nodes, chain.seed, result);
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
    if (joins.every(j => j.seedTableId !== undefined && j.joinedTableId !== undefined)) {
      resolveCommaRoots(buildJoinTree(joins), result);
      return result;
    }
    const all = new Set(model.tables.map((t) => t.id));
    for (const j of joins) result.set(j, all);
    return result;
  }

  const rootSeed = model.tables[0]?.id;
  if (rootSeed === undefined) return result;
  resolveChain(buildJoinTree(joins), rootSeed, result);
  return result;
}
