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
 * (see `resolveAliasAt.ts`/hover), so populating the index here is enough —
 * `scopesById`/`referencesBySymbolId` stay empty until an actual consumer
 * needs them materialized too (per this roadmap's own established discipline:
 * don't build structure ahead of a real, concrete need).
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
 * `'partial'` (also a valid `SemanticCompleteness` value) is NOT reachable by
 * this function today — this parser has no partial-tree recovery (a hard parse
 * failure loses ALL structure, not just the broken part). The value exists so
 * a future, more capable recovery strategy (real partial-tree parsing, listed
 * as later roadmap work) can report it without a breaking type change; treat
 * its absence here as an honest gap, not an oversight.
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
  const base = parens ?? sourceText;
  const selects = safeRepair(() => repairSelectListsForRecovery(base));
  const sections = (text: string | undefined, nested: boolean): string | undefined =>
    text === undefined ? undefined : safeRepair(() => repairTrailingSectionsForRecovery(text, nested));
  const candidates = [
    parens,
    selects,
    sections(base, false),
    sections(selects, false),
    sections(base, true),
    sections(selects, true),
  ];
  for (const repairedText of candidates) {
    if (repairedText === undefined) continue;
    try {
      // Every repair keeps each original offset (in-place blanking, or `)`
      // appended after the end). Checked rather than assumed: if a future
      // repair ever shifted offsets, the snapshot must lose its positions
      // instead of reporting wrong ones.
      if (keepsOffsets(sourceText, repairedText)) {
        const sink = new RecordingBatchSourceMapSink();
        const model = parseBatch(repairedText, resolver, { batchSourceMap: sink });
        return withSymbolIndex(createSemanticSnapshot(documentVersion, sourceText, model, 'recovered', sink.events));
      }
      return withSymbolIndex(createSemanticSnapshot(documentVersion, sourceText, parseBatch(repairedText, resolver), 'recovered'));
    } catch {
      // this repair wasn't enough — try the next one
    }
  }
  if (plain) return plain;

  return createSemanticSnapshot(documentVersion, sourceText, EMPTY_BATCH, 'unavailable');
}

/** A repair that itself throws (lexically invalid text) just yields no candidate. */
function safeRepair(repair: () => string | undefined): string | undefined {
  try {
    return repair();
  } catch {
    return undefined;
  }
}

/** Same length, or only `)` appended after the original end. */
function keepsOffsets(source: string, repaired: string): boolean {
  return repaired.length >= source.length && /^\)*$/.test(repaired.slice(source.length));
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
    const sink = new RecordingBatchSourceMapSink();
    const model = parseBatch(nested, resolver, { batchSourceMap: sink });
    const recovered = withSymbolIndex(createSemanticSnapshot(documentVersion, sourceText, model, 'recovered', sink.events));
    return recovered.index.symbolsById.size > plain.index.symbolsById.size ? recovered : plain;
  } catch {
    return plain;
  }
}
