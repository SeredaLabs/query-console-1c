<!--
source_version: 2
translation_status: canonical
-->

# 🔍 Hover, autocomplete, and diagnostics

[English](../en/hover-and-completion.md) · [Українська](../uk/hover-and-completion.md) · [Русский](../ru/hover-and-completion.md)

These work directly on a query string inside a `.bsl` file — no need to open
Query Designer first. They read the same metadata export as the designer
(`queryConsole.metadataPath`).

## 🖱️ Hover

- A table alias shows the source metadata table.
- Aliases are resolved at the cursor's own scope. Reusing the same alias in
  another batch statement, UNION branch, or nested subquery does not make the
  first occurrence win.
- A field on a reference type shows the table it points to (its type is not
  yet shown in hover; autocomplete already shows it).
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

Hover and autocomplete for fields need metadata to be available, either through
the configured `queryConsole.metadataPath` or workspace auto-discovery, the same
as Query Designer. Without metadata — or whenever these resolvers cannot
confidently identify something — they show nothing rather than a guess; see
[⚠️ limitations](limitations.md).

Temporary-table names are position-aware in the package, but their inferred
column schema is not yet connected to hover or field completion. Therefore an
alias whose source is a temporary table currently has no field hover/list.
