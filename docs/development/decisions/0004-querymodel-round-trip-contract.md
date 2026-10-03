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
means the two can differ verbatim). It is enforced by the committed recorded
canonical-output corpus (`test/fixtures/corpus/golden.jsonl` and
`test/unit/corpusRegression.test.ts`). Private/live corpora are optional workflows
with prerequisites, not committed CI gates. Provenance, negative/English coverage
and template-substitution limits are explicit in [corpus policy](../corpus-testing.md).
Surfaces that decide whether a model can
be applied, or present strict model-derived analysis, MUST reuse the production
parse and validation path rather than implement a parallel parser. The read-only
Query Text analysis service uses `tryOpenBatch`; the shared Apply gate revalidates
generated text, while designer loading adds a comment-loss confirmation (a regression safety net) through
`tryOpenDesignerBatch` ([safety contract](../contracts/safety-and-preservation.md)). Advisory editor
features such as hover and completion share the `parseBatch`-backed semantic
snapshot, but may use its explicit recovery path so that useful assistance can
survive temporarily incomplete text. They must not introduce a separate grammar
or change the generated query contract.

### Literal-value preservation exception (2026-10-02)

Literal contents take precedence over canonical whitespace. Generation must not
insert layout padding inside string literals, including their continuation lines
in SELECT and nested queries. Preserve existing literal whitespace; do not strip
tabs already authored by the user or present in recorded input.

[Executed platform evidence](../audits/c17-literal-runtime-2026-10-02.md) shows
that native constructor padding changes string values on 8.3.15.1489. Canonical
output equality therefore has this explicit exception; constructor acceptance
and canonical text are not proof of semantic equivalence. Structural formatting
outside literals retains the existing contract. Corpus differences must still
be enumerated and reviewed, never hidden by rewriting oracle records.

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
