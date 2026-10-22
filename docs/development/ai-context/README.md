# Quick code navigation

VS Code extension for editing 1C queries: Classic/Canvas WebViews share query
state, validation and generation; the extension owns metadata and editor writes.
This is a navigation aid, not a specification or a task backlog.

| Task | Load only this route | First search term |
|---|---|---|
| Parser, model, generation, temp tables, IDE semantics | [Query core](query-core.md) | `deriveProducerColumns` |
| Query Text, Designer load/state/Apply | [Designer](designer-query-text.md) | `QueryTextDialog` or `decideApply` |
| Commands, host messages, metadata, editor writes | [Extension](extension-metadata.md) | `createPanel` |

Use exact `rg` searches and the source links above, then read the relevant
implementation, callers and tests. For example:

```sh
rg -n 'deriveProducerColumns' src test
```

Load only the route and source excerpts needed for the task. Follow React
callbacks and both sides of host/WebView messages explicitly; a symbol search
alone does not establish the complete runtime path.

Current authority: [development guide](../index.md), especially its architecture,
contracts, grammar parity and debt links. Historical audits do not override code.
