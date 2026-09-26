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

## Planned, deferred

Agreed direction, not started. Pick up as separate tasks; do not fold into
unrelated work.

### Expression type inference

**Why.** The Classic "Custom expression" dialog shows a result type only when
the whole expression is a single resolved field; anything else is "unknown".
The same missing capability blocks type-aware completion ranking
(`КОГДА |` → boolean candidates) and a type column for expression fields in
Canvas.

**Current state.** Custom expressions are strings — there is no expression AST
in core. `isStructurallyValidExpression` (`expressionSyntaxCheck.ts`) only
accepts or rejects. `MetaType` plus `describeOne`/`describeFieldTypes` already
represent and render types; fields resolve through `resolveFieldPath`, aliases
through `resolveAliasAt` (query text) or the dialog's source list.
`FUNCTION_CATALOG` has no return-type data.

**Target API** (pure core, no UI dependencies):

```ts
// src/core/query/expressionType.ts
type InferredType = { kind: 'known'; types: MetaType[] } | { kind: 'unknown' };
function inferExpressionType(
  text: string,
  resolveChain: (segments: string[]) => MetaField | undefined,
): InferredType;
```

The caller injects chain resolution (dialog sources, or `resolveAliasAt` for
query text), so one algorithm serves both. Fail-open: an unknown field,
parameter or function makes the result `unknown`, except for operators whose
result does not depend on operand types (comparisons are always `Булево`).

**First-version rules** (anything contested stays `unknown` or drops
qualifiers until step 1 confirms it):

| Construct | Type |
|---|---|
| number / string literal, `ДАТАВРЕМЯ(...)`, `ИСТИНА`/`ЛОЖЬ` | Число / Строка / Дата / Булево |
| `Alias.Field…` | metadata field types, qualifiers kept |
| comparisons, `И ИЛИ НЕ`, `ПОДОБНО`, `В`, `МЕЖДУ`, `ЕСТЬ NULL`, `ССЫЛКА` | Булево |
| `+ - * /` on numbers | Число without qualifiers (until oracle-verified) |
| `Строка + Строка` | Строка |
| `ВЫБОР … ТОГДА a … ИНАЧЕ b` | union of branches; no `ИНАЧЕ` adds NULL |
| `ЕСТЬNULL(a, b)` | union of a and b without NULL |
| `ВЫРАЗИТЬ(x КАК T)` | T (`Строка(N)`, `Число(p,s)`, `Справочник.X`) |
| `ЗНАЧЕНИЕ(Справочник.X.Y)` | reference to `Справочник.X` |
| catalog functions | per catalog return descriptor (step 2) |

**Steps**, each its own reviewable task:

1. **Oracle check.** Collect 30–50 contested expressions and record their real
   result types from 1C through the existing oracle tooling (`harvestOracle` /
   MCP): arithmetic precision (`Число(15,2) * Число(15,3)`), `ВЫБОР` with
   branches of different precision, `МАКСИМУМ` over a reference,
   `РАЗНОСТЬДАТ`, `СТРОКА(...)`, `Строка + Число` (error or coercion). First
   verify the tooling can read result column types at all — this is the
   riskiest step.
2. **Return descriptors in `FUNCTION_CATALOG`.** Add a result descriptor per
   leaf (`{ type: 'Строка' }`, `{ sameAsArg: 0 }` for `МАКСИМУМ`/`МИНИМУМ`,
   `{ unionOfArgs: [0, 1] }` for `ЕСТЬNULL`, `'unknown'`) — extend the single
   source of truth, no parallel table. A test requires an explicit descriptor
   on every function leaf.
3. **Core module.** A separate token walker following the same grammar as
   `expressionSyntaxCheck`; do **not** modify the structural check that gates
   Apply. Tests: rule table; a corpus differential test (the walker accepts
   exactly what `isStructurallyValidExpression` accepts and never throws);
   golden values only for oracle-verified expressions.
4. **Dialog status.** Replace the single-field rule in `analyzeExpression`
   (`src/webview/expressionEditor/expressionContext.ts`) with
   `inferExpressionType`; render via `describeOne`, unions as `Число | NULL`,
   at most three variants plus "…". E2E for `ВЫБОР`, an aggregate, a date
   function and `ВЫРАЗИТЬ`.
5. **Optional follow-ups**, separate tasks: `КОГДА |` completion ranking by
   `Булево`; a type column for expression fields in the Canvas Fields grid.

**Out of scope.** Temporary-table schemas, `inferUndefinedTempTables` and the
parser's literal typing (see "Unify the temporary-table models" above); any
effect on SDBL generation, Apply or validation — types are display-only first,
with no blocking checks built on them; a new expression AST or a parser
rewrite.

**Risks.** 1C precision and coercion rules (hence oracle first; contested
cases stay unknown or unqualified). Composite types and NULL (the result type
is a union from the start). Grammar duplication between the structural check
and the walker, contained by the corpus differential test; merging them into
one walker is a later task (introduce → validate → switch → remove old).

## Explicitly considered and not planned

Evaluated and deliberately not pursued, so they don't need re-litigating from
scratch if suggested again: a SQLite-based metadata snapshot format (measured
against the current JSON snapshot and rejected), migrating the SDBL parser to
ANTLR/tree-sitter as the runtime engine (see
[0001](decisions/0001-platform-independent-core.md)), and a
`worker_threads`-parallelized XML import (no current evidence of a workload
where the added complexity would pay for itself — revisit only with a real
measured bottleneck, per [performance](performance.md)).
