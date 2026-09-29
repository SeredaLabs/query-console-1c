# C10 — flat-store preservation, 2026-09-29

Baseline: `5156770`, the [step 1 parity guard](store-parity-2026-09-29.md).
C10 is CLOSED for the flat-state omission of `trailingFields` and `characteristics`.

## Change and compatibility

`SavedQuery` and `QueryState` now include both properties as optional values.
`snapshotActive`, `restoreSaved`, `modelToFlat` and `buildModelFromFlat` carry them
without interpreting their contents. Restoring an older snapshot or creating an
empty query explicitly clears the active values, preventing leakage from the
previous query. No required serialized field or format version was added.

This preserves fields after a tabular-section projection and the raw
characteristics block when loading, editing an unrelated field, switching UNION
members or batch queries, serializing snapshots and reopening saved text.
The generator retains its existing characteristics formatting; preservation of raw
model contents is tested separately from equality of generated text.

Production changes are confined to `src/webview/state/queryStore.ts` and
`src/webview/state/queryStore/snapshots.ts`. Parser, generator, Apply policy,
lexical handling and C8 are unchanged.

## Tests first

Before the fix, the updated permanent guards and new unit tests produced
**16 failures / 6 passes**. Failures demonstrated missing model mappings, the
known 13/18 corpus mismatches, missing sections through store operations, and a
malformed trailing expression disappearing before the static Apply check.
All four new browser cases also failed on the old code: Apply emitted text
without the trailing field or characteristics block.

`queryStore.preservedSections.test.ts` adds 17 unit regressions: conversion and
serialized snapshot restore; load/generate/reopen; unrelated alias editing and
Apply; distinct values across UNION/batch switches; fresh UNION/batch queries;
plain/empty loads; older snapshots; preservation and rejection of a malformed
trailing expression by the existing static guard.

`test/e2e/canvas.spec.ts` adds four cases covering both properties in Classic and
Canvas: load → edit alias → save → reopen → save with exact output comparison.
The trailing-field case supplies local metadata through the existing host message.
Characteristics inputs are synthetic parser-preservation fixtures, not evidence
of live 1C platform acceptance.

The three `.fails` annotations and temporary C10 classifiers from step 1 are
removed. Exact store/core equality and complete property mapping are now ordinary
assertions. No expected failures remain in these tests; no golden expectations
were changed to obtain passing results.

## Corpus impact

An independent managed worktree at `5156770` supplied baseline core and store
implementations. A one-off Node/esbuild probe wrote and compared exact generated
strings from HEAD and the working tree for every valid corpus row.

| Comparison | Without metadata | With committed YAML metadata |
|---|---:|---:|
| Core generation changed | 0 / 1976 | 0 / 1976 |
| Store generation corrected | 13 / 1976 | 18 / 1976 |
| Remaining store/core mismatches | 0 | 0 |

All corrected cases regain scalar fields after a tabular-section projection.
For example, `Catalogs-МашиночитаемыеДоверенности-Forms-ФормаСписка-Ext-Form-Module.bsl_1.txt`
previously ended its select list at `) КАК Полномочия`. It now retains the comma
and following `МашиночитаемыеДоверенности.Ссылка КАК Ссылка`, matching direct core
output. No unexplained output change remains. Characteristics occurs in zero
corpus inputs and is covered synthetically. No golden, snapshot, fixture or
classification baseline files changed. Ledger status changes from C10 OPEN to
CLOSED; the step 1 audit remains historical.

## Commands and results

- `npx vitest run test/unit/queryStore.corpusParity.test.ts test/unit/queryStore.modelCoverage.test.ts test/unit/queryStore.having.test.ts test/unit/queryStore.loadBatch.test.ts` — baseline 41 passed, including 3 known C10 expected failures.
- `npx vitest run test/unit/queryStore.preservedSections.test.ts test/unit/queryStore.corpusParity.test.ts test/unit/queryStore.modelCoverage.test.ts` — before fix: 16 failed / 6 passed.
- `npm run test:e2e -- --grep C10` — before fix: 4 failed; after fix: 4 passed.
- `npm run typecheck` — passed for extension, Classic and Canvas.
- `npx vitest run test/unit/queryStore.preservedSections.test.ts test/unit/queryStore.corpusParity.test.ts test/unit/queryStore.modelCoverage.test.ts test/unit/queryStore.having.test.ts test/unit/queryStore.loadBatch.test.ts` — 55 passed.
- `node /tmp/c10-compare.cjs` — temporary HEAD/worktree probe, results in the table above.
- `npx vitest run test/unit` — 3536 passed across 150 files.
- `npm run test:e2e` — 98 passed.
- `npm run test:integration` — 38 passed.
- `npm run docs:check` — passed.
- `git diff --check` — passed.

## Boundary

Older snapshots that already lost these values cannot reconstruct them. The fix
preserves values present in newly loaded models; it does not add editors for these
sections or establish broader structural equivalence. C11, other malformed opaque
slots, comment preservation, lexical scanner migration and release 0.1.93 remain
separate steps. No publication or push is part of this step.
