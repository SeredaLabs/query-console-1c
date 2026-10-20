# Quick code navigation

VS Code extension for editing 1C queries: Classic/Canvas WebViews share query
state, validation and generation; the extension owns metadata and editor writes.
This is a navigation aid, not a specification or a task backlog.

| Task | Load only this route | First Graphify seed |
|---|---|---|
| Parser, model, generation, temp tables, IDE semantics | [Query core](query-core.md) | `deriveProducerColumns` |
| Query Text v2, Designer load/state/Apply | [Designer](designer-query-text.md) | `QueryTextDialog` or `decideApply` |
| Commands, host messages, metadata, editor writes | [Extension](extension-metadata.md) | `createPanel` |

For known components, use exact `rg` searches and the source links above.
Only when exploring unfamiliar dependencies with Graphify, run
`python3 scripts/architecture-index.py status`, then explicit `update` if stale.
Retrieve a bounded neighborhood:

```sh
python3 scripts/architecture-index.py query deriveProducerColumns --context import --budget 700
```

Never load the whole `graphify-out/graph.json` into model context. Read the
returned source locations and relevant tests before making claims or edits.
Truncation and missing edges are not evidence of absent dependencies.

[Graphify workflow/limits](graphify.md) · [Measured evaluation](evaluation.md).
Current authority: [development guide](../index.md), especially its architecture,
contracts, grammar parity and debt links. Historical audits do not override code.
