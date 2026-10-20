# Extension, metadata and editor route

| Responsibility | Source to inspect |
|---|---|
| VS Code activation / command registration | [extension.ts](../../../src/extension/extension.ts): `activate` |
| WebView host, init/load, message dispatch | [panel.ts](../../../src/extension/panel.ts): `createPanel` |
| Typed host/WebView message union | [messages.ts](../../../src/shared/messages.ts) |
| Source baseline / no-write close | [applyBaseline.ts](../../../src/extension/applyBaseline.ts) |
| Actual editor insertion | [insertResult.ts](../../../src/extension/insertResult.ts) |
| Metadata loading and cache | [metadataLoader.ts](../../../src/extension/metadataLoader.ts) → `src/core/metadata/` |
| IDE diagnostics | [queryDiagnosticsController.ts](../../../src/extension/queryDiagnosticsController.ts) → [queryDiagnostics.ts](../../../src/extension/queryDiagnostics.ts) |
| IDE hover / completion | [queryHoverProvider.ts](../../../src/extension/queryHoverProvider.ts), [queryCompletionProvider.ts](../../../src/extension/queryCompletionProvider.ts) → semantic snapshot |

Editor write review: trace `insertText` through `panel.ts`, `ApplyBaseline` and
`insertResult`, and inspect the [Designer gate](designer-query-text.md).
Graphify cannot connect a `postMessage` discriminant to its receiver as a
verified runtime edge; search both sides of the typed message.

Tests: `test/unit/applyBaseline.c32.test.ts`, `queryDiagnostics.test.ts`,
and `test/vscode-integration/insertResult.test.ts`.
Discover exact metadata cases with `rg --files test | rg -i metadata`.

Current rules: [architecture](../architecture.md),
[metadata](../metadata.md), [safety contract](../contracts/safety-and-preservation.md),
[testing/release](../testing-and-release.md). This route introduces no new
invariants or migration program.
