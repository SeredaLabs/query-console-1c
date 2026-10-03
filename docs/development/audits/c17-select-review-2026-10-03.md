# C17 SELECT review: unresolved preservation findings

Follow-up: the two SELECT findings below are [resolved by a bounded fix](c17-select-review-fix-2026-10-03.md). Original pre-fix evidence and verdict are retained. Other C17 slots remain OPEN.

Date: 2026-10-03. Baseline: `abbfb91`; compared with the uncommitted SELECT
implementation. Status: **NOT READY for commit**. This review changes
documentation only; production fixes and regression tests remain pending.

## Method and scope

`node /tmp/c17-select-review.cjs` inserted a line comment after each code token
in ten locally accepted queries, then compared exact comment counts and generated
text after reopening. 133 probes parsed; 97 passed and 36 produced counterexamples.
The frozen HEAD bundle was also evaluated for each counterexample. These are
metadata-free synthetic probes, not native platform acceptance evidence.
[Evidence](c17-select-review-2026-10-03.json) retains all 36 inputs and both
baseline and worktree outputs, including reopened output.

## P1: new double ownership in condition-subquery headers

```sdbl
ВЫБРАТЬ Т.Код КАК А ИЗ Справочник.Валюты КАК Т ГДЕ Т.Код В ( // probe
ВЫБРАТЬ 1 КАК А)
```

HEAD emits one comment and stays stable. The worktree emits two copies on the
first generation and three after reopening. `tryOpenDesignerBatch` succeeds.
The new `preserveComments` propagation in `sdblParser.ts` attaches this header
to the nested document, while `parseConditions` also assigns it to the outer
condition because it precedes the nested SELECT token. Recording nested positions
does not itself prevent this second assignment. Loss-only validation does not
detect the extra copies. This regression must be fixed before committing.

## P1: pre-existing keyword-alias boundary loss remains uncovered

```sdbl
ВЫБРАТЬ 1 КАК // probe
ИЗ, 2 КАК ГДЕ
```

First opening succeeds and emits the comment after the first field. Reopening
silently drops it. Both HEAD and worktree behave this way. The same applies to
`ПОМЕСТИТЬ` / `ДОБАВИТЬ` aliases. Twelve probe positions expose this family.
`commentBinder.ts` guards the new following-clause boundary against aliases and
paths, but its existing FROM and placement boundary checks lack those guards.
The SELECT coverage claim must remain bounded until these cases have tests and
a fix. Native validity of these synthetic keyword aliases was not re-attested.

## Other C17 gaps, outside this SELECT projection change

All 23 remaining counterexamples also fail on HEAD. They cover source
header/path/alias comments (including derived sources) and a comment between
`ОБЪЕДИНИТЬ` and `ВСЕ`. These are additional preservation slots, not 23 newly
introduced regressions. They remain separate follow-up work in C17; they were
not repaired as part of this review.

## Validation interpretation

The implementation report's full unit, E2E, integration and unchanged corpus
results remain historical passing evidence. They do not cover the counterexamples
above and do not establish readiness. No snapshots, golden outputs or corpus
baselines were changed. No commit or push was performed.

Review checks:

- `npx vitest run test/unit/fieldComments.c17.test.ts test/unit/conditionComments.c17.test.ts test/unit/joinComments.c17.test.ts`: 557 passed, 3 files. The new counterexamples are not yet unit regressions.
- `npm run docs:check`: passed, 103 Markdown files and 94 reachable pages.
- `git diff --check`: passed.
