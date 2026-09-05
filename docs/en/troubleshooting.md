---
source_version: 1
translation_status: canonical
---

# Troubleshooting

[English](../en/troubleshooting.md) · [Українська](../uk/troubleshooting.md) · [Русский](../ru/troubleshooting.md)

## The command is missing

The editor context submenu appears only for `.bsl` resources. Use the Command
Palette to find **1C: Parse metadata to YAML**. Confirm the extension is enabled for the
current workspace and that VS Code is 1.90 or later.

## The query is not detected

Put the cursor inside the BSL string. The string must be static and its SDBL must
begin with `ВЫБРАТЬ` or `УНИЧТОЖИТЬ` after comments and whitespace. Dynamic
concatenation is not supported; create a new query or simplify a copy.

## Tables or fields are missing

Check `queryConsole.metadataPath`, confirm `Configuration.xml` exists in the XML
export, then run **1C: Parse metadata to YAML**. Inspect the reported output path. A stale
cache is not refreshed automatically.

## Applying text fails

The manual edit could not be represented by the current query model. Keep the
text in the editor, reduce it to a supported construct, or cancel to preserve the
previous model. Consult [limitations](limitations.md) before retrying.

## Report a reproducible problem

Include VS Code and extension versions, OS, relevant settings, the smallest safe
query, and exact steps. Do not publish a proprietary configuration export.
