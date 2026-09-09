# 0003 — Metadata source of truth and fallback cascade

Status: Accepted

## Context

The extension needs a `MetadataModel` (tables/fields/kinds) built from a real
1C configuration export to power the query constructor, hover, and
completion. Two things can legitimately fail independently: parsing the raw
export, and the workspace/output directory being writable. Earlier in the
project's history a committed YAML tree was the primary artifact consumers
depended on, with a direct-XML path as a secondary/legacy option — this has
since inverted, and the current cascade is not documented anywhere except in
code comments, which is what this record fixes.

## Decision

The metadata pipeline (`src/core/metadata/parser/loadMetadataSafe.ts`) tries,
in order:
1. **Direct XML → JSON snapshot** (`xmlScan.ts`'s per-kind handlers into
   `snapshotBuilder.ts`) — the primary path. A committed snapshot is reused
   only while still fresh relative to the XML export's own mtime
   (`newestRelevantMtime`); a stale snapshot triggers a rebuild rather than
   being served silently.
2. **YAML fallback** (`parseConfiguration.ts` + `yamlLoader.ts`/`modelCache.ts`)
   — used transparently if the direct path fails. YAML is a proven safety
   net, not the primary contract.
3. **Last-known-good** (`lastKnownGoodCache.ts`), read from
   `context.globalStorageUri` only if both of the above fail. This is a
   different failure domain from the workspace-relative output directory the
   snapshot/YAML paths write to — it stays writable even when the workspace
   directory does not (read-only mount, permission-restricted workspace). An
   empty model with no last-known-good is preferred over silently serving an
   incomplete one.

Both the JSON-snapshot and YAML generations build in a staging directory and
switch over only after successful completion (`generationStore.ts`), guarded
by an ownership marker that prevents deleting a directory this extension
didn't create.

## Consequences

- Full detail (including the staged-commit/ownership-marker mechanics) lives
  in [`metadata.md`](../metadata.md) — this record exists so the cascade's
  existence and tier order are a named, intentional decision rather than
  something a future change could silently reorder.
- Changing which tier is "primary" is an architectural decision, not a bug
  fix — it should update this record's Status (e.g. to "Superseded by
  000N") rather than only the code.
- Do not cite any pre-2026-09 historical planning document for the current
  precedence: the pipeline's tier order inverted after this project's
  documentation history was archived, and the older documents describe the
  opposite (YAML-primary) precedence. Code (`loadMetadataSafe.ts`,
  `lastKnownGoodCache.ts`) and [`metadata.md`](../metadata.md) are the only
  current sources of truth.
