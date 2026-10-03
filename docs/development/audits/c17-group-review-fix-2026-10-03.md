# C17 GROUP review fix: require comment ownership

Date: 2026-10-03. Baseline: `fcbdf9e`, the explicit checkpoint of GROUP support
and its [review finding](c17-group-review-2026-10-03.md).

The new any-comment trigger for formatted literal-LHS IN subqueries discarded
formerly preserved ORDER/TOTALS/source comments. The trigger now parses a candidate
but adopts it only when the existing source-position registry accounts for every
comment occurrence. Mixed or unsupported slots retain the established raw path.
Identical comment text cannot hide an unowned occurrence: positions, not strings,
are checked. The legacy compact/HAVING structural conditions remain unchanged.

This is a bounded parser decision fix, not new support for ORDER/TOTALS/FROM.
No generator, store, schema, recovery or loss-gate changes in this follow-up.
Owned GROUP subqueries still reopen structurally and stably. Conservative raw
selection remains possible for preserved comments not covered by the registry;
this is not a claim of universal structured support.

12 new regressions cover metadata on/off and each unsupported slot alone or
mixed with GROUP, deliberately using identical comment text in both slots.
They exercise open/load/preview/Apply, three reopens and non-mutating stripping.
All 12 failed at the checkpoint and pass after the fix. The previous 64 GROUP
tests and SELECT/condition coverage remain green. The three exact recorded review
inputs also open and reopen stably; all 288 independent GROUP probes pass again.

## Validation

| Command | Result |
|---|---|
| `npx vitest run test/unit/groupComments.c17.test.ts test/unit/fieldComments.c17.test.ts test/unit/conditionComments.c17.test.ts` | Baseline 424 passed; final 436 passed |
| `npx vitest run test/unit/groupComments.c17.test.ts` | Before fix: 12 new cases failed, 64 previous cases passed |
| `npm run typecheck` | All three targets passed |
| `npm run test:unit` | 4693 passed / 170 files |
| `node /tmp/c17-fields-corpus-compare.cjs` | 15,808 byte comparisons, 0 changes, 0 errors; HEAD vs worktree, both metadata and comment modes |
| `node /tmp/c17-group-review.cjs` | 288 GROUP probes, 0 findings |
| `npm run test:e2e` | 176 passed |
| `npm run test:integration` | 46 passed; extension host exit 0 |
| `npm run docs:check` | 107 Markdown files / 98 reachable pages; passed |
| `git diff --check` | Passed |

[Comparison summary](c17-group-review-fix-2026-10-03.json). No native platform run;
no golden, snapshot or corpus baseline updates. C17 remains OPEN for the remaining
TOTALS, ORDER, source and UNION separator slots. No push.
