# C17 prerequisite: preserve SELECT literal values

Date: 2026-10-02. Baseline: `25ac0e3`. Implementation is uncommitted.
The leaf SELECT padding defect is fixed; the literal prerequisite is PARTIAL
after review found two additional paths. C17 remains OPEN for remaining
SELECT-field/group/TOTALS/ORDER comment slots.

## Change and contract

`formatSelectExpression` in [sdblGenerator.ts](../../../src/core/query/sdblGenerator.ts)
used `indentStringLiteralNewlines` to insert a tab after each newline inside a
leaf SELECT literal. The [runtime audit](c17-literal-runtime-2026-10-02.md) proved
that this changes values. Remove that call and its now-unused implementation.
Keep all existing structural formatting, nested literal protection and comment
handling. No parser, store, recovery, metadata or schema change is involved.

[ADR 0004](../decisions/0004-querymodel-round-trip-contract.md) now explicitly
prioritizes literal contents over native canonical padding. Existing literal
whitespace is retained, not normalized away. Canonical formatting outside
literal tokens remains the contract. The corpus policy links this exception.

For the attested source query, the output literal changes from `"a\n\tb"` to
`"a\nb"`, matching the original input. Existing user-authored tabs remain.
This deliberately differs from the native constructor's `"a\n\t\tb"`; the
constructor result was demonstrated to have a different runtime value.

## Regression coverage and live verification

[selectLiteralPreservation.test.ts](../../../test/unit/selectLiteralPreservation.test.ts)
adds 113 tests: SELECT, two levels of source nesting, UNION, function, CASE and
condition-subquery shapes; plain/tabbed/blank/comment-looking/semicolon/escaped
quote contents; both metadata and comment modes; reopen stability; and designer
load/preview/Apply/reopen. On the old implementation 97 fail and 16 pass. All
113 pass after the change. No unrelated test expectations were changed.

Two existing package-split assertions in
[sdblParser.test.ts](../../../test/unit/sdblParser.test.ts) intentionally now
expect the input literal bytes instead of added tabs. Their package-splitting
assertions stay unchanged. These are hand-written expectations, not corpus or
snapshot refreshes; the runtime evidence justifies both changes.

[Post-fix native execution](c17-literal-fix-runtime-2026-10-02.json) embeds the
actual worktree-generated source SELECT and original input as derived tables.
Both the self-control and corrected-versus-original comparison return `Yes`
in one row. The pre-fix comparison returned `No`. No business data, writes or
stored-query saves were involved. Live verification covers this synthetic
source-SELECT on the previously observed 8.3.15.1489 session; it does not claim
all platforms, shapes or string lengths were tested by execution.

## Gates and output impact

| Exact command | Result |
|---|---|
| `npx vitest run test/unit/sdblParser.test.ts test/unit/multilineStringCloseParen.test.ts test/unit/joinComments.c17.test.ts test/unit/conditionComments.c17.test.ts` | Baseline: 770 passed / 4 files |
| `npx vitest run test/unit/selectLiteralPreservation.test.ts` | Before fix: 97 failed, 16 passed; expected reproduction |
| `npx vitest run test/unit/selectLiteralPreservation.test.ts test/unit/sdblParser.test.ts` | After fix: 366 passed / 2 files |
| `npm run typecheck` | All three targets passed |
| `npm run test:unit` | 4461 passed / 168 files |
| `node /tmp/c17-literal-corpus-compare.cjs` | 15,808 HEAD/worktree comparisons; 0 changes, 0 errors |
| `npm run test:e2e` | 172 passed |
| `npm run test:integration` | 44 passed; host exit 0 |
| `npm run docs:check` | Passed |
| `git diff --check` | Passed |

[Corpus summary](c17-literal-corpus-comparison-2026-10-02.json) records the exact
baseline and counts. The temporary comparison script bundles HEAD's changed
core files and the worktree, parses/generates every valid committed golden row
from both `input` and `query_text`, with/without metadata and with/without
comments. It compares outputs and errors byte-for-byte: 1976 valid rows × 2
columns × 2 metadata modes × 2 comment modes. No golden, snapshot,
classification or shadow baseline changes. Zero corpus changes means these
synthetic literal failures were not represented in the existing corpus; the
new regression tests supply that coverage.

Audit and ledger updates retain the earlier canonical/runtime findings and
record the leaf fix. The [review](c17-literal-review-2026-10-02.md) supersedes
the original complete-resolution claim: CASE inside functions and tabular
SELECT expressions remain P1 preservation gaps. No commit or push.
Remaining C17 comment support is explicitly outside this bounded fix.


## Follow-up resolution

The [function CASE/tabular SELECT fix](c17-literal-followup-fix-2026-10-02.md)
resolves both reviewed paths with literal-preservation and repeated-reopen
regressions. Earlier PARTIAL/OPEN assessments describe the pre-follow-up state.
Remaining C17 comment slots stay OPEN.
