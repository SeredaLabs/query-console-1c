# 0004 — `QueryModel` parse/edit/generate round-trip contract

Status: Accepted

## Context

The visual constructor edits a query by parsing its SDBL text into a model,
letting the user change the model, then regenerating text. If parsing and
generation can silently drift from what the real 1C platform accepts, users
would get query text that looks right in the editor but fails (or behaves
differently) when actually run. The project needed one authoritative
definition of "correct" for this round trip, and a way to keep the parser and
generator honest against it as both evolve.

## Decision

`generateBatch(parseBatch(input)) === query_text` is the contract, where
`query_text` is the *real 1C platform's own* accepted, canonical output for
`input` — not necessarily `input` itself (the platform's own normalization
means the two differ verbatim for roughly half the committed corpus). It is
enforced by a golden-oracle regression corpus, not by hand-written unit
examples alone: a committed corpus of real query texts paired with 1C's
canonical output (`test/fixtures/corpus/golden.jsonl`), currently gated at
exactly 1976/1976 matching queries in the fast, committed suite
(`test/unit/corpusRegression.test.ts`), with a larger 17933-query corpus run
available via `npm run accept:oracle` for changes that need broader
confidence than the committed subset. Surfaces that decide whether a model can
be applied, or present strict model-derived analysis, MUST reuse the production
parse and validation path rather than implement a parallel parser. Apply and
the read-only Query Text analysis service use `tryOpenBatch`. Advisory editor
features such as hover and completion share the `parseBatch`-backed semantic
snapshot, but may use its explicit recovery path so that useful assistance can
survive temporarily incomplete text. They must not introduce a separate grammar
or change the generated query contract.

## Consequences

- A syntax or generation change is not "done" until it passes a full corpus
  run, not just the specific case that motivated it — narrow gates against a
  stale or hand-picked golden subset have previously masked regressions.
- A new read-only feature must choose its contract deliberately: strict
  Apply-parity uses `tryOpenBatch`; advisory editor assistance may use
  `buildSemanticSnapshotFromText` and expose its incomplete/fail-open result.
  Both paths reuse the repository parser rather than introducing a second one.
- Full test-direction requirements (text→model, model→text, round-trip,
  comments/batches, WebView behavior) are enumerated in
  [`query-model.md`](../query-model.md); this record is about the contract's
  existence and enforcement mechanism, not the day-to-day test checklist.
