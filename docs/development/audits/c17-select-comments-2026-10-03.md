# C17: SELECT projection comment preservation

Date: 2026-10-03. Baseline: `abbfb91`. Uncommitted bounded implementation.
**Historical review status: NOT READY for commit; the two findings are now [resolved by follow-up](c17-select-review-fix-2026-10-03.md).** The [follow-up review](c17-select-review-2026-10-03.md) found a new nested-comment duplication regression and a pre-existing SELECT alias boundary gap. C17 remains OPEN; the gates below did not cover these counterexamples.

## Behavior and implementation

Previously, the binder mapped only `model.fields`, dropped comments inside
expressions, and did not bind SELECT comments in nested source/condition parses.
The new binder uses existing `orderedSelectElements`/`elementAlias` to map
scalar fields, tabular projections and trailing fields in actual SELECT order.
Interior comments become leading anchors on their owning projection. A final
standalone comment also stays with the last projection; same-line trailing
comments use the nearest preceding projection. Source-less following clauses
bound the SELECT region, preventing their comments from being assigned to fields.

Example: `ВЫБРАТЬ Т.Код // note\n+ 1 КАК А ИЗ …` now emits `// note` on its own
line before the generated `Т.Код + 1 КАК А`. Simple paths and aggregate fields
remain structured; no custom-expression conversion or parallel raw renderer.
Tabular interior comments belong to the whole projection, not individual
columns. Original intra-expression position/order is not promised; exact text
and occurrence counts are preserved for the covered cases.

Two optional comment properties on `SelectedTabSectionField` mirror existing
scalar anchors. `buildQueryBlock` decorates output using the same ordered
projection view. Nested source and condition parsers pass the existing comment
mode explicitly. The existing SELECT-relative position registry also records
bound nested comments so parent binders do not duplicate them. No independent
comment parser or source-position store is introduced.

Snapshot stripping now handles trailing/tabular anchors and nested container
comments recursively without mutating the preserving model. Existing alias /
expression edits still clear scalar field-bound comments by the existing
contract; this task covers preservation through unrelated edits, not a new
comment lifecycle. Dynamic SELECT builder fragments are not newly claimed.

Files: `commentBinder.ts`, `queryModel.ts`, `sdblGenerator.ts`, `sdblParser.ts`,
`queryStore/snapshots.ts`, field/open/session/raw-slice unit tests, Canvas/browser
and VS Code bridge tests, safety contract and ledger.

## Regression evidence

43 new unit tests cover interior arithmetic/path/aggregate/CASE/alias comments,
final standalone comments, source and condition nesting, UNION, tabular and
trailing projections, tabular UNION, duplicate text, nested headers, stripping
without mutation, structured field retention, source-less clause boundaries,
designer load/preview/Apply and reopening. Scalar matrix cases run with and
without metadata; tabular examples are explicitly metadata-free synthetic
cases. Comments are compared by exact text/count, not original placement.

The initial 39-test suite failed 36 cases before implementation. A later nested
header regression exposed duplicate parent binding, and a condition-subquery
regression exposed missing nested extraction; both were reproduced before their
fixes. Existing comment-loss confirmation fixtures now use still-unsupported
GROUP BY comments. Two old field-loss assertions were removed because fields
now preserve those comments; open-gate coverage moves fields to the success set.
The loss/refusal/Cancel/explicit-consent checks remain in place.

Two new browser tests cover Classic and Canvas: unrelated alias edit, Save and
three reopens without confirmation or comment loss. A new real VS Code Canvas
bridge case checks inserted SELECT comments and surrounding BSL preservation.

The first E2E run had two failures caused by a newly introduced trailing newline
in the replacement loss fixture: contenteditable `innerText` included an extra
blank line. The fixture now ends at its EOF comment as the previous fixture
had no terminal newline; no product code or assertion was weakened.

## Validation

| Command | Result |
|---|---|
| `npx vitest run test/unit/commentsRoundTrip.test.ts test/unit/rawSliceComments.c16.test.ts test/unit/openDesignerBatch.test.ts test/unit/unionModel.test.ts` | Baseline: 81 passed / 4 files |
| `npx vitest run test/unit/fieldComments.c17.test.ts` | Initial red: 36 failed / 3 passed; final targeted suite: 43 passed |
| `npx vitest run test/unit/fieldComments.c17.test.ts test/unit/conditionComments.c17.test.ts test/unit/joinComments.c17.test.ts` | Intermediate expanded gate: 556 passed / 3 files |
| `npm run typecheck` | All three targets passed |
| `npm run test:unit` | Final: 4587 passed / 169 files |
| `node /tmp/c17-fields-corpus-compare.cjs` | Final: 15,808 comparisons, 0 changes, 0 errors |
| `npm run test:e2e` | Final: 174 passed |
| `npm run test:integration` | 45 passed; host exit 0 |
| `npm run docs:check` | Passed |
| `git diff --check` | Passed |

[Corpus summary](c17-select-corpus-2026-10-03.json) compares HEAD `abbfb91` and
worktree against all 1976 valid golden rows, both input/query_text columns,
both metadata modes and both comment modes. No golden, snapshot, classification
or shadow baseline was changed. The existing corpus has no changed outputs;
new synthetic tests supply the comment cases.

No native 1C execution was performed for this comment-only preservation step.
Literal behavior is protected by the existing literal suite, not re-attested
against the external platform. No commit or push; GROUP BY/TOTALS/ORDER work
is not included.
