<!--
source_version: 6
translation_status: canonical
-->

<h1>
  <a href="../ru/query-designer.md" title="Русский">
    <picture>
      <source media="(max-width: 1000px)" srcset="../../assets/images/lang/ru-icon.svg">
      <img align="right" src="../../assets/images/lang/ru-button.svg" alt="Русский" height="32">
    </picture>
  </a>
  <a href="../uk/query-designer.md" title="Українська">
    <picture>
      <source media="(max-width: 1000px)" srcset="../../assets/images/lang/uk-icon.svg">
      <img align="right" src="../../assets/images/lang/uk-button.svg" alt="Українська" height="32">
    </picture>
  </a>
  <a href="../en/query-designer.md" title="English">
    <picture>
      <source media="(max-width: 1000px)" srcset="../../assets/images/lang/en-icon-active.svg">
      <img align="right" src="../../assets/images/lang/en-button-active.svg" alt="English" height="32">
    </picture>
  </a>
  🧩 Using the query designer
</h1>

The tab-based instructions below describe Classic; Canvas Preview has its own workflow.

## 🏗️ Build the query

Use **Tables and fields** to select sources and output fields. The metadata tree
supports multi-word search. Selected tables expose their fields, aliases, and
virtual-table parameters.

A `*` stays as written. **Expand \*** in the field list replaces it with the
columns of the configuration metadata, after a confirmation: the columns come
from the configuration dump, so attributes of configuration extensions and later
changes are not included. The command is available for configuration tables
without tabular sections outside a UNION; its tooltip names the reason when not.

Use the remaining tabs for joins, conditions, grouping, ordering, totals,
unions, indexes, and additional query options. **Batch** manages multiple
statements, temporary tables, and their order. **Builder** helps assemble
expressions from fields, operators, functions, and parameters.

## 🔍 Review generated text

Open **Query text** to inspect generated SDBL. The editor provides syntax
highlighting, formatting, search, validation markers, and query structure and
parameter panels. Closing it with unapplied changes asks for confirmation;
**Cancel** never changes the designer.

Applying a manual text edit parses it back into the visual `QueryModel`. If the
text is outside the supported grammar, the designer reports an error and keeps
the prior model.

## ✅ Finish

Select **OK** to send the generated source to the active editor. Select **Cancel**
to discard designer changes. If you opened an existing query and changed nothing,
**OK** (and **Save** in Canvas) leaves the BSL string exactly as it was. A metadata-cache refresh changes the available
metadata but does not edit the current BSL file.

## 🧪 Canvas Preview

Enable `queryConsole.enableNewBuilderPreview` and run **1C: New Builder (Preview)**.
Use the six workspaces for structure, fields, conditions, grouping, sorting and
additional settings; package/UNION navigation shares the same model as Classic.
Enter a source subquery for recursive editing: **Back** validates and commits the
draft, **Cancel** leaves the parent unchanged. Common VT forms, external temp
descriptions, totals/indexes and contextual expression editing are available.

The generated SDBL dock supports highlighting/copy/resize/collapse and is read-only.
**Save** inserts accepted generated text; it does not execute a query. Advanced
loaded representations may be preserved without dedicated controls; see the
[current matrix](../design/new-builder/feature-baseline.md) and [limitations](limitations.md).
Functional baseline completion is separate from UX/accessibility and release
readiness, so Preview remains enabled only by choice.

## 🎬 Demo walkthrough

![Classic Query Designer with English UI and captions](../images/query-constructor-demo.gif)

[Watch the video (WebM)](../videos/query-constructor-demo.en.webm).
The recording uses the current Classic WebView and the small E2E metadata fixture,
It does not require a private configuration.

1. Search for `Валюты Наим`: words can match both a table and its field.
2. Drag `Наименование` into **Fields**. Its source table is added automatically.
3. Double-click the selected `Валюты` table to add all fields. Repeats are allowed:
   the repeated `Наименование` is generated with the alias `Наименование1`.
4. Use **+** in **Fields** to open the new **Custom expression** editor. Search
   for a field and double-click it to insert it and see its type. Select the text,
   search for `ЕСТЬNULL`, and insert its template with inline syntax help.
   Type `Валюты.`, choose a field from completion, and use **Tab** for the next
   argument. An unfinished expression shows a syntax error and disables formatting;
   diagnostics do not disable **OK** in this dialog. Correct the expression to
   `ЕСТЬNULL(Валюты.Наименование, "-")` and save it as an output field.
5. Open **Query** in the enhanced text editor. **Structure** shows output fields
   and sources next to the SDBL. Add `ГДЕ Валюты.Код = &Код` and descending order,
   then use **Format** and **Validate** on the toolbar.
6. Open **Parameters** to see `&Код` and its use count. Click the parameter to
   navigate to its line, then **Apply** the text changes.
   Inspect **Conditions** and **Order** to see the text changes in the visual model.
7. Try an unknown source table. Validation shows a diagnostic and an error marker;
   applying the edit keeps the previous model. Close the dialog, confirm **Close
   without saving**, and reopen **Query**: the previous valid model is preserved.
8. **OK** sends SDBL to the extension host for insertion into BSL; it does not run
   a database query. The browser recording does not show VS Code editor insertion.

The interface and captions follow the documentation language. Metadata identifiers
and SDBL keywords remain unchanged. Experimental Canvas is not enabled in this
recording. Query text v2 is explicitly enabled for every text-editing scene; the
custom expression editor is available without that setting.
