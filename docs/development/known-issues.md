# Known issues and product boundaries

Current user/developer-visible limitations. The [ledger](technical-debt.md) owns
engineering status; [safety contracts](contracts/safety-and-preservation.md) own
invariants/exclusions. [User limitations](../en/limitations.md) are mirrored in
Ukrainian/Russian. Historical platform observations are indexed in [audits](audits/README.md).

## Query editing and IDE assistance

- Detection recognizes static BSL strings beginning with `ВЫБРАТЬ`/`УНИЧТОЖИТЬ`.
  English SDBL is unsupported despite recorded platform acceptance (C2). Dynamic
  string composition cannot be evaluated; the extension does not execute queries.
- Parsing/Apply checks supported structure and selected metadata semantics, not
  full grammar, arbitrary-expression validity or input/output equivalence. Unknown
  schema/reference types stay fail-open. Editor diagnostics check syntax/structural
  expressions, not metadata fields; concatenated fragments may receive warnings.
- Raw-expression comments unsupported by the renderer trigger a **warning and
  confirmation** before designer opening/manual-text Apply replaces the model
  (C17). Cancel preserves prior model/text; proceeding permits comment loss on
  Save/OK. Original BSL text stays unchanged until Save. Bound/supported argument
  comments are preserved; explicit consent to loss is not raw-slice support.
- Negated condition-subquery input with keyword alias `В` can be misparsed and
  Apply-blocked (C18); an unambiguous alias has positive regression coverage.
- Aliases in condition subqueries kept as opaque custom text (for example an ИЛИ
  chain) are unindexed. Structured condition subqueries and ordinary source/batch
  scopes have position-aware assistance. Advisory recovery does not authorize Apply.
- Without metadata for an inner sole source, bare condition fields retain the
  existing inner-source binding even when intended as outer correlation. With
  known metadata they use the verified nearest enclosing owner. The validator
  skips subquery-condition field checks to avoid false negatives.
- Temp producers with tabular/trailing projections can expose different column
  sets in star expansion/designer versus semantic schema (A2). A complete inferred
  scalar temp schema supports position-aware field validation/assistance; inferred
  columns do not provide reference types for deeper navigation.

## Canvas Preview

The [functional capability matrix](../design/new-builder/feature-baseline.md)
records editing and intentional preserve-only families. Canvas uses shared
parser/model/state/generation/Apply checks. Its generated SDBL dock is read-only;
Classic retains manual query-text editors. Contextual advanced editors and
metadata refresh/lazy reference expansion parity are separate UX work. Preview
removal still needs UX/accessibility/release review; V4 is a bounded regression
gate, not exhaustive coverage or platform equivalence.

## Virtual-table and metadata boundaries

`Последовательность.*.Границы` has an unconfirmed generic two-slot fallback;
marked extra arguments block Apply (U2). Calculation-register `ДанныеГрафика`/
`ФактическийПериодДействия` have the book-confirmed one-condition layout, and
`База<Имя>` has four slots. Accounting Субконто argument preservation is supported;
old blanket unsafe claims are obsolete. Unique signature/book evidence is in the
[archived investigation](audits/archive/canvas/scratch_phase2x2_virtual_table_design.md).

VT assistance resolves condition fields/reference paths and suggests closed
periodicity/fill-method enums. Two completion families are deliberately outside
the current metadata-only product scope:

- Accounting Субконто-family values are actual ПВХ/database items, not XML schema;
  there is no metadata-only path to enumerate ordinary user-entered values.
- Calculation База dimension/cut strings need register→base-register linkage and
  suffix resolution absent from the importer/signature catalog. This would need
  separately scoped metadata extraction; no partial guessed completion is planned.

Revisit these boundaries only with the required new capability. They are not
forgotten implementation increments. Discovery is bounded; configure an explicit
XML metadata path when necessary. A successfully empty direct/YAML scan is shown
as empty for that call; it does not overwrite saved last-known-good metadata.
Fallback to the saved nonempty model occurs only after normal loading fails.
[Metadata contract](metadata.md) owns cache/import safety.

## Verification limits

[Testing/release](testing-and-release.md) and [corpus policy](corpus-testing.md)
distinguish repository regression checks, recorded platform canonical output and
optional live/independent grammar workflows. Missing grammar WASM means the
independent oracle skipped even when tests are green. U1–U3 remain evidence gaps,
not platform-invalid verdicts. Historical scope/provenance claims and complete
former narratives are retained in the [checkpoint](audits/archive/known-issues-e3b36a5.md).
