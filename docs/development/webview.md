# WebView

Classic (`src/webview`) and Canvas (`src/webview-canvas`) are React adapters over
the shared QueryState/reducer, session, QueryModel conversion, generator and Apply
gate. Canvas imports shared Classic helpers/components one-way. Neither UI reads
workspace files or calls the VS Code extension API directly.

## State and messages

The host sends `init`, `metadataTree`, `refFields`, `refreshResult`, and
`loadModel` through `src/shared/messages.ts`. **loadModel carries source text**;
`useDesignerSession` parses/validates it locally before loading shared state.
Generation is local. Outgoing messages are `ready`, `expandRef`, `insertText`,
`cancel`, `refreshCache`, and `switchDesigner`; there is no model/selection/apply
message type.

`switchDesigner` is the Classic/Canvas toggle. It carries the target UI and the
current model's generated text, like the text `insertText` would carry but
without writing it. The host reloads the **same panel** with the other bundle and
opens that text through the ordinary `loadModel` path; the editor binding and
its stale-document guards, metadata and window stay. Both UIs send it only after
`prepareDesignerSwitch` confirms the text reopens through the designer-open gate
without loss; otherwise the current UI keeps its state and shows why. UI-local
state (active tab, selection, canvas layout) is not carried. Canvas is offered
only while it is available as a preview (`init.canvasAvailable`, from
`queryConsole.enableNewBuilderPreview`). The separate Canvas command is
transitional; removing it leaves the toggle unchanged (`designerKind` in
`panel.ts`).

Classic handles refresh and lazy reference-field responses. Canvas uses initial
metadata but has no corresponding assisted controls/response wiring yet (UX-C8).
UI focus/coordinates/collapse and recursive draft state stay local. Loading,
Cancel/Back and Save follow the [safety contract](contracts/safety-and-preservation.md).

The test harness defaults to Russian to preserve selectors/fixtures; locale tests
send another init. Never translate protocol discriminants, model enums,
data-testid values or SDBL tokens. Both surfaces use the shared bridge.

## Query text editors

Classic's default text dialog supports formatting and Apply/Cancel; experimental
v2 adds CodeMirror search, lint, structure and parameter panels. Both validate
manual edits before replacing the model. Canvas has a read-only generated SDBL
dock with highlighting/copy/resize/collapse. It is not a raw-text editor; the
[current capability matrix](../design/new-builder/feature-baseline.md) records
editing/preservation boundaries.

## Security

The panel uses nonce-based CSP and local resource roots. Keep resources inside
the extension and avoid inline executable content. The real-host integration gate
checks actual insertion through the shared panel bridge.
