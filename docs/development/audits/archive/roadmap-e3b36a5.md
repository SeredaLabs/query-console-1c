# Roadmap

> Historical evidence copied from `docs/development/roadmap.md` at `e3b36a5`.
> Statements and counts describe that checkpoint. [Current status](../../technical-debt.md)
> is owned by the ledger; this record is not a present-day specification.

This page records direction and ordering, not committed release scope or current
status. The [technical-debt ledger](../../technical-debt.md) is authoritative for status.
Do not infer pending work from historical Stage 0 priorities.

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
[`docs/design/new-builder/`](../../../design/new-builder/README.md). It is bundled
with the extension but remains hidden by default behind the
`queryConsole.enableNewBuilderPreview` experimental setting, so it does not
replace the Classic Constructor.

The [Canvas Feature Baseline](../../../design/new-builder/feature-baseline.md) is complete
within its explicit editing/preservation boundary. The
[historical Phase 0–18 reconciliation](canvas-phase-reconciliation-2026-09-30.md)
checks every phase against code/tests: Phase 13 recursive sources/manual temp
and Phase 16 contextual expression help are closed. Phase 14 scalar mapping is
verified, with advanced projections guarded as preserve-only; Phase 15 mandatory
read-only dock behavior is verified, with cross-highlight deferred. Boolean UX,
sort priority, advanced interactions and final polish remain PARTIAL, with
requirements carried by UX-C1–UX-C10 in the ledger. C17/C18 have controlled refusal.
The [verification gate](../../testing-and-release.md#canvas-verification) includes
recursive editing and real VS Code source insertion. Canvas stays opt-in Preview
until a separate UX/release review; Classic stays available.

## Required follow-up tasks

Current tasks and evidence are tracked once in the [ledger](../../technical-debt.md).

### Recommended engineering sequence

1. **Preservation evidence and narrow hardening.** Closed: C1, C3 (live
   hierarchy probe), C4 (metadata-proven correlated condition binding) and C5
   (reject on open or block Apply); C4 wizard text checked live.
2. **CanonicalToken / ExpressionTokens spike (A1).** Inventory existing lexer
   tokens, contextual words, formatter trees and raw scanners; define one lexical
   identity/precedence boundary with source spelling/ranges preserved. Propose
   introduce → validate → switch migration slices. No runtime parser replacement.
3. **Verification foundation (V1–V3).** Record negative/English platform evidence,
   metadata modes and bounded semantic-preservation checks; make the optional
   grammar oracle reproducible with an explicit CI policy before relying on it.
4. **English implementation (C2).** Follow the spike's contract across parser,
   contextual words, expressions, metadata aliases/attributes, IDE detection,
   qualification, formatting and Apply. No scattered keyword-regex patches.
5. **Temporary-table fact unification (A2).** First verify tabular projections
   and trailing columns on the platform; then share lifetime/producer-column
   facts. Retain parser incremental registry, undefined-table inference and
   internal literal typing. Migrate designer and parser consumers separately.
6. **Semantic assistance.** Closed: condition-subquery scope (S1), typing
   recovery (S2) and the snapshot contract (S3). Add a scope/reference index
   only together with its first consumer.
7. **Expression consumers (A3, C6).** Display-only inference over the shared
   representation and cosmetic JOIN stability. Parameter-consumer consistency
   (C7) is closed.
8. **Preview release.** V4 now has a recorded regression gate and D1 source
   comments are corrected. Keep Canvas opt-in pending the UX-C4 release review.
   Other UX-C1–UX-C10 items retain their own capability/dependency boundaries;
   optional global scope IDs are not a release prerequisite.

This is one recommended sequence, not authorization to implement these stages.
Resolve U1–U3 when the relevant stage needs their platform evidence. Existing
accepted import coupling is a constraint, not an invitation to general cleanup.

## Planned, deferred

Agreed direction, not started. Pick up as separate tasks; do not fold into
unrelated work.

### Expression type inference

Status: **PARTIAL** (A3). The previous independent-walker implementation plan is
**STALE**, absorbed into A1. The product goal and display-only boundary remain.

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
3. **Core module, after A1.** Consume the shared token/expression contract
   selected by the spike. Do not add another independent grammar walker or
   infer semantic grouping from the syntax acceptor (it ignores precedence).
   Preserve Apply behavior; test the type rules, unknown propagation and
   oracle-verified values against that shared representation.
4. **Dialog status.** Replace the single-field rule in `analyzeExpression`
   (`src/webview/expressionEditor/expressionContext.ts`) with
   `inferExpressionType`; render via `describeOne`, unions as `Число | NULL`,
   at most three variants plus "…". E2E for `ВЫБОР`, an aggregate, a date
   function and `ВЫРАЗИТЬ`.
5. **Optional follow-ups**, separate tasks: `КОГДА |` completion ranking by
   `Булево`; a type column for expression fields in the Canvas Fields grid.

**Out of scope.** Temporary-table schemas, `inferUndefinedTempTables` and the
parser's literal typing (see A2 in the ledger); any
effect on SDBL generation, Apply or validation — types are display-only first,
with no blocking checks built on them; a new expression AST or a parser
rewrite.

**Risks.** 1C precision and coercion rules (hence oracle first; contested
cases stay unknown or unqualified). Composite types and NULL (the result type
is a union from the start). A second expression grammar would
repeat the RP13/grouping failure pattern, so the shared representation is a
prerequisite, not a later cleanup. An expression AST is an explicit future
decision only if tokens cannot serve concrete consumers.

## Explicitly considered and not planned

Evaluated and deliberately not pursued, so they don't need re-litigating from
scratch if suggested again: a SQLite-based metadata snapshot format (measured
against the current JSON snapshot and rejected), migrating the SDBL parser to
ANTLR/tree-sitter as the runtime engine (see
[0001](../../decisions/0001-platform-independent-core.md)), and a
`worker_threads`-parallelized XML import (no current evidence of a workload
where the added complexity would pay for itself — revisit only with a real
measured bottleneck, per [performance](../../performance.md)).
