# Flat-store parity guard — step 1, 2026-09-29

Baseline: `527e314` (C9 HAVING preservation). This step adds tests and records
C10; production code and persisted contracts are unchanged.

Historical step 1 report. [Step 2](c10-preserved-sections-2026-09-29.md) fixes C10
and removes the temporary expected-failure annotations described below.

## Tests and known failures

`test/unit/queryStore.corpusParity.test.ts` compares direct core generation with
`LOAD_BATCH → assembleBatch → generateBatch` for all 1976 valid corpus queries,
both without metadata and with the committed YAML resolver. It compares exact
strings, without whitespace normalization or golden updates.

On the unchanged implementation, the exact parity assertions fail for 13 inputs
without metadata and 18 with metadata. A separate ordinary assertion verifies
that each difference is explained solely by dropping top-level `trailingFields`:
fields following a tabular-section projection exist in direct output and disappear
after the store roundtrip. No other output changes are allowed by this classifier.
The measured counts are pinned so a partial fix also requires reviewing the guard.

`test/unit/queryStore.modelCoverage.test.ts` reads the TypeScript interface and
both conversion functions using the TypeScript compiler API. Each interface
property must be read by the encoder and reconstructed from its corresponding
flat property by the decoder. `tables`/`fields` use their existing renamed flat
properties; `lockForUpdateBare` uses the documented derived `lockEnabled` mapping.
The only missing properties are `characteristics` and `trailingFields` (C10).
Future unmapped properties fail the ordinary assertion.

The first run, before annotations, produced **3 failures and 5 passes**: the two
corpus equality assertions and the property-coverage assertion. Only these three
assertions now use `it.fails`, explicitly naming C10. Setup/parsing and the
unexplained-difference guards remain outside expected-failure assertions, so an
exception or unrelated loss cannot satisfy the quarantine. No test is skipped.
An unexpected pass fails the suite and requires removing the annotation.

Step 2 must remove all three `.fails` annotations and the temporary C10
classifier/count and missing-property assertions. The exact parity and complete
mapping assertions remain permanent. Do not refresh golden data to fix these tests.

## Verification

- Baseline: `npx vitest run test/unit/queryStore.having.test.ts test/unit/queryStore.loadBatch.test.ts test/unit/corpusRegression.test.ts` — 35 passed.
- Red/annotated runs: `npx vitest run test/unit/queryStore.corpusParity.test.ts test/unit/queryStore.modelCoverage.test.ts` — initially 3 failed / 5 passed; annotated 8 passed, including 3 expected failures.
- `npm run typecheck` — passed (extension, Classic, Canvas).
- `npx vitest run test/unit` — 3522 passed across 149 files, including the 3 explicit C10 expected failures.
- `npm run test:e2e` — 94 passed.
- `npm run test:integration` — 38 passed.
- `npm run docs:check` — passed.

A separate managed Git worktree at `527e314` supplied the HEAD implementation.
A one-off Node/esbuild probe bundled its parser/generator and those of the working
tree independently, wrote both sets of generated strings to JSON dumps, and
compared every string in both metadata modes: **1976/1976 identical in each mode,
0 changes**. This compares core output with HEAD; the separate store/core test
intentionally exposes the existing C10 loss. No snapshot, fixture, golden,
classification or corpus baseline was modified.

## Limits and next boundary

This is a guard, not the C10 repair. The known data-loss risk remains open until
step 2. Characteristics has no corpus coverage; its synthetic preservation tests
belong to step 2. Static mapping presence does not prove transformation semantics
or all snapshot paths; behavioral and browser regressions are still required for
the fix. No new platform-validity claim is made. Parser, lexical policy, Apply,
C8, English support, structural equivalence and release work are outside this step.
