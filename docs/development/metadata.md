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

## Extension flow

`panel.ts` loads metadata without blocking panel creation, reports controlled
failures, and sends the model to the WebView. Cache freshness on the primary
path IS compared against the XML export's mtime — a stale committed snapshot
triggers a rebuild rather than being served silently (`loadMetadataSafe.ts`).

If both the direct path and its YAML fallback fail, `panel.ts` no longer falls
back to a legacy parser limited to Catalogs/Documents. Instead it reads a
last-known-good snapshot from `context.globalStorageUri`
(`lastKnownGoodCache.ts`) — the last successfully built FULL model, written
best-effort after every successful load. `globalStorageUri` is a different
failure domain from the workspace-relative output directory the snapshot/YAML
paths write to: it stays writable even when that workspace directory does not
(read-only mount, permission-restricted workspace). An empty model with no
last-known-good is preferred over a silently incomplete one.

Performance fixtures and commands are described in [performance](performance.md).
