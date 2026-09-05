# Localization

English is the source language. Supported locales are `en`, `uk`, and `ru`;
regional forms such as `uk-UA` normalize to their base language, and unsupported
locales fall back to English.

## Surfaces

| Surface | Source |
|---|---|
| Manifest commands/settings | `package.nls.json`, `package.nls.uk.json`, `package.nls.ru.json` |
| Extension-host runtime | `vscode.l10n.t(...)` and `l10n/bundle.l10n*.json` |
| WebView | `src/webview/i18n/{en,uk,ru}.json` through `t(...)` |
| User documentation | mirrored files in `docs/{en,uk,ru}` |

The extension sends normalized `vscode.env.language` in the `init` message.
WebView dictionaries are statically bundled, so no separate network or filesystem
request is required.

## Adding text

Add every key to all locale files in the same change. Keep placeholders such as
`{0}` consistent. Do not translate SDBL keywords, metadata identifiers, API and
setting IDs, protocol fields, or internal model values.

User pages carry `source_version` front matter. Increment it in the English page
when meaning changes, update both translations, and run `npm run docs:check`.
Terminology is recorded in [`docs/glossary.yml`](../glossary.yml).
