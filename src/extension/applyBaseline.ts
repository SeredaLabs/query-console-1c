/**
 * C32 Safe Apply / No-op Apply: the text an unchanged OK / Save would write, kept by
 * the host for one Designer panel (session) and its source query.
 *
 * Without it every OK regenerates the query and replaces the literal even when the
 * user changed nothing. The baseline is the text the webview would apply right after
 * the first successful open of the source query; an Apply with exactly that text
 * changes nothing the user asked for, so the host closes the panel without touching
 * the document (no re-encoding: the decoded literal does not reproduce its `|`
 * indentation, and no clipboard fallback).
 *
 * Kept by the host, not the webview: switching Classic ↔ Canvas reloads the webview
 * with the generated text, so a per-UI baseline would make edits made before the
 * switch look unchanged. Only a report for a load of the source query issued before
 * any switch is accepted, and only the first one; anything else (late, repeated,
 * unknown, malformed) is ignored. Without a baseline nothing is unchanged and Apply
 * keeps its current path.
 *
 * Pure (no `vscode` import) — unit-tested directly.
 */
export class ApplyBaseline {
  private nextLoadId = 1;
  private readonly sourceLoads = new Set<number>();
  private switched = false;
  private text: string | undefined;

  /**
   * @param sourceQuery the query text opened from the document, or `undefined` when
   *   there is no source query to keep (a new query, result-processing code, no editor).
   */
  constructor(private readonly sourceQuery: string | undefined) {}

  /** Id for a `loadModel` the host is about to send with `text`. */
  load(text: string): number {
    const id = this.nextLoadId++;
    if (!this.switched && this.sourceQuery !== undefined && text === this.sourceQuery) this.sourceLoads.add(id);
    return id;
  }

  /** The panel now shows the other UI with a generated text: no new baseline after this. */
  switchDesigner(): void {
    this.switched = true;
    this.sourceLoads.clear();
  }

  /** The webview's text for load `loadId`, reported right after it was opened. */
  report(loadId: unknown, text: unknown): void {
    if (this.text !== undefined || this.switched) return;
    if (typeof loadId !== 'number' || typeof text !== 'string' || !this.sourceLoads.has(loadId)) return;
    this.text = text;
  }

  /** Apply with `applied` changes nothing: the panel may close without writing. */
  isUnchanged(applied: string): boolean {
    return this.text !== undefined && applied === this.text;
  }
}

/**
 * The query an Apply would replace: opened from an existing literal in the document
 * (a non-empty range). A new query (empty range, maybe with result-processing code)
 * or an editor-less panel has none.
 */
export function sourceQueryOf(
  saved: { queryRange?: { start: number; end: number }; resultProcessing?: boolean } | undefined,
  initialQueryText: string | undefined,
): string | undefined {
  if (!saved?.queryRange || saved.resultProcessing) return undefined;
  return saved.queryRange.end > saved.queryRange.start ? initialQueryText : undefined;
}
