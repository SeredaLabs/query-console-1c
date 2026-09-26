# Metadata pipeline

## Source discovery

`resolveCfPath.ts` resolves an explicit `queryConsole.metadataPath`, known
`src/cf` layouts, or a bounded workspace search for `Configuration.xml`. Discovery
is intentionally bounded; users can always configure an explicit path.

## Import and cache

The primary path is direct: `xmlScan.ts`'s per-kind handlers parse the XML
export straight into a `MetadataModel` (`snapshotBuilder.ts`), which is
committed as a JSON snapshot — no intermediate YAML. `loadMetadataSafe.ts`
tries this first, reusing an already-committed snapshot when it is still fresh
relative to the XML source's mtime (`newestRelevantMtime`), and transparently
falls back to the older YAML path (`parseConfiguration.ts` + `yamlLoader.ts` /
`modelCache.ts`) on any failure. YAML remains a proven safety net, not the
primary path.

Both the JSON-snapshot and YAML generations build in staging and switch only
after successful completion (`generationStore.ts`). An ownership marker
prevents deletion of arbitrary directories. Preserve those properties when
changing the pipeline.

Sibling cleanup requires an ownership marker; a `cf.building-*` or
`cf.previous-*` name alone is never sufficient. Staging is removed only when
its creating process is confirmed to have exited. Unknown process status,
symlinks, and unmarked staging left before finalization are preserved.
Previous generations are retained unless an owned current generation exists,
so cleanup cannot remove the only recovery copy after a failed rollback.

## Extension flow

`metadataLoader.ts` (used by both the Classic `panel.ts` and the Canvas
`canvasPanel.ts`) loads metadata without blocking panel creation, reports controlled
failures, and sends the model to the WebView. Cache freshness on the primary
path IS compared against the XML export's mtime — a stale committed snapshot
triggers a rebuild rather than being served silently (`loadMetadataSafe.ts`).

If both the direct path and its YAML fallback fail, `metadataLoader.ts` no longer falls
back to a legacy parser limited to Catalogs/Documents. Instead it reads a
last-known-good snapshot from `context.globalStorageUri`
(`lastKnownGoodCache.ts`) — the last successfully built non-empty FULL model,
written best-effort after trustworthy loads. `globalStorageUri` is a different
failure domain from the workspace-relative output directory the snapshot/YAML
paths write to: it stays writable even when that workspace directory does not
(read-only mount, permission-restricted workspace). An empty model with no
last-known-good is preferred over a silently incomplete one.

A completed scan that returns zero tables is not classified as a load failure:
the current caller receives that empty result (`unknown != invalid`) and the
next call scans normally. It is deliberately not allowed to overwrite the
last-known-good snapshot. Last-known-good substitution happens only after the
normal direct/YAML paths actually fail, so it cannot make an empty or
temporarily incomplete source look current forever.

Performance fixtures and commands are described in [performance](performance.md).
