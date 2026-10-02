# Review: SELECT literal preservation is incomplete

Date: 2026-10-02. Reviewed uncommitted fix over `25ac0e3`.
Review only; no additional production or test edits.

## Findings

### P1: CASE inside a function still folds literal newlines

`reindentLeafCase` in `src/core/query/exprFormatter.ts:1456` joins physical
lines without protecting multiline literal spans. The input
`ВЫБРАТЬ ЕСТЬNULL(ВЫБОР КОГДА ИСТИНА ТОГДА "a\nb" КОНЕЦ, "x") КАК А`
produces `"a b"` instead of `"a\nb"`. This occurs identically at HEAD and
in the reviewed worktree. The new tests cover CASE and functions separately,
but omit their composition. Removing SELECT padding cannot address this path.

### P1: tabular SELECT expressions still acquire literal padding

`tsExprLines` in `src/core/query/sdblGenerator.ts:1853` adds a tab to every
continuation line of a lexically valid expression, including literal contents.
For `ВЫБРАТЬ Т.Товары.("a\nb" КАК А) ИЗ Документ.ЗаказКлиента КАК Т`,
HEAD emits two tabs before `b`, the worktree emits one, and reopening the
worktree output emits two again. Thus the reviewed fix reduces the padding but
still fails value preservation and reopen stability in this SELECT path.
The new tests omit tabular projection expressions.

[Exact local before/after/reopen evidence](c17-literal-review-2026-10-02.json)
was generated using frozen HEAD and fresh worktree bundles. These cases were
parsed without a metadata resolver; the tabular source is a synthetic local
case, not an assertion that this table exists in the connected database.
No live execution was performed during this review.

## Scope and verification

A supplementary matrix exercised 42 scalar combinations: six literals (CRLF,
blank/trailing/leading newline, tabs, escaped quotes) across seven expression
forms (bare, function, arithmetic, CASE, AND, OR, function containing CASE).
Six function-containing-CASE cases altered literal bytes; the other 36
preserved literals and were stable on reopening. The tabular case was checked
separately. Both findings predate this fix; neither is evidence that removing
`indentStringLiteralNewlines` introduced a new defect.

The previous 4461 unit / 172 E2E / 44 integration / typecheck and 15,808
zero-difference corpus results remain valid for the implementation reviewed.
They do not cover these two gaps. No golden or other baseline was changed.
The current review reruns the targeted literal/JOIN/condition tests and checks
documentation and diff hygiene; it does not claim a new full-suite run.

The report and ledger must not mark the complete literal prerequisite resolved.
The leaf SELECT padding defect is fixed, but the prerequisite remains PARTIAL
until these two paths preserve literal contents and have regression coverage.
Resolve them as bounded follow-up work before remaining C17 comment slots.

Commands executed for this review:

- `npx vitest run test/unit/selectLiteralPreservation.test.ts test/unit/multilineStringCloseParen.test.ts test/unit/joinComments.c17.test.ts test/unit/conditionComments.c17.test.ts`: 630 passed / 4 files.
- `npm run docs:check`: passed.
- `git diff --check`: passed.


## Follow-up resolution

The [function CASE/tabular SELECT fix](c17-literal-followup-fix-2026-10-02.md)
resolves both reviewed paths with literal-preservation and repeated-reopen
regressions. Earlier PARTIAL/OPEN assessments describe the pre-follow-up state.
Remaining C17 comment slots stay OPEN.
