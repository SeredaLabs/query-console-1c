# Query Console 1C - Full Localization Specification

**Status:** Draft for implementation
**Scope:** User-facing localization of the VS Code extension and Query Constructor webview
**Supported locales:** English (`en`), Ukrainian (`uk`), Russian (`ru`)

## 1. Goal

Provide a complete, consistent, and safe localization of the extension UI. A user
must see the same language in the VS Code command/settings surface, extension-host
notifications, and Query Constructor webview.

Localization is a presentation-only feature. It must not change query semantics,
persisted data, metadata lookup, generated SDBL, or existing public identifiers.

## 2. Language Selection Policy

The sole language source is VS Code's display language, read by the extension host
from `vscode.env.language`.

| VS Code locale | Constructor locale |
| --- | --- |
| `uk`, `uk-UA`, `uk-*` | `uk` |
| `ru`, `ru-RU`, `ru-*` | `ru` |
| `en`, `en-US`, `en-*` | `en` |
| every other locale | `en` |

There is no `queryConsole.language` setting and no in-webview language switcher in
this delivery. A custom override would make the webview language differ from
Command Palette, Settings, and native VS Code notifications.

VS Code applies a display-language change after its normal restart/reload flow. The
extension reads the locale when activated and passes it to every newly created
webview. An already open constructor need not hot-switch language.

## 3. Non-Goals and Invariants

The following are not translated and must remain byte-for-byte compatible:

- SDBL keywords, operators, functions, query text, comments, and generated output.
- 1C metadata names, table names, field names, kinds, and virtual-table names.
- `QueryModel`, `QueryState`, serialized cache data, parser/generator input and output.
- command IDs, configuration keys, context keys, `when` clauses, language IDs,
  `data-testid` values, webview message `type` values, and enum values.
- test fixtures, golden files, corpus data, and screenshots unless a test explicitly
  covers localized presentation.

No parser, generator, metadata loader, query store behavior, or extension command
flow may be changed as part of this work.

## 4. User-Facing Coverage

Localization covers all display text owned by this repository:

- Query Constructor tabs, labels, buttons, tooltips, placeholders, empty states,
  modal dialogs, confirmations, validation, and webview errors.
- Extension-host information, warning, and error messages.
- command titles and configuration descriptions exposed by VS Code.
- documentation that explains language selection and contribution rules.

The terms shown from a loaded 1C configuration remain as supplied by that
configuration. For example, a Ukrainian constructor may correctly display a
metadata table named `Справочник.Номенклатура` and generate `ВЫБРАТЬ`.

## 5. Target Design

### 5.1 Webview

Create a dependency-free localization layer:

```text
src/webview/i18n/
  index.ts       Typed `t(key, params)` API and fallback handling
  locale.ts      `normalizeLocale()` and supported locale definitions
  en.ts          Canonical base dictionary
  uk.ts          Ukrainian dictionary
  ru.ts          Russian dictionary
```

`en.ts` defines the complete key schema. `uk.ts` and `ru.ts` must satisfy that
schema at compile time. Keys are stable ASCII dotted identifiers, for example:

```ts
tabs.tablesAndFields
actions.cancel
validation.selectTableAndField
dialog.tempTable.title
```

`t()` supports named interpolation only, for example `t('errors.parse', { error })`.
It never returns an untranslated key to the user: missing entries fall back to the
English base dictionary and are reported in development/test mode.

### 5.2 Host-to-Webview Contract

The existing initial webview payload receives a new `locale: SupportedLocale`
field. The host normalizes `vscode.env.language`; the webview must not independently
inspect browser, operating-system, or navigator language.

This is an additive protocol field. Older messages and all existing message `type`
values remain unchanged.

### 5.3 Extension Host and Manifest

Use VS Code's native localization mechanism:

- `vscode.l10n.t(...)` for runtime strings in `src/extension/`.
- `package.nls.json`, `package.nls.uk.json`, and `package.nls.ru.json` for command
  titles, configuration titles, and descriptions referenced by `package.json`.
- `bundle.l10n.json`, `bundle.l10n.uk.json`, and `bundle.l10n.ru.json` for extension
  host runtime messages, using the format required by the supported VS Code API.

All localization bundles must be included in the VSIX. `package.json` keeps stable
placeholder keys and must not change any command/configuration identifiers.

## 6. Translation Rules

- English is the fallback and key source of truth.
- Russian must preserve the established terminology where it is already user-facing.
- Ukrainian and English translations must be natural UI text, not transliterations.
- 1C and SDBL tokens embedded in an explanatory sentence remain unchanged and use
  code formatting where practical.
- A shared glossary is stored in this specification or a dedicated adjacent document
  before translation begins. It defines translations for concepts such as Query,
  Batch, Union, Temporary Table, Builder, Cache, and Metadata.
- Dynamic data is interpolated as data, never concatenated into translated strings.

## 7. Delivery Phases

### Phase 0 - Baseline and String Inventory

**Scope**

- Run and record the current full gate: typecheck, unit tests, e2e tests, build,
  package, and VSIX inventory.
- Inventory every user-facing string in `src/webview/`, `src/extension/`, and
  `package.json`.
- Classify every discovered string as translatable UI, native VS Code manifest,
  dynamic data, SDBL/domain token, or developer-only logging/comment.
- Record existing e2e selectors that depend on visible Russian text.

**Acceptance criteria**

- No source files are functionally changed.
- A reviewed inventory exists and explicitly lists exclusions.
- Current gates remain green.

### Phase 1 - Locale Core and Protocol

**Scope**

- Add `SupportedLocale`, `normalizeLocale`, dictionaries, and typed `t()`.
- Add the additive `locale` field to the initialization protocol.
- Resolve locale only in the extension host from `vscode.env.language`.
- Add a minimal locale provider/hooks boundary for React components.

**Acceptance criteria**

- `uk`, `ru`, regional variants, and unsupported locales normalize deterministically.
- All dictionaries compile against the same key shape.
- An unknown locale falls back to `en`.
- Existing constructor behavior is unchanged when the locale is `ru`.
- Unit tests cover normalization, fallback, interpolation, and key completeness.

### Phase 2 - Constructor Shell and Shared UI

**Scope**

- Localize `App.tsx`, `ConstructorView.tsx`, tabs, common buttons, shared dialog
  actions, loading states, and the bottom action panel.
- Localize global validation and syntax-error presentation inside the webview.
- Preserve all `data-testid` attributes exactly.

**Acceptance criteria**

- Constructor opens in all three locales.
- Core actions still generate, insert, and cancel without behavior changes.
- E2E tests use stable test IDs where a visible-label selector would be localized.

### Phase 3 - Tables, Fields, and Metadata UI

**Scope**

- Localize database-tree UI chrome, TablesPanel, FieldsPanel, search, empty states,
  common add/remove/edit actions, and temporary-table dialogs.
- Localize only surrounding UI; retain metadata values verbatim.

**Acceptance criteria**

- Drag/drop and double-click behavior passes existing e2e tests.
- A metadata fixture name is identical in all locale modes.
- The temporary-table `#` and `&` name-preservation behavior remains covered.

### Phase 4 - Query Editing Tabs

**Scope**

- Localize Conditions, Connections, Grouping, Order, Totals, Additional, Builder,
  Index, Unions, Batch, expression builder, and virtual-table parameter dialogs.
- Localize labels and help text, but never SDBL operator values or generated syntax.

**Acceptance criteria**

- Parser/generator tests remain byte-for-byte unchanged and green.
- Existing query package, union, temporary-table, and nested-query e2e flows pass.
- New targeted visual/text smoke tests cover each localized tab family.

### Phase 5 - Extension Host Messages

**Scope**

- Move user-facing messages in `extension.ts`, `panel.ts`, and `insertResult.ts` to
  `vscode.l10n.t`.
- Localize creation prompts, missing metadata warnings, refresh results, validation
  errors, and clipboard-fallback notification.
- Do not localize output inserted into a `.bsl` document.

**Acceptance criteria**

- Both insert paths remain correct: source editor visible inserts text; unavailable
  editor copies text and displays the localized notification.
- Invalid `queryConsole.metadataPath` still gives a localized actionable warning.
- Manual smoke validates new query, existing query, cancel, clipboard fallback, and
  missing metadata in all three locales.

### Phase 6 - VS Code Manifest Localization

**Scope**

- Introduce package and host localization bundles.
- Localize command titles, extension display text where supported, and configuration
  titles/descriptions.
- Keep command IDs, setting keys, menu conditions, categories, and package identity
  immutable.

**Acceptance criteria**

- Command Palette and Settings show the VS Code display language.
- `queryConsole.metadataPath`, `queryConsole.parserOutputPath`, and
  `queryConsole.openInNewWindow` keep the same keys and behavior.
- VSIX contains every required localization bundle and static asset.

### Phase 7 - Test Hardening and Documentation

**Scope**

- Add a static test that rejects unapproved user-facing literals outside locale
  dictionaries. Allow explicit comments/allowlist only for SDBL and metadata tokens.
- Add locale smoke coverage for `en`, `uk`, and `ru`.
- Keep the full behavioral e2e suite on one canonical locale using test IDs.
- Update README and DEVELOPMENT documentation with the locale policy, glossary, and
  contribution rule: new UI text requires dictionary entries in all locales.

**Acceptance criteria**

- Missing keys, locale drift, and accidental hardcoded UI text fail CI.
- Documentation states that VS Code display language controls the constructor.
- No documentation instructs users to set a separate constructor language.

### Phase 8 - Release Qualification

**Scope**

- Run typecheck, full unit suite, e2e suite, build, package, and VSIX inspection.
- Manually test a real VS Code session in `en`, `uk`, and `ru`.
- Verify Marketplace package metadata and language resources.

**Acceptance criteria**

- All automated gates are green.
- Core manual smoke passes in all locales.
- Generated SDBL is identical for the same model in all locale modes.
- The package contains no `src/`, `test/`, `tooling/`, or `.devcontainer/` paths.
- Release is a separate patch version and tag only after the qualification result.

## 8. Test Matrix

| Area | Unit | E2E | Manual VS Code |
| --- | --- | --- | --- |
| Locale normalization/fallback | required | no | optional |
| Dictionary key completeness | required | no | no |
| Constructor shell | targeted | required | required |
| Tables/fields/temp tables | existing + targeted | required | required |
| Query generation | existing golden tests | required | required |
| Insert/cancel/clipboard fallback | host tests where feasible | boundary e2e | required |
| Manifest commands/settings | static/package test | package inspection | required |
| All three display languages | smoke | smoke | required |

## 9. Required Gates Per Implementation Commit

Every implementation commit must run:

```bash
npm run typecheck
npm test
npm run build
git diff --check
```

At the end of each delivery phase that changes a webview or package path, also run:

```bash
npm run test:e2e
npm run package
```

Before release, inspect the VSIX contents and run the full manual smoke matrix.

## 10. Rollback Strategy

- Each phase lands in isolated commits with no mixed parser, generator, state-store,
  or structural refactor work.
- A failed phase is reverted with a normal revert commit; never reset published
  history.
- Locale resources may be corrected independently from behavior as long as keys and
  protocol contracts remain stable.
- A missing translation must fall back to English rather than block constructor use.

## 11. Release Boundary

Localization is a user-visible feature and must be released separately from
repository reorganization. It requires a new patch version, an annotated release
tag, green CI, manual three-locale confirmation, and a separate Marketplace publish
decision.
