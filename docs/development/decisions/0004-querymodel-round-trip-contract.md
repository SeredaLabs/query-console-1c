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

`generateBatch(parseBatch(text)) === text` (for text the platform itself
accepts) is the contract, and it is enforced by a golden-oracle regression
corpus, not by hand-written unit examples alone: a committed corpus of real
query texts with the *real 1C platform's own* accepted output
(`test/fixtures/corpus/golden.jsonl`), currently gated at exactly 1976/1976
matching queries in the fast, committed suite
(`test/unit/corpusRegression.test.ts`), with a larger 17933-query corpus run
available via `npm run accept:oracle` for changes that need broader
confidence than the committed subset. Any reader/writer of `QueryModel` that
matters for user-visible correctness (semantic validation, hover, completion,
the read-only analysis service backing the "Structure"/"Parameters" panels
and status bar) MUST go through the same `tryOpenBatch`/`parseBatch` entry
point as the real Apply path — never a second, parallel parse — so that
what's shown to the user can never diverge from what Apply will actually do
(`queryAnalysisService.ts`'s `analyze()` docstring states this explicitly and
is the enforcement point).

## Consequences

- A syntax or generation change is not "done" until it passes a full corpus
  run, not just the specific case that motivated it — narrow gates against a
  stale or hand-picked golden subset have previously masked regressions.
- Any new "read the query for informational purposes" feature (a future
  hover/analysis/lint-style feature, for example) must reuse
  `tryOpenBatch`/`parseBatch`, not implement its own parse, or it risks
  showing something Apply would not actually produce.
- Full test-direction requirements (text→model, model→text, round-trip,
  comments/batches, WebView behavior) are enumerated in
  [`query-model.md`](../query-model.md); this record is about the contract's
  existence and enforcement mechanism, not the day-to-day test checklist.
