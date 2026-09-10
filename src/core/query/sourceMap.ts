/**
 * Phase 1b of the semantic-core roadmap (memory: project-semantic-core-roadmap).
 *
 * Source-location side-channel for the parser: an optional, write-only sink that
 * `sdblParser.ts` reports completed node→range mappings into. No sink supplied ⇒
 * byte-identical parser behavior — this is a pure side observation, never
 * consulted by the parser itself (enforced by
 * `test/unit/semanticArchitectureBoundary.test.ts` and proven against the whole
 * golden corpus by `test/unit/sourceMapZeroImpact.test.ts`).
 *
 * Lives in `src/core/query` (not `src/core/semantic`) even though it exists FOR
 * the future semantic layer: the parser (`Cursor`, `parseTableSource`, …) needs
 * to reference this type directly to call `sourceMap?.record(...)`, and
 * `src/core/query` must never import from `src/core/semantic` (one-way
 * dependency, the opposite direction is fine and expected — the semantic layer
 * will import THIS file to consume the recorded events). Deliberately
 * self-contained (no `BatchDocument`/`QueryModel` types) so it can sit at the
 * boundary between both layers without pulling either one in.
 */

/** Half-open: `[start, end)` — `end` is exclusive, matching `String.slice` semantics. */
export interface TextRange {
  start: number;
  end: number;
}

export type SourceMapNodeKind = 'unionMember' | 'table';

export interface SourceMapEvent {
  kind: SourceMapNodeKind;
  /**
   * Position within its own list — union member index within the document, or
   * table index within one query's `ИЗ` clause (matches `SelectedTable.id`'s
   * `'t' + index` numbering). NOT a cross-document/batch-wide identity; a
   * consumer that needs that assembles it from the `parseDocument` call this
   * event came from.
   */
  index: number;
  range: TextRange;
}

/**
 * Write-only from the parser's perspective: `record` returns nothing, and the
 * parser must never read anything back from a sink (no `if (sink.record(...))`,
 * no cached state queried mid-parse). `record` is only ever called AFTER the
 * parser has already decided and built the node it describes — never
 * interleaved with in-progress parsing decisions.
 */
export interface SourceMapSink {
  record(event: Readonly<SourceMapEvent>): void;
}

/** Simple concrete sink: collects every event, in recording order. */
export class RecordingSourceMapSink implements SourceMapSink {
  readonly events: SourceMapEvent[] = [];
  record(event: Readonly<SourceMapEvent>): void {
    this.events.push(event);
  }
}

/**
 * Batch-level counterpart of `SourceMapEvent`: `parseBatch` stitches the
 * chunk-relative events each `parseDocument` call produces into these — `range`
 * is absolute within the ORIGINAL text passed to `parseBatch` (not the chunk),
 * and `statementIndex` identifies which `BatchDocument.members[i]` (which `;`
 * -separated statement) the event belongs to, resolving the ambiguity a single
 * `SourceMapSink` shared across chunks would have (see `parseBatch`'s own doc
 * comment on `ParseOptions.batchSourceMap`).
 *
 * ONLY produced for a `'complete'` parse (see
 * `buildSemanticSnapshotFromText` in `src/core/semantic`) — a repaired/
 * recovered parse runs against TEXT WITH DIFFERENT CHARACTER OFFSETS than the
 * user's real document (the repair heuristic replaces a variable-length SELECT
 * list with a fixed `' 1 '` placeholder, shifting everything after it), so
 * ranges recorded against repaired text would silently misreport positions in
 * the real source — worse than having none.
 */
export interface AbsoluteSourceMapEvent {
  statementIndex: number;
  kind: SourceMapNodeKind;
  index: number;
  range: TextRange;
}

export interface BatchSourceMapSink {
  record(event: Readonly<AbsoluteSourceMapEvent>): void;
}

/** Simple concrete sink: collects every batch-level event, in recording order. */
export class RecordingBatchSourceMapSink implements BatchSourceMapSink {
  readonly events: AbsoluteSourceMapEvent[] = [];
  record(event: Readonly<AbsoluteSourceMapEvent>): void {
    this.events.push(event);
  }
}

export function rangeContains(range: TextRange, pos: number): boolean {
  return pos >= range.start && pos < range.end;
}

function rangeLength(range: TextRange): number {
  return range.end - range.start;
}

/**
 * All recorded events whose range contains `pos` (half-open), innermost
 * (smallest range) first — ranges nest (a table's range sits inside its union
 * member's range), so callers wanting the MOST SPECIFIC match should take `[0]`.
 * Works for either `SourceMapEvent[]` or `AbsoluteSourceMapEvent[]` — both carry
 * a `range`, which is all this needs.
 */
export function findContaining<T extends { range: TextRange }>(events: readonly T[], pos: number): T[] {
  return events
    .filter((e) => rangeContains(e.range, pos))
    .sort((a, b) => rangeLength(a.range) - rangeLength(b.range));
}

/**
 * The single most relevant event for `pos`: the innermost containing event if
 * any contains it, otherwise the event whose range is textually closest (by
 * distance to its nearest boundary) — e.g. a cursor sitting in trailing
 * whitespace just past the last field still resolves to that field. Ties
 * (equal distance) resolve to whichever event comes first in `events`.
 */
export function findNearest<T extends { range: TextRange }>(events: readonly T[], pos: number): T | undefined {
  const containing = findContaining(events, pos);
  if (containing.length > 0) return containing[0];
  if (events.length === 0) return undefined;
  let best: T | undefined;
  let bestDist = Infinity;
  for (const e of events) {
    const dist = pos < e.range.start ? e.range.start - pos : pos - e.range.end;
    if (dist < bestDist) {
      best = e;
      bestDist = dist;
    }
  }
  return best;
}
