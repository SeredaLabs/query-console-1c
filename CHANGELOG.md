# Changelog

All notable changes are recorded here. The project uses
[Semantic Versioning](https://semver.org/).

## Unreleased

## 0.1.32 - 2026-09-08

### Fixed

- A metadata rebuild that came back with zero tables (e.g. a temporarily
  empty or misconfigured export path) was still committed as the new
  current snapshot, even though 0.1.31 already stopped it from overwriting
  the last known good copy — so the next open would warm-cache that same
  empty result indefinitely instead of ever retrying. It's no longer
  committed at all in that case.
- If applying the generated query text to the document threw (rather than
  just returning `false`), it wasn't caught — 0.1.31 only handled the
  `false` case. Both now fall back to the clipboard the same way.
- If a metadata generation commit failed AND its own rollback also failed,
  the leftover copy of the previous generation could still be swept away by
  a later cleanup pass. It's now left alone until a real target exists again.

## 0.1.31 - 2026-09-08

### Fixed

- The extension only activated when one of its 3 commands was run first —
  opening a `.bsl` file and just hovering or typing (without ever using the
  command palette) got no hover or autocomplete at all. It now activates on
  its own.
- "Refresh Cache" in an already-open Query Designer only showed a toast — the
  DB tree, field validation, and hover/autocomplete kept using the model
  from before the refresh until the window was reloaded. It now updates
  immediately.
- If applying the generated query text to the document failed for reasons
  outside the already-handled "source file changed" case, the text was
  silently lost — not inserted, not copied to clipboard, no message. It now
  falls back to the clipboard with a clear message either way. Also fixed a
  related case where that same clipboard fallback dropped the `"…"` string
  wrapping around the query text.
- A metadata rebuild that failed partway through could leave the previous,
  working metadata generation missing on disk instead of restored.
- A metadata export path that isn't a real 1C configuration (e.g. temporarily
  empty or misconfigured) could silently overwrite the last known good
  metadata with an empty one, affecting every subsequent open until a real
  rebuild succeeded.

## 0.1.30 - 2026-09-08

### Added

- Typing `.` after a table alias inside a query-text literal in a `.bsl` file
  now triggers field-name autocomplete — including through reference fields
  (`Alias.RefField.` offers the referenced catalog/document's own fields).

## 0.1.29 - 2026-09-08

### Added

- Hovering over a field path (`Alias.Field.Field...`) inside a query-text
  literal in a `.bsl` file now shows what the alias resolves to, what a
  reference field points to, or that a field genuinely doesn't exist —
  directly in the editor, without opening the query designer.
- The query text editor now reports a field that genuinely does not exist on
  its source table or catalog (`Поле "..." не найдено в "..."`), catching a
  class of mistakes that previously only surfaced once the query actually ran
  in 1C.

### Changed

- Replaced Ctrl/Cmd+Click on a query-text literal with a hover tooltip: hover
  over the query text and click the "Open in Query Designer" link right in
  the tooltip. No more underline on the query text.

## 0.1.28 - 2026-09-07

### Added

- Ctrl/Cmd+Click on a query-text literal in a `.bsl` file now opens the query
  constructor directly at that location, without going through the command
  palette or context menu.

### Changed

- Removed pure-redirect legacy documentation pages that only pointed
  elsewhere, and repointed everything that referenced them at the real
  current location instead.

### Internal

- Consolidated three independent, hand-duplicated implementations of
  field-path resolution (used for field-name casing correction, the report
  builder's `.*` suffix decision, and redundant `СГРУППИРОВАТЬ ПО`
  dereference removal) into one shared module. No change in generated query
  output — verified against the full 1976-query regression corpus before and
  after.

## 0.1.27 - 2026-09-05

### Changed

- Visually consolidated the custom-expression ("Довільний вираз") dialog with
  the rest of the query constructor: shared panel/section-header styling,
  icon-and-hover field rows, and a code-editor surface matching the query text
  dialog.
- Increased and unified vertical row spacing across every field/table list in
  the constructor (previously an inconsistent 1-3px depending on tab), for
  better readability.
- Restyled the localized user-guide pages (English, Ukrainian, Russian) with
  the same visual language as the README, fixed a stale command reference in
  the Ukrainian and Russian troubleshooting pages, and moved the
  translation-tracking metadata into a hidden comment so it no longer renders
  as a visible table on GitHub.

## 0.1.26 - 2026-09-05

### Changed

- Redesigned the localized README headers with a responsive project banner,
  compact Marketplace badges, and clearer language navigation.
- Replaced the static constructor screenshot with an optimized animated demo
  based on SFK metadata.

## 0.1.25 - 2026-09-05

### Added

- Canonical English user and developer documentation with synchronized Ukrainian
  and Russian user guides.
- English, Ukrainian, and Russian localization for the extension manifest,
  extension-host messages, and WebView interface.
- Documentation structure, glossary, translation metadata, and automated link,
  parity, and freshness checks.

### Changed

- Consolidated superseded technical documents under `docs/history/pre-consolidation/`.
- Centralized the current product screenshot under `docs/images/`.
- Refreshed the Marketplace README pages with a structured, localized layout.
- Updated third-party attribution and removed the superseded Claude PR-01 workflow.

Earlier release notes were not reconstructed without authoritative historical
records. Git tags and GitHub Releases remain the source for earlier releases.
