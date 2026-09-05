# Setup and build

## Prerequisites

Use Node.js 20 or later, npm, and VS Code 1.90 or later.

```bash
npm install
npm run build
npm run dev
```

`npm run build` bundles the extension host and WebView into `out/`. `npm run dev`
launches an Extension Development Host after building. The optional setup helper
can also install Playwright browsers:

```bash
npm run setup -- --e2e
```

## Useful commands

| Command | Purpose |
|---|---|
| `npm run typecheck` | Check extension/core and WebView TypeScript projects |
| `npm run test:unit` | Run Vitest tests |
| `npm run test:e2e` | Run the static WebView Playwright suite |
| `npm run test:integration` | Run real VS Code Extension Host tests |
| `npm run docs:check` | Validate localized docs and links |
| `npm run package` | Build the release VSIX |

Generated output under `out`, metadata caches under `tmp`, and `.vsix` files are
not source files.
