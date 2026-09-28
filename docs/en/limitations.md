<!--
source_version: 9
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
The Query Text parameter list and generated parameter boilerplate may include
`&name` from strings/comments; parameter hover/completion use lexer tokens.
Parameter suggestions can also fail while the name after `&` is still empty.
Apply validates supported structure and selected metadata semantics, but does
not prove that the generated query means the same as the original.

The New Builder (Canvas) is an experimental preview, available only when
`queryConsole.enableNewBuilderPreview` is enabled. It reads, checks and writes
queries through the same parser, generator and Apply checks as the Classic
designer, so their fixes apply to both. Browser tests cover representative
round-trips, field/condition/sort edits and Save guards; a real VS Code test
covers load, alias edit, Save and source insertion. These checks are not
exhaustive coverage of its editing actions.

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
