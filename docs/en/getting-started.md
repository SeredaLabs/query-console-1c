<!--
source_version: 5
translation_status: canonical
-->

<h1>
  <a href="../ru/getting-started.md" title="Русский">
    <picture>
      <source media="(max-width: 1000px)" srcset="../../assets/images/lang/ru-icon.svg">
      <img align="right" src="../../assets/images/lang/ru-button.svg" alt="Русский" height="32">
    </picture>
  </a>
  <a href="../uk/getting-started.md" title="Українська">
    <picture>
      <source media="(max-width: 1000px)" srcset="../../assets/images/lang/uk-icon.svg">
      <img align="right" src="../../assets/images/lang/uk-button.svg" alt="Українська" height="32">
    </picture>
  </a>
  <a href="../en/getting-started.md" title="English">
    <picture>
      <source media="(max-width: 1000px)" srcset="../../assets/images/lang/en-icon-active.svg">
      <img align="right" src="../../assets/images/lang/en-button-active.svg" alt="English" height="32">
    </picture>
  </a>
  🚀 Getting started
</h1>

## ✅ Requirements

- VS Code 1.90 or later.
- A `.bsl` file.
- For configuration-specific tables and fields, a file-based XML export of the
  1C configuration.

## ⌨️ Commands

| Command | Purpose |
|---|---|
| **1C: Query text only** | Insert or edit a query string |
| **1C: With result-processing code** | Create a new query with a BSL result-processing wrapper |
| **1C: Rebuild metadata index** | Rebuild the derived metadata files and cache |
| **1C: New Builder (Preview)** | Open the experimental visual constructor; first enable `queryConsole.enableNewBuilderPreview` in Settings |

## 🛠️ Create a query

1. Open a `.bsl` file and place the cursor at the insertion point.
2. Open the editor context menu and select **1C: Query Constructor**.
3. Choose **Query text only** or **With result-processing code**.
4. Add tables and fields, configure the query, and select **OK**.

The first command inserts a BSL string containing the SDBL text. The second
inserts a generated BSL result-processing wrapper.

> ⚠️ **Important:** Neither command executes the query — both only generate
> BSL source.

## 📂 Open an existing query

Place the cursor inside a supported static BSL string and invoke either command.
The designer parses the query and replaces the same source range after **OK**.
Selecting **Cancel** leaves the editor unchanged.

## ➡️ Next steps

Configure [🗂️ metadata](metadata.md), learn the [🧩 designer](query-designer.md), and
review the [⚠️ round-trip limits](limitations.md) before editing complex handwritten
queries.
