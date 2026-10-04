# Corpus testing

The committed corpus exercises repository parse/generate behavior through unit
tests. [ADR 0004](decisions/0004-querymodel-round-trip-contract.md) requires output
to match recorded platform-canonical `query_text` for supported attested cases,
with its explicit literal-value preservation exception;
this is distinct from an input-text fixed point or semantic-equivalence proof.

## Evidence roles and limits

| Evidence | What it checks | What it does not prove |
|---|---|---|
| `test/fixtures/corpus/golden.jsonl`, corpusRegression tests | Committed inputs match recorded accepted canonical output | Fresh live execution, per-entry build/metadata provenance, negative/English coverage or template substitution |
| Curated oracle/meta1c fixtures | Selected expected shapes/layouts with case-specific provenance | Universal platform validity without attestation |
| Generator-derived `.sdbl` fixtures | Repository canonical stability | Independent oracle acceptance |
| queryStore.corpusParity tests | Core/store output agree in both metadata modes, including unrelated edit/reopen | Every core output is a fixed point or semantically equivalent to input |
| Classification/shadow baselines | Reviewable support/resolver changes | A disagreement count alone is a correctness measure |

Golden acceptance selection is positive-only and contains template markers;
build/metadata/substitution attestation is incomplete. Negative unit tests are
useful regressions, not an attested negative platform corpus. V1–V3 and U1 in the
[ledger](technical-debt.md) own these remaining evidence gaps. Historical measured
sizes/verdicts remain in [Stage 0](audits/stage-0.md) and later audit reports.

## Gates and optional tooling

`npm run test:unit` runs committed corpus regression/classification/store/shadow
gates. `npm run corpus:test` processes configured corpus directories;
`npm run corpus:verify` needs its local visual-tooling prerequisites.
The larger historical private corpus is not shipped or guaranteed available.
`npm run accept:oracle` requires that corpus, metadata/cache and the configured
validator environment; it is not the ordinary CI gate.

`npm run probe:error -- <name.txt.json> | --all` reproduces configured error files
and prints diffs. `npm run oracle:reprobe -- <name.txt.json> | --all` requests live
`validate_query` using the configured MCP endpoint; credentials/environment and
metadata are prerequisites. `--patch-golden` intentionally changes expected
output and must follow the review policy below, never serve as automatic repair.
Do not put private queries or credentials in this repository.

The optional tree-sitter oracle (V2, dev tooling) needs
`test/fixtures/tree-sitter-sdbl.wasm`. When it is absent the helper warns and
performs no check; tests whose only assertion is the oracle report *skipped*,
while other tests still run their own assertions. CI does not build it. The
historical ABI concern was source-inferred, not a rebuilt compatibility test.
External grammar acceptance is not 1C validity or semantic-equivalence
evidence: 1C Platform / Query Designer is authoritative for platform acceptance
and canonicalization, and an external-grammar disagreement is a candidate for
platform reprobe, never a reason to change canonical output by itself.

## Classification and resolver shadow baseline

`corpus-classes.json` records SUPPORTED/RECOVERED/UNSUPPORTED/INVALID; the
classification tests forbid silent downgrade. `npm run corpus:classify` rebuilds
it only for an intentional reviewed change.

The position-aware alias resolver is compared with the frozen tooling-only flat
resolver on the committed corpus. `shadow-mode-baseline.json` records each
identity/classification disagreement plus corpus hash. Legitimate nested scope
changes can disagree; raw totals do not rank correctness. Inspect a failing diff
before using `npm run corpus:shadow-baseline -- --write`.

## Expected-output changes

Never refresh golden/snapshot/classification/shadow artifacts to hide an unexplained
regression. Preserve original inputs; report affected count/categories,
representative before/after text or classifications and the semantic reason.
Attest new canonical cases with platform/version/metadata/substitution context
where available. Missing attestation stays explicit; local parser agreement
cannot upgrade UNKNOWN platform behavior.
