# Testing and release

## Regression gate

Run checks in this order where relevant:

```bash
npm run docs:check
npm run typecheck
npm run test:unit
npm run build
npm run test:e2e
npm run test:integration
```

Vitest covers core, extension helpers, locale selection, and regression corpus.
Playwright covers the WebView harness. `@vscode/test-electron` covers command
registration, editor insertion, and metadata flow inside a real Extension Host.

Snapshot, corpus, or generated-output changes require an explanation of affected
case counts and representative transitions. Never update them blindly.

## Packaging

`npm run package` runs the prepublish build and creates `query-console-1c.vsix`.
Inspect the archive to confirm JavaScript bundles, localization bundles, manifest
translations, icon, license, localized README files, the project banner, and the
animated demo are included.

## Release workflow

The GitHub Actions workflow verifies pull requests and `main`. A `v*` tag also
packages a versioned VSIX and creates a GitHub Release. Versioning and tagging are
maintainer actions, not part of an ordinary contribution.
