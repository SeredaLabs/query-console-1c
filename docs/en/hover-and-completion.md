<!--
source_version: 1
translation_status: canonical
-->

# 🔍 Hover, autocomplete, and diagnostics

[English](../en/hover-and-completion.md) · [Українська](../uk/hover-and-completion.md) · [Русский](../ru/hover-and-completion.md)

These work directly on a query string inside a `.bsl` file — no need to open
Query Designer first. They read the same metadata export as the designer
(`queryConsole.metadataPath`).

## 🖱️ Hover

- A table alias shows the source metadata table.
- A field shows its type, and for a reference field, the table it points to.
- A field on a virtual table (`Остатки`, `Обороты`, and similar) shows which
  base register resource it comes from.
- A `&Параметр` reference shows it as a query parameter.

## ⌨️ Autocomplete

- Typing `.` after a table alias suggests its fields.
- Typing `&` suggests parameter names already used elsewhere in the same query.
- Inside a virtual-table argument for `Периодичность`/`МетодДополнения`,
  suggests the valid keyword values.

## ⚠️ Diagnostics

A query-text literal that Query Designer cannot parse is flagged with a
warning directly in the editor, without opening the designer. Disable this
with `queryConsole.queryDiagnosticsEnabled` if it produces false positives for
queries built by string concatenation.

## 🗂️ When nothing shows

Hover and autocomplete for fields need `queryConsole.metadataPath` configured,
the same as Query Designer. Without it — or whenever these resolvers cannot
confidently identify something — they show nothing rather than a guess; see
[⚠️ limitations](limitations.md).
