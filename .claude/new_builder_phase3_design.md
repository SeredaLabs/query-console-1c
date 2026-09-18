# Phase 3 — Structure Workspace: Design & Engineering Audit

> Design-only. No code written for this phase yet. Companion to
> `.claude/new_builder_capability_map.md` and `.claude/new_builder_roadmap.md`.

## 0. Domain/reducer re-verification (evidence, not assumption)

| Capability | Domain field | Reducer action | Notes for Phase 3 |
|---|---|---|---|
| selectedTables | `QueryState.selectedTables: SelectedTable[]` | `ADD_TABLE`, `REMOVE_TABLE` (queryStore.ts:565-638) | duplicates allowed; `id` from global `_tableCounter`, unique for the reducer's lifetime |
| fields (checkboxes on card) | `QueryState.selectedFields: SelectedField[]` | `ADD_FIELD`/`REMOVE_FIELD`/`ADD_ALL_FIELDS_DUP` (queryStore.ts:640-646,707-724,973-1006) | `REMOVE_FIELD` takes an **index**, not (tableId,path) — Structure must locate the index itself (`findIndex`), no domain change |
| table identity/alias | `SelectedTable.alias`, `defaultTableAlias()` (queryModel.ts:657-667) | none for *editing* alias | confirmed (capability map): **no `SET_TABLE_ALIAS` action exists**. TableCard shows alias **read-only** in Phase 3; renaming stays `REQUIRES_DOMAIN_CHANGE`, gated separately |
| joins | `QueryState.joins: Join[]` | `ADD_JOIN`, `REMOVE_JOIN` (queryStore.ts:1163-1178) | one `Join` object = one line, regardless of conjunct count |
| join kinds | `Join.leftAll/rightAll` → `inner`\|`left`\|`full` | `SET_JOIN_ALL` (queryStore.ts:1224-1231); keyword mapping mirrors `joinKeyword()` in sdblGenerator.ts:958-961 | only 3 kinds ever rendered (`JoinKind` type has no `'right'` — normalized away by construction) |
| multiple join conditions | `Join.conditions?: JoinCondition[]` | `ADD_JOIN_CONDITION`/`REMOVE_JOIN_CONDITION`/`updateJoinConjunct` (queryStore.ts:1180-1245) | **not** rendered distinctly on the line/label in Phase 3 — that's Inspector content (Phase 4) |
| virtual tables | `SelectedTable.virtual: VirtualParams` | `SET_VIRTUAL_PARAMS` (queryStore.ts:1014-1021) | TableCard shows a virtual-table indicator; editing params is Inspector (Phase 4), not Structure |
| remove source/join | as above | `REMOVE_TABLE` cascades fields/joins/grouping/order/totals/indexing server-side (queryStore.ts:590-638); `REMOVE_JOIN` is a plain filter (queryStore.ts:1177-1178) | Structure only needs to clean up its OWN local UI state (positions/selection) after dispatch — domain cleanup is already handled |
| package/query switching | `SET_ACTIVE_BATCH`/`SET_ACTIVE_QUERY`/`LOAD_BATCH` (already wired in Phase 2 Sidebar) | tableIds are **globally unique** (`_tableCounter`, `syncTableCounter`) — a step's tables never collide with another step's | positions can be a single flat `Record<tableId,...>` map; switching steps just changes which ids are *currently visible* |

No domain/reducer/protocol change is required anywhere in this design.

## 1. Coordinate system

- **World space**: virtual infinite 2D plane, 1 world unit = 1 CSS px at zoom 1. Card positions `{x,y}` are top-left, in world space.
- **Screen space**: `screenX = worldX*zoom + panX`, `screenY = worldY*zoom + panY`.
- Cards render as absolutely-positioned **HTML** `<div>`s (not SVG `foreignObject` — more robust text layout/overflow/tooltips in a Chromium webview) inside one wrapper whose `transform: translate(panX,panY) scale(zoom)` does all the work. Join lines render in a **sibling SVG layer** under the *same* transform wrapper, so both layers share one coordinate space with zero extra math.

## 2. Pan/zoom

- Zoom range ~25%–200%, step via mouse wheel (no modifier) zooming **around the cursor** (classic zoom-to-point: capture world point under cursor before the change, adjust `pan` after so it stays under the cursor).
- Drag on empty canvas background = pan (`grab`/`grabbing` cursor per spec §33). Card drag and JOIN-line click both `stopPropagation` so they never trigger background pan (spec §33 requirement, verified as a first-class design constraint, not an afterthought).
- Toolbar buttons: `−`/`+` step zoom by fixed increment; `100%` resets zoom (keeps current visual center); `Fit` computes the bounding box of all card positions+sizes and sets zoom/pan so it fits the viewport with padding.

## 3. Manual positions storage

- `positions: Record<tableId, {x,y}>` — Canvas-local UI state (never in `QueryState`), owned by the Structure workspace.
- `manuallyPositioned: Set<tableId>` — marks which cards the user has explicitly dragged.
- Not persisted across panel close/reopen (Phase 3 doesn't touch `messages.ts`; consistent with current_state.md's own framing of Canvas transient state).
- Keying purely by `tableId` is safe and sufficient — ids never repeat across package steps/union members (confirmed above), so **switching between steps naturally remembers each step's own layout** for free, without any extra bookkeeping.

## 4. Auto-layout vs. manual drag coexistence

- A tableId's position is computed by auto-layout **only if it has no entry in `positions` yet** (first time seen) — this covers: table just added via Sidebar `+`, or a package step visited for the first time this session.
- Once a card is dragged, it's added to `manuallyPositioned` and auto-layout never touches it again, *except* when the user explicitly clicks the toolbar's **"Auto Layout"** button, which re-lays-out every currently-visible table and clears `manuallyPositioned` for them (explicit, reversible, opt-in reset — matches roadmap's "reuse existing... layered/BFS auto-layout" wording, not a silent behavior).
- `REMOVE_TABLE` just deletes that id's entries from `positions`/`manuallyPositioned` — no repositioning of siblings (a node-editor convention: removing a card doesn't reshuffle the user's spatial memory of the rest).

## 5. JOIN line rendering (no graph library)

- One `<path>` (or `<line>`) per `Join`, stroke-width 2, in the shared SVG layer described in §1.
- Straight line between two **anchor points** (see §6) — no curve/elbow needed at this node density; spec forbids gradients/rainbow, not straight lines.
- Label (`LEFT`/`INNER`/`FULL` pill, 20–22px height, 11px font, 4px radius per spec §13) is an HTML `<div>` absolutely positioned at the line's midpoint, living in the same transformed layer as the cards (not a separate fixed overlay) — so it pans/zooms in lockstep automatically.

## 6. Anchor points on TableCard

- Card geometry: `{x, y}` from `positions`, `{width, height}` from a small `cardSize: Map<tableId, {width,height}>` populated by a `useLayoutEffect`/`ResizeObserver` measuring the real DOM node once mounted (default estimate `240×80` used for the first frame so lines never "flash empty" before the real size lands).
- Anchor = the side-midpoint of the card facing the other end of the join: if the other card is below/above, use bottom-center/top-center; if beside, use right-center/left-center. Computed purely from the two cards' `{x,y,width,height}` — no library, ~10 lines of arithmetic (`geometry.ts`).

## 7. 8–10px click target with a 2px visible line

Two overlapping SVG paths per join, same geometry:
1. **Visible** path: `stroke-width:2` (3px selected), real color (neutral/accent per state).
2. **Hit-target** path: `stroke-width:8–10`, `stroke:"transparent"`, `pointer-events:"stroke"` — a standard SVG technique: a transparent stroked path is still hit-testable exactly along its stroke width, without ever being visible. All `onClick`/`onMouseEnter`/`onMouseLeave` live on this second path; its hover/selected state then drives the FIRST path's visual style.

## 8. Minimap

- Small (~160×100px per spec §15) fixed-position overlay, own tiny `<svg>`, bottom-right of the Structure workspace.
- Renders simplified rectangles for every card (no text/fields) at a scaled-down transform, plus a draggable "viewport" rectangle representing the current visible world-rect (derived from pan/zoom/viewport size).
- Click/drag inside the minimap re-centers the main pan on that world point.
- Hidden when content's bounding box comfortably fits the viewport already (per spec §15, "не нав'язувати для trivial graph") — a simple bounds comparison, no separate "trivial" heuristic beyond that.

## 9. Add/remove table behavior

- **Add** (Sidebar `+`, Phase 2, dispatches `ADD_TABLE`): the new tableId has no `positions` entry → incremental layout step places it (adjacent to a join partner if one already exists, otherwise as a new component/row) → newly added card becomes the current `selection` (so Phase 4's Inspector will show it immediately once wired).
- **Remove** (TableCard's own remove control, dispatches existing `REMOVE_TABLE`): domain cascade (fields/joins/grouping/etc.) is already handled by the reducer; Structure only clears that id from `positions`/`manuallyPositioned`, and clears `selection` if it pointed at the removed table/one of its removed joins.

## 10. Package/query switching

- On `SET_ACTIVE_BATCH`/`SET_ACTIVE_QUERY`/`LOAD_BATCH`, `state.selectedTables`/`state.joins` swap to a different step's data (different, non-overlapping tableIds). Cards for the previous step simply stop rendering (their ids aren't in the new `selectedTables`); the new step's tables get auto-laid-out on first visit exactly like §9's add-case, or **reuse their previously-computed positions** if this step was visited earlier in the same session (free property of the flat, globally-keyed position map).
- `selection` is always cleared on any package/query switch (an id from a step that's no longer visible would be a dangling reference).

## 11. Performance (8–12 tables / 10–15 joins)

- Trivial scale: ~12 DOM cards + ~15×2 SVG paths + labels — a few dozen nodes total, no virtualization needed.
- `React.memo` on `TableCard`/`JoinLine` keyed by their own minimal props (their own position/size/selection-state/fields — not the whole `QueryState`) so dragging one card doesn't re-render the other eleven.
- Pan/zoom only updates the single outer transform — GPU-composited, no per-card reflow.
- Drag updates batched by React 18's automatic batching; no custom rAF loop needed at this node count (note it as a fallback if a later profiling pass at higher scale shows jank — not needed now).

## 12. Accessibility / keyboard

- Baseline only (full spatial keyboard navigation is explicitly Phase 17, later): every interactive control (card's own action buttons, JOIN hit-path, minimap) is a real focusable/activatable element (`<button>`/`role="button"`, `tabIndex=0`, Enter/Space activation) — not a bare `onClick` div.
- `aria-label` on each JOIN hit-path (e.g. "Join: Заказ → Контрагент, LEFT") gives a screen-reader user *some* information even without visual graph comprehension.
- No arrow-key card-to-card navigation model in Phase 3 — explicitly deferred to Phase 17 alongside drag field-to-field and find/focus helpers.

## 13. Reusable seams for Phase 4/5/6

- `selection: { kind:'table'; tableId:string } | { kind:'join'; joinIndex:number } | null` — owned one level up, at the **Workspace container**, not inside Structure itself, so it's a sibling-shared value: Structure *sets* it, Inspector (Phase 4) *reads* it, Focus (Phase 5) derives dim/emphasis purely from it, Joins Overview (Phase 6) both reads and sets it (list row click ↔ canvas join selection, bidirectional, same piece of state — exactly what the roadmap's Phase 6 spec asks for).
- A small pure helper `neighborsOf(selection, joins)` (derived, not stored) returns the set of tableIds/joinIndexes "related" to the current selection — reusable by Phase 5's dimming logic and Phase 6's "highlight related" list rendering, computed fresh from `state.joins` each time (no cache invalidation to get wrong).
- `positions`/`cardSize`/pan-zoom stay Structure-internal (Inspector doesn't need pixel coordinates).

## A vs B — renderer choice

| | **A. Custom lightweight SVG/React** | **B. Graph/canvas library (react-flow, d3, cytoscape.js, jointjs, …)** |
|---|---|---|
| Bundle cost | ~0kb added (React already bundled) | +90–120kb gzip (react-flow) to +400–600kb (cytoscape/jointjs) added to a webview loaded on every panel open |
| Layout control | Exact BFS/layered per roadmap; trivial to keep "no force-directed" | Most libraries default to force-directed; steering them to layered/BFS-only is extra integration work, not less |
| Visual precision | Pixel-exact 240px cards, 27–30px rows, 2px/8–10px hit split, VS Code CSS-var theming — plain code, no fighting a library's own opinions | Node-content is usually pluggable (mitigates some of this), but pan/zoom, edge routing, and theming remain library-owned abstractions to bridge |
| State model | One flat position map + one selection value; fits directly into the "Canvas UI state ≠ QueryState" architecture | Own node/edge arrays typically required — needs an adapter layer to/from `QueryState`, doubling state to keep in sync |
| Scale fit | 8–12 nodes / 10–15 edges is well inside "hand-rolled BFS is ~150–250 lines" territory | Solves problems (thousands of nodes, force simulation, complex routing) this project doesn't have yet |
| Maintenance | Same team, same token system (`theme.ts`), fully debuggable | New dependency surface, version upgrades, license review, CSP/webview compatibility to verify |

**Recommendation: A.** At this explicit, bounded scale (8–12/10–15, confirmed by roadmap's own STOP 1 validation criteria) a self-built renderer is less code, less risk, and stays inside the architecture's existing conventions. Revisit B only if STOP 1's real-scale validation (Phase 3 roadmap gate) reveals the custom renderer breaking down at scale meaningfully larger than what's specified today — not preemptively.

## Component / file architecture

```
src/webview-canvas/structure/
  StructureWorkspace.tsx   — container: owns pan/zoom + positions + manuallyPositioned state,
                             renders Toolbar + CanvasSurface + Minimap, wires dispatch
  Toolbar.tsx              — "− 100% + · Fit · Auto Layout · Зв'язки N" (spec §11)
                             ("+ Джерело" deferred — Sidebar already covers add-source, see Risks)
  CanvasSurface.tsx        — the transformed SVG+HTML viewport; background pan/zoom handlers,
                             background-click clears selection
  TableCard.tsx            — header (color badge + name/alias read-only + remove), field
                             checkboxes (ADD_FIELD/REMOVE_FIELD/ADD_ALL_FIELDS_DUP), virtual-
                             table indicator, drag handling, click → selection
  JoinLine.tsx             — anchor computation, visible+hit-target paths, label pill,
                             hover/selected state, click → selection
  Minimap.tsx              — scaled overview + draggable viewport rect
  layout.ts                — pure BFS/layered algorithm: (tables, joins, existingPositions) →
                             position patch. No React; unit-testable like the rest of core/query.
  geometry.ts              — pure: anchor points, world↔screen transforms, bounding box,
                             zoom-to-cursor math. No React; unit-testable.
  colors.ts                — cyclic table-identity color assignment by first-appearance order
                             (presentational only, not domain)
  useCanvasTransform.ts    — hook: {zoom, pan, screenToWorld, worldToScreen} + wheel/drag handlers
  usePositions.ts          — hook: positions/manuallyPositioned state + auto-layout effect for
                             newly-visible tableIds (add / package switch)
```

`Workspace.tsx` (existing) renders `<StructureWorkspace .../>` when the active tab is `structure`, replacing the Phase 1/2 placeholder for that one tab only; other tabs keep their placeholder. `selection` state is introduced in `App.tsx` (or a thin `useStructureSelection` hook called from there) as the shared seam for Phase 4/5/6 described in §13 — passed down to `Workspace`/`StructureWorkspace` (sets it) and, from Phase 4 onward, to `Inspector` (reads it); Phase 3 wires the prop through but Inspector's own rendering stays the static Phase-1 placeholder until Phase 4.

## State model

- Domain (`QueryState`, unchanged): `selectedTables`, `selectedFields`, `joins`, `syntheticTables`/`metadataCatalogRef` (via `allTables`).
- Canvas-local, Structure-owned: `positions`, `manuallyPositioned`, `cardSize`, pan/zoom (`useCanvasTransform`).
- Canvas-local, Workspace-owned (shared with future Inspector/Focus/Joins Overview): `selection`.
- Nothing here is written back into `QueryState` or `messages.ts`.

## Interaction model

- Background drag → pan. Background click → clear `selection`.
- Card drag → move (updates `positions`, marks `manuallyPositioned`); card click → `selection = {kind:'table', tableId}`.
- Card field checkbox toggle → `ADD_FIELD`/`REMOVE_FIELD` (existing actions).
- Card remove button → `REMOVE_TABLE` + local cleanup (§9).
- JOIN hit-path click → `selection = {kind:'join', joinIndex}`; hover → visual emphasis only, no state write.
- Wheel → zoom-to-cursor. Toolbar `−`/`+`/`100%`/`Fit`/`Auto Layout` → transform/layout resets described in §2/§4.
- Minimap click/drag → re-center pan.

## Layout algorithm (summary — full detail in §4/§5 of the numbered answers above)

BFS per connected component over the `leftTableId↔rightTableId` adjacency implied by `state.joins` (join `depth`/`seedTableId`/`joinedTableId` are TEXT-chain metadata, irrelevant to graph layout) → layer index = row (top-to-bottom, matches spec's reference screen), position-within-layer = column (left-to-right) → components stacked side by side so disconnected fragments never overlap. Applied only to tableIds without an existing `positions` entry (or all of them, on explicit "Auto Layout").

## Rendering strategy

HTML `<div>` cards + sibling SVG line layer, both under one shared `transform: translate() scale()` wrapper (§1) — no `foreignObject`, no graph library (see A vs B above).

## Risks

1. **Toolbar "+ Джерело"** (spec §11) duplicates Sidebar's Phase 2 add-source affordance — recommend deferring a canvas-toolbar add-source control (or having it just focus/open the Sidebar's Metadata tab) rather than building a second picker; flagging for explicit confirmation before Phase 3 coding starts.
2. **Card height variability** (virtual-table badge, long field lists) makes anchor-point computation depend on *measured* height, not just a constant — mitigated by the default-estimate-then-measure approach in §6, but worth calling out as the one place where a visual "settle" frame could be visible on first render.
3. **`REMOVE_FIELD` needs an index lookup** by (tableId, path) done in TableCard/app code, not the reducer — low risk, but must be implemented carefully to avoid off-by-one bugs when multiple fields share a path (duplicates are allowed by domain design).
4. **Multi-conjunct joins** rendering as a single line is a simplification the domain fully supports (each `Join` = one line regardless of conjunct count) — no risk, just worth stating so Phase 4's Inspector is understood as the place where conjunct-level detail appears.

## Acceptance criteria (for the eventual Phase 3 implementation, not this design pass)

- Adding a source via Sidebar `+` renders a new TableCard at a sensible auto-layout position within one frame.
- Dragging a card updates its position immediately and persists across an unrelated re-render (e.g., toggling a different card's field checkbox).
- Toggling a field checkbox on a card dispatches `ADD_FIELD`/`REMOVE_FIELD` and the checkbox state matches `state.selectedFields` exactly (no local field-selection state duplicated).
- Every `Join` in `state.joins` renders exactly one line with a correct LEFT/INNER/FULL label derived from `leftAll`/`rightAll`.
- Clicking a join's hit-path (not just the visible 2px stroke) selects it; clicking empty canvas clears selection.
- Switching package/query (Sidebar Phase 2) swaps the visible card set with no crash, no stale selection, and previously-visited steps keep their prior layout.
- Removing a table removes its card, its joins, and clears selection if it was targeted — no orphaned position/selection entries left behind.
- At 8–12 tables / 10–15 joins, dragging/panning/zooming stays visually smooth (no dropped frames under casual manual testing).
- Minimap appears only when content exceeds the viewport and correctly re-centers pan on click.
- `npm run typecheck` / `build` / unit+integration tests all stay green; no change to `messages.ts`, `queryStore.ts`, or `queryModel.ts`.

## Implementation breakdown (small sub-steps, for when coding is approved)

1. `geometry.ts` + `layout.ts` as pure, unit-tested modules (no React, no rendering) — verify BFS/anchor/transform math in isolation first.
2. `useCanvasTransform` + empty `CanvasSurface` (pan/zoom on a blank grid, no cards yet) — verify pan/zoom feel before adding content.
3. `TableCard` (static props, no drag yet) + `usePositions` wired to real `state.selectedTables` — cards appear at auto-layout positions, read-only.
4. Card drag (`manuallyPositioned`) + remove button (`REMOVE_TABLE`) + field checkboxes (`ADD_FIELD`/`REMOVE_FIELD`).
5. `JoinLine` (visible+hit-target paths, label, anchor computation) wired to real `state.joins`.
6. `selection` state lifted to Workspace container; card/join/background click wiring; background-click-clears.
7. `Minimap`.
8. Toolbar (`−`/`+`/`100%`/`Fit`/`Auto Layout`/join count) — resolve the "+ Джерело" question from Risks before or during this step.
9. Package/query-switch behavior (§10) + add/remove edge cases (§9) verified against the real reducer via manual multi-step package testing.
10. Full typecheck/build/unit/integration pass; visual check against spec §11–§15, §34.
