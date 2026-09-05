# WebView

The React WebView edits a `QueryModel` received from the extension host. It uses
the typed messages in `src/shared/messages.ts`; it must not read workspace files
or call the VS Code API directly.

## State and messages

`App.tsx` receives `init` and metadata/model updates, establishes the locale, and
owns top-level dialogs. Stores and focused components make model changes and send
apply, cancel, refresh, and selection requests to the host.

The test harness initializes Russian to preserve historical selectors and
fixtures. Locale-specific tests may send another `init` message and assert the
visible labels. Never translate message types, model enums, `data-testid` values,
or SDBL tokens.

## Query text editors

The default query-text dialog provides formatting and apply/cancel behavior. The
v2 editor is experimental and adds CodeMirror search, lint markers, structure,
and parameter panels. Both must parse manual edits before replacing the model.

## Security

The panel uses a nonce-based content security policy and local resource roots.
Keep new resources inside the extension and avoid inline executable content.
