<!--
source_version: 5
translation_status: canonical
-->

<h1>
  <a href="../ru/editing-existing-queries.md" title="Русский">
    <picture>
      <source media="(max-width: 1000px)" srcset="../../assets/images/lang/ru-icon.svg">
      <img align="right" src="../../assets/images/lang/ru-button.svg" alt="Русский" height="32">
    </picture>
  </a>
  <a href="../uk/editing-existing-queries.md" title="Українська">
    <picture>
      <source media="(max-width: 1000px)" srcset="../../assets/images/lang/uk-icon.svg">
      <img align="right" src="../../assets/images/lang/uk-button.svg" alt="Українська" height="32">
    </picture>
  </a>
  <a href="../en/editing-existing-queries.md" title="English">
    <picture>
      <source media="(max-width: 1000px)" srcset="../../assets/images/lang/en-icon-active.svg">
      <img align="right" src="../../assets/images/lang/en-button-active.svg" alt="English" height="32">
    </picture>
  </a>
  ✏️ Editing existing queries
</h1>

## 🔎 Query detection

The extension searches around the cursor for a static BSL string whose SDBL text,
after whitespace and comments, begins with `ВЫБРАТЬ` or `УНИЧТОЖИТЬ`, or with the
English `SELECT` or `DROP`. A `SELECT` string with native SQL code (`--` or `/* */`
comments, `@name` variables, `[name]` quoting) is not treated as a 1C query. It
does not evaluate concatenation, variables, functions, or other dynamic BSL
expressions. Apply writes an English query in Russian, as the 1C Designer does.

If no supported string is found, the extension asks whether to create a new
query at the cursor.

## 🔁 Round-trip behavior

Opening converts SDBL text to `QueryModel`; applying converts the model back to
SDBL and replaces the detected string. Line comments are preserved; a comment
inside an expression can move to its section header (or after `ИЗ`), and
formatting can be normalized. Review the diff before saving a complex
handwritten query.

As a safety net, both designers compare comments before replacing their model:
should a defect ever drop one, they warn and ask for confirmation. Cancel keeps
the previous model; Classic manual-text Apply uses the same check. Original BSL
editor text changes only on Save/OK. See [limitations](limitations.md) for comment
placement and the known negated condition-subquery alias case.

## 🛡️ Safe workflow

1. Commit or otherwise preserve the source file.
2. Open the query and inspect every designer tab.
3. Review generated query text.
4. Apply and inspect the editor diff.
5. Validate the query in the target 1C environment.

See [⚠️ limitations](limitations.md) for constructs that are only partially
validated or must not be round-tripped.
