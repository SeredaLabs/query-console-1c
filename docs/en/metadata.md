<!--
source_version: 4
translation_status: canonical
-->

# 🗂️ Metadata

[English](../en/metadata.md) · [Українська](../uk/metadata.md) · [Русский](../ru/metadata.md)

## ⚙️ Configure the source

`queryConsole.metadataPath` accepts the absolute `cf` directory from a file-based
1C XML export. When empty, the extension first checks each workspace's `src/cf`
and then searches for `Configuration.xml` to a maximum depth of six directories.

The primary importer reads the supported configuration-object kinds and common
attributes directly from XML and commits a consolidated JSON snapshot under
`queryConsole.parserOutputPath`; it does not create intermediate YAML. If that
path fails, the extension transparently rebuilds through the older YAML
pipeline. YAML is a compatibility fallback, not the normal loading path.

## 🔄 Build or refresh the cache

Run **1C: Rebuild metadata index** from the Command Palette, or select **Refresh cache**
inside the designer — both rebuild the same way. The index is checked against
the XML export's modification time and rebuilt automatically when it is stale;
manual refresh is needed only to force a rebuild sooner, or when neither the
Command Palette nor the designer noticed a change (for example, an export
replaced through a sync tool that preserves file timestamps).

The generated output is disposable and must not replace the original XML export.
The importer stages a new generation before switching to it and avoids deleting
an output directory it does not own.

If both the direct importer and YAML fallback fail, the extension can use the
last non-empty model saved in VS Code's extension storage. A scan that completes
successfully with zero tables is shown honestly for that call instead of being
silently replaced with older data; it does not overwrite the saved
last-known-good model, and the next load scans the source again.

## 🔍 Search behavior

Search matches multiple words against the normalized metadata names. It does not
provide fuzzy spelling correction and cannot discover metadata omitted from the
export or unsupported by the parser. Temporary tables from the current batch are
shown separately from configuration metadata.
