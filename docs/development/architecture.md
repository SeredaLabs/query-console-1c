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
| `src/core/semantic` | Tolerant snapshot building for hover/completion/analysis (recovers from malformed queries; distinct from the strict Apply path) |
| `src/webview` | React UI and model editing; no direct filesystem access |
| `src/shared` | Typed host/WebView protocol and locale contract |

## Stability boundaries

Command and setting IDs, serialized caches, `QueryModel`, `MetadataModel`, and
message discriminants are contracts. Change parser and generator behavior
together and cover both directions. Keep VS Code and browser dependencies out of
`src/core`.

`src/extension/panel.ts` owns asynchronous metadata loading and the message
bridge; changes there require Extension Host coverage as well as WebView tests.

## Known internal coupling

(Re-verified against the import graph on 2026-09-21, after the `qualifyBareFields`
→ `sdblGenerator` edge was cut and `queryModelUtils.ts` was extracted — see below.)

One real circular-import pair remains inside `src/core/query`, made
load-order-safe via hook injection rather than restructured away:
`sdblParser.ts` → `qualifyBareFields.ts` → `sdblParser.ts`
(`setSubqueryParser`, registered once at module load so `qualifyBareFields`
never has a static import of `sdblParser`). This is a known refactor hazard,
not an emergency — a future decomposition of `src/core/query` should account
for it deliberately rather than assume the current file boundaries are the
natural module seams.

`sdblGenerator.ts` → `exprFormatter.ts` is **not** a circular import:
`exprFormatter.ts` has no import of `sdblGenerator.ts` at all. `sdblGenerator.ts`
imports `exprFormatter.ts`'s formatting helpers one-way, and additionally
registers a callback via `setInlineSubqueryReflow` so `exprFormatter.ts` can
invoke generator-owned inline-subquery reflow logic without importing the
generator. It's an inversion-of-control seam, not a cycle to break.

`unionModel.ts` ↔ `sdblGenerator.ts` is a real, **accepted** cycle, deliberately
narrowed to one binding: `unionModel.ts` imports only `fieldExpr` from
`sdblGenerator.ts` (needed for final SDBL cell text), while `sdblGenerator.ts`
imports `unionModel.ts`'s column-derivation helpers. This is pinned by an
architecture guard test (`test/unit/unionModel.test.ts`) that fails if
`unionModel.ts` ever imports a second binding from `sdblGenerator.ts` — treat
it as accepted debt, not a pending TODO.

`sdblParser.ts` also keeps the active `MetadataResolver` in module-scoped state
only for the duration of a synchronous `parseDocument` call, restoring the
previous value in `finally` so nested parses remain isolated. Do not introduce
`await`, callbacks that outlive that call, or parallel parsing through this
state. A future parser decomposition should pass an explicit parse context
instead; until then, preserve the stack discipline and its strict/tolerant
boundary regression coverage.

Related decisions: see [`decisions/`](decisions/README.md).
