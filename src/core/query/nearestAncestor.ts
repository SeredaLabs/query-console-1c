/**
 * Nearest-ancestor-wins lookup for correlated references from inside a
 * subquery, live-verified against real 1C (semantic-core roadmap Phase 2a,
 * 2026-09-10; see `src/core/semantic/correlation.ts` for the verification
 * details): enclosing levels are checked ONE AT A TIME, nearest first, and the
 * first level with ANY match decides — its candidates are never pooled with a
 * farther level's.
 *
 * Lives in `src/core/query` so both the parse-time bare-field qualification
 * pass (`qualifyBareFields.ts`) and the semantic layer
 * (`src/core/semantic/correlation.ts`) apply the SAME rule; `src/core/query`
 * must not import from `src/core/semantic`.
 */

/**
 * Candidates at the nearest level that has any match, or `[]` when no level
 * matches. `levels` must be ordered NEAREST-FIRST. One element — resolved; more
 * than one — ambiguous at that level.
 */
export function matchesAtNearestLevel<T>(
  matches: (item: T) => boolean,
  levels: readonly (readonly T[])[],
): T[] {
  for (const level of levels) {
    const found = level.filter(matches);
    if (found.length > 0) return found;
  }
  return [];
}
