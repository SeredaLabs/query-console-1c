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

`src/core/**` contains zero imports of `vscode` and no DOM APIs. It is plain,
synchronous TypeScript, runnable identically from the extension host, the
CLI tools, and the unit-test suite. `tsconfig.json` (extension) and
`tsconfig.webview.json` enforce the corresponding split for `src/webview`
(excluded from the former, the only project allowed to use DOM/React) —
neither project type-checks the other's dependency direction by construction.

The SDBL lexer/parser/generator (`sdblLexer.ts`, `sdblParser.ts`,
`sdblGenerator.ts`) are hand-written, not generated from or backed by an
external grammar engine at runtime. `web-tree-sitter` appears only as a
`devDependency` (`package.json`), used exclusively as an optional
differential test oracle (`test/helpers/assertValidSdbl.ts`) when its WASM
fixture is present — never on the runtime parse path.

## Consequences

- Every `src/core` function is trivially unit-testable in Vitest with no
  Extension Host or browser harness required — this is what makes the
  1976/17933-query golden-corpus regression suite (see
  [0004](0004-querymodel-round-trip-contract.md)) cheap enough to run on every
  change.
- Adding any `vscode`- or DOM-dependent code to `src/core` is a regression of
  this boundary, not a style nit — it would silently make that code
  untestable outside the Extension Host and break the CLI tools that import
  `src/core` directly (`src/cli/*.ts`).
- The tradeoff is maintenance cost: platform grammar changes must be
  hand-ported into the parser/generator rather than picked up from an
  upstream grammar package. This has been accepted deliberately in exchange
  for determinism, test speed, and zero native/WASM runtime dependencies.
