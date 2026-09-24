# New Builder — Current Capability Map

> STATUS: refreshed against repository HEAD `86ab4eb`, 2026-09-24.
>
> This replaces the historical audit from HEAD `efc0a78`, where
> `src/webview-canvas/` did not yet exist. Do not use the old “Canvas: N/A”
> conclusions for current planning. Detailed implementation notes and
> invariants remain in `.claude/new_builder_current_state.md`.

## Current milestone

- Canvas is a real, separately bundled webview (`out/webview/canvasApp.js`),
  hidden by default behind `queryConsole.enableNewBuilderPreview`.
- The baseline roadmap through Phase 12 is implemented.
- STOP 2 (recorded Classic/Canvas semantic parity) is still pending.
- Phase 13 is the next main implementation phase.
- Phase 14 was implemented ahead of Phase 13.
- Phase 15 is complete except for UI-to-SDBL cross-highlight.
- Phase 16 and advanced Phase 17 work have not started. Phase 18 is partial.

## Architecture boundary

Canvas and Classic share:

- `QueryState`, reducer and snapshot selectors;
- parser, generator and semantic validation;
- host protocol and designer-panel host;
- metadata tree model, apply gate, condition operators, resize handle and
  webview/host bridge;
- query load/save flow and guarded `insertResult()` write-back.

Canvas-only state is presentation state: workspace selection, card positions,
pan/zoom, panel sizes and collapsed state. It must not create parallel domain
semantics.

## Capability matrix

| Capability | Shared domain/core | Canvas UI | Status / remaining work |
|---|---|---|---|
| Open query under cursor | `tryOpenBatch` → `LOAD_BATCH` | Shared `useDesignerSession`, loading and blocking error overlays | Implemented |
| Window/shell integration | Shared panel host owns new-window behavior and tab identity | Compact auxiliary window, responsive Package/UNION navigation, single Canvas identity glyph | Implemented; compact mode is best-effort on hosts that expose the VS Code command |
| Save to source document | `computeBatchTextSafe`, shared apply gate, `insertResult` guards | Document Bar Save | Implemented |
| Add/remove sources | `SelectedTable`, `ADD_TABLE`, `REMOVE_TABLE` | Source Browser + Structure cards | Implemented |
| Reference-field expansion | Host supports `expandRef` | No Canvas control wired | UI missing |
| Metadata-cache refresh | Shared host supports `refreshCache` | No Canvas control wired | UI missing |
| Structure graph | Tables/joins from `QueryState` | Pan/zoom, fixed cards, obstacle-aware orthogonal JOIN routing, shared minimap routes, BFS auto-layout | Implemented; routes avoid non-overlapping cards and greedily minimize overlap/crossing, but arbitrary cyclic crossing elimination is not guaranteed |
| JOIN CRUD | Existing JOIN actions and condition model | Create popover, Inspector edit/remove, joins overview | Implemented for normal and single-conjunct editing; multi-conjunct edit remains limited |
| Virtual-table parameters | `SET_VIRTUAL_PARAMS` and shared metadata exist | Canvas only displays the virtual-table badge; it never dispatches `SET_VIRTUAL_PARAMS` | UI missing |
| SELECT fields | Existing field actions | Fields workspace: add/remove, alias, expression, aggregate, reorder | Implemented |
| Reusable Expression Builder | Raw expressions are supported by the domain | No Canvas ExpressionBuilder workflow | Phase 16 |
| WHERE conditions | Flat `Condition[]`, existing reducer actions | Conditions workspace | Implemented for flat AND plus opaque custom expressions |
| Structured nested AND/OR | No tree-shaped condition domain | None | Requires an explicit core/reducer/parser/generator design; not implied by Phase 8 |
| Condition subqueries | Partial parser/domain support | Cannot be created structurally in Canvas | Separate scope from source-subquery Phase 13 |
| Group fields | Existing grouping actions | Grouping workspace | Implemented |
| Grouping sets | Domain/reducer support exists | No Canvas controls | UI missing |
| Aggregates | `SelectedField.func` and existing actions | Managed from Fields workspace | Implemented; intentionally not duplicated in Grouping |
| HAVING | Model/parser/generator can preserve/render it, but no complete reducer CRUD surface | None | Requires approved reducer/UI work |
| Totals / hierarchical totals | Domain/reducer/parser/generator support exists | None | UI missing; required for full STOP 2 parity |
| Sorting | Existing order actions | Add/remove, direction, auto-order | Implemented |
| Sort-priority reorder | Array order is semantic; no reducer move action | None | Requires a small approved reducer addition |
| DISTINCT / TOP / ALLOWED | Existing selection actions | Additional workspace | Implemented |
| FOR UPDATE / locking | Existing lock actions | Additional workspace | Implemented |
| Indexes | Domain/reducer/parser/generator support exists | None | UI missing |
| Package navigation | `BatchDocument` and batch actions | Responsive PackageNav | Implemented; reorder/rename UI missing |
| Temp-table create/append/drop | Existing query type and package model | Additional workspace + PackageNav | Implemented |
| Temp-table lifecycle/continuity | Position-aware shared lifetime selectors | Producer/appender/consumer/drop markers and related-member highlight | Implemented |
| Manual/ad-hoc temp-table editor | Existing Classic workflow and synthetic metadata support | None | Phase 13 |
| Source subquery | `SelectedTable.subquery`, `ADD_SUBQUERY_TABLE`, `UPDATE_SUBQUERY_TABLE` | No nested Canvas editor | Phase 13; domain changes are not required for the first implementation |
| UNION / UNION ALL members | Existing union document/actions | Responsive UnionStrip | Implemented |
| Positional UNION mapping | `deriveUnionColumns`, alias and move actions | Union mapping dialog | Implemented without an invented explicit-mapping object |
| Generated SDBL | Shared generator | Read-only highlighted CodeMirror dock, copy, resize, collapse | Implemented |
| Workspace ↔ SDBL cross-highlight | Parser-input source maps exist for semantic lookups; the generator does not emit QueryState-to-generated-text ranges, and no Canvas mapping contract is approved | None | Remaining Phase 15 work |
| Table alias editing | `SelectedTable.alias` exists, but no reducer action | Read-only display | Requires an approved reducer addition |
| Query execution/results | Not part of the product boundary | None | Explicitly out of scope |

## Phase checkpoint

| Phase | Current status |
|---|---|
| 0--6 | Complete |
| STOP 1 | Complete; complex graph live-QA recorded |
| 7 | Baseline complete |
| 8 | Baseline complete within the existing flat-condition model |
| 9 | Partial: grouping complete; totals/grouping sets/HAVING missing |
| 10 | Baseline complete; reorder missing |
| 11 | Partial: common query settings complete; indexes missing |
| STOP 2 | Pending |
| 12 | Complete |
| 13 | Not started; next main phase |
| 14 | Implemented ahead of sequence |
| 15 | Implemented except cross-highlight |
| 16 | Not started |
| 17 | Advanced interactions not started |
| 18 | Partial for Structure/TableCard; broader accessibility/polish pending |

## Validation status

Available guards include typecheck/build coverage for Canvas, pure geometry,
layout and edge-router regression tests (obstacles, hub ports, parallel edges,
crossing pressure, label placement and determinism), responsive Package/UNION
layout tests, designer-window/icon tests, reducer/core tests, preview packaging
checks, shared apply-gate tests, and load-failure/source-wiring tests.

The remaining material gap is a real Canvas browser E2E. The current
`npm run test:e2e` harness bundles Classic `out/webview/main.js` only. Before
removing the preview flag, add at least:

1. init → metadata → loadModel → edit → Save → insertText;
2. malformed load → blocking error → Close without insertText;
3. package + UNION navigation and positional mapping;
4. temp-table create/consume/drop lifecycle.

## Planning rule

Before every phase, use the roadmap Implementation Gate. If a task needs a new
core semantic, reducer action shape or host protocol message, stop and request
explicit approval. UI over already-supported actions does not require a new
domain abstraction.
