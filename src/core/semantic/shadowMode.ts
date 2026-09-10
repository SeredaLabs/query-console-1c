/**
 * Phase 3b of the semantic-core roadmap (memory: project-semantic-core-roadmap).
 *
 * Shadow-mode comparison harness, per Refinement 4/5's explicit requirement
 * before any hover/completion cutover (Phase 3d/3e): run `resolveAliasAt`
 * (position-aware, new) alongside `hoverFieldInfo.ts`'s existing
 * `findAliasTable` (flat, first-match across the whole batch, position-blind,
 * new) on the SAME real corpus text, and CLASSIFY every disagreement — a raw
 * disagreement count/rate is explicitly rejected as a migration gate by this
 * roadmap's own design history (Refinement 4): "20 disagreements out of
 * 10,000 sounds fine until you learn all 20 are the new resolver confidently
 * resolving to the WRONG table."
 *
 * This module only DISCOVERS and CLASSIFIES disagreements over the large
 * corpus — it does NOT adjudicate which resolver is "right" for a given case
 * (that needs a human, or a promotion into a curated, hand-verified oracle
 * fixture — see `test/unit/resolveAliasAt.test.ts`, which already encodes the
 * cases live-verified against real 1C in Phase 2a). Per Refinement 5's
 * asymmetry: "new resolver confidently WRONG [relative to the CURATED
 * ORACLE]" is the hard blocker for cutover, not "corpus sweep found a
 * disagreement" — plenty of real disagreements are EXPECTED and desired here
 * (e.g. a right-nested JOIN condition where the old flat lookup incorrectly
 * includes the outer seed and the new resolver correctly excludes it) since
 * discovering them for review is the whole point of this harness.
 */
import type { MetadataResolver } from '../query/metadataResolver';
import { findAliasTable } from '../query/findAliasTable';
import { buildSemanticSnapshotFromText } from './buildSemanticSnapshot';
import { resolveAliasAt } from './resolveAliasAt';
import { resolveSymbolTable } from './collectSymbols';
import type { Symbol, SemanticSnapshot } from './semanticSnapshot';
import type { Resolution } from './resolution';

export type ShadowModeClassification =
  | 'sameResolved'
  | 'differentResolved'
  | 'oldResolvedNewAmbiguous'
  | 'oldResolvedNewUnknown'
  | 'oldUnknownNewResolved'
  | 'oldUnknownNewAmbiguous'
  | 'bothUnknown';

export interface ShadowModeCase {
  alias: string;
  position: number;
  classification: ShadowModeClassification;
  /** `${fullName}#${alias}` signature for whichever table each side landed on — a best-effort DISCOVERY identity, not a strict cross-parse object identity (see module doc: two separate `parseBatch` calls never share table object references). */
  oldSignature?: string;
  newSignature?: string;
}

function tableSignature(fullName: string, alias: string): string {
  return `${fullName}#${alias}`;
}

function newResolutionSignature(snapshot: SemanticSnapshot, resolution: Resolution<Symbol>): string | undefined {
  if (resolution.kind !== 'resolved') return undefined;
  const table = resolveSymbolTable(snapshot.model, resolution.value.ref.path);
  if (!table) return undefined; // malformed path — should not happen; fail open rather than throw
  return tableSignature(table.fullName, table.alias ?? '');
}

/**
 * Classifies one (alias, position) comparison. `oldSignature`/`newSignature`
 * are used only for the `sameResolved`/`differentResolved` split — anything
 * else is determined purely by which side resolved/was ambiguous/was unknown.
 */
export function classify(
  oldFound: boolean,
  oldSignature: string | undefined,
  newResolution: Resolution<Symbol>,
  newSignature: string | undefined,
): ShadowModeClassification {
  if (!oldFound) {
    if (newResolution.kind === 'resolved') return 'oldUnknownNewResolved';
    if (newResolution.kind === 'ambiguous') return 'oldUnknownNewAmbiguous';
    return 'bothUnknown';
  }
  if (newResolution.kind === 'unknown') return 'oldResolvedNewUnknown';
  if (newResolution.kind === 'ambiguous') return 'oldResolvedNewAmbiguous';
  return oldSignature === newSignature ? 'sameResolved' : 'differentResolved';
}

/** Finds every `<identifier>.` occurrence in `text` outside string literals — candidate alias-reference positions to shadow-compare. */
function findAliasReferencePositions(text: string): Array<{ alias: string; position: number }> {
  const out: Array<{ alias: string; position: number }> = [];
  const re = /([\p{L}][\p{L}\p{N}_]*)\s*\./gu;
  let inString = false;
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    // Best-effort string-literal guard: count unescaped quotes before this match's start.
    const before = text.slice(0, m.index);
    const quoteCount = (before.match(/"/g) ?? []).length;
    inString = quoteCount % 2 === 1;
    if (!inString) out.push({ alias: m[1], position: m.index });
  }
  return out;
}

/**
 * Runs both resolvers on every alias-reference candidate found in `text`,
 * returning one classified `ShadowModeCase` per candidate. Never throws —
 * a resolver failure on one candidate is recorded as that side being
 * "not found"/`'unknown'`, matching both resolvers' own fail-open philosophy;
 * a hard crash here would defeat the point of sweeping a large, uncurated
 * corpus.
 */
export function runShadowModeSweep(text: string, resolver: MetadataResolver): ShadowModeCase[] {
  const snapshot = buildSemanticSnapshotFromText(1, text, resolver);
  const cases: ShadowModeCase[] = [];
  for (const { alias, position } of findAliasReferencePositions(text)) {
    let oldFound = false;
    let oldSignature: string | undefined;
    try {
      const old = findAliasTable(text, resolver, alias);
      if (old) {
        oldFound = true;
        oldSignature = tableSignature(old.table.fullName, old.table.alias ?? '');
      }
    } catch {
      // treat as not-found — matches findAliasTable's own fail-open contract
    }

    let newResolution: Resolution<Symbol>;
    try {
      newResolution = resolveAliasAt(snapshot, position, alias);
    } catch {
      newResolution = { kind: 'unknown' };
    }
    const newSignature = newResolutionSignature(snapshot, newResolution);

    cases.push({
      alias,
      position,
      classification: classify(oldFound, oldSignature, newResolution, newSignature),
      oldSignature,
      newSignature,
    });
  }
  return cases;
}

/** Tallies a batch of cases by classification — the summary shape `test:unit`'s corpus sweep and any future CI report reads. */
export function summarize(cases: readonly ShadowModeCase[]): Record<ShadowModeClassification, number> {
  const summary: Record<ShadowModeClassification, number> = {
    sameResolved: 0,
    differentResolved: 0,
    oldResolvedNewAmbiguous: 0,
    oldResolvedNewUnknown: 0,
    oldUnknownNewResolved: 0,
    oldUnknownNewAmbiguous: 0,
    bothUnknown: 0,
  };
  for (const c of cases) summary[c.classification]++;
  return summary;
}
