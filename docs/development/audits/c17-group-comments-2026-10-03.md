# C17 GROUP BY comment preservation

Date: 2026-10-03. HEAD baseline: `6bab85f`; the working tree already contained
the [SELECT review fixes](c17-select-review-fix-2026-10-03.md). No commit or push.

**Historical review: NOT READY; now [resolved by the ownership guard](c17-group-review-fix-2026-10-03.md).** The [independent review](c17-group-review-2026-10-03.md) found a preservation regression outside GROUP caused by the broad commented-subquery trigger. Passing gates below did not cover it.

## Scope and behavior

The parser previously stripped GROUP expression comments and did not retain
comments between section keywords, keys or grouping sets. The renderer can
remove constants, cap/reorder duplicate keys and append missing keys. Attaching
comments only to individual keys would therefore still lose user text.

`Grouping.commentLeading` is an optional section anchor. The parser captures
exact comment text in source order from GROUP's first keyword up to the next
clause/boundary and registers ownership in the existing source-position registry.
The generator prints these comments after the GROUP header. If the pre-existing
normalization removes all keys, it prints them as query headers before SELECT.
This explicitly relocates comments; original key association/position is not
promised. No grouping expression, deduplication or constant-filter rule changed.
The strip-comments view removes the anchor recursively without mutation.

An additional required dependency surfaced in literal-LHS `1 В (SELECT …)`:
the first compact parse was structured, but reopening switched to raw text.
With preserved GROUP comments this changed indentation. Commented subqueries
now retain the existing structured parse path even after expansion to multiple
lines. The uncommented gate is unchanged. No alternate parser/renderer added.

## Tests and review

64 new matrix tests cover metadata on/off; keyword/path/expression comments;
duplicate keys and identical comments; removed parameters and whole-section
removal; grouping sets; HAVING boundaries; source/condition subqueries; UNION;
load/preview/Apply; three opens; and non-mutating stripping with equal code tokens.
The initial 48 tests all failed before implementation. Adding condition-subquery
coverage exposed 14 indentation failures; the structured-path fix resolves them.
The first full unit run also caught those same 14 failures; it is not counted as
a passing gate.

GROUP is removed from known-loss assertions and moved to successful opening.
Confirmation/refusal/Cancel/repeated-loss fixtures now use still-unsupported ORDER
comments without weakening assertions. Two browser cases exercise Classic/Canvas
alias edits and three Save/reopens. A real VS Code Canvas case checks GROUP comment
insertion while preserving surrounding BSL.

Files: parser/model/generator, snapshot stripping, GROUP/open/session/raw-comment
tests, Canvas E2E/host tests, safety contract and ledger. No native platform run
or new platform canonical-layout claim. No corpus, snapshot or golden updates.
TOTALS, ORDER, source and UNION separator preservation remain separate C17 tasks.

## Validation

| Command | Result |
|---|---|
| `npx vitest run test/unit/fieldComments.c17.test.ts test/unit/conditionComments.c17.test.ts test/unit/rawSliceComments.c16.test.ts test/unit/openDesignerBatch.test.ts` | Baseline: 423 passed |
| `npx vitest run test/unit/groupComments.c17.test.ts` | Initial red: 48 failed; initial implementation: 48 passed; expanded matrix exposed 14 failures / 50 passed |
| `npx vitest run test/unit/groupComments.c17.test.ts test/unit/fieldComments.c17.test.ts test/unit/conditionComments.c17.test.ts test/unit/rawSliceComments.c16.test.ts test/unit/openDesignerBatch.test.ts test/unit/designerSession.commentLoss.test.ts` | Intermediate: 473 passed |
| `npx vitest run test/unit/groupComments.c17.test.ts test/unit/fieldComments.c17.test.ts test/unit/conditionComments.c17.test.ts` | Final targeted: 424 passed, including all 64 GROUP cases |
| `npm run typecheck` | Passed all three targets after final code change |
| `npm run test:unit` | Final: 4681 passed / 170 files |
| `node /tmp/c17-fields-corpus-compare.cjs` | Final: 15,808 comparisons, 0 changes, 0 errors |
| `npm run test:e2e` | 176 passed |
| `npm run test:integration` | 46 passed; extension host exit 0 |
| `npm run docs:check` | Passed: 105 Markdown files, 96 reachable pages |
| `git diff --check` | Passed |

[Corpus summary](c17-group-corpus-2026-10-03.json): HEAD vs worktree, 1976 valid
rows × input/query_text × metadata on/off × comment mode on/off. This comparison
also includes the prior uncommitted SELECT fixes. No existing baseline changed.
