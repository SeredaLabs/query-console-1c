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
 */
import { parseBatch } from '../query/sdblParser';
import type { MetadataResolver } from '../query/metadataResolver';
import { repairSelectListsForRecovery } from '../query/selectListRepair';
import type { BatchDocument } from '../query/batchModel';
import { RecordingBatchSourceMapSink } from '../query/sourceMap';
import { createSemanticSnapshot, type SemanticSnapshot } from './semanticSnapshot';

const EMPTY_BATCH: BatchDocument = { members: [] };

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
    return createSemanticSnapshot(documentVersion, sourceText, model, 'complete', sink.events);
  } catch {
    // falls through to the recovery attempt below
  }

  const repairedText = repairSelectListsForRecovery(sourceText);
  if (repairedText !== undefined) {
    try {
      return createSemanticSnapshot(documentVersion, sourceText, parseBatch(repairedText, resolver), 'recovered');
    } catch {
      // repair itself wasn't enough — fall through to 'unavailable'
    }
  }

  return createSemanticSnapshot(documentVersion, sourceText, EMPTY_BATCH, 'unavailable');
}
