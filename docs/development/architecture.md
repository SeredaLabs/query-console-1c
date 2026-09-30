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

(Re-verified against current imports on 2026-09-30.)

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

## Query and semantic dependencies

The existing lexer (`sdblLexer`, shared keyword sets) feeds parser, formatter and
validator. Parser/generator edit `QueryModel`; arbitrary expressions remain
strings, with formatter-local Boolean/arithmetic trees rather than a shared AST.
`validateBatch` calls parser plus `semanticValidator`; the latter uses the
structural expression acceptor, field-path resolver and semantic temp lifetimes.
The semantic snapshot builder also uses this parser, with advisory recovery;
source-map ranges/depth and `symbolsById` serve on-demand alias resolution.
No scope/reference index or `partial` completeness state is produced.

Temporary-table facts still have three owners: parser registry, designer store
and semantic lifetime/schema derivation. Scalar-head versus all-projection schema
alignment is unfinished. The shared lexer likewise does not mean all raw
expression scanners have disappeared. [A1/A2/A3](technical-debt.md#architecture)
own these debts and their dependencies; the existing cycle/hooks/resolver above
constrain decomposition.

## Stable contracts and scope

[Query model](query-model.md) describes current representation/section order;
[lexical facts](expression-lexical-contract.md) and
[safety/preservation/recovery](contracts/safety-and-preservation.md) own enforced
invariants. Classic and Canvas share state/session/generation/Apply infrastructure;
the host sends source text and inserts only accepted text through the shared
bridge. Canvas keeps presentation state and recursive drafts local.

Metadata filesystem I/O stays in the Node adapter/importer path; browser bundles
consume metadata values/resolvers, not filesystem loaders. The extension edits
static BSL query literals and offers advisory IDE assistance. It has no query
execution transport, database result grid or dynamic BSL data-flow engine.

Runtime grammar replacement, SQLite caches and worker/process redesign are not
implied by current debt. A new runtime dependency or architecture replacement
requires a concrete scoped need; optimization requires measured workloads.
[ADR records](decisions/README.md) remain accepted. Current release gates and
Preview criteria belong to [testing/release](testing-and-release.md), not audits.
