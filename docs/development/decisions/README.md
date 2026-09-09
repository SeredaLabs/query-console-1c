# Architecture decisions

Records here are for durable, long-lived architecture decisions only — not a
log of every implementation detail. A change to how something is implemented
does not need a new record; a change to whether a recorded decision still
holds should update that record's Status, not silently go stale.

- [0001 — Platform-independent `core`](0001-platform-independent-core.md)
- [0002 — Extension host / WebView message boundary](0002-extension-webview-boundary.md)
- [0003 — Metadata source of truth and fallback cascade](0003-metadata-source-of-truth.md)
- [0004 — `QueryModel` parse/edit/generate round-trip contract](0004-querymodel-round-trip-contract.md)
