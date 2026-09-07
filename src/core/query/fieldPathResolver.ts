import type { MetadataResolver } from './metadataResolver';
import type { MetaTable, MetaField } from '../metadata/types';

/**
 * Shared field-path resolution kernel (semantic-core hardening, step 1).
 *
 * `findField`/`firstRef` and the "walk segments through reference fields" loop were
 * independently hand-written at least three times — `canonicalizeFieldCasing.ts`,
 * `resolveBuilderStar.ts`, and `dropRedundantGroupDerefs.ts` — with `findField`/
 * `firstRef` byte-for-byte identical across all three, and the walking loop sharing
 * the same shape but with small, real behavioral differences between sites (see
 * `resolveFieldPath`'s doc comment). This module is the single source of truth for
 * that shared behavior.
 *
 * DELIBERATE SCOPE LIMIT: this module is currently ADDITIVE ONLY. None of the three
 * existing consumers have been migrated to it yet — each has its own local behavior
 * (e.g. `dropRedundantGroupDerefs.ts`'s head-segment dimension/resource special case,
 * or the differing `metaFor` tabular-section fallback between call sites) that a
 * migration must either preserve via a consumer-side check on top of this kernel's
 * output, or reconcile deliberately with corpus proof — not silently. Do not remove
 * the old implementations or wire this in without that per-consumer parity work; see
 * `test/unit/fieldPathResolver.test.ts` for the parity fixtures this was verified
 * against.
 */

/** Classification of what a single resolved segment's OWN type is (independent of
 * chain position) — mirrors `resolveBuilderStar.ts`'s three-way (plus `'parameter'`,
 * handled by callers before reaching a `MetaTable`, not by this module) result. */
export type FieldKindClassification = 'reference' | 'scalar' | 'unknown';

export interface ResolvedSegment {
  /** Segment text as written in the query (original casing). */
  requested: string;
  /** The metadata field found for this segment. */
  field: MetaField;
  /** This segment's own classification (does IT hold a reference, a proven scalar,
   * or an unproven/synthetic type — e.g. a temp-table column with `types: []`). */
  kind: FieldKindClassification;
  /** Reference target table, when `kind === 'reference'` AND the target metadata
   * was itself found (`resolver.tableByFullName` succeeded). `undefined` if the
   * field is a reference but its target table isn't in the resolver — this is the
   * "unknown != invalid" case: the field IS a reference, we just can't navigate
   * further through it. */
  refTarget?: MetaTable;
}

export interface FieldPathResolution {
  /** Segments successfully matched against metadata, in order, stopping at (and
   * NOT including) the first unresolvable segment. */
  resolved: ResolvedSegment[];
  /** Everything from the first unresolvable segment onward, verbatim — empty if
   * every segment resolved. Never guessed at, never dropped. */
  unresolvedTail: string[];
  /** Overall classification: the last resolved segment's own `kind` if the path
   * fully resolved OR stopped because an intermediate segment turned out
   * non-navigable (scalar/unknown); `'unknown'` if the FIRST unresolvable segment
   * had no field at all (name not found, or no starting metadata). This matches
   * what `resolveBuilderStar.ts`'s `walk()` already returns for the union of both
   * cases — see parity tests. */
  kind: FieldKindClassification;
  /**
   * WHY resolution stopped before consuming every segment — `undefined` when
   * `unresolvedTail` is empty (nothing to explain). This distinction matters for any
   * consumer that wants to report a diagnostic (e.g. "field not found"): only
   * `'fieldNotFound'` is safe to surface as an error — it means we HAD a real,
   * resolved `MetaTable` and searched its actual field list. `'targetUnresolved'`
   * means an earlier segment's reference target isn't in the metadata cache at all
   * (a metadata-completeness gap, not proof the field is invalid) — per the
   * project's "unknown != invalid" rule, this must never be reported as an error.
   */
  stoppedReason?: 'fieldNotFound' | 'targetUnresolved';
}

/** Case-insensitive field lookup by name — the single most duplicated primitive in
 * the codebase (byte-identical in `canonicalizeFieldCasing.ts`, `resolveBuilderStar.ts`,
 * `dropRedundantGroupDerefs.ts` before this module existed). */
export function findField(meta: MetaTable, name: string): MetaField | undefined {
  const up = name.toUpperCase();
  return meta.fields.find(f => f.name.toUpperCase() === up);
}

/** First reference type on a field, if any (a field's `types` is a union — 1C fields
 * are rarely-but-sometimes polymorphic; every existing consumer takes the first). */
export function firstRef(field: MetaField): { kind: string; name: string } | undefined {
  for (const t of field.types) if (t.ref) return t.ref;
  return undefined;
}

/** Does this table itself look "reference-shaped" (has a `Ссылка` field that is
 * itself a reference)? This is a TABLE-level question, not a segment-walk question —
 * it answers `resolveFieldPath(meta, [], resolver)`'s otherwise-undefined case: a
 * bare alias/select-field with zero further path segments (`Alias.*` in a report
 * builder block, no dot after the alias). Exported so callers that already have a
 * `MetaTable` in hand for other reasons don't need to re-derive this themselves. */
export function hasReference(meta: MetaTable): boolean {
  const ssylka = findField(meta, 'Ссылка');
  return ssylka !== undefined && firstRef(ssylka) !== undefined;
}

/**
 * Walks `segs` from `meta` through reference fields, resolving each segment against
 * metadata. Stops at the first segment that can't be matched (no such field, or the
 * previous segment's reference target has no metadata) and returns everything
 * resolved so far plus the unresolved tail verbatim.
 *
 * Never throws, never guesses — per the project-wide "unknown != invalid" rule
 * (docs/development/known-issues.md and the header comments of every consumer this
 * was extracted from): an incomplete metadata graph must degrade to "we don't know",
 * not to a false error or a fabricated guess.
 *
 * NOTE on known behavioral variance NOT captured here (left to callers deliberately,
 * see module doc comment):
 * - `dropRedundantGroupDerefs.ts` treats a HEAD segment classified `dimension`/
 *   `resource` (register measures) specially (never treated as provably reference,
 *   regardless of whether it actually has a reference type) — callers that need this
 *   must check `resolution.resolved[0]?.field.kind` themselves.
 * - The starting `meta` here is assumed already resolved — the "fullName with
 *   fallbacks" step (virtual-table slice, tabular-section-as-table) that some but not
 *   all consumers apply before calling this is intentionally NOT folded in yet; see
 *   the Architecture Report for why.
 *
 * `segs.length === 0` (a bare alias/select-field with no further path — `Alias.*`
 * with nothing after the dot, reachable via the report-builder grammar) is handled
 * via `hasReference(meta)`, matching `resolveBuilderStar.ts`'s original special case
 * for this input — found during the pre-migration audit; NOT covered by the
 * project's golden corpus, so this was previously untested even indirectly.
 */
export function resolveFieldPath(
  meta: MetaTable,
  segs: string[],
  resolver: MetadataResolver
): FieldPathResolution {
  if (segs.length === 0) {
    return { resolved: [], unresolvedTail: [], kind: hasReference(meta) ? 'reference' : 'scalar' };
  }

  const resolved: ResolvedSegment[] = [];
  let cur: MetaTable | undefined = meta;

  for (let i = 0; i < segs.length; i++) {
    if (!cur) {
      return { resolved, unresolvedTail: segs.slice(i), kind: 'unknown', stoppedReason: 'targetUnresolved' };
    }
    const field = findField(cur, segs[i]);
    if (!field) {
      return { resolved, unresolvedTail: segs.slice(i), kind: 'unknown', stoppedReason: 'fieldNotFound' };
    }

    const ref = firstRef(field);
    const isLast = i === segs.length - 1;
    let kind: FieldKindClassification;
    let refTarget: MetaTable | undefined;
    if (ref) {
      kind = 'reference';
      refTarget = resolver.tableByFullName(`${ref.kind}.${ref.name}`);
    } else {
      // A synthetic temp-table column (`types: []`, see sdblParser.ts's
      // registerTempTables) has UNPROVEN non-reference-ness — 'unknown', not
      // 'scalar'. A real non-reference field always has a non-empty `types`.
      kind = field.types.length === 0 ? 'unknown' : 'scalar';
    }

    resolved.push({ requested: segs[i], field, kind, refTarget });

    if (isLast) return { resolved, unresolvedTail: [], kind };
    if (kind !== 'reference') return { resolved, unresolvedTail: segs.slice(i + 1), kind };
    cur = refTarget;
  }

  return { resolved, unresolvedTail: [], kind: 'unknown' };
}
