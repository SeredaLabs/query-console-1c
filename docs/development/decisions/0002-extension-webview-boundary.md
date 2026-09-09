# 0002 — Extension host / WebView message boundary

Status: Accepted

## Context

The visual query constructor runs as a VS Code WebView (`src/webview`, React)
hosted by the extension (`src/extension/panel.ts`). The two sides run in
separate processes/contexts with no shared memory or direct function calls —
only `postMessage`. Without a single, explicit, typed contract for that
channel, the two sides tend to drift: a message shape can change on one side
without the compiler catching the other.

## Decision

`src/shared/messages.ts` is the ONLY channel contract between the extension
host and the WebView, and it is small and closed by construction: a
discriminated union `HostMsg` (host → WebView: `init`, `metadataTree`,
`refFields`, `generatedText`, `refreshResult`, `loadModel`) and a
discriminated union `WebviewMsg` (WebView → host: `ready`, `expandRef`,
`generate`, `insertText`, `cancel`, `refreshCache`). Both sides import these
types instead of hand-rolling ad hoc message shapes; `panel.ts`
(`postMessage`/`onDidReceiveMessage`) and `src/webview/bridge.ts`
(`postToHost`/`onHostMessage`) are the only two files that touch the raw
`postMessage` API.

## Consequences

- Adding a new capability across the boundary means adding a new
  discriminant to one of these two unions first — TypeScript then forces both
  sides' `switch`/`if` handling to be updated, instead of a silent runtime
  mismatch.
- Neither adapter can "reach through" the other layer: the WebView cannot
  call `vscode` APIs directly, and the extension host never touches DOM/React
  state directly — everything crosses through this one typed channel,
  keeping both sides independently testable (WebView via Playwright against
  a static harness with a mocked `vscode` API; extension host via
  `vscode-test`).
- This contract is a stability boundary (see
  [`architecture.md`](../architecture.md)): changing a message's shape is a
  breaking change to both sides at once and needs coverage on both.
