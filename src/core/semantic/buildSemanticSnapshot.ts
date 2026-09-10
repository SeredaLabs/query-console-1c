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
import { repairSelectListsForRecovery } from '../query/selectListRepair';
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
 *  1. a plain `parseBatch` — `completeness: 'complete'`.
 *  2. `repairSelectListsForRecovery` (blanks out broken top-level SELECT lists,
 *     keeping `ИЗ`/aliases/joins intact) then `parseBatch` again —
 *     `completeness: 'recovered'`. The recovered model's own SELECT-list fields
 *     are placeholders, not the user's real fields — consumers that need real
 *     field data (not just source/alias visibility) must treat a `'recovered'`
 *     snapshot's fields as unreliable.
 *  3. neither works — `completeness: 'unavailable'`, an EMPTY model (no
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
  try {
    const sink = new RecordingBatchSourceMapSink();
    const model = parseBatch(sourceText, resolver, { batchSourceMap: sink });
    return withSymbolIndex(createSemanticSnapshot(documentVersion, sourceText, model, 'complete', sink.events));
  } catch {
    // falls through to the recovery attempt below
  }

  const repairedText = repairSelectListsForRecovery(sourceText);
  if (repairedText !== undefined) {
    try {
      return withSymbolIndex(createSemanticSnapshot(documentVersion, sourceText, parseBatch(repairedText, resolver), 'recovered'));
    } catch {
      // repair itself wasn't enough — fall through to 'unavailable'
    }
  }

  return createSemanticSnapshot(documentVersion, sourceText, EMPTY_BATCH, 'unavailable');
}
