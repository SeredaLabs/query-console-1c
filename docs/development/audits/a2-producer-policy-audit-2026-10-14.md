# A2 producer-column policy audit — 2026-10-14

Audited base: `99546ad`. A2 remains **PARTIAL**. This audit changes no production
behavior and does not certify queries against a live platform. Findings below
record that base, not the behavior after the follow-up fix.

## Follow-up implementation — 2026-10-14

The two same-priority defects below are fixed in `deriveProducerColumns`:
registry/Designer include scalar trailing columns when no outer nested projection
exists, and Designer no longer exposes unnamed stars as columns. Original
wildcard text and nested-output recovery remain unchanged. The characterization
tests are now regression assertions for retained downstream columns and absence
of fake fields; seven assertions failed before the change. Added analysis and
constructor controls cover multiple expanded sources and UNION creators.
Production Designer Apply/reopen preservation controls remain in place.

Duplicate explicit-name behavior is still unresolved. No fixture supplies the
needed platform verdict. Live verification could not start: the earlier SL_kza
browser tab was absent and opening a new tab timed out. The user will check this
in a separate session. A2 is not CLOSED on that
basis; do not infer duplicate-alias validity or normalize user names speculatively.

## What is shared now

- Projection ordering and output names: `deriveProjectionFacts`, C30 `columnNames`.
- Producer column derivation: `deriveProducerColumns`, with three explicit policies.
- Create/append/drop transitions: `advanceTempTableRegistry`, used by both parser
  passes and the positional lifetime model used by Designer and semantics.
- Unknown definitions shadow older schemas without becoming empty known tables.

Shared implementation alone does not prove that all three column policies are
correct. The remaining differences need separate decisions.

## Policy findings

| Boundary | Current behavior / evidence | Disposition |
|---|---|---|
| Scalar fields after an expanded star | In **analysis/constructor** modes, `expandStarFields` puts scalar suffixes into `trailingFields`. The parser registry omits them, so a downstream `*` also omits them. The actual semantic snapshot reproduces this. | **A2 defect, same priority as the fake Designer column.** Affects IDE model and constructor parity; production Designer preserve-mode controls retain the suffix. |
| Unresolved qualified star | Registry/semantics omit `Н.*` from known columns; Designer's `fieldAlias` fallback exposes a field named `Н.*`. Reproduced with absent metadata and with preserve-mode metadata. | **A2 user-visible defect, at least the same priority as scalar-tail loss.** The production Designer table list offers this fake field. Unknown source shape is not proof of invalid input. Decide how Designer represents unknown shape without offering a fabricated column. |
| Nested outer projection | Registry/Designer use scalar head; semantics includes the nested element and scalar suffix. The recorded platform fixture rejects six nested-INTO variants. | Preserve invalid-input recovery for now. No need to invent a platform temp schema for rejected producers. This evidence does not cover scalar-only trailing fields. |
| Duplicate explicit names | Registry keeps duplicates; Designer/semantics generate unique names (`Код`, `код1`, `код11` in the test). | **A2 unresolved behavior.** Existing tests pin compatibility; they are not platform evidence for duplicate explicit aliases in INTO. Do not silently declare either result correct. |
| Empty aliases / aliased path star / repeated object identity | Hand-built model tests capture different fallback, exclusion and identity behavior. | Internal compatibility cases, not proof of valid textual producer schemas. Keep scoped apart from normal parsed producers. |
| Completeness and primitive types | Only semantics asserts completeness; parser literal `Строка` markers mean non-reference, not actual expression types. | Intentional adapter responsibilities. Do not merge these into inferred result types (A3). |

## Scalar-tail reproduction

Input, with a source resolver exposing one scalar attribute `Код`:

```sdbl
ВЫБРАТЬ Н.*, 1 КАК Маркер ПОМЕСТИТЬ ВТ
ИЗ Справочник.Источник КАК Н;
ВЫБРАТЬ * ИЗ ВТ КАК Б
```

In analysis and constructor modes the parsed producer model has `fields = [Код]`,
`trailingFields = [Маркер]`, and no `tabSectionFields`.

| Policy applied to the analysis/constructor producer model | Current columns |
|---|---|
| Parser registry policy | `Код` |
| Designer policy (not the production Designer parse path) | `Код` |
| Semantic policy | `Код, Маркер` |

The producer's model still contains `Маркер`; the loss is in registry schema
derivation. The next statement then expands to `Б.Код` without `Б.Маркер` in
analysis/constructor modes. The production semantic snapshot uses analysis mode,
so IDE consumers receive this incomplete downstream projection. This is a local
reproduction, not a newly recorded platform execution result.

The production Designer opens in preserve mode. Catalog stars remain verbatim;
C24 expansion over package temp tables or nested queries puts the scalar suffix
in `fields`, so both columns remain available. Tests exercise actual open → store
→ Apply → reopen for three cycles: the table list contains `Код, Маркер`, and
output contains both `Б.Код` and `Б.Маркер`. The policy-only table above must not
be read as evidence of column loss or query corruption through Designer Apply.

The separate unresolved-star defect does reach the production Designer: opening
the catalog example above exposes `Н.*` and `Маркер` in the temp-table field list,
including when catalog metadata is supplied.
The initial parity assertion failed on unchanged production code. The current
characterization should be replaced with an all-consumer parity assertion in the
fix, not treated as a permanent desired contract.

[Policy tests](../../../test/unit/producerColumns.a2.test.ts) reproduce both the
resolved scalar-tail case and the unresolved-star case in preserve/constructor
modes. [Production-path tests](../../../test/unit/producerColumnsScope.a2.test.ts)
cover downstream stars in analysis/constructor, the semantic snapshot, Designer
preservation controls, and the fake field in the real Designer table list.
[Platform evidence](../../../test/fixtures/platform/a2-nested-projection-temp.json)
contains six rejected and two accepted cases from SL_kza; its platform build is
unknown and it does not test this scalar-only suffix.

## Corpus coverage and limits

Read all 1,976 `golden.jsonl` inputs, parse in preserve/constructor mode with and
without `buildYamlResolver(test/fixtures/corpus/metadata/cf)`. For every createTemp
head, compare the ordered name arrays from all three `deriveProducerColumns`
policies. This compares schema names, not platform acceptance or result types.

| Mode | Metadata | Parsed inputs | Producers | Policy differences |
|---|---|---:|---:|---:|
| preserve | absent | 1,976 | 561 | 0 |
| preserve | fixture | 1,976 | 561 | 0 |
| constructor | absent | 1,976 | 561 | 0 |
| constructor | fixture | 1,976 | 561 | 0 |

All 7,904 parses succeeded; all 2,244 producer comparisons matched. The new
synthetic case demonstrates why this is insufficient to close A2: the corpus
does not expose the policy divergence. No golden or platform fixture was changed.

## Planned boundaries at audited base

Treat the fake Designer column and analysis/constructor scalar-tail loss as two
same-priority A2 defects. The fake field is directly offered by the UI; scalar-tail
loss affects the IDE model and constructor parity. Neither is justified by the
nested-INTO fixture or by zero corpus differences.

Use separate focused fixes. For scalar-tail loss, cover downstream `*` in
**analysis** and constructor modes, the actual semantic snapshot, multiple expanded
scalar sources and UNION creators. Designer Apply/reopen tests are preservation
controls, not sufficient regression tests for that loss. For the fake field,
verify the real Designer field list and preserve the original wildcard text.
Preserve nested-projection recovery while fixing these boundaries. Compare corpus
text and production Designer behavior before/after without blind baseline updates.

Then resolve duplicate-name policy explicitly. Keep the current A2 ledger as the
status source; this document is evidence, not a replacement roadmap. No new
monolithic specification or architecture is proposed.
