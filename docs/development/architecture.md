# Architecture

The repository separates code that can run without VS Code or a browser from its
adapters: the extension host and two WebView UIs (the Classic designer and the
Canvas preview).

This keeps parsing and generation deterministic and fast to test without Electron.
The WebViews have no filesystem access; the shared protocol prevents either side
from reaching through the other layer.

```text
BSL editor / VS Code API
          |
          v
src/extension  <--- src/shared/messages.ts --->  src/webview (Classic, React)
          \                                            ^
           \                                           | shared state, apply gate,
            \                                          | i18n (one-way import)
             \                                  src/webview-canvas (Canvas, React)
              \                                      /
               +------------- src/core -------------+
                               | metadata
                               | query parser/model/generator
                               | semantic (hover/completion)

src/cli, tooling/  — developer tools (corpus, oracle); import src/core, never shipped
```

## Layer responsibilities

| Layer | Responsibility |
|---|---|
| `src/extension` | Commands, active editor, paths, WebView panels, insertion, hover/completion/diagnostics providers |
| `src/core/metadata` | XML import, YAML compatibility data, JSON cache, metadata model; the only `src/core` area that uses the filesystem (Node `fs`, never `vscode`) |
| `src/core/query` | `QueryModel`, SDBL parsing/generation, validation, transforms |
| `src/core/semantic` | Tolerant snapshot building for hover/completion (recovers from malformed queries; distinct from the strict open/Apply path, which uses `validateBatch.ts`) |
| `src/webview` | Classic designer UI; also owns the state/model editing (`state/queryStore.ts`), batch text generation and apply gate (`applyGate.ts`) that Canvas reuses; no filesystem access |
| `src/webview-canvas` | Canvas designer preview UI; imports shared state/gate/i18n from `src/webview` (never the reverse) instead of duplicating them |
| `src/shared` | Typed host/WebView protocol and locale contract |
| `src/cli`, `tooling/` | Corpus, oracle and metadata developer tools; not bundled into the extension |

## Stability boundaries

Command and setting IDs, serialized caches, `QueryModel`, `MetadataModel`, and
message discriminants are contracts. Change parser and generator behavior
together and cover both directions. Keep VS Code and browser dependencies out of
`src/core`.

`src/extension/metadataLoader.ts` owns asynchronous metadata loading and
last-known-good caching. `panel.ts` owns the shared designer-panel host and the
entire message bridge for both Classic and Canvas; `canvasPanel.ts` is only a
thin Canvas-specific configuration wrapper around that host. Changes to the
shared bridge require Extension Host coverage as well as both WebView paths.

## Known internal coupling

(Re-verified against the import graph on 2026-09-23.)

One real circular-import group remains inside `src/core/query`:
`sdblGenerator.ts` → `sdblParser.ts` (the generator re-parses inline subquery
text via `parseDocument`) → `unionModel.ts` / `commentBinder.ts` →
`sdblGenerator.ts` (`unionModel.ts` imports `fieldExpr`, see below). This is a
known refactor hazard, not an emergency — a future decomposition of
`src/core/query` should account for it deliberately (for example by moving
inline-subquery reflow out of the generator) rather than assume the current
file boundaries are the natural module seams.

`sdblParser.ts` ↔ `qualifyBareFields.ts` is **not** a static cycle:
`qualifyBareFields.ts` never imports the parser; the parser registers itself via
`setSubqueryParser` once at module load (a hook, like the one below).

`sdblGenerator.ts` → `exprFormatter.ts` is **not** a circular import:
`exprFormatter.ts` has no import of `sdblGenerator.ts` at all. `sdblGenerator.ts`
imports `exprFormatter.ts`'s formatting helpers one-way, and additionally
registers a callback via `setInlineSubqueryReflow` so `exprFormatter.ts` can
invoke generator-owned inline-subquery reflow logic without importing the
generator. It's an inversion-of-control seam, not a cycle to break — but note
that formatting depends on the generator module having been loaded (today
guaranteed, because the parser/generator group above always loads together).

The `unionModel.ts` → `sdblGenerator.ts` edge of that group is **accepted**
debt, deliberately narrowed to one binding: `unionModel.ts` imports only `fieldExpr` from
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

## Current semantic and expression contracts

The [technical-debt ledger](technical-debt.md) owns current status. In particular,
A1 tracks duplicated lexical/expression knowledge, and A2 tracks temporary-table
lifetime/producer facts. Reusing or extending the hand-written lexer with
canonical tokens is compatible with ADR 0001/0004 if spelling, source positions,
opaque preservation and the platform-canonical output contract remain intact.
A runtime grammar engine or independent recovery grammar would require revisiting
those ADRs. A full expression AST needs a separate scope decision; a formatter's
internal Boolean/arithmetic tree is not a shared expression AST in QueryModel.

`buildSemanticSnapshotFromText` materializes source-alias `symbolsById` for complete
and recovered parses; `resolveAliasAt` consumes it. It is the only index: the
unused scope/reference maps and the never-produced `partial` state were removed
(S3). Completeness is `complete`, `recovered` or `unavailable`. `complete` means the
parse did not throw, not that every source/scope was captured: condition
subqueries kept as custom text are not covered. Text with an unclosed `(` is
recovered first even when it parses, because the parenthesis can swallow ИЗ.
Source-map events carry `depth`; scope descent matches nested levels by depth and
the parent node's range. Current source maps and
on-demand scope traversal already serve consumers; add a new index only together
with its first consumer. Some source comments still describe earlier phases
(D1); the implementation and this contract take precedence.
