# Canvas roadmap reconciliation

Audit: 2026-09-30, continuing the [feature-baseline implementation](feature-baseline.md).
This reconciles historical requirements; it does not restart that audit or
supersede the shared model. Current status belongs in the
[technical-debt ledger](../../development/technical-debt.md), with capability
and preservation contracts in the feature-baseline matrix. Phase numbers are
historical references, not a completion algorithm.

## Provenance and search boundary

The tracked history under `.claude/` contains requirements missing from the
current `docs/design/new-builder/` index. Read alongside design/development docs,
Canvas components/tests, Classic ConstructorView, QueryModel, QueryState and
QueryAction:

- `.claude/new_builder_roadmap.md`: introduced at `580a2ea` (2026-09-18),
  already defining Phases **0–18**, STOP 1/2 and a separate technical backlog.
  `123838d` added the 2026-09-24 delivery checkpoint; `92dda51` updated measured
  package navigation. Delivery intentionally departed from phase order.
- `.claude/new_builder_current_state.md`: delivery notes, subphases and the
  recorded STOP 1 browser observation; not current authority for missing UI.
- `.claude/new_builder_capability_map.md`: initial domain/Classic/Canvas audit.
- `.claude/new_builder_phase3_design.md`: graph design and baseline keyboard
  requirements, particularly section 12.
- `.claude/new_builder_visual_spec.md`: visual direction; its numbered sections
  0–37 are **not** additional Canvas phases.
- `.claude/prompts/new_builder_audit.md`: historical audit procedure, not an
  active implementation restriction for this authorized task.

`rg` included hidden tracked files. `git log --all --name-only` identified older
Builder/Canvas documents; roadmap revisions were inspected with `git show`.
`git log --all -G 'Phase (19|[2-9][0-9])|Фаза (19|[2-9][0-9])'` over the Canvas
historical files, design/development roadmap and Canvas source found no Phase
19+. Older `docs/PHASE_0…9` definitions concern **Classic**, not an additional
Canvas sequence. This is the history available in this checkout, not a claim
about unavailable remote branches or external specifications.

## Phase disposition

Statuses describe the **full original intent**, not just baseline acceptance.
PARTIAL can coexist with Feature Baseline Complete when its remaining work has
an explicit preserve/defer contract. The table records the final implemented state, with initial gaps identified where relevant.

| Phase | Original intent | Current implementation | Evidence | Status |
|---|---|---|---|---|
| 0 | Inspect domain/actions/parser/generator and both UIs before code | Historical capability audit plus current before/after matrix | capability map; feature-baseline; QueryModel/queryStore | CLOSED |
| 1 | Document bar, workspace, inspector, dock; resize/scroll boundaries | Separate Canvas shell, six workspaces, shared session; root/nested contexts | App, Workspace, DocumentBar, Inspector, SdblDock; Canvas E2E | CLOSED |
| 2 | Persistent Metadata/Package sidebar, no duplicated chosen sources | Replaced by contextual SourceBrowser and ordered PackageNav | current-state 3E/3E.1; SourceBrowser, PackageNav | OBSOLETE layout; functional intent CLOSED |
| 3 | Sources and JOINs together; drag/zoom/BFS/minimap | Fixed cards, obstacle-aware routes/shared minimap; source/JOIN/minimap Enter/Space added | StructureWorkspace, TableCard, JoinPath, Minimap; geometry/layout/router units; phase3 design §12 | CLOSED |
| 4 | One contextual inspector, local selection, VT editing | Source/JOIN inspection; common VT editor; manual temp/subquery actions | Inspector, SourceDialogs; Canvas E2E | CLOSED |
| 5 | Selected source/neighbors or JOIN/endpoints emphasized; rest dimmed | Derived focus/dimming over existing graph | StructureWorkspace focus memo/isTableDimmed/isJoinDimmed; Canvas focus E2E | CLOSED |
| 6 | Textual JOIN overview synchronized with graph/inspector | Contextual JOIN list shares graph/inspector selection; row Enter/Space added | JoinManagerPopover, Inspector; phase3 design | CLOSED |
| 7 | Ordered scalar results, alias/expression/aggregate | Field CRUD, order and properties, source-less expressions | FieldsWorkspace; queryStore field actions; Canvas E2E | CLOSED; advanced projections PRESERVE |
| 8 | Explain real Boolean model; visual conditions without fake nesting | Flat structured conjunctions and opaque custom expressions; no general Boolean-tree UI | ConditionsWorkspace; Condition/queryStore; preservation E2E | PARTIAL; tree UX DEFERRED |
| 9 | Group fields, aggregates and TOTALS together | Basic grouping plus contextual shared TotalsTab; advanced sets retained | GroupingWorkspace, TotalsEditor; C9/C11, Canvas E2E | CLOSED original baseline; advanced UX deferred |
| 10 | Ordered field/expression sorting, directions and priority reorder if supported | Add/remove/direction/auto; tail-slot fix; loaded hierarchy/order preserved; no MOVE_ORDER action | SortingWorkspace, compoundSections, QueryAction | PARTIAL; priority editing SHOULD |
| 11 | Rare query settings, locking, temp output, indexes | Settings and contextual shared IndexTab | AdditionalWorkspace, IndexEditor, QueryIdentityPopover; E2E | CLOSED |
| 12 | Ordered package and temp continuity, no domain dependency graph | Position-aware producer lifetimes/append/drop; measured responsive navigation | PackageNav; packageNavLayout units; temp lifecycle/store tests | CLOSED; package move UX SHOULD |
| 13 | Manual temp descriptions and recursive source-query drill-down | Isolated local reducer draft, six workspaces, recursive sources/UNION, validated Back; external temp dialog | SourceQueryEditor, sourceQueryDraft, SourceDialogs; unit/browser/real host tests | CLOSED |
| 14 | Audit positional UNION; visualize alignment without new mapping object | Verified scalar alias/reorder, member navigation/ALL; incomplete advanced mapping suppressed with preserve-only notice | UnionMappingPopover, deriveUnionColumns, orderedSelectElements; queryStore UNION actions | PARTIAL; mandatory guard/tests CLOSED; full projection mapping DEFERRED |
| 15 | Read-only highlighted generated SDBL, copy, collapse; investigate cross-highlight | Read-only highlighted/copyable/resizable/collapsible dock verified; keyboard toggle added; no generated-output semantic ranges | SdblDock, CodeEditor, computeBatchTextSafe, generateBatch | PARTIAL; mandatory dock/tests CLOSED; cross-highlight DEFERRED |
| 16 | Reuse expression builder after CRUD; inspect dependencies/bundle | Classic ExpressionBuilder reused contextually for VT/custom fields/WHERE/JOIN create/edit; shared source helper/resolver | ExpressionBuilder, SourceDialogs, FieldsWorkspace, ConditionsWorkspace, Inspector | CLOSED |
| 17 | Field-to-field JOIN drag, shortcuts, find/focus helpers | Card drag/pan/zoom/fit, search, native controls; advanced interactions absent | CanvasSurface, structure/Toolbar, source/field searches | PARTIAL; advanced UX DEFERRED |
| 18 | Icons/typography/spacing/focus/themes/accessibility/minimap polish | Structure tokens/card polish and light/dark styles; no complete release/a11y proof | theme, visual spec, structure components; browser tests | PARTIAL; release review DEFERRED |

Subphase history is retained without inventing new numbered roadmap phases:
3A sources; 3B JOIN; 3C geometry/minimap/performance; 3D visual tokens; 3E sidebar
replacement; 3E.1 anchor/search polish. All delivered, including the baseline keyboard fixes above. Phases 5.1–5.9 cover field-row density, contrast, header band, quiet
inclusion controls, alignment, alpha, tab icons and toolbar reorder: delivered
Structure polish, not a replacement for Phase 18 release review. Phase 12A temp
output UI and 12B lifecycle continuity are delivered and regression protected.

STOP 1 has a historical 2026-09-18 observation of 12 sources/12 JOINs including
VT/disconnected/cyclic cases. Current geometry units and selection/focus browser tests protect bounded
invariants; this audit does not claim a fresh exhaustive live visual review.
STOP 2's old pending browser/parity requirement is superseded by V4 plus the
current production UI and host gates, and the 1976-input two-mode store/core
gate. These prove the stated paths, not live-platform semantic equivalence.

## Phase 14 and 15: exact remaining work

UNION corresponds by position. `deriveUnionColumns` sees scalar `fields`, while
generation uses `orderedSelectElements`, including tabular projections and
trailing fields. A scalar-only table must not offer edits implying that it shows
the complete alignment of those queries. **MUST**: show a preserve-only notice
and suppress mapping edits for these shapes; prove unrelated edit/save/reopen
retains the complete query. Scalar alias/reorder/member/ALL operations need UI
regressions, including one-to-two-to-one transitions. **DEFERRED**: full advanced
projection mapping, requiring shared alignment across all ordered select elements
and safe alias/reorder semantics. Coordinate with A2 projection/schema work; full
A2 unification is not an invented prerequisite. Do not duplicate alignment in Canvas.

The SDBL dock already implements the mandatory read-only/highlight/copy/collapse
requirements. **MUST**: verify these through the actual production UI, including
resize and updates after edits, and make its toggle keyboard accessible. No dock
rewrite is justified. Cross-highlight was an investigation requirement. The
generator returns text without stable model-to-generated-output ranges; parser
source maps describe input and cannot simply locate regenerated fragments.
Text-search guesses would be ambiguous for repeated expressions and aliases.
**DEFERRED**: approve an output-range contract before implementing cross-highlight;
it is an assisted navigation UX gap, not loss of an editing/model capability.

## Chosen implementation scope and preservation contracts

History + existing Canvas + Classic/QueryModel matrix yields:

| Classification | Actual remaining work | Boundary / ledger destination |
|---|---|---|
| MUST, CLOSED | Advanced UNION mapping guard; scalar UNION UI regressions; dock UI regressions; Enter/Space selection for source/JOIN/overview/minimap/dock | Existing UI/actions only; no core/reducer/protocol semantics change |
| SHOULD, CLOSED | Contextual Classic ExpressionBuilder for custom scalar fields, WHERE and JOIN create/edit | Same string-valued actions; shared metadata sources/resolver; no permanent dock or new dependency |
| PRESERVE | Tabular/trailing UNION projections, grouping sets/DCS/HAVING, ORDER hierarchy/priority, source aliases, existing structured condition subqueries | Unrelated edit → save → reopen retains representation; unsafe/malformed cases blocked; C17 safe rejection is not preservation |
| SHOULD, separate UX | Package move control, sort priority control, metadata refresh and reference-field expansion | UX-C2/UX-C7/UX-C8; existing order/navigation retained. Refresh/expand are absent Canvas UI, not N/A domain capabilities |
| DEFERRED | Cross-highlight, advanced drag/spatial keyboard/find, final release review, projection editor/mapping, general Boolean tree | UX-C1/UX-C3/UX-C4/UX-C5/UX-C6/UX-C9 |
| DEFERRED shared design | Global stable query IDs; condition-subquery asymmetries; EXISTS, scalar SELECT subqueries, structured JOIN subqueries | No current ID consumer; unsupported structured grammar/model must not be simulated in Canvas. Existing raw JOIN text remains editable |

Nested source editing stays isolated and uses existing ADD/UPDATE actions.
Parent fields whose exports disappear require an explicit parent edit first.
Manual external temp descriptions are session metadata; unused description-only
columns are not a promised SDBL persistence capability. Package-derived schemas
remain producer-owned. Existing source aliases have no rename action; package
display labels do not imply a new persisted rename contract.

The remaining Phase 14 projection mapping is a **functional UI gap** over a
shared schema limitation, accepted as PRESERVE/DEFERRED; scalar mapping is not
reopened. Its earlier incomplete view/test gaps are closed. The remaining Phase
15 cross-highlight is a **UX gap**, not a missing query edit. The original text
requires investigation rather than unconditional implementation: that
investigation is complete here. PARTIAL records the unimplemented broader UX
idea named in the later checkpoint. Required dock functionality and its test gap
are closed. Neither remainder is silently treated as obsolete.

## Historical documents and future cleanup manifest

Do not delete the six historical files listed above in this task. Their delivery
statements must be read with their dates. Before an archive, retain this phase
table/provenance and the current capability matrix, and transfer all open rows
to the authoritative ledger with dependencies and preservation contracts.

Still actionable requirements: Phase 8 Boolean
UX; Phase 10 sort priority; Phase 12 package controls; Phase 14 projection mapping;
Phase 15 cross-highlight; Phase 17 advanced
interactions; Phase 18 release/a11y/minimap review; the explicit shared backlog.
The ledger must carry these even when their original phase is partly delivered.

Superseded statements: Phase 13 not started; totals/indexes/VT forms absent;
Classic-only E2E and STOP 2 still awaiting any browser evidence; JOIN inspector
read-only/single-conjunct; no expression builder anywhere in Canvas; CodeMirror
not yet integrated; persistent Sidebar as final layout; dynamic measured card
height (fixed frozen cards replaced it); straight JOIN lines (orthogonal router
replaced them). Root Cancel is not a gap: closing the designer cancels without
insertText by the recorded product decision (`200447b`). Approved screenshot
pixel equivalence and complete release accessibility are not established by unit
tests. The active roadmap's blanket Phases 0–13 completion statement also needs
this more precise PARTIAL/OBSOLETE qualification.

| Historical document | Still relevant material | Required destination before archive |
|---|---|---|
| `new_builder_roadmap.md` | Phase 8/10/14/15/17/18 remainders; explicit shared backlog | UX-C1–UX-C10, C18/A2 dependencies and this reconciliation's unsupported-grammar boundary |
| `new_builder_current_state.md` | STOP 1 evidence/provenance, product decisions and subphase lineage | Retain historical observation; current behavior/status belongs to matrix/ledger |
| `new_builder_capability_map.md` | Domain boundaries; source vs condition subquery distinction; preservation flags | Current capability matrix and shared action/metadata contracts |
| `new_builder_phase3_design.md` | Graph geometry/focus/minimap invariants; now-closed baseline keyboard contract | Preserve code/tests evidence; remaining tuning/release review in UX-C4/UX-C6 |
| `new_builder_visual_spec.md` | Visual direction, all-workspace accessibility/polish requirements | UX-C4; retain reference provenance, do not claim absent approved PNGs |
| `prompts/new_builder_audit.md` | Historical audit method/context | Historical archive; no current feature status or unfulfilled runtime requirement |

No requirement still relies only on an old phase-status assertion. The ledger
holds the open work; matrix/reconciliation carry preservation boundaries,
unsupported ideas, dependencies and closure evidence. Historical records remain
available for a separately scoped archive/cleanup.

## Reconciliation verification

Before these additional fixes: 390 unit tests in 26 files passed via
`npx vitest run test/unit/canvas*.test.ts test/unit/webviewCanvas*.test.ts test/unit/packageNavLayout.test.ts test/unit/queryStore*.test.ts test/unit/sourceQueryDraft.test.ts test/unit/compoundSections.test.ts test/unit/applyGate.test.ts`.
`npm run test:e2e -- test/e2e/canvas.spec.ts` passed all 50 cases.
Continuation commits: `b25bf32` (history reconciliation before code) and
`6a59ed6` (controls plus regressions), `fa03e07` (source/JOIN focus regression);
final documentation records the ledger.

Final additional implementation: shared contextual ExpressionBuilder, basic
keyboard controls, advanced mapping preserve-only guard and one-to-two-to-one
UNION hook ordering correction. Phase 3/6 baseline requirements and Phase 16 are
closed; Phase 14/15 retain only their explicitly deferred advanced UX. Phases
8/10/17/18 remain PARTIAL. No phase documents were deleted or rewritten.

## Evidence index

Component names in the table refer to `src/webview-canvas/`:
[App](../../../src/webview-canvas/App.tsx),
[StructureWorkspace](../../../src/webview-canvas/structure/StructureWorkspace.tsx),
[PackageNav](../../../src/webview-canvas/components/PackageNav.tsx),
[UnionMappingPopover](../../../src/webview-canvas/components/UnionMappingPopover.tsx),
[SdblDock](../../../src/webview-canvas/components/SdblDock.tsx),
[SourceQueryEditor](../../../src/webview-canvas/components/SourceQueryEditor.tsx).
The shared contracts are
[QueryModel](../../../src/core/query/queryModel.ts),
[QueryState/QueryAction/reducer](../../../src/webview/state/queryStore.ts),
[UNION representation](../../../src/core/query/unionModel.ts),
[Classic ConstructorView](../../../src/webview/components/ConstructorView.tsx),
[ExpressionBuilder](../../../src/webview/components/ExpressionBuilder.tsx),
[expressionSources](../../../src/webview/expressionSources.ts),
[session](../../../src/webview/hooks/useDesignerSession.ts) and
[Apply gate](../../../src/webview/applyGate.ts).

Permanent evidence:
[Canvas browser cases](../../../test/e2e/canvas.spec.ts),
[real host Save](../../../test/vscode-integration/canvasSave.test.ts),
[model coverage](../../../test/unit/queryStore.modelCoverage.test.ts),
[corpus parity](../../../test/unit/queryStore.corpusParity.test.ts),
[shared editor sources](../../../test/unit/expressionSources.test.ts),
[router](../../../test/unit/webviewCanvasEdgeRouter.test.ts),
[layout](../../../test/unit/webviewCanvasLayout.test.ts),
[geometry](../../../test/unit/webviewCanvasGeometry.test.ts),
[minimap](../../../test/unit/webviewCanvasMinimap.test.ts),
[package layout](../../../test/unit/packageNavLayout.test.ts).

Actions were cross-checked by consumer, not merely by declaration: source
ADD/UPDATE/REMOVE and subquery/temp/VT actions; JOIN/custom/conjunct actions;
field add/alias/expression/aggregate/MOVE_FIELD; conditions/custom/operators/
parameters; grouping/TOTALS/INDEX; selection/locking/temp-output; package/UNION
ADD/REMOVE/SET_ACTIVE, SET_COLUMN_ALIAS/MOVE_UNION_COLUMN. MOVE_BATCH_QUERY has
Classic UI but no Canvas move control (UX-C2); SET_REF_FIELDS and the existing
refresh/expand bridge are unwired in Canvas (UX-C8). ORDER priority/HAVING/source
alias/general Boolean-tree edits have no current corresponding action; preservation
is not an invented editor capability. Classic's editable text/reparse dialog
and optional comment stripping are not promised Canvas workflows: Canvas dock
stays read-only and preserves comments by default, with C17 controlled refusal.

Final commands:

| Command | Result |
|---|---|
| `npm run docs:check` | PASS: 76 Markdown files / 67 reachable pages |
| `npm run typecheck` | PASS: all three projects |
| `npm run build` | PASS: extension / Classic / Canvas |
| `npx vitest run test/unit/canvas*.test.ts test/unit/webviewCanvas*.test.ts test/unit/packageNavLayout.test.ts test/unit/queryStore*.test.ts test/unit/sourceQueryDraft.test.ts test/unit/compoundSections.test.ts test/unit/applyGate.test.ts test/unit/expressionSources.test.ts` | PASS: 392 cases / 27 files |
| `npx vitest run test/unit/expressionSources.test.ts` | PASS: 2 cases; rerun after correcting the fixture's metadata type |
| `npm run test:e2e -- test/e2e/canvas.spec.ts -g 'Canvas roadmap reconciliation'` | PASS: 10 cases |
| `npm run test:unit` | PASS: 3776 cases / 161 files, including unchanged full corpus/preservation gates |
| `npm run test:e2e` | PASS: 138 cases, including 60 Canvas cases |
| `npm run test:integration` | PASS: 39 cases, real VS Code 1.139.1, production nested edit/Back/Save |

Initial regression attempts exposed the missing source keyboard target; mapping
and dock assertions were corrected to the real DOM/CodeMirror contracts (hidden
measurement probes, direct ALL toggle, aria-readonly with selectable content).
Keyboard minimap evidence uses an overflowing viewport, where that control is
intentionally rendered. No failing test, expected output, golden, snapshot or
classification update was hidden. The optional tree-sitter fixture remains
unavailable, so its independent oracle is not claimed. No new dependency or
parser/generator/protocol/persisted-model change occurred in this continuation.
The existing CodeMirror bundle was already used by dock/VT before Phase 16;
production Canvas remains approximately 3.0 MB in the ordinary unminified build.

**Canvas Feature Baseline Complete** is supported under the full-roadmap exit
criterion: all found phases are accounted for, Phase 13 is closed, 14+ are checked,
the capability matrix is complete, critical limitations are explicitly classified,
preservation has regression evidence, and UX/release work lives separately in
the ledger. This does not declare all historical phases CLOSED or remove Preview.
