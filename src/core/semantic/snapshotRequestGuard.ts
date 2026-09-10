/**
 * Phase 1c of the semantic-core roadmap (memory: project-semantic-core-roadmap).
 *
 * Pure staleness guard for building a `SemanticSnapshot` — the same generation-
 * counter pattern `queryDiagnosticsController.ts` already uses (`generation`/
 * `versionAtSchedule`, guarding against a debounced check running after a newer
 * edit superseded it), extracted here as a plain, vscode-free primitive so a
 * future async/incremental snapshot builder (hover/completion migration,
 * Phase 3d/3e) doesn't have to reinvent it or depend on `vscode.TextDocument`.
 *
 * Deliberately NOT an actual cancellation mechanism (no `AbortController`, no
 * interrupting a running parse) — `parseBatch` is synchronous and fast, so
 * there is nothing today that would need mid-flight interruption. This only
 * answers "did a NEWER request start after mine, so my result should be
 * discarded" — the same question `queryDiagnosticsController.ts` already asks,
 * just factored out where it can be reused and unit-tested on its own.
 */
export class SnapshotRequestGuard {
  private generation = 0;

  /**
   * Call when starting a new snapshot build. Returns a token to pass to
   * `isStale` once the (possibly async) build finishes — if a newer call to
   * `beginRequest` happened in the meantime, that token reports stale.
   */
  beginRequest(): number {
    return ++this.generation;
  }

  /** True if a newer `beginRequest` call has happened since `token` was issued. */
  isStale(token: number): boolean {
    return token !== this.generation;
  }
}
