<!--
source_version: 3
translation_status: canonical
-->

<h1>
  <a href="../ru/troubleshooting.md" title="Русский">
    <picture>
      <source media="(max-width: 1000px)" srcset="../../assets/images/lang/ru-icon.svg">
      <img align="right" src="../../assets/images/lang/ru-button.svg" alt="Русский" height="32">
    </picture>
  </a>
  <a href="../uk/troubleshooting.md" title="Українська">
    <picture>
      <source media="(max-width: 1000px)" srcset="../../assets/images/lang/uk-icon.svg">
      <img align="right" src="../../assets/images/lang/uk-button.svg" alt="Українська" height="32">
    </picture>
  </a>
  <a href="../en/troubleshooting.md" title="English">
    <picture>
      <source media="(max-width: 1000px)" srcset="../../assets/images/lang/en-icon-active.svg">
      <img align="right" src="../../assets/images/lang/en-button-active.svg" alt="English" height="32">
    </picture>
  </a>
  🧯 Troubleshooting
</h1>

## ❓ The command is missing

The editor context submenu appears only for `.bsl` resources. Use the Command
Palette to find **1C: Rebuild metadata index**. Confirm the extension is enabled for the
current workspace and that VS Code is 1.90 or later.

## 🔍 The query is not detected

Put the cursor inside the BSL string. The string must be static and its SDBL must
begin with `ВЫБРАТЬ`, `УНИЧТОЖИТЬ`, `SELECT` or `DROP` after comments and
whitespace; a `SELECT` string with native SQL code (`--`, `/* */`, `@name`,
`[name]`) is skipped. Dynamic
concatenation is not supported; create a new query or simplify a copy.

## 🗂️ Tables or fields are missing

Check `queryConsole.metadataPath`, confirm `Configuration.xml` exists in the XML
export, then run **1C: Rebuild metadata index**. Inspect the reported output path. A stale
cache is normally rebuilt automatically on the next open; run the command to force it sooner.

## ❌ Applying text fails

The manual edit could not be represented by the current query model. Keep the
text in the editor, reduce it to a supported construct, or cancel to preserve the
previous model. Consult [⚠️ limitations](limitations.md) before retrying.

## 💬 Report a reproducible problem

Include VS Code and extension versions, OS, relevant settings, the smallest safe
query, and exact steps. Do not publish a proprietary configuration export.
