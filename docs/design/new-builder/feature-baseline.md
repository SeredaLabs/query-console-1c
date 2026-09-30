# Canvas Feature Baseline

Audit date: 2026-09-30. Baseline: `main` at `3c2e66e`, at the start of this task.
Code and tests, rather than phase numbering, determine this checkpoint.
Canvas remains opt-in Preview; V4 verifies a bounded set of paths and is not
feature completion.

## Capability matrix before / after

EDIT means an accessible editing workflow, PRESERVE means retained through an
unrelated edit and save/reopen, MISSING means a required workflow is absent,
N/A means outside this constructor's editing surface. EDIT can have specific
preserve-only subproperties; these are listed separately below.

| Capability | Classic before | Canvas before | Canvas after |
|---|---|---|---|
| Metadata sources, removal, field selection | EDIT | EDIT | EDIT |
| Source aliases / aliasSynthesized | PRESERVE (no rename action) | PRESERVE | PRESERVE |
| Virtual sources / arguments | EDIT common layouts | MISSING argument editor | EDIT common forms; other layouts PRESERVE |
| Source subquery create / recursive edit | EDIT | MISSING; loaded tree preserved | EDIT |
| JOIN endpoints, kind, multiple conjuncts, custom expressions | EDIT | EDIT | EDIT |
| Parsed JOIN tree / source ordering properties | PRESERVE | PRESERVE | PRESERVE |
| Scalar fields, aliases, custom expressions, per-field aggregates, reorder | EDIT | EDIT (source-less expression creation MISSING) | EDIT |
| Tabular projections and inner columns / expressions | EDIT partially | PRESERVE | PRESERVE |
| Field qualification, selectOrder, funcOperandQualified, exprAliasExplicit, autoAliasDotted | PRESERVE | PRESERVE | PRESERVE |
| DISTINCT, ALLOWED, TOP | EDIT | EDIT | EDIT |
| FOR UPDATE enable / source list | EDIT | EDIT | EDIT |
| WHERE field/operator/parameter or custom text | EDIT | EDIT | EDIT |
| Structured condition subqueries, hierarchy/negation flags | PRESERVE; replace via custom text | PRESERVE; replace via custom text | PRESERVE |
| HAVING | PRESERVE (no reducer editing actions) | PRESERVE | PRESERVE |
| GROUP BY basic fields / per-field aggregate | EDIT | EDIT | EDIT |
| Grouping sets, explicitGroupCount, legacy grouping aggregates | EDIT/PRESERVE | PRESERVE | PRESERVE |
| ORDER BY add/remove/direction, auto | EDIT; UNION slot bug C20 | EDIT; UNION slot bug C20 | EDIT, including UNION tail |
| ORDER hierarchy, expression, qualified/selectAlias | PRESERVE (no hierarchy action) | PRESERVE | PRESERVE |
| TOTALS grouping/kind/alias, aggregate function, grand total | EDIT | MISSING editor; preserved | EDIT |
| TOTALS raw expression/operand flags, ПЕРИОДАМИ | PRESERVE | PRESERVE | PRESERVE |
| INDEX BY sets/unique/columns/reorder | EDIT | MISSING editor; preserved | EDIT |
| INDEX raw expression/qualified/selectAlias | PRESERVE | PRESERVE | PRESERVE |
| Temp producer/create, append, consume, drop | EDIT | EDIT | EDIT |
| Manual temp source description create/update | EDIT | MISSING UI | EDIT |
| Package-derived temp schema | Producer owns schema | Producer owns schema | EDIT through producer; no manual override |
| Package add/remove/switch, UNION add/remove/switch/ALL/distinct | EDIT | EDIT | EDIT |
| UNION column alias/reorder mapping | EDIT scalar | EDIT scalar; incomplete advanced projection view | EDIT scalar; tabular/trailing mapping guarded PRESERVE |
| Package reordering | EDIT | PRESERVE order | PRESERVE; UX follow-up |
| Report builder dynamic blocks | EDIT | PRESERVE | PRESERVE; advanced UX follow-up |
| Characteristics raw block, trailingFields | PRESERVE | PRESERVE | PRESERVE |
| Bound SELECT/FROM/field comments, VT/ПЕРИОДАМИ argument comments | PRESERVE | PRESERVE | PRESERVE |
| C17 raw expression comments lost on open | MISSING safety | MISSING safety | Explicit safe rejection; renderer remains C17 |
| Contextual expression helper (field/WHERE/JOIN/VT) | EDIT | MISSING contextual helper | EDIT via shared Classic editor |
| Metadata cache refresh / lazy reference-field expansion | EDIT via existing bridge/actions | MISSING assisted workflow | MISSING noncritical UX-C8; existing loaded navigation retained |
| Generated SDBL text editing / reparse | EDIT Classic dialog | Read-only by design | Read-only dock; raw editor remains available outside Canvas |
| Execution / IDE assistance | Separate editor workflow | N/A | N/A |

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
6. Source-less custom fields: ADD_EXPRESSION_FIELD accepts an empty tableId and
   core supports `ВЫБРАТЬ 1`, but Canvas disabled creation without sources. MUST:
   remove the UI restriction; no reducer/generator change.
7. C17: existing parser/generator lose comments in opaque slices. P1 preservation
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

**Canvas Feature Baseline Complete / CLOSED**, verified 2026-09-30. The
[complete historical reconciliation](phase-reconciliation.md) covers Phases
0–18 and supersedes the earlier inference from Phase 13 alone. This is completion
of the explicitly classified editing baseline, not closure of every historical
UX phase. Phase 13
source editing and manual temp descriptions are implemented, all MUST gaps in
the classified scope are closed, and advanced workflows have explicit preservation boundaries.
Preview and Classic remain. This checkpoint is not a production-ready release.


### Findings and output changes

Implementation findings:

- C20 (P1, fixed): ORDER/TOTALS/INDEX UI actions targeted the active UNION
  member, although core stores those sections on the last member and resolves
  columns against the first. Both UIs now use a shared selector/action composition,
  retain the active member and its field focus, and resolve total operands from
  first-member aliases. Example: editing ORDER on member 0 previously had no
  saved effect; it now writes `Первый УБЫВ` in the tail. No parser/generator change.
- C19 (P1, fixed): source-update pruning dropped navigation paths such as
  `Ссылка.Код` when exported `Ссылка` still existed. Both source-update actions
  now recognize the head column; no changes to root load/generation.
- Canvas drafts refuse an update that would implicitly remove selected parent
  scalar fields. Restore exported names, or explicitly remove dependent parent
  fields first. Classic's existing explicit pruning contract is unchanged.
- C18 (P2, open): negated condition subquery with keyword alias `В` is misparsed;
  Apply blocks it in both UIs. `Т` has positive preservation evidence. No new
  parser rewrite or false PRESERVE claim.
- VT forms edit only information-register slices, accumulation-register slices
  and the existing accounting forms. Calculation, criterion and other layouts
  remain preserved; unsafe arguments remain blocked. Confirming a common form
  retains hidden parser-owned flags. No new VT domain representation.
- INDEX uniqueness is expressed by the existing generator only for multiple
  nonempty sets; the E2E uses two sets. The canonical single-index behavior was
  not changed.
- A manual external temp description is session metadata, as in Classic. SDBL
  saves its source name and referenced columns; reopening infers that schema.
  Unused description-only columns are not persisted by SDBL. Package schemas
  remain derived from their producer lifetime (A2 unchanged).


### Regression evidence and final commands

| Command | Result |
|---|---|
| `npm run docs:check` | PASS: 76 Markdown files, 67 reachable pages |
| `npm run typecheck` | PASS: extension, Classic, Canvas |
| `npm run build` | PASS: extension, Classic, Canvas production bundles |
| `npm run test:unit` | PASS: 161 files, 3776 tests |
| `npm run test:e2e` | PASS: 138 tests; Canvas file 60 tests, including 32 new cases |
| `npm run test:integration` | PASS: 39 tests in real VS Code 1.139.1, including nested Canvas source edit/back/Save |

Additional targeted commands executed during implementation:

- `npx vitest run test/unit/canvas*.test.ts test/unit/queryStore*.test.ts test/unit/applyGate.test.ts test/unit/rawSliceComments.c16.test.ts`: baseline 389/17 PASS.
- `npm run test:e2e -- test/e2e/canvas.spec.ts`: baseline 27 PASS, one Classic C12 loading timeout. `npm run test:e2e -- test/e2e/canvas.spec.ts -g 'C12'`: 4 PASS. Final full suite above has no failures.
- `npx vitest run test/unit/queryStore*.test.ts test/unit/sourceQueryDraft.test.ts test/unit/openDesignerBatch.test.ts test/unit/canvasPreserveBoundaries.test.ts`: 344/15 PASS.
- `npx vitest run test/unit/compoundSections.test.ts test/unit/queryStore.test.ts test/unit/canvasReuse.test.ts`: 233/3 PASS.
- `npm run test:e2e -- test/e2e/canvas.spec.ts -g 'Canvas feature baseline|C17'`: 19 PASS before the three final safety cases.
- `npm run test:e2e -- test/e2e/canvas.spec.ts -g 'confirmation'`: 2 PASS (VT safety flags, manual-temp referenced-column refusal).
- `npm run test:integration -- --grep 'production Canvas'`: 2 PASS before final full integration.

Added 35 unit cases in six new files and two corpus gate assertions (33 cases
in the original implementation, two shared expression-source cases after full
roadmap reconciliation).
New units cover cloned recursive drafts/cancel, shared validation, UNION slots and
first-column aliases, navigation retention, C17 controlled refusal and the C18
boundary. Browser tests cover all six nested workspaces, recursive sources/JOIN,
source-less creation, UNION/temp packages, manual descriptions, VT arguments,
TOTALS/INDEX, Classic→Canvas→Classic, preservation families and unsafe edits.
Ten additional browser cases cover advanced UNION preserve-only mapping,
scalar mapping edits/ALL/create/remove, source/JOIN focus and keyboard controls,
read-only highlighted/copyable/resizable/collapsible generated SDBL and contextual
expression editing/Cancel/malformed recovery/nested Escape/JOIN creation.
The real host test verifies production nested editing changes only the captured
BSL literal through the actual bridge.

The committed corpus remains 1976 valid inputs. Both metadata modes compare core
and store output byte-for-byte, now also after an unrelated ALLOWED modifier edit
and reloading the saved result (drop-only first statements skip the modifier).
There are zero unexplained store/core differences. This checks store fidelity;
it does not assert every existing core canonicalization is a fixed point or
prove live 1C semantic equivalence. Existing corpus, shadow and C16 preservation
gates pass unchanged. No snapshot, golden or classification file was updated.
Interim regression tests caught source pruning and UNION focus loss before their
fixes. New E2E assumptions were corrected to the existing contracts: only common
VT layouts are editable, one INDEX set does not emit UNIQUE, a negated keyword
alias is C18, and the legacy text dialog uses a different close control from v2.
The optional tree-sitter WASM fixture is absent: its independent oracle did not
run. Platform/live oracle execution and release hardening were outside this task.

### Remaining product work

- UX-C1: explicit editors for grouping sets, dynamic report blocks and tabular
  projections; baseline preserves them through unrelated edits.
- UX-C2: package reordering and advanced source alias/ORDER hierarchy controls;
  baseline preserves their loaded properties and ordering.
- UX-C3: HAVING and recursive condition-subquery GUI; existing representations
  survive unrelated edits, with C18 classified as a safely blocked exception.
- UX-C4: narrow-viewport, keyboard and accessibility/release review of recursive
  workflows before changing Preview status.
- UX-C5: UI-to-SDBL cross-highlight, pending an output-range contract.
- UX-C6: field-to-field JOIN drag, advanced shortcuts/find/focus.
- UX-C7: sort-priority reorder, requiring a shared action.
- UX-C8: metadata refresh and lazy reference-field expansion parity; the earlier
  matrix's N/A classification was incorrect. These assisted workflows are missing
  but do not prevent primary editing or preserving loaded query properties.
- UX-C9: full advanced positional UNION mapping, pending the shared schema
  contract; current mapping suppresses misleading edits for preserved projections.
- UX-C10: stable global scope-ID hardening only when a concrete consumer exists.
- C17: comment-aware raw-expression rendering remains required to support the
  safely rejected inputs. C18 requires narrow keyword-alias disambiguation.

No A1/A2/A3, English SDBL, core rewrite, new domain/store, dependency or visual
redesign was introduced. Historical audits/phase documents were retained unchanged.


### Logical commits

- `b63b02b` — capability audit and chosen scope, before implementation.
- `2c91db9` — C19 source navigation preservation and failing-before regressions.
- `04bd224` — shared C17 safe-open boundary and 26 regressions.
- `1025de5` — Classic text Apply uses the same safe-open boundary.
- `1617113` — C20 shared UNION tail selectors/actions and focus preservation.
- `fa4777e` — contextual Canvas TOTALS/INDEX editors.
- `7af95c1` — recursive source/VT/manual-temp workflows and draft regressions.
- `9487cf0` — browser, production host and full-corpus preservation evidence.

The original documentation commit `3edace9` recorded the initial checkpoint.
The continuation adds `b25bf32` (full roadmap reconciliation) and `6a59ed6`
(contextual expression/keyboard/UNION safety controls and regressions), `fa03e07`
(source/JOIN focus regression), followed by final UX-C1–UX-C10 documentation.
See the reconciliation's final verification for continuation commits and commands.
No history rewrite, force push, temporary probe or generated fixture was committed.
