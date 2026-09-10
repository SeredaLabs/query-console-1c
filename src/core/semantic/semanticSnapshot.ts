/**
 * Phase 1a of the semantic-core roadmap (see memory: project-semantic-core-roadmap).
 *
 * This module is the skeleton of a NEW, parallel analysis layer: read-only consumer
 * of `BatchDocument`/raw text, never a dependency of `parseBatch`/`generateBatch`.
 * `src/core/query` stays exactly what it is today (corpus-proven round-trip engine);
 * this directory must never be imported from there (enforced by
 * `test/unit/semanticArchitectureBoundary.test.ts`).
 *
 * No real analysis happens yet — scopes/symbols/references are populated starting
 * Phase 2a/3a. This phase only establishes the snapshot shape and its lifecycle
 * discipline: `model` and `index` are always built together from the same
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
  | { kind: 'field'; index: number };

/** A structural path into `BatchDocument`, meaningful only inside the snapshot it was produced from. */
export type ModelPath = readonly ModelPathSegment[];

/**
 * Opaque reference to a `BatchDocument` node, so the semantic layer's public surface
 * doesn't hard-couple to `SelectedField`/`SelectedTable`'s exact shape.
 */
export interface ModelRef {
  kind: 'table' | 'field' | 'query' | 'unionMember';
  id: SemanticNodeId;
  path: ModelPath;
}

export interface Scope {
  id: SemanticNodeId;
}

export interface Symbol {
  id: SemanticNodeId;
  ref: ModelRef;
}

export interface Reference {
  symbolId: SemanticNodeId;
  path: ModelPath;
}

/**
 * Holds ONLY scopes/symbols/references — never a parallel fields/tables/conditions
 * tree. A future `{ fields; tables; conditions; grouping }` shape here would be a
 * second `QueryModel`, which is the one anti-pattern this design exists to avoid.
 */
export interface SemanticIndex {
  scopesById: Map<SemanticNodeId, Scope>;
  symbolsById: Map<SemanticNodeId, Symbol>;
  referencesBySymbolId: Map<SemanticNodeId, Reference[]>;
}

export function createEmptySemanticIndex(): SemanticIndex {
  return {
    scopesById: new Map(),
    symbolsById: new Map(),
    referencesBySymbolId: new Map(),
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
 *   the repair touched is a placeholder, not the user's real field.
 * - `'partial'`: reserved for a future, more capable partial-tree recovery this
 *   parser doesn't have yet (today a hard parse failure loses ALL structure,
 *   not just the broken part) — see `buildSemanticSnapshotFromText`'s doc.
 * - `'unavailable'`: no strategy produced a usable parse; `model` is an empty,
 *   safe placeholder (`{ members: [] }`), never a thrown exception.
 */
export type SemanticCompleteness = 'complete' | 'recovered' | 'partial' | 'unavailable';

export interface SemanticSnapshot {
  documentVersion: number;
  sourceHash: string;
  model: BatchDocument;
  completeness: SemanticCompleteness;
  /**
   * Batch-wide, absolute-offset ranges for `model`'s tables/union members (see
   * `AbsoluteSourceMapEvent`), collected via `parseBatch`'s `batchSourceMap`
   * option. ALWAYS empty (`[]`) for `completeness !== 'complete'` — a repaired
   * or unavailable parse either ran against reflowed text (repair changes
   * character offsets) or produced no real model at all, so no range in either
   * case can be trusted to point at the user's actual source
   * (`buildSemanticSnapshotFromText` enforces this).
   */
  sourceMapEvents: readonly AbsoluteSourceMapEvent[];
  index: SemanticIndex;
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
 * `index` is empty until later phases (2a/3a) start populating scopes/symbols.
 * `completeness` defaults to `'complete'` for callers that already know their
 * `model` came from a clean parse; `buildSemanticSnapshotFromText` (Phase 1c)
 * is the tolerant entry point that determines it for you when parsing might fail.
 * `sourceMapEvents` defaults to `[]`; only pass a non-empty array alongside
 * `completeness: 'complete'` (see `sourceMapEvents`'s own doc for why).
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
