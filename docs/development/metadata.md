# Metadata pipeline

## Source discovery

`resolveCfPath.ts` resolves an explicit `queryConsole.metadataPath`, known
`src/cf` layouts, or a bounded workspace search for `Configuration.xml`. Discovery
is intentionally bounded; users can always configure an explicit path.

## Import and cache

`parseConfiguration.ts` imports supported XML object kinds and common attributes
into derived YAML files. `modelCache.ts` builds and loads the JSON snapshot used
on the normal startup path; `yamlLoader.ts` is the compatibility fallback.

The importer builds in staging and switches only after successful generation.
An ownership marker prevents deletion of arbitrary directories. Preserve those
properties when changing the pipeline.

## Extension flow

`panel.ts` loads metadata without blocking panel creation, reports controlled
failures, and sends the model to the WebView. Cache freshness is not compared
against XML timestamps, so refresh remains explicit.

Performance fixtures and commands are described in [performance](performance.md).
