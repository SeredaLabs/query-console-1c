/**
 * Phase 2b of the semantic-core roadmap (memory: project-semantic-core-roadmap).
 *
 * Correlated-subquery field resolution: when a bare field inside a subquery
 * doesn't belong to any of the subquery's own local sources, real 1C searches
 * ENCLOSING levels — but as NEAREST-ANCESTOR-WINS lexical scoping, not a
 * flattened "all ancestors at once" set.
 *
 * Live-verified against a real 1C instance (Phase 2a, 2026-09-10) with a
 * 3-level-deep correlated subquery and a field name shared by the grandparent
 * and parent levels (absent from the innermost level):
 * - The immediate parent having a match resolves cleanly to it, with NO
 *   ambiguity error — even though the grandparent ALSO has a matching field.
 *   Real 1C does not even consider the grandparent a competing candidate once
 *   the parent already answers unambiguously.
 * - Removing the field from the parent (leaving it only on the grandparent)
 *   still resolves successfully via the grandparent — proving genuine
 *   fallback through multiple ancestor levels, not "only the immediate
 *   parent is ever reachable."
 *
 * This means resolution must check ONE ancestor level at a time, nearest
 * first, and stop at the FIRST level that has any match (resolved if exactly
 * one, ambiguous if more than one AT THAT SAME LEVEL) — never pooling two
 * different levels' candidates together into one ambiguity check.
 */
import type { Resolution } from './resolution';
import { matchesAtNearestLevel } from '../query/nearestAncestor';

/**
 * Shared core: checks ONE ancestor level at a time, nearest first, and stops
 * at the FIRST level with ANY match (resolved if exactly one, ambiguous if
 * more than one AT THAT SAME LEVEL) — never pools two different levels'
 * candidates together. `ancestorLevels` must be ordered NEAREST-FIRST.
 * Used by `resolveAliasAt` (alias symbols). The level walk itself is
 * `matchesAtNearestLevel` (`src/core/query`), which bare-field correlation uses
 * directly (`qualifyBareFields`, `correlatedOuterAlias`) — same rule, different
 * match predicate. The live experiment is pinned in `correlation.test.ts`.
 */
export function resolveNearestAncestorMatch<T>(
  matches: (item: T) => boolean,
  ancestorLevels: readonly (readonly T[])[],
): Resolution<T> {
  const found = matchesAtNearestLevel(matches, ancestorLevels);
  if (found.length === 1) return { kind: 'resolved', value: found[0] };
  if (found.length > 1) return { kind: 'ambiguous', candidates: found };
  return { kind: 'unknown' };
}
