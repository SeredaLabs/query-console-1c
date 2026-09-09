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

## Classification gate

Every corpus entry is classified as `SUPPORTED`, `RECOVERED`, `UNSUPPORTED`, or
`INVALID` (`test/fixtures/corpus/corpus-classes.json`, rebuilt by
`npm run corpus:classify`). The regression test
(`test/unit/corpusClassification.test.ts`) enforces a no-silent-downgrade rule:
no committed entry may drop from a better class to a worse one
(`SUPPORTED` → `RECOVERED`/`UNSUPPORTED`/`INVALID`, etc.) without that being an
explicit, reviewed, reported change — never a side effect nobody noticed.

## Changing expected output

Classify every change before updating a baseline. Report the number of affected
queries, categories, representative before/after SDBL, and why the new output is
correct. Preserve original input and never use snapshot refresh as a repair for
an unexplained regression.

Some oracle workflows require a private 1C environment, XML export, or locally
built parser artifact and therefore are not CI requirements. Keep proprietary
queries out of the repository and reduce defects to safe fixtures.
