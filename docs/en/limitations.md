<!--
source_version: 11
translation_status: canonical
-->

# ⚠️ Limitations

[English](../en/limitations.md) · [Українська](../uk/limitations.md) · [Русский](../ru/limitations.md)

## 🚫 The extension does not execute queries

Both commands generate BSL source. The result-handling variant generates code
that a 1C runtime can execute later; the extension itself has no database
connection, result grid, execution history, or query transport.

## 🧪 Detection and validation are bounded

Cursor detection supports static BSL strings beginning with `ВЫБРАТЬ` or
`УНИЧТОЖИТЬ`. The tolerant parser and validator are not a complete 1C compiler.
Successful parsing does not prove that every custom expression, field,
dot-navigation chain, or platform-specific construct is valid.

When the designer opens or applies a query, field names are checked against
the metadata in the select list, grouping, ordering, indexing, join
conditions, and the simple conditions of the top-level query. Fields of
package temporary tables are also checked after `ПОМЕСТИТЬ` when their inferred
output schema is complete. Unknown/ad-hoc temporary tables and producers with
an unresolved `*`, conditions inside subqueries, and custom expressions are
not checked. Editor diagnostics report syntax errors only; a missing field is
reported by the designer, not underlined in the editor.

English SDBL is currently unsupported. Completion does not resolve aliases of a
condition subquery written inside a custom expression (for example an `ИЛИ` chain).
Apply validates supported structure and selected metadata semantics, but does
not prove that the generated query means the same as the original.

Canvas is an opt-in Preview with a completed functional baseline. It shares
parser/model/state/generation/Apply checks with Classic. Dedicated editors are
absent for some advanced loaded representations (HAVING, grouping/report blocks,
tabular projections and advanced UNION mapping); these are preserve-only through
unrelated edits. Its SDBL dock is read-only. Metadata refresh and lazy reference
expansion remain Classic-only assisted workflows. The
[current matrix](../design/new-builder/feature-baseline.md) defines the surface;
browser/real-host gates are bounded and do not replace UX/accessibility/release review.

Unsupported raw-expression `//` comments trigger a warning and confirmation
before loading/replacing the model (C17). Cancel keeps the prior model/text;
continuing allows known comment loss on Save/OK. The original editor text stays
unchanged until Save. Consent is not preservation support. A negated condition
subquery using the platform-invalid source alias `В` opens but cannot be applied
(C5/RP11, formerly C18). The same subquery with a valid alias such as `Вал` works.
Confirmation does not bypass Apply checks. Supported comments remain preserved.

## ⛔ Round-trip exclusions

> Do not apply designer changes to `Последовательность.*.Границы` when it
> uses three or more positional parameters.

The real parameter layout for this virtual table isn't confirmed, so the
common fallback can't guarantee lossless reconstruction beyond its first two
positions.

`РегистрРасчета.*.ДанныеГрафика`/`ФактическийПериодДействия` (a single
`Условие` parameter) and `<main register>.База<base register name>` (four
parameters) are fully supported now — their real layout was confirmed and
implemented; only a genuinely extra parameter beyond that (which real 1C
queries never produce) is blocked.

Accounting-register `Субконто(...)` parameters are supported and regression
tested; older documentation that marked them unsafe is obsolete.

Temporary-table producers containing tabular-section projections can expose
different column sets in star expansion and semantic assistance. Without
metadata for the inner source, a bare field in a subquery condition may bind to
the inner source even when it belongs to an outer source. See [known issues](../development/known-issues.md) for the verified
boundaries and evidence still needed.

## 🗂️ Metadata boundaries

The cache is checked against the XML export's modification time and rebuilt
automatically when it is stale — manual rebuild is only needed to force it
sooner, or when a sync tool preserved the file's timestamp across an export.
Workspace discovery has a bounded depth, and unsupported metadata kinds do not
appear in the tree.
