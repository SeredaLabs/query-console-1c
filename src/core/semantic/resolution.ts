/**
 * Phase 2b of the semantic-core roadmap (memory: project-semantic-core-roadmap).
 *
 * Shared result shape for the whole semantic layer, planned since the design's
 * very first refinement round and now needed by real code (`computeJoinVisibility`,
 * `resolveCorrelatedField`) rather than anticipated speculatively.
 *
 * Formalizes this project's existing fail-open philosophy (already used ad hoc
 * via `targetUnresolved`/`fieldNotFound` in `hoverFieldInfo.ts`): `'unknown'` is
 * NOT the same as an error — it means "not enough information to say", and is a
 * valid, permanent answer for constructs this layer doesn't (yet, or ever) model.
 * `'ambiguous'` is distinct from both: enough information to know MULTIPLE
 * candidates are plausible, with none preferred — critically different from
 * silently guessing one.
 */
export type Resolution<T> =
  | { kind: 'resolved'; value: T }
  | { kind: 'ambiguous'; candidates: readonly T[] }
  | { kind: 'unknown' };
