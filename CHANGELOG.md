# Changelog

All notable changes are recorded here. The project uses
[Semantic Versioning](https://semver.org/).

## Unreleased

## 0.1.26 - 2026-09-05

### Changed

- Redesigned the localized README headers with a responsive project banner,
  compact Marketplace badges, and clearer language navigation.
- Replaced the static constructor screenshot with an optimized animated demo
  based on SFK metadata.
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
