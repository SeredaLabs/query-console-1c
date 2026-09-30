# Documentation consolidation — 2026-09-30

Inventory and cleanup plan recorded **before cleanup**, against clean commit
`e3b36a5`. This report is historical evidence; the [ledger](../technical-debt.md)
owns current status. No implementation project or platform rerun is included.

## Inventory

All 84 tracked Markdown documents were classified, including eight `.claude`
notes and two tooling READMEs outside `docs/`. Query fixtures (`.sdbl`, `.txt`,
JSON/YAML), licenses and frozen audit payloads are evidence/data, not prose to
rewrite. Documentation-like comments were inspected selectively in the lexer,
parser, generator, formatter, union model, Apply gate, shared store and dock.

| Original path | Classification | Planned action | Reason |
|---|---|---|---|
| `.claude/new_builder_capability_map.md` | STALE / DUPLICATE / ARCHIVE | ARCHIVE | Historical Canvas/semantic investigations; retain unique requirements and book evidence. |
| `.claude/new_builder_current_state.md` | STALE / DUPLICATE / ARCHIVE | ARCHIVE | Historical Canvas/semantic investigations; retain unique requirements and book evidence. |
| `.claude/new_builder_phase3_design.md` | ARCHIVE / AUDIT | ARCHIVE | Historical Canvas/semantic investigations; retain unique requirements and book evidence. |
| `.claude/new_builder_roadmap.md` | STALE / DUPLICATE / ARCHIVE | ARCHIVE | Historical Canvas/semantic investigations; retain unique requirements and book evidence. |
| `.claude/new_builder_visual_spec.md` | ARCHIVE / AUDIT | ARCHIVE | Historical Canvas/semantic investigations; retain unique requirements and book evidence. |
| `.claude/prompts/new_builder_audit.md` | ARCHIVE / AUDIT | ARCHIVE | Historical Canvas/semantic investigations; retain unique requirements and book evidence. |
| `.claude/scratch_phase2x2_virtual_table_design.md` | ARCHIVE / AUDIT | ARCHIVE | Historical Canvas/semantic investigations; retain unique requirements and book evidence. |
| `.claude/scratch_semantic_core_plan_review.md` | STALE / DUPLICATE / ARCHIVE | ARCHIVE | Historical Canvas/semantic investigations; retain unique requirements and book evidence. |
| `AGENTS.md` | CONTRACT | KEEP | Repository rules, attribution or accepted architecture decision. |
| `CHANGELOG.md` | EVIDENCE | KEEP | Immutable release history. |
| `CONTRIBUTING.md` | CURRENT | UPDATE | Align roles, boundaries, protocol, gates or references with current code. |
| `README.md` | CURRENT | UPDATE | Align roles, boundaries, protocol, gates or references with current code. |
| `README.ru.md` | CURRENT | UPDATE | Align roles, boundaries, protocol, gates or references with current code. |
| `README.uk.md` | CURRENT | UPDATE | Align roles, boundaries, protocol, gates or references with current code. |
| `THIRD-PARTY-NOTICES.md` | CONTRACT | KEEP | Repository rules, attribution or accepted architecture decision. |
| `docs/README.md` | CURRENT | UPDATE | Align roles, boundaries, protocol, gates or references with current code. |
| `docs/design/new-builder/README.md` | CURRENT | UPDATE | Align roles, boundaries, protocol, gates or references with current code. |
| `docs/design/new-builder/feature-baseline.md` | AUDIT / CURRENT / DUPLICATE | UPDATE + ARCHIVE report | Keep current capability matrix; retain original implementation/verification evidence separately. |
| `docs/design/new-builder/phase-reconciliation.md` | AUDIT / EVIDENCE | ARCHIVE | Complete phase history and requirement crosswalk; ledger owns remaining work. |
| `docs/development/architecture.md` | CURRENT | UPDATE | Align roles, boundaries, protocol, gates or references with current code. |
| `docs/development/audits/a1-comma-2026-09-29.md` | AUDIT / EVIDENCE / ARCHIVE | KEEP in indexed archive | Dated evidence; statuses are historical. Frozen Stage 0 payload stays beside its report. |
| `docs/development/audits/a1-tuple-2026-09-29.md` | AUDIT / EVIDENCE / ARCHIVE | KEEP in indexed archive | Dated evidence; statuses are historical. Frozen Stage 0 payload stays beside its report. |
| `docs/development/audits/c10-preserved-sections-2026-09-29.md` | AUDIT / EVIDENCE / ARCHIVE | KEEP in indexed archive | Dated evidence; statuses are historical. Frozen Stage 0 payload stays beside its report. |
| `docs/development/audits/c11-malformed-slots-2026-09-29.md` | AUDIT / EVIDENCE / ARCHIVE | KEEP in indexed archive | Dated evidence; statuses are historical. Frozen Stage 0 payload stays beside its report. |
| `docs/development/audits/c11-resumed-audit-2026-09-29.md` | AUDIT / EVIDENCE / ARCHIVE | KEEP in indexed archive | Dated evidence; statuses are historical. Frozen Stage 0 payload stays beside its report. |
| `docs/development/audits/c11-slot-audit-2026-09-29.md` | AUDIT / EVIDENCE / ARCHIVE | KEEP in indexed archive | Dated evidence; statuses are historical. Frozen Stage 0 payload stays beside its report. |
| `docs/development/audits/c12-characteristics-eof-2026-09-29.md` | AUDIT / EVIDENCE / ARCHIVE | KEEP in indexed archive | Dated evidence; statuses are historical. Frozen Stage 0 payload stays beside its report. |
| `docs/development/audits/c13-c15-raw-expression-eof-2026-09-29.md` | AUDIT / EVIDENCE / ARCHIVE | KEEP in indexed archive | Dated evidence; statuses are historical. Frozen Stage 0 payload stays beside its report. |
| `docs/development/audits/c16-raw-slice-comments-2026-09-30.md` | AUDIT / EVIDENCE / ARCHIVE | KEEP in indexed archive | Dated evidence; statuses are historical. Frozen Stage 0 payload stays beside its report. |
| `docs/development/audits/c3-hierarchy-2026-09-28.md` | AUDIT / EVIDENCE / ARCHIVE | KEEP in indexed archive | Dated evidence; statuses are historical. Frozen Stage 0 payload stays beside its report. |
| `docs/development/audits/c4-correlated-2026-09-28.md` | AUDIT / EVIDENCE / ARCHIVE | KEEP in indexed archive | Dated evidence; statuses are historical. Frozen Stage 0 payload stays beside its report. |
| `docs/development/audits/c9-having-2026-09-29.md` | AUDIT / EVIDENCE / ARCHIVE | KEEP in indexed archive | Dated evidence; statuses are historical. Frozen Stage 0 payload stays beside its report. |
| `docs/development/audits/near-term-2026-09-28.md` | AUDIT / EVIDENCE / ARCHIVE | KEEP in indexed archive | Dated evidence; statuses are historical. Frozen Stage 0 payload stays beside its report. |
| `docs/development/audits/reconciliation-b6286c57.md` | AUDIT / EVIDENCE / ARCHIVE | KEEP in indexed archive | Dated evidence; statuses are historical. Frozen Stage 0 payload stays beside its report. |
| `docs/development/audits/stage-0.md` | AUDIT / EVIDENCE / ARCHIVE | KEEP in indexed archive | Dated evidence; statuses are historical. Frozen Stage 0 payload stays beside its report. |
| `docs/development/audits/store-parity-2026-09-29.md` | AUDIT / EVIDENCE / ARCHIVE | KEEP in indexed archive | Dated evidence; statuses are historical. Frozen Stage 0 payload stays beside its report. |
| `docs/development/corpus-testing.md` | CURRENT | UPDATE | Align roles, boundaries, protocol, gates or references with current code. |
| `docs/development/decisions/0001-platform-independent-core.md` | CONTRACT | UPDATE | Align roles, boundaries, protocol, gates or references with current code. |
| `docs/development/decisions/0002-extension-webview-boundary.md` | CONTRACT | UPDATE | Align roles, boundaries, protocol, gates or references with current code. |
| `docs/development/decisions/0003-metadata-source-of-truth.md` | CONTRACT | KEEP | Repository rules, attribution or accepted architecture decision. |
| `docs/development/decisions/0004-querymodel-round-trip-contract.md` | CONTRACT | UPDATE | Align roles, boundaries, protocol, gates or references with current code. |
| `docs/development/decisions/README.md` | CONTRACT | KEEP | Repository rules, attribution or accepted architecture decision. |
| `docs/development/demo-recording.md` | CURRENT | KEEP | Current reference; no conflicting claim found. |
| `docs/development/expression-lexical-contract.md` | CONTRACT / AUDIT | UPDATE + ARCHIVE checkpoint | Separate current status, sequencing and invariant from discovery history. |
| `docs/development/index.md` | CURRENT | UPDATE | Align roles, boundaries, protocol, gates or references with current code. |
| `docs/development/known-issues.md` | CURRENT / STALE | UPDATE | Align roles, boundaries, protocol, gates or references with current code. |
| `docs/development/localization.md` | CURRENT | KEEP | Current reference; no conflicting claim found. |
| `docs/development/metadata.md` | CURRENT | KEEP | Current reference; no conflicting claim found. |
| `docs/development/performance.md` | CURRENT | KEEP | Current reference; no conflicting claim found. |
| `docs/development/query-model.md` | CURRENT | UPDATE | Align roles, boundaries, protocol, gates or references with current code. |
| `docs/development/roadmap.md` | ROADMAP / STALE / DUPLICATE | UPDATE + ARCHIVE checkpoint | Separate current status, sequencing and invariant from discovery history. |
| `docs/development/setup-and-build.md` | CURRENT / STALE | UPDATE | Align roles, boundaries, protocol, gates or references with current code. |
| `docs/development/technical-debt.md` | CURRENT / AUDIT / DUPLICATE | UPDATE + ARCHIVE checkpoint | Separate current status, sequencing and invariant from discovery history. |
| `docs/development/testing-and-release.md` | CURRENT / STALE | UPDATE | Align roles, boundaries, protocol, gates or references with current code. |
| `docs/development/webview.md` | CURRENT / STALE | UPDATE | Align roles, boundaries, protocol, gates or references with current code. |
| `docs/en/editing-existing-queries.md` | CURRENT | UPDATE | Align all three locales: Canvas baseline/Preview, safe refusal or Classic-only assisted workflows. |
| `docs/en/getting-started.md` | CURRENT | KEEP | Current reference; no conflicting claim found. |
| `docs/en/hover-and-completion.md` | CURRENT | KEEP | Current reference; no conflicting claim found. |
| `docs/en/index.md` | CURRENT | KEEP | Current reference; no conflicting claim found. |
| `docs/en/limitations.md` | CURRENT | UPDATE | Align all three locales: Canvas baseline/Preview, safe refusal or Classic-only assisted workflows. |
| `docs/en/metadata.md` | CURRENT | UPDATE | Align all three locales: Canvas baseline/Preview, safe refusal or Classic-only assisted workflows. |
| `docs/en/query-designer.md` | CURRENT | UPDATE | Align all three locales: Canvas baseline/Preview, safe refusal or Classic-only assisted workflows. |
| `docs/en/settings.md` | CURRENT | UPDATE | Align all three locales: Canvas baseline/Preview, safe refusal or Classic-only assisted workflows. |
| `docs/en/troubleshooting.md` | CURRENT | KEEP | Current reference; no conflicting claim found. |
| `docs/ru/editing-existing-queries.md` | CURRENT | UPDATE | Align all three locales: Canvas baseline/Preview, safe refusal or Classic-only assisted workflows. |
| `docs/ru/getting-started.md` | CURRENT | KEEP | Current reference; no conflicting claim found. |
| `docs/ru/hover-and-completion.md` | CURRENT | KEEP | Current reference; no conflicting claim found. |
| `docs/ru/index.md` | CURRENT | KEEP | Current reference; no conflicting claim found. |
| `docs/ru/limitations.md` | CURRENT | UPDATE | Align all three locales: Canvas baseline/Preview, safe refusal or Classic-only assisted workflows. |
| `docs/ru/metadata.md` | CURRENT | UPDATE | Align all three locales: Canvas baseline/Preview, safe refusal or Classic-only assisted workflows. |
| `docs/ru/query-designer.md` | CURRENT | UPDATE | Align all three locales: Canvas baseline/Preview, safe refusal or Classic-only assisted workflows. |
| `docs/ru/settings.md` | CURRENT | UPDATE | Align all three locales: Canvas baseline/Preview, safe refusal or Classic-only assisted workflows. |
| `docs/ru/troubleshooting.md` | CURRENT | KEEP | Current reference; no conflicting claim found. |
| `docs/uk/editing-existing-queries.md` | CURRENT | UPDATE | Align all three locales: Canvas baseline/Preview, safe refusal or Classic-only assisted workflows. |
| `docs/uk/getting-started.md` | CURRENT | KEEP | Current reference; no conflicting claim found. |
| `docs/uk/hover-and-completion.md` | CURRENT | KEEP | Current reference; no conflicting claim found. |
| `docs/uk/index.md` | CURRENT | KEEP | Current reference; no conflicting claim found. |
| `docs/uk/limitations.md` | CURRENT | UPDATE | Align all three locales: Canvas baseline/Preview, safe refusal or Classic-only assisted workflows. |
| `docs/uk/metadata.md` | CURRENT | UPDATE | Align all three locales: Canvas baseline/Preview, safe refusal or Classic-only assisted workflows. |
| `docs/uk/query-designer.md` | CURRENT | UPDATE | Align all three locales: Canvas baseline/Preview, safe refusal or Classic-only assisted workflows. |
| `docs/uk/settings.md` | CURRENT | UPDATE | Align all three locales: Canvas baseline/Preview, safe refusal or Classic-only assisted workflows. |
| `docs/uk/troubleshooting.md` | CURRENT | KEEP | Current reference; no conflicting claim found. |
| `tooling/1c-export/README.md` | CURRENT | KEEP | Current reference; no conflicting claim found. |
| `tooling/real-constructor/README.md` | CURRENT | KEEP | Current reference; no conflicting claim found. |

## Contradictions and authoritative answers

| Conflicting claim | Current answer and evidence | Destination |
|---|---|---|
| Setup says Canvas has no E2E; reconciliation says V4 OPEN | `test/e2e/canvas.spec.ts` and real-host tests now exercise Canvas; V4 is a bounded regression gate | Setup/testing; ledger |
| C17 says Apply silently loses comments | Core raw-slice loss remains, but `tryOpenDesignerBatch` rejects initial comment occurrence loss before LOAD_BATCH in both UIs and Classic text Apply; rejection is not preservation | Safety contract; C17 |
| Webview receives a model / sends selection or apply messages | `HostMsg.loadModel` carries text; generation and state are local. `insertText`, `cancel`, `ready`, `expandRef`, `refreshCache` are the actual outgoing discriminants | Architecture/webview |
| Query-model promises all comments at original positions | Bound comments and argument comments have defined rendering; raw-expression comments can be refused; Classic has an explicit preserve toggle | Safety contract |
| Old Canvas phases/STOP gates define completion; Phase 13 is the endpoint | Full 0–18 reconciliation already verified baseline, preserve-only boundaries and UX-C1–10; phase history is evidence | Current matrix; archived reconciliation; ledger |
| Baseline complete implies Preview removal, or V4 complete implies feature complete | Functional baseline, regression gate and UX/release readiness are distinct; Preview stays opt-in | Canvas/README/testing |
| Architecture still says D1 comments require correction | D1 is closed; actual import cycle, hooks and synchronous resolver stack remain accepted constraints | Architecture; compact closed register |
| A1 reports authorize raw fallbacks; roadmap proposes a separate typing walker | Current lexical contract removes four fallbacks and requires explicit unknown facts; other scanners remain. A3 must reuse A1 representation | Lexical contract; A1/A3; archived proposal |
| Corpus equals independent/live compiler proof; optional oracle tests passed means oracle ran | Positive recorded canonical output has provenance limits; generator-derived fixtures are not independent. Missing grammar WASM warns and returns, including in CI | Corpus/testing; V1–V3 |
| Stage 0 calls English P0; later ledger P1 | P0 is ordinary host crash/hang; unsupported valid English is C2/P1. EOF availability regressions C13–15 are closed P0 | Ledger; immutable historical evidence |
| Refresh is available inside every designer | Classic handles refresh/ref expansion messages; Canvas has no equivalent controls/response wiring | Localized metadata guides; UX-C8 |
| Old test counts describe current gates | Current docs specify commands/scope; counts belong to dated verification reports | Testing and archive |

## Debt revalidation

No open item was closed merely because another audit is newer. The narrow source
and regression checks below supplement the completed Canvas pass; they do not
restart it or upgrade local tests to platform evidence.

| Items | Current implementation / regression evidence | Disposition at this checkpoint |
|---|---|---|
| C2 | Russian-only entry/detection in lexer/parser and `bslQueryExtractor`; RP06/07 platform acceptance retained in Stage 0 results | OPEN P1 |
| C6 | `booleanGroupingSemantics.test.ts` still exempts exactly two JOIN layouts; both passes check truth tables | OPEN P3, cosmetic |
| C17 | `rawSliceComments.c16.test.ts` pins remaining core loss; `openDesignerBatch.test.ts` verifies safe refusal | OPEN P1, scope clarified |
| C18 | `canvasPreserveBoundaries.test.ts` pins keyword-alias negation misparse and malformed Apply blocker | OPEN P2 |
| A1 | Generator/formatter still contain raw lexical scanners; four consumers use `tryTokenize` without raw fallback | OPEN P1 |
| A2 | Parser/store use scalar producer heads; `tempTableSemantics` uses `orderedSelectElements`; UNION mapping still scalar-only | OPEN P2 |
| A3 | `expressionContext` infers only a lone resolved field; tests deliberately leave arbitrary expressions unknown | PARTIAL P2; separate walker obsolete |
| V1 | Recorded golden corpus is positive, lacks per-entry build/metadata attestation and has template markers; generated fixtures do not establish validity | PARTIAL P2 |
| V2 | `test/helpers/assertValidSdbl.ts` returns when `tree-sitter-sdbl.wasm` is absent; release CI does not build it | OPEN P2; historical ABI mismatch is source-inferred |
| V3 | `decideApply` checks input blockers, generated validation and reparsed malformed expressions; no equivalence comparison | PARTIAL P2 |
| V4 | Completed browser/real-host Canvas pass; source tests present | CLOSED, bounded scope retained |
| U1 / U2 | RP22 metadata-unresolved; RP24 live base lacked sequences; no later attestation | UNKNOWN P2 |
| U3 | Disconnected-source all-visible fallback remains in `joinVisibility`, with a named unit test | UNKNOWN P2 |
| UX-C1–3 | Advanced projections/grouping/report blocks, package controls and structured condition/HAVING editors remain absent; underlying representations retained | OPEN P2 |
| UX-C4–7 | Baseline Enter/Space/dock works; full release review, output-range cross-highlight, advanced gestures and sort reorder remain separate | OPEN P2 |
| UX-C8 / UX-C9 | No Canvas refresh/ref response wiring; advanced UNION guard suppresses scalar-only mapping for tabular/trailing projections | OPEN P2 |
| UX-C10 | Recursive local drafts work without persistent global scope IDs; no current consumer requires that proposed contract | Deferred P3; not a baseline/release prerequisite |

Baseline commands: `npm run docs:check` (passed); targeted 12-file Vitest
revalidation (635 passed). Exact final commands/results belong to this report's
verification section, added after cleanup. No golden/snapshot/classification
updates or new live-platform observations are authorized by this pass.

## Cleanup plan

| Action | Scope | Information treatment |
|---|---|---|
| KEEP | AGENTS, changelog, attribution, accepted ADRs, metadata/localization/performance/demo/tooling references and unaffected user guides | Preserve durable contracts and unique observations |
| UPDATE | Current ledger, architecture/model/webview/setup/testing/corpus/known issues/roadmap, Canvas entry/matrix, contributor/root README and affected three-locale guides | Remove false status/protocol claims and volatile counts; link the one authority for each fact |
| MERGE | Apply, preservation/comments, shared-state and semantic-recovery invariants scattered through audits/current docs | One safety contract plus the existing lexical contract; retain model schema documentation |
| ARCHIVE | Eight `.claude` notes, full Canvas implementation report/phase reconciliation, old ledger/roadmap/lexical-history checkpoints | Preserve originals and unique remaining requirements; add source-path/provenance mapping |
| ARCHIVE INDEX | Existing dated audits and Stage 0 report/payload | Keep paths to avoid changing frozen script imports; explicitly classify historical dispositions |
| DELETE | None | No document was proven to lack unique historical value |
| CREATE | This permanent audit, short audit index, one safety/preservation contract | No new parallel status ledger or phase-based roadmap |

Existing `docs/development/` paths remain authoritative. Historical phase
numbering is available through the audit index only; remaining Canvas requirements
live in UX-C1–10 and the current capability/preservation matrix. No parser,
feature, protocol, cache, dependency or golden changes are planned.

## Archive path manifest

Original bodies were checked against e3b36a5 after removing only the added
archive banner and normalized active-link targets. All 14 matched. All 16
existing dated reports and the frozen Stage 0 payload remain unchanged.

| Original | Evidence destination |
|---|---|
| `.claude/new_builder_capability_map.md` | [new_builder_capability_map.md](archive/canvas/new_builder_capability_map.md) |
| `.claude/new_builder_current_state.md` | [new_builder_current_state.md](archive/canvas/new_builder_current_state.md) |
| `.claude/new_builder_phase3_design.md` | [new_builder_phase3_design.md](archive/canvas/new_builder_phase3_design.md) |
| `.claude/new_builder_roadmap.md` | [new_builder_roadmap.md](archive/canvas/new_builder_roadmap.md) |
| `.claude/new_builder_visual_spec.md` | [new_builder_visual_spec.md](archive/canvas/new_builder_visual_spec.md) |
| `.claude/prompts/new_builder_audit.md` | [new_builder_audit.md](archive/canvas/prompts/new_builder_audit.md) |
| `.claude/scratch_phase2x2_virtual_table_design.md` | [scratch_phase2x2_virtual_table_design.md](archive/canvas/scratch_phase2x2_virtual_table_design.md) |
| `.claude/scratch_semantic_core_plan_review.md` | [scratch_semantic_core_plan_review.md](archive/canvas/scratch_semantic_core_plan_review.md) |
| `docs/design/new-builder/feature-baseline.md` | [canvas-feature-baseline-2026-09-30.md](archive/canvas-feature-baseline-2026-09-30.md) |
| `docs/design/new-builder/phase-reconciliation.md` | [canvas-phase-reconciliation-2026-09-30.md](archive/canvas-phase-reconciliation-2026-09-30.md) |
| `docs/development/expression-lexical-contract.md` | [expression-lexical-e3b36a5.md](archive/expression-lexical-e3b36a5.md) |
| `docs/development/known-issues.md` | [known-issues-e3b36a5.md](archive/known-issues-e3b36a5.md) |
| `docs/development/roadmap.md` | [roadmap-e3b36a5.md](archive/roadmap-e3b36a5.md) |
| `docs/development/technical-debt.md` | [technical-debt-e3b36a5.md](archive/technical-debt-e3b36a5.md) |

## Final consistency review

Second pass after edits, read from current entry points rather than audit narratives.
Each question has a current answer without reading historical reports.

| New contributor question | Current answer / authority |
|---|---|
| What is the product? | Root README: visual metadata-aware SDBL editing/static BSL insertion; no database execution. |
| What works? | README/user guide for supported workflows; current Canvas matrix for detailed EDIT/PRESERVE boundaries. |
| How does core work? | Architecture: handwritten lexer/parser/generator/formatter, validator and semantic snapshot; real cycle/hooks/stack state retained. |
| What is Classic? | Existing designer with editable text dialogs and shared domain/session/Apply infrastructure. |
| What is Canvas? | Opt-in visual adapter over that same infrastructure; functional baseline complete with explicit preserved advanced families. |
| What does Preview mean? | UX/accessibility/release hardening and opt-in access, separate from functional baseline/V4. |
| What are correctness contracts? | Safety/preservation/recovery plus lexical contract; model/ADR canonical output define representation/testing boundaries. |
| What gates exist? | Testing/release commands and corpus policy distinguish browser, real host, recorded output and missing optional oracle. |
| What limitations exist? | Known issues/user limitations cover English, comments/alias refusal, opaque scopes, temp schemas, VT/metadata and execution boundaries. |
| What debt is open? | Technical-debt ledger alone: C2/C6/C17/C18; A1/A2/A3; V1–V3; UX-C1–10 with consumer-gated UX-C10. |
| What is platform-unknown? | U1 template substitution, U2 sequence layout, U3 disconnected-source visibility; scoped C1/A2/V1 evidence qualifications retained. |
| What next? | Short roadmap: preservation/correctness → incremental architecture → compatibility/evidence → UX → release review. |
| Where are historical audits? | Audit index points to dated reports/payload, full phase history, book/live evidence and original design notes. |

No functional debt was closed by editing documentation. No new behavior bug was
found; no new regression test or expected-output artifact was needed. Two stale
source narratives about Canvas loading and diagnostic provenance were corrected
in the final selective comment review. Existing current commands were checked
against package.json; all 20 script names referenced by current root/developer/
Canvas docs exist. Repository grep found no live source/config/tool references
to the removed `.claude` paths or original phase-reconciliation location.

## Verification executed for consolidation

| Exact command / check | Result and limit |
|---|---|
| `npm run docs:check` (baseline and after slices; final) | PASS; final 92 Markdown files, 83 reachable doc pages, 9 user pages × 3 locales; relative/reference/HTML links, anchors, case, localized versions/heading parity and stale-history scan. All tracked Markdown is now within this check's roots. |
| `npx vitest run test/unit/booleanGroupingSemantics.test.ts test/unit/canvasPreserveBoundaries.test.ts test/unit/rawSliceComments.c16.test.ts test/unit/openDesignerBatch.test.ts test/unit/tempTableSemantics.test.ts test/unit/unionModel.test.ts test/unit/joinVisibility.test.ts test/unit/expressionContext.test.ts test/unit/applyGeneratedOutput.test.ts test/unit/invalidInputPreservation.test.ts test/unit/recoveryS2.test.ts test/unit/semanticSnapshot.test.ts` | Baseline PASS: 635 tests / 12 files. |
| `npm run typecheck` | PASS: extension/core, Classic and Canvas projects. |
| `npm run build` | PASS: extension, Classic and Canvas bundles. |
| `npm run test:unit` | PASS: 3776 tests / 161 files; committed corpus/store/classification/shadow gates included. |
| `git diff --check` | PASS. |
| Ad hoc TypeScript verification against e3b36a5 | All 12 edited TS/TSX/helper files have identical parser-derived non-comment syntax tokens and identical transpileModule output with removeComments. An initial context-free scanner comparison was unsuitable for regex/template syntax; parser-derived comparison resolves that false signal. |
| Archive body comparison against captured e3b36a5 originals | PASS: 14 bodies unchanged except banner/link targets; all 16 existing reports unchanged. |
| Fixture/payload scope and Markdown inventory checks | PASS: no golden/snapshot/classification/fixture or Stage 0 payload changes; all 92 tracked Markdown files covered. |
| Direct golden/grammar inventory | 1976 records, all valid:true, zero English SELECT starts, 85 hash-marker inputs; grammar WASM absent. These are checkpoint measurements, not new platform attestations. |

Browser E2E/real-host tests were **not rerun** for documentation/comment-only
changes. The prior Canvas pass's exact 138 browser/39 real-host results remain
archived evidence, not execution claimed by this task. Independent grammar oracle,
private corpus and live 1C were not run; no platform UNKNOWN was upgraded.

## Changes and disposition

- Inventory: 84 original tracked Markdown documents; final 92 includes five
  historical checkpoints and three permanent index/contract/audit documents.
- MERGE: scattered Apply/comment/preservation/shared-state/recovery requirements
  into one safety contract; keep existing lexical contract as its sole fact owner.
- ARCHIVE: nine relocated notes/reports (eight `.claude` plus phase reconciliation)
  and five full prior checkpoints (ledger, lexical contract, Canvas report,
  roadmap, known issues). Active links/source references are updated.
- KEEP: all 16 dated core reports and frozen payloads at their original paths,
  preserving imports and live/book evidence. No content-only deletion.
- UPDATE: current architecture/model/protocol, debt, roadmap/limitations, gates/
  corpus roles, Canvas matrix/entry, README/contributor and affected user guides
  with synchronized English/Ukrainian/Russian source versions.
- Production: comment-only source edits; no implementation, API/protocol, cache,
  dependency, feature or parser change. No changelog/version bump or history rewrite.

Logical commits before final verification: cb707ca (inventory/plan), 8df042c
(ledger/history), 1fdcc40 (architecture/contracts), 28a162b (Canvas/archive/index),
b2b6777 (roadmap/limits/gates), 0204520 (README/localized product).
Final review/verification commits follow these; use `git log e3b36a5..HEAD`
for the complete local sequence. No push or release action is included.

## Lost-information check

| Category | Retained authoritative/evidence location | Result |
|---|---|---|
| OPEN debt | Current ledger, short roadmap dependencies, full prior ledger checkpoint | RETAINED; no unjustified closure |
| UNKNOWN platform behavior | U1–U3 plus C1/A2/V1 qualifications; RP result payload and reconciliation | RETAINED; no local-to-platform evidence upgrade |
| Regression rationale | Closed register/test refs, original dated fix reports and full ledger/Canvas checkpoints | RETAINED; reviewed fixture/shadow/output changes remain historical |
| Live 1C evidence | Stage 0 setup/RP01–25 payload, C3 hierarchy and C4 correlation reports | RETAINED verbatim, with build/metadata limits |
| Canvas remaining requirements | UX-C1–10, current matrix/safety contract; complete phase/subphase crosswalk and original specs archived | RETAINED; advanced mapping/cross-highlight/release/unsupported grammar are explicit |
| Architecture constraints | Actual cycle/hooks/synchronous stack, A1/A2 exit boundaries, A3 shared representation; original proposal checkpoints | RETAINED; desired architecture is not presented as implemented |
| Safety/preservation contracts | Unified safety contract and lexical contract with tests; metadata safety unchanged | RETAINED; safe rejection never relabeled preservation |

All seven categories have a current owner or preserved indexed evidence; none
exists only in deleted prose. Future work starts from the ledger/roadmap, not an
old phase or stage statement.
