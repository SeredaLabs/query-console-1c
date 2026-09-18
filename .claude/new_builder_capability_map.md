# New Builder — Capability Map

> STATUS: FILLED after repository audit, 2026-09-12.
> Repository: `SeredaLabs/query-console-1c`, branch `main`, HEAD `efc0a78`.

## ⚠️ Headline finding (overrides the pack's own premise)

`src/webview-canvas/` **does not exist**. Not partially built — absent entirely:

- No directory `src/webview-canvas/` anywhere in the working tree, in any local
  branch (`main`, `fix/field-type-qualifiers-and-timestamp`, `tmp-merge-test`,
  `claude/gracious-saha-8df1ba`), or in `remotes/origin/*` / `remotes/upstream/*`.
- No `out/webview/canvas.js` build target — `package.json`'s `build:webview`
  script only bundles `src/webview/main.tsx`.
- No extension-side registration: `src/extension/` has no `canvasPanel.ts`
  (checked — only `panel.ts`, the Classic panel). `package.json` `contributes.commands`
  defines only `1c.queryConstructor` / `1c.queryConstructorWithResult` /
  `1c.parseMetadata` — no "New Builder" / canvas command.
- No protocol surface: `src/shared/messages.ts` (21 lines total) has exactly six
  `HostMsg` variants and five `WebviewMsg` variants, all Classic-oriented
  (`metadataTree`, `refFields`, `generatedText`, `generate`, etc.) — no
  canvas-specific message type.
- Zero hits anywhere in `src/` for any of: `TableCard`, `JoinInspector`,
  `VirtualParamsPanel`, `TablePropertiesPanel`, `minimap`, `BFS`, `autoLayout`,
  `zoom` (checked via `grep -rl` across `src/`).
- The one artifact that looked promising, `out/test-integration/src/extension/canvasPanel.js`
  (built today, mtime 14:51), is a **stale/orphaned build output** — `out/` is
  git-ignored, its sourcemap points at `src/extension/canvasPanel.ts`, which does
  not exist in the working tree and has never existed in git history
  (`git log --all -- '*canvas*'` and `git log --all -S webview-canvas` both empty).
  It is leftover from some earlier, never-committed local experiment; not evidence
  of a real Canvas implementation.

**Consequence**: every statement in the supplied `new_builder_current_state.md`
about "поточний Canvas shell" (top row, sidebar modes, tab strip, TableCard,
JoinInspector, minimap, layered/BFS auto-layout, etc.) describes something that
is not in this repository. Per the audit's own anti-hallucination rule ("не
покладайся на markdown як на доказ реалізації"), that document is **not
evidence** — it reads as aspirational/pre-written documentation for a build that
was never started here (or was built and lost outside git). The roadmap's
framing of Phase 1–6 as "wire up / extend the existing Canvas shell" does not
match reality: Phase 1 is a from-scratch webview app, bundle target, extension
command, and panel — not a refactor.

This does **not** block planning — it changes what Phase 1 actually is (build,
not extend) and means "Current Canvas" in every row below is uniformly `N/A —
component does not exist`, never partial credit.

## Shared core — confirmed rich and mature

By contrast, the shared domain core is real, large, and evidently
battle-tested (referenced golden corpus of ~1976 queries, extensive
`test/unit/corpus*.test.ts` suite, `queryModel.ts` carries dozens of
phase-numbered inline comments documenting resolved edge cases going back
through "фаза 6.12" … "фаза 8.3.2"). Key files:

- [`src/core/query/queryModel.ts`](src/core/query/queryModel.ts) — `QueryModel`, `SelectedTable`, `SelectedField`,
  `Grouping`, `Condition`, `Join`/`JoinCondition`, `Order`, `Totals`, `Indexing`,
  `ReportBuilder`, `Selection`, `QueryType` (668 lines).
- [`src/core/query/unionModel.ts`](src/core/query/unionModel.ts) — `QueryDocument`/`UnionMember` (UNION representation).
- [`src/core/query/batchModel.ts`](src/core/query/batchModel.ts) — `BatchDocument` (package/batch of queries).
- [`src/webview/state/queryStore.ts`](src/webview/state/queryStore.ts) (1788 lines) + `queryStore/snapshots.ts` — `QueryState`,
  `QueryAction` (full reducer, ~90 action types), `initialState()`.
- [`src/shared/messages.ts`](src/shared/messages.ts) — Host↔Webview protocol (Classic only, as noted above).
- [`src/core/query/sdblGenerator.ts`](src/core/query/sdblGenerator.ts) (3161 lines) — model → SDBL text.
- [`src/core/query/sdblParser.ts`](src/core/query/sdblParser.ts) (5400 lines) — SDBL text → model (round-trip).
- Classic UI reference: `src/webview/components/*.tsx` (28 files — `TablesPanel`,
  `FieldsPanel`, `ConnectionsTab` (joins), `ConditionsTab`, `GroupingTab`,
  `OrderTab`, `AdditionalTab`, `IndexTab`, `BatchTab`, `UnionsTab`, `BuilderTab`,
  `ExpressionBuilder`, `VirtualTableParamsDialog`, `TempTableDialog`,
  `QueryStructurePanel`, `CodeEditor` (CodeMirror 6-based), etc.)

## Status values

- `SUPPORTED` — domain+reducer+generator+parser all confirmed; only a Canvas UI needs building.
- `UI_ONLY_REFACTOR` — presentation-only change, no domain/reducer touch.
- `DOMAIN_SUPPORTED_CANVAS_MISSING` — same as SUPPORTED but calling it out because Canvas has literally zero existing UI to reuse (applies to nearly every row, see headline finding).
- `REQUIRES_DOMAIN_CHANGE` — needs new `QueryModel`/reducer/parser/generator surface.
- `DEFERRED` — explicitly out of scope for now per roadmap/spec.
- `UNKNOWN` — not enough evidence found; do not implement against this.

## Matrix

| Capability | Domain field/type | Reducer/action | Classic reference | Current Canvas | Generator | Parser | Target UI | Status | Core change? | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| Add source | `QueryModel.tables: SelectedTable[]` (queryModel.ts:79-101) | `ADD_TABLE` (queryStore.ts:565-588), `ADD_FIELD_WITH_TABLE`, `ADD_ALL_FIELDS_WITH_TABLE` | `TablesPanel.tsx`, `DbTreePanel.tsx` | N/A — no Canvas exists | `sdblGenerator.ts` FROM-clause rendering | `sdblParser.ts` table-source parsing | Structure | SUPPORTED | NO | queryStore.ts:565-588 |
| Remove source | same | `REMOVE_TABLE` (queryStore.ts:590-638, cascades fields/joins/grouping/order/totals/indexing) | `TablesPanel.tsx` | N/A | n/a (removal) | n/a | Structure | SUPPORTED | NO | queryStore.ts:590-638 |
| Select result field | `SelectedField` (queryModel.ts:103-174) | `ADD_FIELD`, `ADD_FIELD_WITH_TABLE`, `ADD_ALL_FIELDS_WITH_TABLE`, `ADD_ALL_FIELDS_DUP`, `REMOVE_FIELD` | `FieldsPanel.tsx` | N/A | field-list rendering, `fieldExpr()` | field-list parsing | Structure/Fields | SUPPORTED | NO | queryStore.ts:640-724, 973-1006 |
| Reorder result fields | `SelectedField[]` order in array | `MOVE_UNION_COLUMN` (queryStore.ts:1384-1405) — swaps position i/i±1 across all union members; works for a single non-union query too since it's a positional array swap | `UnionsTab.tsx` (framed as union-column reorder, not a general "Fields" reorder UI) | N/A | positional order = array order | positional order = array order | Fields | SUPPORTED but UI-repurposed — action is named/designed for union alignment; using it as "drag row up/down" in a plain Fields workspace is a legitimate reuse, not a new action | NO | queryStore.ts:1384-1405 |
| Field alias | `SelectedField.alias` | `SET_COLUMN_ALIAS` (rename by matching alias, queryStore.ts:1371-1382), also settable via `SET_FIELD_EXPRESSION` | `FieldsPanel.tsx` | N/A | alias rendering (`КАК <alias>`) | alias parsing | Fields/Inspector | SUPPORTED | NO | queryStore.ts:1371-1382 |
| Arbitrary expression (field) | `SelectedField.expression`, `ADD_EXPRESSION_FIELD` | `SET_FIELD_EXPRESSION` (queryStore.ts:726-766), `ADD_EXPRESSION_FIELD` (queryStore.ts:1023-1027) | `ExpressionBuilder.tsx`, `CodeEditor.tsx` (CodeMirror 6 — already a bundled dependency, see package.json:169-175) | N/A | expression pass-through rendering | expression capture (raw text) | Fields/etc. | SUPPORTED | NO | queryStore.ts:726-766, 1023-1027 |
| Add JOIN | `Join` (queryModel.ts:512-585) | `ADD_JOIN` (queryStore.ts:1163-1175, requires ≥2 selected tables) | `ConnectionsTab.tsx` | N/A | JOIN clause rendering incl. right-nesting (depth) | JOIN parsing incl. chain seed/joined table order | Structure | SUPPORTED | NO | queryStore.ts:1163-1175 |
| JOIN kind | `Join.leftAll/rightAll` (→ inner/left/full, queryModel.ts:487,518-520) | `SET_JOIN_ALL` (queryStore.ts:1224-1231) | `ConnectionsTab.tsx` | N/A | kind rendering | kind parsing | Inspector | SUPPORTED | NO | queryStore.ts:1224-1231 |
| Multiple JOIN conditions (per-join AND conjuncts) | `Join.conditions?: JoinCondition[]` (queryModel.ts:501-510, 584) | `ADD_JOIN_CONDITION`/`REMOVE_JOIN_CONDITION`/`updateJoinConjunct` (queryStore.ts:1180-1245, 521-540) | `ConnectionsTab.tsx` | N/A | per-conjunct rendering with custom/standard split | per-conjunct parsing | Inspector | SUPPORTED | NO | queryStore.ts:1180-1245 |
| Virtual table params | `SelectedTable.virtual: VirtualParams` (queryModel.ts:3-42, positional layouts in `accountingPositionKeys`) | `SET_VIRTUAL_PARAMS` (queryStore.ts:1014-1021) | `VirtualTableParamsDialog.tsx` | N/A | `accountingVirtualParams.ts`/`accumVirtualFields.ts` rendering | same modules, parse side | Inspector | SUPPORTED | NO | queryStore.ts:1014-1021, queryModel.ts:3-77 |
| WHERE condition (flat, ANDed) | `QueryModel.conditions?: Condition[]` (queryModel.ts:299-339, 608) | `ADD_CONDITION`/`REMOVE_CONDITION`/`SET_CONDITION_*` (queryStore.ts:1120-1161) | `ConditionsTab.tsx` | N/A | `buildConditionStrings()` (sdblGenerator.ts:3041+) | condition parsing | Conditions | SUPPORTED (flat AND list only — see next row) | NO | queryStore.ts:1120-1161 |
| AND/OR nesting (structured tree, per visual spec §19) | **none** — `Condition[]` is a flat top-level list joined by `И`; the only way to express `ИЛИ`/nested grouping is one `Condition.custom=true` with a hand-written `expression` string (raw text, opaque to the domain model) | none — no group/children/logicalOp concept in reducer | `ConditionsTab.tsx` offers the same flat list + a free-text "custom" toggle, no visual tree | N/A | generator prints the flat list with `И`; a `custom` condition's raw text is passed through verbatim (so `A ИЛИ B` can appear only as literal text inside one condition slot) | parser captures `custom`/`expression` as opaque text, does not parse internal `И`/`ИЛИ` structure into a tree | Conditions | **REQUIRES_DOMAIN_CHANGE** to get real structural add-group/nest-condition UI; visualizing the *existing* flat-AND-plus-opaque-custom-text model is UI_ONLY_REFACTOR but is materially less than what the visual spec §19 mockup shows (nested "Будь-яка з умов OR" groups) | YES (if structural nesting is required) | queryModel.ts:299-339; sdblGenerator.ts:3041-3080 |
| Query params (`&Name`) | **not a domain field** — params are ad-hoc `&Name` substrings inside `Condition.param`/`expression`/etc.; read-only derived list via `QueryAnalysisParameter` (queryAnalysisService.ts) | none (no ADD/EDIT/REMOVE-parameter action; params aren't a first-class collection) | `QueryParametersPanel.tsx` — read-only, navigate-to-usage only | N/A | n/a (params are literal text, printed wherever they appear) | n/a | Conditions | SUPPORTED as read-only derived analysis; "manage parameters" as an editable list is **UNKNOWN/not modeled** — there is no reducer concept of a parameter registry | NO for read-only view; UNKNOWN for any "parameter list CRUD" UI | src/webview/components/QueryParametersPanel.tsx:1-13 |
| Grouping | `Grouping.groupFields`/`groupSets`/`multiple` (queryModel.ts:279-295) | `ADD_GROUP_FIELD`/`REMOVE_GROUP_FIELD`/`SET_GROUPING_MULTIPLE`/`ADD_GROUP_SET`/etc. (queryStore.ts:1029-1119) | `GroupingTab.tsx` | N/A | `СГРУППИРОВАТЬ ПО` / `… ПО ГРУППИРУЮЩИМ НАБОРАМ` rendering (sdblGenerator.ts:2994) | grouping parsing | Grouping | SUPPORTED | NO | queryStore.ts:1029-1119 |
| Aggregates | `SummableField` (queryModel.ts:275-277), `Grouping.aggregates` | `ADD_SUMMABLE_FIELD`/`REMOVE_SUMMABLE_FIELD`/`SET_SUMMABLE_FUNC` (queryStore.ts:1056-1091) | `GroupingTab.tsx` | N/A | aggregate wrapping (`СУММА(…)` etc., queryModel.ts:245-247) | aggregate parsing | Grouping/Fields | SUPPORTED | NO | queryStore.ts:1056-1091 |
| Totals | `Totals` (queryModel.ts:374-408) | `ADD_TOTAL_GROUP_FIELD`/`ADD_TOTAL_FIELD`/`SET_TOTAL_GRAND`/etc. (queryStore.ts:1563-1655) | `TotalsTab.tsx` | N/A | `ИТОГИ … ПО …` rendering | totals parsing | Grouping | SUPPORTED | NO | queryStore.ts:1563-1655 |
| Hierarchical totals | `TotalGroupField.kind: TotalKind` (`'elements'\|'hierarchy'\|'onlyHierarchy'`, queryModel.ts:342-372) | `SET_TOTAL_GROUP_KIND` (queryStore.ts:1583-1594) | `TotalsTab.tsx` | N/A | `ИЕРАРХИЯ`/`ТОЛЬКО ИЕРАРХИЯ` rendering | kind parsing | Grouping | SUPPORTED | NO | queryStore.ts:1583-1594 |
| Sorting | `Order.fields: OrderField[]` (queryModel.ts:448-478) | `ADD_ORDER_FIELD`/`REMOVE_ORDER_FIELD`/`SET_ORDER_DIRECTION` (queryStore.ts:1530-1558) | `OrderTab.tsx` | N/A | `УПОРЯДОЧИТЬ ПО` rendering (incl. `ИЕРАРХИЯ` suffix) | order parsing | Sorting | SUPPORTED | NO | queryStore.ts:1530-1558 |
| Sorting — reorder | no move action for `Order.fields` (unlike `MOVE_INDEX_FIELD`/`MOVE_UNION_COLUMN`) | confirmed absent — `OrderTab.tsx` only wires `onAddOrderField`/`onRemoveOrderField`/drag-in via `useFieldDragDrop` (OrderTab.tsx:6,15,36), no move-up/down handler anywhere | `OrderTab.tsx` — remove+re-add only (re-add appends at end, does not reposition) | N/A | array order = SQL order | array order = SQL order | Sorting | **REQUIRES_DOMAIN_CHANGE (reducer only)** — Classic itself cannot reorder existing sort fields in place; a `MOVE_ORDER_FIELD` action analogous to `MOVE_INDEX_FIELD` would be new reducer surface, not a rediscovery of hidden Classic capability | YES (reducer addition, small) | OrderTab.tsx:6,15,36 (grep for move/drag handlers on existing rows: none) |
| Auto ordering | `Order.auto: boolean` | `SET_ORDER_AUTO` (queryStore.ts:1560-1561) | `OrderTab.tsx` | N/A | `АВТОУПОРЯДОЧИВАНИЕ` rendering | auto-order parsing | Sorting | SUPPORTED | NO | queryStore.ts:1560-1561 |
| DISTINCT | `Selection.distinct` (queryModel.ts:592) | `SET_SELECTION_DISTINCT` (queryStore.ts:1257-1258) | `AdditionalTab.tsx` | N/A | `РАЗЛИЧНЫЕ` (sdblGenerator.ts:941-947) | selection-modifier parsing | Additional | SUPPORTED | NO | queryStore.ts:1257-1258; sdblGenerator.ts:941-947 |
| TOP/FIRST | `Selection.top` (queryModel.ts:589) | `SET_SELECTION_TOP` (queryStore.ts:1247-1255) | `AdditionalTab.tsx` | N/A | `ПЕРВЫЕ N` (sdblGenerator.ts:948-950) | parsing | Additional | SUPPORTED | NO | queryStore.ts:1247-1255 |
| ALLOWED | `Selection.allowed` (queryModel.ts:594) | `SET_SELECTION_ALLOWED` (queryStore.ts:1260-1261) | `AdditionalTab.tsx` | N/A | `РАЗРЕШЕННЫЕ` (sdblGenerator.ts:945) | parsing | Additional | SUPPORTED | NO | queryStore.ts:1260-1261 |
| FOR UPDATE / locking | `QueryModel.lockForUpdate`/`lockForUpdateBare` (queryModel.ts:626-632) | `SET_LOCK_ENABLED`/`ADD_LOCK_TABLE`/`REMOVE_LOCK_TABLE` (queryStore.ts:1282-1295) | `AdditionalTab.tsx` | N/A | `ДЛЯ ИЗМЕНЕНИЯ …` (sdblGenerator.ts:1650-1656) | parsing | Additional | SUPPORTED — note this is query-level (all-or-named-sources), NOT per-table filters as roadmap Phase 11 warns | NO | queryStore.ts:1282-1295 |
| Package query (batch of queries) | `BatchDocument` (batchModel.ts), `QueryState.batchSaved`/`activeBatch` | `ADD_BATCH_QUERY`/`SET_ACTIVE_BATCH`/`REMOVE_BATCH_QUERY`/`MOVE_BATCH_QUERY`/`LOAD_BATCH` (queryStore.ts:1407-1528) | `BatchTab.tsx` | N/A | `assembleBatch` (queryStore/snapshots.ts) → sequential SDBL blocks | full batch parsing (`parseBatch`) | Package | SUPPORTED — confirmed **ordered sequence**, not a graph (matches roadmap Phase 2 assumption) | NO | queryStore.ts:1407-1528 |
| Temp table create/append/drop | `QueryModel.queryType: 'select'\|'createTemp'\|'appendTemp'\|'dropTemp'` (queryModel.ts:598) | `SET_QUERY_TYPE` (queryStore.ts:1263-1271), `ADD_TEMP_TABLE`/`UPDATE_TEMP_TABLE` (queryStore.ts:782-870) | `TempTableDialog.tsx`, `BatchTab.tsx` | N/A | `ПОМЕСТИТЬ`/`ДОБАВИТЬ`/`УНИЧТОЖИТЬ` rendering | parsing + `tempTable` flag synthesis (queryStore.ts:355-387) | Package/Additional | SUPPORTED | NO | queryStore.ts:782-870, 1263-1271 |
| Temp table indexes | `Indexing.indexes: QueryIndex[]` (queryModel.ts:410-420) | `ADD_INDEX`/`SET_INDEX_UNIQUE`/`ADD_INDEX_FIELD`/`MOVE_INDEX_FIELD`/etc. (queryStore.ts:1687-1782) | `IndexTab.tsx` | N/A | `ИНДЕКСИРОВАТЬ ПО [НАБОРАМ]` (sdblGenerator.ts:2324-2371) | index parsing | Package/Additional | SUPPORTED | NO | queryStore.ts:1687-1782 |
| Subquery as source | `SelectedTable.subquery: QueryDocument` (queryModel.ts:92-93) | `ADD_SUBQUERY_TABLE`/`UPDATE_SUBQUERY_TABLE` (queryStore.ts:768-780, 872-924) | `TablesPanel.tsx` (nested constructor dialog) | N/A | nested-query rendering (indented `(ВЫБРАТЬ …)`) | subquery-source parsing + synthetic metatable columns | Structure | SUPPORTED | NO | queryStore.ts:768-780, 872-924 |
| UNION / UNION ALL | `UnionMember.distinct` (unionModel.ts:4-10), `QueryDocument.members` | `ADD_QUERY`/`SET_ACTIVE_QUERY`/`REMOVE_QUERY`/`SET_QUERY_DISTINCT`/`MOVE_UNION_COLUMN` (queryStore.ts:1297-1405) | `UnionsTab.tsx` | N/A | `ОБЪЕДИНИТЬ`/`ОБЪЕДИНИТЬ ВСЕ` separators (sdblGenerator.ts:116-130, 2491+) | union parsing | UNION | SUPPORTED — confirmed **positional** column alignment (by index, not by alias/explicit mapping) via `deriveUnionColumns`/`orderedSelectElements` (unionModel.ts:54-103); matches roadmap Phase 14's stated assumption exactly | NO | unionModel.ts:54-129 |
| SDBL generation | n/a | n/a | live preview in `App.tsx`/`ConstructorView.tsx` | N/A (no SDBL dock in Canvas at all) | `sdblGenerator.ts` (3161 lines), `generate()` entry point | n/a | SDBL Dock | SUPPORTED (engine); Canvas-side read-only dock UI must be built from scratch | NO | src/core/query/sdblGenerator.ts |
| SDBL round-trip (parse→model→generate) | n/a | `LOAD_BATCH` consumes `parseBatch()` output | `QueryTextDialog.tsx` ("open from text") | N/A | n/a | `sdblParser.ts` (5400 lines), `parseBatch()`; validated against `test/fixtures/corpus` + `test/unit/corpus*.test.ts` (golden-corpus regression suite) | internal | SUPPORTED, extensively tested | NO | src/core/query/sdblParser.ts; test/unit/corpus*.test.ts |
| Table alias editing (rename an already-added source's alias) | `SelectedTable.alias` field exists | **no action found** — grepped `queryStore.ts`/`snapshots.ts` for `TABLE_ALIAS`/`tableAlias`/`RENAME_TABLE`/`SET_ALIAS`: zero matches | not present in `TablesPanel.tsx` either (per `current_state.md`'s own claim, now verified) | N/A | alias read from field, no write path from UI | alias parsed from source text (`ИЗ X КАК Alias`) fine — just no *interactive* edit | Structure/Inspector | **REQUIRES_DOMAIN_CHANGE** — needs a new reducer action (e.g. `SET_TABLE_ALIAS`); QueryModel field already exists so it's a small, contained addition, but it is still a reducer semantic change and must go through the approval gate, not be silently added | YES (reducer only, not QueryModel) | grep across queryStore.ts + snapshots.ts: no match |

## Audit conclusion

### Safe UI-only work

Everything in the matrix marked `SUPPORTED` is safe to build Canvas UI for
without touching `src/core/query/*`, the reducer's action *shapes*, or
`src/shared/messages.ts` — which is the overwhelming majority of the roadmap's
Phase 1–15 scope (Structure, Fields incl. reorder-via-`MOVE_UNION_COLUMN`,
Conditions as flat-AND, Grouping, Totals, Sorting except reorder, Additional,
Package, Temp tables, Subquery sources, UNION, SDBL dock, SDBL round-trip).

None of this UI exists yet in `src/webview-canvas/` — it all has to be *built*,
not *refactored*, but building it requires zero domain/reducer/protocol
changes.

### Domain-supported but missing in Canvas

Effectively **the entire feature set** — because Canvas has zero UI today.
This is not a short list of gaps layered on an otherwise-working Canvas; it is
the complete inventory of Classic's capabilities, all of which are
domain-ready and none of which have any Canvas presentation yet.

### Requires domain change

1. **AND/OR nested condition groups** (visual spec §19's "Будь-яка з умов OR"
   nested tree) — `Condition[]` is a flat AND list today; true structural
   nesting needs a new tree-shaped representation in `QueryModel`, reducer,
   parser, and generator. Building the Conditions workspace on the *current*
   flat-AND model is fine (UI_ONLY_REFACTOR); promising the nested-tree mockup
   literally is not, without this change.
2. **Table alias editing** — small, contained (`SelectedTable.alias` already
   exists in the domain type), but there is no reducer action for it today. A
   `SET_TABLE_ALIAS` action is a minimal, well-scoped reducer addition — still
   requires the explicit approval gate per the roadmap's own rule, even though
   risk is low.
3. **Query parameters as an editable, first-class collection** (if the Canvas
   Conditions/Additional UX ever wants "manage parameters" beyond the existing
   read-only navigate-to-usage list) — not modeled today; `&Name` is just
   ad-hoc text. Not required by Phase 1–6, flagging for later phases (8/11).
4. **Sort-field reordering** — confirmed absent in Classic too (`OrderTab.tsx`
   has no move handler); a `MOVE_ORDER_FIELD` action would be new reducer
   surface. Relevant to Phase 10 (Sorting), not Phase 1–6.

### Unknown / needs deeper investigation

- **Approved screenshots**: `docs/design/new-builder/` is empty by design (the
  pack's own README says so) — no `structure.png`/`fields.png`/etc. exist, so
  visual-spec ASCII mockups are the only presentation reference right now.
  Presentation source-of-truth chain (`screenshot → visual spec → roadmap →
  current implementation`) currently bottoms out at "visual spec" for every
  screen, since there is no current implementation and no screenshot.

### Recommended Phase 1–6 implementation boundary

Phase 1–6 (Shell, Sidebar 2.0, Structure, Unified Inspector, Focus/Readability,
Joins Overview) as scoped by the roadmap touch **only** `SUPPORTED` capabilities
(sources, joins incl. multi-conjunct, virtual params) — no domain change is
needed for any of them. The only correction to the roadmap's own framing is
that "Phase 1 — New Builder Shell" must include, as prerequisite/expanded
scope: creating `src/webview-canvas/` from scratch, an esbuild target, an
extension-side panel + command, and a message-protocol decision (reuse
`src/shared/messages.ts` as-is, since Structure/Inspector/Focus/Joins-Overview
need nothing beyond `metadataTree`/`generatedText`/`generate`/`ready` — this
was verified, not assumed).
