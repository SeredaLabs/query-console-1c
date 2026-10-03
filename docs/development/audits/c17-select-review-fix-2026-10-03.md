# C17 SELECT review fixes

Date: 2026-10-03. Baseline: `6bab85f`. Bounded follow-up to the
[SELECT review](c17-select-review-2026-10-03.md). C17 remains OPEN for other slots.

## Changes

`parseConditionList` now skips comment positions already claimed by a nested
document. A header before its SELECT token therefore belongs only to the
subquery, instead of being duplicated on the outer condition. Ownership is
position-based: identical comments at distinct positions remain distinct.

`commentBinder` applies its existing explicit-alias/dotted-path guard to every
clause boundary, including FROM and placement. Keyword-shaped aliases such as
`ИЗ`, `ПОМЕСТИТЬ` and `ДОБАВИТЬ` no longer truncate the projection region.
Actual FROM/placement clauses still terminate it.

No generator, store, recovery or designer loss-gate changes. The loss gate still
detects missing occurrences only; this fix does not make it a duplicate detector.

## Regression evidence

32 added cases in `fieldComments.c17.test.ts` exercise both metadata modes,
WHERE/HAVING subquery headers, repeated identical comments inside/outside the
subquery, all three aliases at different comment positions, actual FROM and
placement controls, load/preview/Apply, three consecutive opens and non-mutating
comment stripping. Before the fix, 28 failed and 4 controls passed; the pre-existing
43 SELECT cases passed. After the fix all 75 SELECT tests pass.

Repeating the original 133 token-boundary probes resolves all 13 SELECT review
counterexamples with no new findings. The remaining 23 source/UNION separator
counterexamples are outside this fix. [Comparison summary](c17-select-review-fix-2026-10-03.json).

No native platform execution was performed. Keyword-alias coverage describes
already accepted local parser behavior, not new platform syntax attestation.
No golden, snapshot, classification or corpus baseline changes. No commit/push.

## Validation

| Command | Result |
|---|---|
| `npx vitest run test/unit/fieldComments.c17.test.ts test/unit/conditionComments.c17.test.ts test/unit/joinComments.c17.test.ts` | Baseline 557 passed; after fix 589 passed |
| `npx vitest run test/unit/fieldComments.c17.test.ts` | Before fix: 28 failed, 47 passed |
| `npm run typecheck` | Passed all three targets |
| `npm run test:unit` | 4619 passed / 169 files |
| `node /tmp/c17-fields-corpus-compare.cjs` | HEAD vs worktree: 15,808 byte comparisons, 0 changes, 0 errors; both metadata and comment modes, input/query_text for 1976 valid rows |
| `node /tmp/c17-select-review.cjs` | 133 probes, 13 resolved, 23 previously known out-of-scope findings, 0 new findings |
| `npm run test:e2e` | 174 passed |
| `npm run test:integration` | 45 passed; extension host exit 0 |
| `npm run docs:check` | Passed: 104 Markdown files, 95 reachable pages |
| `git diff --check` | Passed |
