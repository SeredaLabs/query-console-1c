# Canvas Feature Baseline

Audit date: 2026-09-30. Baseline: `main` at the start of this task.
Code and tests, rather than phase numbering, determine this checkpoint.
Canvas remains opt-in Preview; V4 verifies a bounded set of paths and is not
feature completion.

## Capability audit before implementation

EDIT means an accessible editing workflow, PRESERVE means retained through an
unrelated edit and save/reopen, MISSING means a required workflow is absent,
N/A means outside this constructor's editing surface. EDIT can have specific
preserve-only subproperties; these are listed separately below.

| Capability | Classic | Canvas before | Intended baseline |
|---|---|---|---|
| Metadata sources, removal, field selection | EDIT | EDIT | EDIT |
| Source aliases / aliasSynthesized | PRESERVE (no rename action) | PRESERVE | PRESERVE |
| Virtual sources / arguments | EDIT | MISSING argument editor | EDIT |
| Source subquery create / recursive edit | EDIT | MISSING; loaded tree preserved | EDIT |
| JOIN endpoints, kind, multiple conjuncts, custom expressions | EDIT | EDIT | EDIT |
| Parsed JOIN tree / source ordering properties | PRESERVE | PRESERVE | PRESERVE |
| Scalar fields, aliases, custom expressions, per-field aggregates, reorder | EDIT | EDIT | EDIT |
| Tabular projections and inner columns / expressions | EDIT partially | PRESERVE | PRESERVE |
| Field qualification, selectOrder, funcOperandQualified, exprAliasExplicit, autoAliasDotted | PRESERVE | PRESERVE | PRESERVE |
| DISTINCT, ALLOWED, TOP | EDIT | EDIT | EDIT |
| WHERE field/operator/parameter or custom text | EDIT | EDIT | EDIT |
| Structured condition subqueries, hierarchy/negation flags | PRESERVE; replace via custom text | PRESERVE; replace via custom text | PRESERVE |
| HAVING | PRESERVE (no reducer editing actions) | PRESERVE | PRESERVE |
| GROUP BY basic fields / per-field aggregate | EDIT | EDIT | EDIT |
| Grouping sets, explicitGroupCount, legacy grouping aggregates | EDIT/PRESERVE | PRESERVE | PRESERVE |
| ORDER BY add/remove/direction, auto | EDIT | EDIT | EDIT |
| ORDER hierarchy, expression, qualified/selectAlias | PRESERVE (no hierarchy action) | PRESERVE | PRESERVE |
| TOTALS grouping/kind/alias, aggregate function, grand total | EDIT | MISSING editor; preserved | EDIT |
| TOTALS raw expression/operand flags, ПЕРИОДАМИ | PRESERVE | PRESERVE | PRESERVE |
| INDEX BY sets/unique/columns/reorder | EDIT | MISSING editor; preserved | EDIT |
| INDEX raw expression/qualified/selectAlias | PRESERVE | PRESERVE | PRESERVE |
| Temp producer/create, append, consume, drop | EDIT | EDIT | EDIT |
| Manual temp source description create/update | EDIT | MISSING UI | EDIT |
| Package-derived temp schema | Producer owns schema | Producer owns schema | EDIT through producer; no manual override |
| Package add/remove/switch, UNION add/remove/switch/ALL/distinct | EDIT | EDIT | EDIT |
| UNION column alias/reorder mapping | EDIT | EDIT | EDIT |
| Package reordering | EDIT | PRESERVE order | PRESERVE; UX follow-up |
| Report builder dynamic blocks | EDIT | PRESERVE | PRESERVE; advanced UX follow-up |
| Characteristics raw block, trailingFields | PRESERVE | PRESERVE | PRESERVE |
| Bound SELECT/FROM/field comments, VT/ПЕРИОДАМИ argument comments | PRESERVE | PRESERVE | PRESERVE |
| C17 raw expression comments lost on open | MISSING safety | MISSING safety | Explicit safe rejection; renderer remains C17 |
| Metadata cache refresh, execution, IDE assistance | Separate workflow | N/A | N/A |

## Missing workflows and chosen scope

1. Source subquery: users can load/save but cannot create or enter the nested
   query. Classic recursively mounts ConstructorView; ADD/UPDATE_SUBQUERY_TABLE,
   LOAD_BATCH, assembleMembers and deriveUnionColumns already exist. MUST:
   recursively mount Canvas Workspace using the same reducer, with an isolated
   draft, breadcrumb/back commit, cancel, nested UNION and all six workspaces.
   No new domain model, host session or package inside a source subquery.
2. Manual temp description: users cannot define/edit an external temp source.
   Classic TempTableDialog and ADD/UPDATE_TEMP_TABLE already exist. MUST: reuse
   that dialog from the source browser/Inspector. Package schemas must continue
   to use producer lifetimes; UPDATE_TEMP_TABLE intentionally refuses them.
3. VT arguments: users can add a VT but cannot configure its period/filter.
   Classic VirtualTableParamsDialog and SET_VIRTUAL_PARAMS already exist. MUST:
   contextual source action, using metadata kind/slice and existing expression
   editor. Unsupported arguments remain blocked by the shared Apply gate.
4. TOTALS: Classic TotalsTab and all relevant actions exist. MUST: contextual
   section under Grouping; preserve raw expressions and ПЕРИОДАМИ properties.
5. INDEX BY: Classic IndexTab and all actions exist. MUST: contextual section
   under Additional for temp producers. No temp architecture change (A2).
6. C17: existing parser/generator lose comments in opaque slices. P1 preservation
   blocker. A narrow shared open check must refuse a lossy initial model before
   LOAD_BATCH, leaving the original document recoverable. Comment-aware rendering
   is an A1-adjacent follow-up, not part of this task. This is rejected unsupported
   input, **not** a PRESERVE guarantee. No new generator output contract.

Grouping sets, dynamic report builder, tabular projection editing, package move
controls, HAVING and recursive condition-subquery GUI are explicitly deferred.
Preserving their existing representation is a valid baseline boundary; full
recursive source editing is feasible without changing architecture.

## Invariants and verification plan

Both surfaces keep shared QueryState/QueryModel, load session, reducer, generation,
Apply gate, bridge and metadata infrastructure. Parent workspace stays mounted
while a nested draft is open, preserving its selection, tab and layout. Cancel
does not modify the parent. Back validates through the shared Apply gate before
UPDATE_SUBQUERY_TABLE, which also refreshes source columns. Saving the root is
unavailable while a draft is open. Package-derived temp schemas are never manually
rewritten. New controls use current contextual UI and tokens.

Baseline targeted units: 389 passed (17 files), including full store/core corpus
parity. Baseline Canvas browser run: 27 passed, one existing Classic C12 timeout;
isolated rerun recorded with final verification.

Add model/output assertions for nested load/edit/back/save/reopen, recursive
sources/JOIN, cancel/context retention, malformed drafts, temp/package edit/save,
VT parameters, totals and indices, Classic→Canvas→Classic, UNION + nested/package,
and each preserve-only family. Extend the production-bundle real Extension Host
test to drive nested editing through the actual insertText bridge.

Run docs check, all typechecks/build, unit suite (including corpus/preservation),
browser E2E and Extension Host integration. Never regenerate golden/snapshots.

## Completion evidence

Pending implementation and gates. Product item is PARTIAL/P1 until the chosen
editing scope, preservation evidence and primary E2E workflows pass.
