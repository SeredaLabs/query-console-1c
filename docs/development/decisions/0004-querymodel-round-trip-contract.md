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

### Boolean operand scope exception (2026-10-24)

The scope of a negation takes precedence over canonical text in one case: the
Designer keeps the parentheses of a negated field followed by `В`, although the
platform's canonical text drops them.

```text
Input and Designer output:  ГДЕ (НЕ Т.ПометкаУдаления) В (&П)
Platform canonical text:    ГДЕ НЕ Т.ПометкаУдаления В (&П)
```

[Executed platform evidence](../../../test/fixtures/platform/c54-negated-operand.json)
(constant derived tables, 2026-10-24): for a false `Ф`,
`ГДЕ (НЕ Т.Ф) В (ИСТИНА, ЛОЖЬ)` returns 1 row and the canonical
`ГДЕ НЕ Т.Ф В (ИСТИНА, ЛОЖЬ)` returns 0 rows. The canonical text is accepted, but it
negates the membership instead of the field. The same probes show that the platform
keeps these parentheses before `=`, `>` and `ЕСТЬ NULL` (where dropping them would also
change `ЕСТЬ NULL`: 1 row and 0 rows for a NULL `Ф`), so no exception is needed
there and the Designer prints the platform's text. Limitation of this evidence: the
backend does not report the platform build, so the probes are not tied to a version;
repeat them on a known build before widening or relying on the exception elsewhere.

As for literals, constructor acceptance and canonical text are not proof of semantic
equivalence; writing a query with another result is worse than a difference from the
canonical text.

Bounds:

- Only `(НЕ <поле>)` — a negated field path in its own parentheses — directly before
  `В` (a parameter, a value list or a subquery). All other parenthesis removal and
  formatting keep the canonical contract.
- Not a general licence: another case where the canonical text changes the meaning
  needs its own executed evidence and an amendment of this record.
- No golden or grammar-parity text has this form today. If one appears, its
  difference is enumerated and reviewed, the oracle record is never rewritten, and a
  grammar-parity construct needs an ACCEPTED ledger item listed in
  `ACCEPTED_DIVERGENCES`.

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
