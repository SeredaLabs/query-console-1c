# Contributing

Thank you for improving 1C: Query Constructor. Keep changes focused, preserve
existing behavior unless the issue requires a change, and include tests for bugs
and user-visible behavior.

## Development setup

Use Node.js 20 or later, npm, and VS Code:

```bash
npm install
npm run build
npm run dev
```

See the [development guide](docs/development/index.md) for architecture, metadata,
testing, localization, and release details.

## Project structure

- `src/core` contains VS Code- and browser-independent metadata and query logic.
- `src/extension` integrates commands, files, settings, and the WebView panel.
- `src/webview` contains the React interface; `src/shared` defines its host protocol.
- `test/unit`, `test/e2e`, and `test/vscode-integration` cover the three layers.

## Before submitting a change

Run the strongest relevant checks:

```bash
npm run docs:check
npm run typecheck
npm run test:unit
npm run build
npm run test:e2e
npm run test:integration
```

Do not update corpus snapshots or generated expectations merely to make a test
pass. Explain every intentional baseline change and include representative
before/after cases.

## Pull requests and releases

Keep each pull request scoped to one change, explain behavior and compatibility
impact, list exact checks run, and call out untested risks. Maintainers create
versions and `v*` tags; the release workflow verifies the repository, packages
the VSIX, and publishes a GitHub Release. Contributors should not bump versions
unless the change request explicitly requires it.

## Documentation and translations

English is canonical. User pages in `docs/en`, `docs/uk`, and `docs/ru` must have
matching filenames and heading levels. When English content changes, update both
translations and keep their `source_version` equal. Run `npm run docs:check`.

Add UI text to all three WebView dictionaries. Extension-host text uses
`vscode.l10n.t`; manifest text uses `package.nls*.json`. Keep SDBL keywords,
metadata object names, setting IDs, command IDs, and protocol discriminants
unchanged.

## Reporting issues

Include the extension and VS Code versions, operating system, the smallest query
that reproduces the problem, relevant settings, and whether metadata cache was
rebuilt. Do not attach proprietary configuration exports; reduce them to a safe
fixture when possible.
