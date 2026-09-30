<!--
source_version: 6
translation_status: canonical
-->

# ⚙️ Settings

[English](../en/settings.md) · [Українська](../uk/settings.md) · [Русский](../ru/settings.md)

## 📋 Available settings

| Setting | Default | Effect |
|---|---:|---|
| `queryConsole.metadataPath` | empty | XML export `cf` directory; empty enables workspace discovery |
| `queryConsole.parserOutputPath` | `tmp/parser_data` | Directory for derived metadata files and cache |
| `queryConsole.openInNewWindow` | `true` | Open the designer in a separate VS Code window and enable compact mode when supported |
| `queryConsole.queryTextEditorV2` | `false` | Enable the experimental Query Text v2 editor |
| `queryConsole.queryDiagnosticsEnabled` | `true` | Warn on a query-text literal Query Designer cannot parse or would not apply |
| `queryConsole.enableNewBuilderPreview` | `false` | Show Canvas Preview; functional baseline complete, UX/release review remains |

## 🗺️ Scope and paths

Settings use the active workspace configuration. `metadataPath` must be absolute;
a relative `parserOutputPath` is resolved from the first workspace root.

Changing a path does not automatically rebuild metadata. Run **1C: Rebuild
metadata index** after changing either metadata setting.
