---
source_version: 2
translation_status: canonical
---

# ✏️ Editing existing queries

[English](../en/editing-existing-queries.md) · [Українська](../uk/editing-existing-queries.md) · [Русский](../ru/editing-existing-queries.md)

## 🔎 Query detection

The extension searches around the cursor for a static BSL string whose SDBL text,
after whitespace and comments, begins with `ВЫБРАТЬ` or `УНИЧТОЖИТЬ`. It does not
evaluate concatenation, variables, functions, or other dynamic BSL expressions.

If no supported string is found, the extension asks whether to create a new
query at the cursor.

## 🔁 Round-trip behavior

Opening converts SDBL text to `QueryModel`; applying converts the model back to
SDBL and replaces the detected string. Line comments in supported locations are
preserved, but formatting can be normalized. Review the diff before saving a
complex handwritten query.

## 🛡️ Safe workflow

1. Commit or otherwise preserve the source file.
2. Open the query and inspect every designer tab.
3. Review generated query text.
4. Apply and inspect the editor diff.
5. Validate the query in the target 1C environment.

See [⚠️ limitations](limitations.md) for constructs that are only partially
validated or must not be round-tripped.
