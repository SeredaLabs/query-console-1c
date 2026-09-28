/**
 * Phase 1c of the semantic-core roadmap (memory: project-semantic-core-roadmap).
 *
 * Tolerant snapshot construction: a `SemanticSnapshot` should be buildable EVEN
 * when the raw text doesn't fully parse — this project's own hover/completion
 * already regressed once in production (v0.1.33) on an everyday malformed-query
 * case (a missing comma), which is exactly why the tolerant/recovered distinction
 * matters here too: a new semantic layer that only works on fully-parseable
 * queries would be a REGRESSION relative to already-shipped behavior, not an
 * improvement.
 *
 * Reuses the SAME recovery heuristic hover/completion already rely on
 * (`repairSelectListsForRecovery`, moved to `../query/selectListRepair` in this
 * phase precisely so it isn't duplicated) rather than inventing a parallel one.
 *
 * A `'complete'` snapshot also collects `sourceMapEvents` (batch-wide, absolute
 * table/union-member ranges) via `parseBatch`'s `batchSourceMap` option —
 * closing a gap an external review of Phase 1a-1c correctly flagged: proving
 * the position mapping at the single-`parseDocument` level (the original
 * Phase 1b oracle suite) doesn't help THIS function's actual entry point,
 * `parseBatch`, which parses a whole (potentially multi-statement) batch.
 *
 * Phase 3d (hover migration): this is also where `index.symbolsById` gets
 * materialized — `collectSourceAliasSymbols` runs ONCE here (for `'complete'`
 * and `'recovered'` models; source/alias structure is trustworthy in both,
 * see the `'recovered'` case above) instead of every `resolveAliasAt` call
 * re-walking the whole `BatchDocument` from scratch. `createSemanticSnapshot`
 * itself stays a plain, symbol-free skeleton constructor (`semanticSnapshot.ts`
 * is Phase 1a's foundational module and has no reason to depend on Phase 3a's
 * `collectSymbols.ts`); this function is the one real production entry point
 * (see `resolveAliasAt.ts`/hover), so populating the index here is enough.
 * Scope and reference indexes are deliberately absent until a real consumer
 * needs them (per this roadmap's own discipline: don't build structure ahead of
 * a concrete need).
 */
import { parseBatch } from '../query/sdblParser';
import type { MetadataResolver } from '../query/metadataResolver';
import { repairSelectListsForRecovery, repairTrailingSectionsForRecovery, repairUnbalancedParensForRecovery } from '../query/selectListRepair';
import type { BatchDocument } from '../query/batchModel';
import { RecordingBatchSourceMapSink } from '../query/sourceMap';
import { createSemanticSnapshot, type SemanticSnapshot } from './semanticSnapshot';
import { collectSourceAliasSymbols } from './collectSymbols';

const EMPTY_BATCH: BatchDocument = { members: [] };

function withSymbolIndex(snapshot: SemanticSnapshot): SemanticSnapshot {
  const symbols = collectSourceAliasSymbols(snapshot.model);
  if (symbols.length === 0) return snapshot;
  return {
    ...snapshot,
    index: { ...snapshot.index, symbolsById: new Map(symbols.map((s) => [s.id, s])) },
  };
}

/**
 * Builds a `SemanticSnapshot` from raw source text, trying increasingly lossy
 * strategies until one succeeds:
 *  1. a plain `parseBatch` — `completeness: 'complete'`, unless the text has an
 *     unclosed `(` (it can swallow ИЗ while still parsing; S2).
 *  2. recovery repairs, least destructive first — `completeness: 'recovered'`:
 *     the unclosed-parenthesis repair (when needed), then on top of it
 *     `repairSelectListsForRecovery` (placeholder SELECT lists, keeping
 *     `ИЗ`/aliases/joins), `repairTrailingSectionsForRecovery` (blanked
 *     ORDER/GROUP/TOTALS/INDEX sections, statement level, then also inside
 *     subqueries) and both together. Every repair keeps
 *     original offsets, so `sourceMapEvents` are kept. A recovered model's own
 *     SELECT-list fields may be placeholders, not the user's real fields —
 *     consumers that need real field data (not just source/alias visibility)
 *     must treat a `'recovered'` snapshot's fields as unreliable.
 *  3. the plain parse from step 1 when it succeeded but no repair parsed.
 *  4. nothing works — `completeness: 'unavailable'`, an EMPTY model (no
 *     tables/fields at all), never a thrown exception.
 *
 * There is no partial-tree state: this parser has no partial-tree recovery (a
 * hard parse failure loses ALL structure, not just the broken part). A future
 * strategy that can report one adds its own `SemanticCompleteness` value
 * together with the consumers that handle it (S3).
 */
export function buildSemanticSnapshotFromText(
  documentVersion: number,
  sourceText: string,
  resolver?: MetadataResolver,
): SemanticSnapshot {
  // S2: with an unclosed `(` a parse can succeed and still be unusable (the
  // parenthesis swallows ИЗ: no sources). Such text is recovered first; the
  // plain parse is kept only when no repair parses.
  const parens = safeRepair(() => repairUnbalancedParensForRecovery(sourceText));
  let plain: SemanticSnapshot | undefined;
  try {
    const sink = new RecordingBatchSourceMapSink();
    const model = parseBatch(sourceText, resolver, { batchSourceMap: sink });
    plain = withSymbolIndex(createSemanticSnapshot(documentVersion, sourceText, model, 'complete', sink.events));
    if (parens === undefined) return preferNestedRecovery(plain, documentVersion, sourceText, resolver);
  } catch {
    // falls through to the recovery attempts below
  }

  // Recovery candidates, least destructive first: real SELECT lists are kept
  // when only a trailing section is broken (C18/C19).
  const base = parens?.text ?? sourceText;
  const inserted = parens?.inserted ?? [];
  const selects = safeRepair(() => repairSelectListsForRecovery(base));
  const sections = (text: string | undefined, nested: boolean): string | undefined =>
    text === undefined ? undefined : safeRepair(() => repairTrailingSectionsForRecovery(text, nested));
  const candidates = [
    parens?.text,
    selects,
    sections(base, false),
    sections(selects, false),
    sections(base, true),
    sections(selects, true),
  ];
  for (const repairedText of candidates) {
    if (repairedText === undefined) continue;
    try {
      return recoveredSnapshot(documentVersion, sourceText, repairedText, inserted, resolver);
    } catch {
      // this repair wasn't enough — try the next one
    }
  }
  if (plain) return plain;

  return createSemanticSnapshot(documentVersion, sourceText, EMPTY_BATCH, 'unavailable');
}

/**
 * The one way a repaired text becomes a `'recovered'` snapshot, for every recovery
 * path. Throws when `repairedText` does not parse (callers try the next candidate).
 *
 * Repairs edit in place; only the parenthesis repair adds `)` characters, listed
 * in `inserted` (source offsets), so positions are mapped back to `sourceText`.
 * Checked rather than assumed: when the length does not match, the snapshot gets
 * no source-map events (no trustworthy positions) instead of wrong ones.
 */
function recoveredSnapshot(
  documentVersion: number,
  sourceText: string,
  repairedText: string,
  inserted: readonly number[],
  resolver: MetadataResolver | undefined,
): SemanticSnapshot {
  if (repairedText.length !== sourceText.length + inserted.length) {
    return withSymbolIndex(createSemanticSnapshot(documentVersion, sourceText, parseBatch(repairedText, resolver), 'recovered'));
  }
  const sink = new RecordingBatchSourceMapSink();
  const model = parseBatch(repairedText, resolver, { batchSourceMap: sink });
  const events = inserted.length === 0 ? sink.events : sink.events.map(e => ({
    ...e,
    range: { start: toSourceOffset(e.range.start, inserted), end: toSourceOffset(e.range.end, inserted) },
  }));
  return withSymbolIndex(createSemanticSnapshot(documentVersion, sourceText, model, 'recovered', events));
}

/** A repair that itself throws (lexically invalid text) just yields no candidate. */
function safeRepair<T>(repair: () => T | undefined): T | undefined {
  try {
    return repair();
  } catch {
    return undefined;
  }
}

/**
 * Repaired-text offset → source offset, given the sorted source offsets before
 * which one character each was inserted (the i-th inserted character sits at
 * repaired offset `inserted[i] + i`).
 */
function toSourceOffset(repaired: number, inserted: readonly number[]): number {
  let before = 0;
  while (before < inserted.length && inserted[before] + before < repaired) before++;
  return repaired - before;
}

/**
 * S2: a broken section inside a condition subquery (`В (ВЫБРАТЬ … СГРУППИРОВАТЬ
 * ПО К. ,)`) does not fail the parse: the whole subquery silently stays custom
 * text, so its aliases are lost. When the text has sections inside subqueries,
 * the nested section repair is tried too and kept only if it yields MORE source
 * aliases; otherwise the complete snapshot is returned unchanged.
 */
function preferNestedRecovery(
  plain: SemanticSnapshot,
  documentVersion: number,
  sourceText: string,
  resolver: MetadataResolver | undefined,
): SemanticSnapshot {
  const nested = safeRepair(() => repairTrailingSectionsForRecovery(sourceText, true));
  if (nested === undefined || nested === safeRepair(() => repairTrailingSectionsForRecovery(sourceText, false))) return plain;
  try {
    const recovered = recoveredSnapshot(documentVersion, sourceText, nested, [], resolver);
    return recovered.index.symbolsById.size > plain.index.symbolsById.size ? recovered : plain;
  } catch {
    return plain;
  }
}
