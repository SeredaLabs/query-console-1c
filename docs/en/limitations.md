<!--
source_version: 3
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

## 🔀 Hover and autocomplete ignore query scope

Hovering over a field or triggering autocomplete resolves the table alias
across the *entire* query batch — every `ОБЪЕДИНЕНИЕ` branch and subquery at
once, not just the one under the cursor. If the same alias name is reused for
a different source in another branch or subquery, the shown field/table info
can be wrong. This is advisory only: it never affects the generated query
text or what Apply inserts.

## ⛔ Round-trip exclusions

> Do not apply designer changes to the following virtual tables when they use
> three or more positional parameters:

- `РегистрРасчета.*.ДанныеГрафика`
- `РегистрРасчета.*.ФактическийПериодДействия`
- `Последовательность.*.Границы`

The common fallback cannot guarantee lossless reconstruction for those forms.
Accounting-register `Субконто(...)` parameters are supported and regression
tested; older documentation that marked them unsafe is obsolete.

## 🗂️ Metadata boundaries

The cache is not automatically compared with the XML export. Workspace discovery
has a bounded depth, and unsupported metadata kinds do not appear in the tree.
Rebuild explicitly after exporting a configuration.
