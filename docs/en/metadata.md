<!--
source_version: 3
translation_status: canonical
-->

# 🗂️ Metadata

[English](../en/metadata.md) · [Українська](../uk/metadata.md) · [Русский](../ru/metadata.md)

## ⚙️ Configure the source

`queryConsole.metadataPath` accepts the absolute `cf` directory from a file-based
1C XML export. When empty, the extension first checks each workspace's `src/cf`
and then searches for `Configuration.xml` to a maximum depth of six directories.

The parser recognizes the supported configuration-object kinds and common
attributes, then writes a derived YAML representation and a JSON cache under
`queryConsole.parserOutputPath`. The JSON snapshot is the normal loading path;
YAML is the compatibility fallback.

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

## 🔍 Search behavior

Search matches multiple words against the normalized metadata names. It does not
provide fuzzy spelling correction and cannot discover metadata omitted from the
export or unsupported by the parser. Temporary tables from the current batch are
shown separately from configuration metadata.
