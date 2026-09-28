/**
 * Phase 1a of the semantic-core roadmap (see memory: project-semantic-core-roadmap).
 *
 * This module is the skeleton of a NEW, parallel analysis layer: read-only consumer
 * of `BatchDocument`/raw text, never a dependency of `parseBatch`/`generateBatch`.
 * `src/core/query` stays exactly what it is today (corpus-proven round-trip engine);
 * this directory must never be imported from there (enforced by
 * `test/unit/semanticArchitectureBoundary.test.ts`).
 *
 * The text builder populates source-alias symbols (the only index). This module defines the snapshot shape and its lifecycle discipline:
 * `model` and `index` are always built together from the same
 * `documentVersion`/source text and must be discarded together, never mixed across
 * versions (a hover computed from `model@42` + `index@41` is a worse bug than
 * `undefined` — it looks plausible but is wrong).
 */
import type { BatchDocument } from '../query/batchModel';
import type { AbsoluteSourceMapEvent } from '../query/sourceMap';

/**
 * Identifies a semantic node WITHIN one snapshot only. Deliberately not stable
 * across reparses — nothing in this design needs cross-snapshot identity (no
 * incremental cache, no rename session), so a simple per-snapshot counter is
 * sufficient and avoids inventing stable ids for model nodes that don't have one
 * (e.g. `SelectedField` has no standalone id today, only `tableId` + `path`).
 */
export type SemanticNodeId = number;

export type ModelPathSegment =
  | { kind: 'batch'; index: number }
  | { kind: 'union'; index: number }
  | { kind: 'table'; index: number }
  /** A condition subquery: `model.conditions[index]` / `model.having[index]`, followed by its `union` chain. */
  | { kind: 'whereSubquery'; index: number }
  | { kind: 'havingSubquery'; index: number };

/** A structural path into `BatchDocument`, meaningful only inside the snapshot it was produced from. */
export type ModelPath = readonly ModelPathSegment[];

/**
 * Opaque reference to a `BatchDocument` node, so the semantic layer's public surface
 * doesn't hard-couple to `SelectedField`/`SelectedTable`'s exact shape.
 */
export interface ModelRef {
  /** Only source tables are referenced today (source-alias symbols). */
  kind: 'table';
  id: SemanticNodeId;
  path: ModelPath;
}

/**
 * Phase 3a: currently always a source/table alias (`SelectedTable.alias`) —
 * the only symbol kind this roadmap has needed so far. Kept as one concrete
 * shape rather than a discriminated union until a second kind (e.g. an
 * output-column symbol) is actually needed; see `collectSourceAliasSymbols`.
 */
export interface Symbol {
  id: SemanticNodeId;
  /** Declared alias, ORIGINAL casing. SDBL identifiers are case-insensitive — callers matching by name must upper-case both sides themselves. */
  alias: string;
  ref: ModelRef;
}

/**
 * Holds ONLY semantic indexes — never a parallel fields/tables/conditions tree.
 * A future `{ fields; tables; conditions; grouping }` shape here would be a
 * second `QueryModel`, which is the one anti-pattern this design exists to avoid.
 * Only indexes with a production consumer live here (S3): scopes are resolved on
 * demand from source-map events (`resolveAliasAt`), and no consumer needs a
 * reference index yet. Add one together with its first consumer.
 */
export interface SemanticIndex {
  symbolsById: Map<SemanticNodeId, Symbol>;
}

export function createEmptySemanticIndex(): SemanticIndex {
  return {
    symbolsById: new Map(),
  };
}

/**
 * Phase 1c: how much of `model` is trustworthy. Formalizes this project's
 * existing fail-open philosophy (already used ad hoc via
 * `targetUnresolved`/`fieldNotFound` in `hoverFieldInfo.ts`) so different
 * consumers can apply different trust thresholds to the same snapshot — e.g.
 * diagnostics might only act on `'complete'`, while alias-resolving hover can
 * still trust `'recovered'`.
 * - `'complete'`: `sourceText` parsed with no repair needed.
 * - `'recovered'`: a full parse failed, but a repair heuristic
 *   (`repairSelectListsForRecovery`) produced text that DID parse — `model`'s
 *   structure (sources/aliases/joins) is trustworthy, but any SELECT-list field
 *   the repair touched is a placeholder, not the user's real field. Positions
 *   (`sourceMapEvents`) are available when the repair preserved offsets — see
 *   `hasTrustworthyPositions`.
 * - `'unavailable'`: no strategy produced a usable parse; `model` is an empty,
 *   safe placeholder (`{ members: [] }`), never a thrown exception.
 */
export type SemanticCompleteness = 'complete' | 'recovered' | 'unavailable';

export interface SemanticSnapshot {
  documentVersion: number;
  sourceHash: string;
  model: BatchDocument;
  completeness: SemanticCompleteness;
  /**
   * Batch-wide, absolute-offset ranges for `model`'s tables/union members (see
   * `AbsoluteSourceMapEvent`), collected via `parseBatch`'s `batchSourceMap`
   * option. Populated for `'complete'`, and for `'recovered'` ONLY when the
   * repair kept every character offset in place (its placeholder is
   * length-preserving; see `repairSelectListsForRecovery`) — otherwise, and
   * always for `'unavailable'`, it is empty (`[]`), since a range recorded
   * against reflowed text would silently point at the wrong place in the
   * user's source (`buildSemanticSnapshotFromText` enforces this). Check
   * `hasTrustworthyPositions` rather than `completeness` alone.
   */
  sourceMapEvents: readonly AbsoluteSourceMapEvent[];
  index: SemanticIndex;
}

/**
 * Whether `snapshot.sourceMapEvents` can be used for position-aware lookups:
 * always for `'complete'`, and for `'recovered'` when the repair preserved
 * offsets (non-empty events). Consumers that also need the real SELECT-list
 * fields (output aliases, etc.) must still require `'complete'` themselves.
 */
export function hasTrustworthyPositions(snapshot: SemanticSnapshot): boolean {
  if (snapshot.completeness === 'complete') return true;
  return snapshot.completeness === 'recovered' && snapshot.sourceMapEvents.length > 0;
}

/**
 * Cheap non-cryptographic hash, sufficient for staleness detection (mismatched
 * `sourceHash` between two snapshots means the text changed) — not a security
 * or collision-resistance concern.
 */
function hashSource(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (Math.imul(31, hash) + text.charCodeAt(i)) | 0;
  }
  return `${text.length}:${(hash >>> 0).toString(16)}`;
}

/**
 * Builds a `SemanticSnapshot` around an already-parsed `BatchDocument`. `model` and
 * `index` are always constructed together from the same `documentVersion`/
 * `sourceText` — callers must discard the whole snapshot on the next edit rather
 * than reuse `index` against a newer `model` (see module doc).
 *
 * This factory creates an empty `index`; the text builder adds source-alias
 * symbols through `withSymbolIndex`.
 * `completeness` defaults to `'complete'` for callers that already know their
 * `model` came from a clean parse; `buildSemanticSnapshotFromText` (Phase 1c)
 * is the tolerant entry point that determines it for you when parsing might fail.
 * `sourceMapEvents` defaults to `[]`; non-empty events are also valid for
 * recovered text when the repair preserved offsets (see `hasTrustworthyPositions`).
 */
export function createSemanticSnapshot(
  documentVersion: number,
  sourceText: string,
  model: BatchDocument,
  completeness: SemanticCompleteness = 'complete',
  sourceMapEvents: readonly AbsoluteSourceMapEvent[] = [],
): SemanticSnapshot {
  return {
    documentVersion,
    sourceHash: hashSource(sourceText),
    model,
    completeness,
    sourceMapEvents,
    index: createEmptySemanticIndex(),
  };
}
