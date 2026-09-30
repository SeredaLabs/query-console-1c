# 0001 — Platform-independent `core`

Status: Accepted

## Context

The extension needs the same query/metadata logic in three places that don't
share a runtime: the VS Code extension host (Node, has `vscode`), the WebView
(browser DOM, no `vscode`), and standalone CLI/test tooling (plain Node, no
`vscode`, no DOM). Two early, related choices shaped `src/core`: writing the
metadata XML parser and the SDBL query parser/generator by hand in plain
TypeScript, rather than adopting an existing grammar/parsing library or a
native/WASM dependency such as `tree-sitter-bsl`.

## Decision

`src/core/**` contains zero imports of `vscode` and no DOM APIs. Query parsing
and generation are synchronous TypeScript, runnable in host, browser and tests.
Metadata filesystem importers run only in Node; browser consumers use values and
resolvers. The extension, Classic and Canvas have separate TypeScript projects
(`tsconfig.json`, `tsconfig.webview.json`, `tsconfig.webview-canvas.json`). Project
boundaries alone do not prove every import direction; preserve the documented
layer rules and review the actual graph.

The SDBL lexer/parser/generator (`sdblLexer.ts`, `sdblParser.ts`,
`sdblGenerator.ts`) are hand-written, not generated from or backed by an
external grammar engine at runtime. `web-tree-sitter` appears only as a
`devDependency` (`package.json`), used exclusively as an optional
differential test oracle (`test/helpers/assertValidSdbl.ts`) when its WASM
fixture is present — never on the runtime parse path.

## Consequences

- Every `src/core` function is trivially unit-testable in Vitest with no
  Extension Host or browser harness required — this is what makes the
  committed golden-corpus gate cheap to run on relevant changes (see
  [0004](0004-querymodel-round-trip-contract.md) and [corpus policy](../corpus-testing.md)).
- Adding any `vscode`- or DOM-dependent code to `src/core` is a regression of
  this boundary, not a style nit — it would silently make that code
  untestable outside the Extension Host and break the CLI tools that import
  `src/core` directly (`src/cli/*.ts`).
- The tradeoff is maintenance cost: platform grammar changes must be
  hand-ported into the parser/generator rather than picked up from an
  upstream grammar package. This has been accepted deliberately in exchange
  for determinism, test speed, and zero native/WASM runtime dependencies.
