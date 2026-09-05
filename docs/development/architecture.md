# Architecture

The repository separates code that can run without VS Code or a browser from its
two adapters.

This keeps parsing and generation deterministic and fast to test without Electron,
while the host and WebView remain thin trust boundaries for filesystem and UI
effects. The shared protocol prevents either adapter from reaching through the
other layer.

```text
BSL editor / VS Code API
          |
          v
src/extension  <--- src/shared/messages.ts --->  src/webview (React)
          \                                      /
           +----------- src/core ---------------+
                         | metadata
                         | query parser/model/generator
```

## Layer responsibilities

| Layer | Responsibility |
|---|---|
| `src/extension` | Commands, active editor, paths, WebView panel, insertion |
| `src/core/metadata` | XML import, YAML compatibility data, JSON cache, metadata model |
| `src/core/query` | `QueryModel`, SDBL parsing/generation, validation, transforms |
| `src/webview` | React UI and model editing; no direct filesystem access |
| `src/shared` | Typed host/WebView protocol and locale contract |

## Stability boundaries

Command and setting IDs, serialized caches, `QueryModel`, `MetadataModel`, and
message discriminants are contracts. Change parser and generator behavior
together and cover both directions. Keep VS Code and browser dependencies out of
`src/core`.

`src/extension/panel.ts` owns asynchronous metadata loading and the message
bridge; changes there require Extension Host coverage as well as WebView tests.
