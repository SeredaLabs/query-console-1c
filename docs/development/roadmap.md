# Roadmap

This page records direction, not committed release scope.

## Current priorities

1. Expand safe, explicitly tested SDBL round-trip coverage.
2. Improve metadata discovery and cache freshness diagnostics without risking
   user-owned directories.
3. Strengthen user-facing diagnostics and accessibility across all locales.
4. Keep performance and corpus gates reproducible, and turn the currently
   optional tree-sitter SDBL oracle into an explicit CI gate only when its
   grammar artifact can be built reproducibly.

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

## Required follow-up tasks

These are mandatory: they close known correctness debt and must not be
dropped or silently deferred as optional cleanup.

### Unify the temporary-table models

Package temporary tables are modeled three times (parser registry, designer
model, semantic model); see
[known issues](known-issues.md#required-technical-debt-three-temporary-table-models).

**Scope: two shared facts, not one merged model.** Unify only what the
platform defines once:

- **Lifetime rules** -- a table is visible after its `ПОМЕСТИТЬ`, through
  `ДОБАВИТЬ`, until `УНИЧТОЖИТЬ`; a later `ПОМЕСТИТЬ` starts a new schema. The
  designer model and the semantic model implement this twice with
  near-identical code; one module must own it for both.
- **Producer columns** -- which output columns a `ПОМЕСТИТЬ` statement
  creates. One function must serve all three call sites, so their column sets
  can no longer diverge.

**Keep separate on purpose** -- these are different concerns, not
duplication, and must not be folded into the shared module:

- The parser's incremental registry mechanism. The parser needs columns
  mid-parse, statement by statement, and a map updated on create/drop is the
  correct single-pass form of the same rules. Only its column source should
  change to the shared producer-columns function; do not replace the map with
  the lifetime-index structure.
- `inferUndefinedTempTables`. It guesses the columns of a table the package
  never creates from later references, under its own oracle-verified
  visibility rule. That is a different fact from a `ПОМЕСТИТЬ` schema, and
  the semantic model deliberately leaves such tables fail-open.
- The parser's primitive typing of pure-literal columns. It is a
  parser-internal device so `resolveBuilderStar` can drop a `.*` suffix (it
  types numeric literals as `Строка` too), not a truthful column type for the
  shared schema.

Steps, each its own reviewable task:

1. **Oracle check.** Record how the real 1C constructor expands `*` over a
   temporary table whose producer contains a tabular-section projection
   (`Т.Товары.(…)`) and trailing fields. This decides the correct producer
   columns; do not pick one by preference.
2. **Designer model onto the core module.** Make
   `src/webview/state/queryStore/snapshots.ts` use the lifetime rules and
   producer columns from `src/core/query/tempTableSemantics.ts` instead of its
   own `deriveTempTableLifetimes` copy. Classic and Canvas temp-table groups,
   the picker, and continuity must keep their current behavior apart from the
   column set decided in step 1.
3. **Parser column source.** Make `registerTempTables` take producer columns
   from the shared function, keeping its own map, its literal typing, and
   `inferUndefinedTempTables`. First verify whether the registry's
   `kind: 'Справочник'` affects parsing before changing it; leave it if
   changing it has no benefit.

Done when lifetime rules have one owner used by the designer and semantic
models, producer columns have one owner used by all three call sites, the
separate concerns above are still separate, and the corpus,
validator-corpus, and oracle checks pass. Any change in golden output must be
explained case by case.

## Explicitly considered and not planned

Evaluated and deliberately not pursued, so they don't need re-litigating from
scratch if suggested again: a SQLite-based metadata snapshot format (measured
against the current JSON snapshot and rejected), migrating the SDBL parser to
ANTLR/tree-sitter as the runtime engine (see
[0001](decisions/0001-platform-independent-core.md)), and a
`worker_threads`-parallelized XML import (no current evidence of a workload
where the added complexity would pay for itself — revisit only with a real
measured bottleneck, per [performance](performance.md)).
