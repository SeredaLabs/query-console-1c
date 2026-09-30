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
