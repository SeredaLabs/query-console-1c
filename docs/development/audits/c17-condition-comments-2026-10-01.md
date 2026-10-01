# C17: WHERE/HAVING comment preservation

Date: 2026-10-01. Implementation baseline: `59a928d` on
`codex/c21-designer-toggle`. Current status belongs to the
[ledger](../technical-debt.md): C17 remains OPEN for JOIN/field/group/TOTALS slices.

## Bounded behavior change

Before this change, raw WHERE/HAVING comments could disappear during generation.
Simply keeping a HAVING line comment was unsafe: the generated conjunction `И`
could follow `//` and become part of the comment. The shared designer therefore
asked for consent to the detected loss.

The [parser](../../../src/core/query/sdblParser.ts) now retains these comments
with `preserveComments`. Edge comments use optional Condition `commentLeading`
and `commentTrailing` arrays; internal comments remain in a custom expression's
source gaps. Edge comments do not change parameter conditions or structured IN
subqueries into opaque text. Internal comments in an ordinary non-subquery
condition use the custom-expression representation. Parsing without preservation
continues to strip condition comments.

The [generator](../../../src/core/query/sdblGenerator.ts) prints edge comments
on their own lines and bypasses expression formatting for commented raw text.
Top-level Boolean conjuncts are wrapped without rewriting their code/comments;
a trailing comment cannot swallow the closing parenthesis. HAVING conjunctions
following commented text go on a separate line. This preserves the conjunct
boundary when another condition is added through the shared store.

Synthetic UNION EOF tokens stop at the last code token. A separate source-end
boundary includes trailing comments without changing tokens, grammar or recorded
source-map ranges. Source and condition subqueries inherit preservation mode.
The [binder](../../../src/core/query/commentBinder.ts) excludes parser-owned
comments by SELECT-relative source positions, including nested source positions;
identical comment text in another slot still binds independently. These positions
are transient, not serialized model properties. Existing SELECT/FROM/argument
comment binding still runs once through its original path.

The [strip-comments view](../../../src/webview/state/queryStore/snapshots.ts)
removes condition anchors and raw-text comments recursively without changing the
editable preserving model. Strings containing `//` remain strings. Existing
models without the optional condition anchors retain their behavior; no migration,
new lexer, grammar, UI editor or dependency was introduced.

The warning check remains exact comment text/counts only, with no source-placement
comparison. Missing comments in unsupported slots still require explicit consent;
Cancel and malformed Apply blockers remain active. No live 1C execution or general
input/output semantic equivalence claim is made here.

## Regression and baseline changes

- [Condition regressions](../../../test/unit/conditionComments.c17.test.ts):
  32 cases covering edge/internal/repeated comments, strings, AND/OR/NOT,
  parenthesis flattening, nested source/condition subqueries, UNION, metadata
  modes, open/store/Apply/reopen, nonmutating strip mode, an added AND condition
  after a commented OR block and malformed Apply refusal.
- Three former known-loss cells (WHERE before OR; HAVING before AND; trailing
  HAVING), each in two metadata modes, move from loss expectations to preservation
  coverage. Six tests leave the C16 known-loss matrix; JOIN/field/group/TOTALS
  cells stay unchanged. Two designer-open shapes move from confirmation to
  successful opening in both metadata modes.
- Consent fixtures now use unsupported field/JOIN comments instead of newly
  supported WHERE comments. Cancel/Continue, stale-candidate replacement,
  duplicate counts, dialog list rendering and toggle refusal assertions remain.
- [Browser tests](../../../test/e2e/canvas.spec.ts): four new cases for Classic
  and Canvas alias edit/Save/reopen, plus Apply in both Classic text editors.
- [Real-host test](../../../test/vscode-integration/canvasSave.test.ts): one new
  Canvas condition-comments Save case checks exact occurrence counts and the
  surrounding BSL text through the production host bridge. Existing consent
  scenarios use JOIN comments and retain their original assertions.

Before production edits, 787 existing tests in five relevant files passed. The
frozen-HEAD/current comparison covered all 1976 valid corpus records, both
`input` and `query_text`, metadata on/off, preservation on/off:
**15,808 generated outputs compared; zero changes; zero parse failures in either
version**. No golden, snapshot, fixture-file or classification baseline changed.
Expected output changes are confined to the explicit new comment cases above.
For example, `ГДЕ Т.Код = 1 // c` followed by `ИЛИ …` previously lost `// c`;
it now retains that text inside a Boolean wrapper. A HAVING condition followed by
`// c` now emits the comment and the connecting `И` on separate lines.

## Verification

| Command | Result |
|---|---|
| `npx vitest run test/unit/rawSliceComments.c16.test.ts test/unit/commentsRoundTrip.test.ts test/unit/openDesignerBatch.test.ts test/unit/booleanGroupingSemantics.test.ts test/unit/sdblParser.test.ts` | Pre-edit baseline: 787 tests / 5 files passed. |
| `npm run typecheck` | Extension, Classic webview and Canvas passed. |
| `npx vitest run test/unit` | 3870 tests / 166 files passed. |
| `npx vitest run test/unit/conditionComments.c17.test.ts test/unit/rawSliceComments.c16.test.ts test/unit/openDesignerBatch.test.ts test/unit/designerSession.commentLoss.test.ts test/unit/booleanGroupingSemantics.test.ts test/unit/conditionSubqueryScope.test.ts test/unit/invalidInputPreservation.test.ts test/unit/queryStore.stripComments.test.ts` | Final targeted gate: 607 tests / 8 files passed, including the added nonmutation assertion. |
| `npm run test:e2e` | 162 passed. |
| `npm run test:integration` | 43 passed in the real VS Code host; exit 0. |
| `node /tmp/c17-corpus-compare.cjs` | Frozen HEAD versus working code: 15,808 outputs, zero changes. |
| `npm run docs:check` | Passed. |
| `git diff --check` | Passed. |

## Remaining scope

C17 is not closed. JOIN, selected fields, grouping and TOTALS comment-safe
rendering are separate follow-ups. Comment placement verification, unrelated
ORDER alias behavior, broad lexical migration and parser redesign are outside
this slice. C18/C5 invalid-input behavior and their regression test are unchanged.
