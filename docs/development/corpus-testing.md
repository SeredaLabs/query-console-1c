# Corpus testing

The committed regression corpus exercises parse/generate behavior in unit tests.
Use `npm run corpus:test` for corpus processing and `npm run corpus:verify` for the
visual verification tooling when its local prerequisites are available.

The committed golden-oracle regression gate
(`test/unit/corpusRegression.test.ts`) currently covers 1976/1976 queries
byte-for-byte against the real platform's own output; a larger 17933-query
corpus run is available via `npm run accept:oracle` for changes needing
broader confidence than the committed subset. See
[0004](decisions/0004-querymodel-round-trip-contract.md) for why this
contract exists and what depends on it.

To triage individual failures from a corpus run (JSON files in the configured
errors directory, `tmp/corpus-errors` by default):
`npm run probe:error -- <name.txt.json> | --all` re-runs our designer on each
input and prints the first diff against the recorded validator text;
`npm run oracle:reprobe -- <name.txt.json> | --all` asks the live oracle
(`validate_query` over MCP, URL from `.mcp.json`) and reports whether ours,
the committed golden and the live output agree (`--patch-golden` refreshes a
stale golden entry where ours matches live). Both need the private corpus and
metadata cache, like `accept:oracle`.

## Classification gate

Every corpus entry is classified as `SUPPORTED`, `RECOVERED`, `UNSUPPORTED`, or
`INVALID` (`test/fixtures/corpus/corpus-classes.json`, rebuilt by
`npm run corpus:classify`). The regression test
(`test/unit/corpusClassification.test.ts`) enforces a no-silent-downgrade rule:
no committed entry may drop from a better class to a worse one
(`SUPPORTED` → `RECOVERED`/`UNSUPPORTED`/`INVALID`, etc.) without that being an
explicit, reviewed, reported change — never a side effect nobody noticed.

## Semantic resolver shadow baseline

The position-aware resolver (`resolveAliasAt`, the only alias resolver
hover/completion use) is compared with a frozen copy of the legacy flat alias
resolver (`tooling/corpus-verify/legacyFindAliasTable.ts`, harness in
`tooling/corpus-verify/shadowMode.ts`; neither ships) on the complete committed
corpus, so any change in `resolveAliasAt`'s results shows up as a reviewable
diff. Disagreements are expected in legitimate scope
cases, so a raw count is not a correctness metric. Instead,
`test/fixtures/corpus/shadow-mode-baseline.json` freezes the identity and
classification of every disagreement, together with a corpus hash and summary
totals.

`npm run test:unit` compares the live sweep with that reviewed baseline. For an
intentional semantic change, first inspect the failing diff, then regenerate it
explicitly with `npm run corpus:shadow-baseline -- --write`. Include the number,
categories, and representative semantic justification in the change review;
never refresh this artifact just to make a test pass.

## Changing expected output

Classify every change before updating a baseline. Report the number of affected
queries, categories, representative before/after SDBL, and why the new output is
correct. Preserve original input and never use snapshot refresh as a repair for
an unexplained regression.

Some oracle workflows require a private 1C environment, XML export, or locally
built parser artifact and therefore are not CI requirements. Keep proprietary
queries out of the repository and reduce defects to safe fixtures.

## Evidence boundaries at b6286c57

Current verification debt is V1–V3 in the [ledger](technical-debt.md); historical
measurements remain in [Stage 0](audits/stage-0.md). The committed suite was rerun:
1976 positive golden entries match recorded `query_text`; this is an independent
platform-recorded expected-output contract, not a fresh live-platform execution.
All 1976 entries are `valid: true`, none starts with English SELECT, and 85 inputs
contain `#`. The corpus's acceptance selection has positive-only bias. Invalid
unit examples now cover modifier order and empty-table columns, but do not form
an attested negative/English platform corpus. New regressions cover full-name
qualification, keyword parameters and Boolean grouping outside golden.jsonl.

Query `.sdbl` fixtures are described by their test as generator-produced canonical
text; they test stability, not independent validity. Curated oracle/meta1c fixture
provenance is incomplete. Golden records lack per-entry platform build, metadata
fingerprint and template-substitution attestation. The historical 17933-query
private run requires local/private prerequisites; it was not available or rerun
for this reconciliation. Do not report it as a committed CI gate.

The tree-sitter helper warns and returns when the grammar WASM is absent, so
Vitest's passed count includes calls that performed no independent grammar check.
CI does not build that artifact. Stage 0 recorded an ABI incompatibility with its
pinned upstream grammar; it has not been fixed or rebuilt here. A future explicit
gate needs compatible, reproducible provenance and an explicit unavailable policy.
Tree-sitter acceptance is never proof of 1C validity or semantic equivalence.
