# Testing and release

## Regression gate

Run checks in this order where relevant:

```bash
npm run docs:check
npm run typecheck
npm run build
npm run test:unit
npm run test:e2e
npm run test:integration
```

Vitest covers core, extension helpers, locale selection, and regression corpus.
Playwright covers the WebView harness. `@vscode/test-electron` covers command
registration, editor insertion, and metadata flow inside a real Extension Host.

The independent tree-sitter SDBL grammar is currently an opt-in local check,
not part of the standard gate: `test/fixtures/tree-sitter-sdbl.wasm` is not
committed and CI does not build it. `assertValidSdbl` prints a warning and
falls back to the committed corpus/structural checks when the fixture is
absent. `tooling/scripts/build-wasm.sh` documents the current local build path;
do not report the grammar oracle as executed unless the fixture was present.

Snapshot, corpus, or generated-output changes require an explanation of affected
case counts and representative transitions. Never update them blindly.

## Canvas verification

`npm run test:e2e` builds both production bundles and serves the same metadata
harness: `/?surface=canvas` selects Canvas, otherwise Classic. Tests
in `test/e2e/canvas.spec.ts` cover:

- Identical Classic/Canvas saved text and stable Canvas reopening for fields /
  WHERE / ORDER, grouping, source subqueries, condition subqueries, UNION and a
  temporary-table package.
- Preservation of an entered string-field ORDER hierarchy modifier in both UIs
  through load/save/reopen (C3).
- Canvas alias, custom-condition and sort-direction edits, semantic assertions
  on the saved model, then reopening/saving that result through Classic.
- Recursive source create/edit in all six workspaces, JOIN conditions, cancel /
  context retention, referenced-column refusal, nested UNION/temp packages,
  source-less expressions and manual temp descriptions.
- Contextual common VT forms with argument comments/safety flags, TOTALS with
  ПЕРИОДАМИ, INDEX sets/unique, and UNION tail ORDER/TOTALS/INDEX editing (C20).
- Preserve-only grouping sets, dynamic report blocks, condition subqueries,
  raw ORDER/TOTALS and calculation VT through unrelated edit/Save/reopen.
- Scalar UNION alias/reorder/ALL and first-member create/remove transitions;
  tabular/trailing projections use a preserve-only mapping guard and survive an
  unrelated edit/Save/Classic reopen.
- Read-only highlighted SDBL dock, exact clipboard text, resize, keyboard
  collapse/expand and generated text updates; basic source/JOIN/overview/minimap
  Enter/Space activation; source focus stops at direct neighbors and JOIN focus
  includes only the selected endpoints.
- Contextual shared ExpressionBuilder for fields/WHERE/JOIN create/edit,
  Cancel/malformed recovery and nested-source Escape/OK/Back safety.
- C17 controlled open refusal on both surfaces and Classic text Apply, keeping
  original editor/model data intact; this is rejection, not preservation.
- Duplicate-alias rejection and recovery, unsafe VT and malformed-expression
  Save blocking, C11 VT/`ПЕРИОДАМИ` Apply refusal with an explanation on both
  surfaces, and a failed load that emits cancel without replacement text.

The browser harness captures `insertText`; it does not modify a VS Code document.
`npm run test:integration` additionally runs `canvasSave.test.ts`: a real VS Code
webview loads the production Canvas bundle, receives metadata/query through the
host, changes a field alias or enters a nested source, edits and returns through
Back, then clicks Save. The actual
`acquireVsCodeApi` bridge and `insertResult` replace only the captured BSL literal.
A test-only script drives those controls under the panel's existing CSP nonce;
it does not synthesize `insertText` or replace the production UI. Existing host
tests also cover stale-document rejection.

Verified locally on 2026-09-30: 128 browser tests and 39 Extension Host tests. This is a representative regression gate, not
exhaustive Canvas editing coverage or proof of live 1C semantic equivalence.
[Canvas Feature Baseline](../design/new-builder/feature-baseline.md) is complete,
including Phase 13, while the opt-in preview boundary remains. These tests
run through the existing browser and Extension Host CI commands; no new runtime
dependency or test hook is added to the extension.

## Packaging

`npm run package` runs the prepublish build and creates `query-console-1c.vsix`.
Inspect the archive to confirm JavaScript bundles, localization bundles, manifest
translations, icon, license, localized README files, the project banner, and all
three localized GIF demos are included. WebM videos are linked from GitHub and
excluded from the VSIX. See [Recording localized demos](demo-recording.md) to
regenerate and verify the media after relevant UI changes.

## Release workflow

The GitHub Actions workflow verifies pull requests and `main`. A `v*` tag also
packages a versioned VSIX and creates a GitHub Release. Versioning and tagging are
maintainer actions, not part of an ordinary contribution.
