<!--
source_version: 2
translation_status: canonical
-->

# 🧩 Using the query designer

[English](../en/query-designer.md) · [Українська](../uk/query-designer.md) · [Русский](../ru/query-designer.md)

## 🏗️ Build the query

Use **Tables and fields** to select sources and output fields. The metadata tree
supports multi-word search. Selected tables expose their fields, aliases, and
virtual-table parameters.

Use the remaining tabs for joins, conditions, grouping, ordering, totals,
unions, indexes, and additional query options. **Batch** manages multiple
statements, temporary tables, and their order. **Builder** helps assemble
expressions from fields, operators, functions, and parameters.

## 🔍 Review generated text

Open **Query text** to inspect generated SDBL. The default editor provides syntax
highlighting and formatting. When `queryConsole.queryTextEditorV2` is enabled,
the experimental editor also provides search, validation markers, query
structure, and parameter panels.

Applying a manual text edit parses it back into the visual `QueryModel`. If the
text is outside the supported grammar, the designer reports an error and keeps
the prior model.

## ✅ Finish

Select **OK** to send the generated source to the active editor. Select **Cancel**
to discard designer changes. A metadata-cache refresh changes the available
metadata but does not edit the current BSL file.
