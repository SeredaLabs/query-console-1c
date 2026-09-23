# Roadmap

This page records direction, not committed release scope.

## Current priorities

1. Expand safe, explicitly tested SDBL round-trip coverage.
2. Improve metadata discovery and cache freshness diagnostics without risking
   user-owned directories.
3. Strengthen user-facing diagnostics and accessibility across all locales.
4. Keep performance and corpus gates reproducible.

Features such as query execution, database connections, result grids, history,
and transport are not implemented. They require separate product and security
decisions and must not be inferred from the phrase “query console.”

New Builder (the canvas-based visual constructor under `src/webview-canvas`)
is in-progress preview work; approved visual references for it are tracked in
[`docs/design/new-builder/`](../design/new-builder/README.md). It is bundled
with the extension but remains hidden by default behind the
`queryConsole.enableNewBuilderPreview` experimental setting, so it does not
replace the Classic Constructor.

The current Canvas baseline covers roadmap Phases 0--12. UNION UX (Phase 14)
and most of the read-only SDBL developer experience (Phase 15) were completed
ahead of sequence. Phase 13 remains the next main implementation step:
source-subquery drill-down and manual temporary-table editing. Before Canvas
can leave preview, the project still requires a recorded Classic/Canvas
semantic-parity gate and a real Canvas browser E2E covering load, edit, save,
and insertion back into the source document.

## Explicitly considered and not planned

Evaluated and deliberately not pursued, so they don't need re-litigating from
scratch if suggested again: a SQLite-based metadata snapshot format (measured
against the current JSON snapshot and rejected), migrating the SDBL parser to
ANTLR/tree-sitter as the runtime engine (see
[0001](decisions/0001-platform-independent-core.md)), and a
`worker_threads`-parallelized XML import (no current evidence of a workload
where the added complexity would pay for itself — revisit only with a real
measured bottleneck, per [performance](performance.md)).
