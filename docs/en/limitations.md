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

## 🗂️ Metadata boundaries

The cache is checked against the XML export's modification time and rebuilt
automatically when it is stale — manual rebuild is only needed to force it
sooner, or when a sync tool preserved the file's timestamp across an export.
Workspace discovery has a bounded depth, and unsupported metadata kinds do not
appear in the tree.
