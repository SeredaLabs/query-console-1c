# Audit and evidence index

Historical investigations explain how findings were obtained. They do not own
current status: use the [ledger](../technical-debt.md), [architecture](../architecture.md)
and [contracts](../contracts/safety-and-preservation.md). Dates, old priorities,
counts, intermediate failures and source paths in reports describe their baseline.

RESOLVED = resulting fix is closed; SUPERSEDED = later evidence/contract replaces
its status or policy; STILL RELEVANT = a unique evidence boundary remains;
HISTORICAL = design/process record. A resolved audit may still contain valuable
platform observations. No live-platform experiment was repeated by consolidation.

## Dated core investigations

Existing report/payload paths remain fixed to preserve frozen probe imports.
This is an indexed historical archive, not a second status ledger.

| Date | Audit / scope | Result → debt/fix | Disposition |
|---|---|---|---|
| 2026-09-27 | [Stage 0](stage-0.md), [frozen payload](stage-0/environment.json) | Differential/recovery audit and RP01–25 live results; English acceptance, invalid VT arity, hierarchy and template/sequence unknowns | STILL RELEVANT evidence; historical priorities/status superseded |
| 2026-09-27 | [Baseline reconciliation](reconciliation-b6286c57.md) | Reproductions/dependency inventory and qualified RP dispositions → C/A/V/U ledger | STILL RELEVANT unknowns; many fix statuses superseded |
| 2026-09-28 | [Near-term implementation](near-term-2026-09-28.md) | C1/D1/V4 bounded fixes and gates | RESOLVED |
| 2026-09-28 | [Hierarchy live observation](c3-hierarchy-2026-09-28.md) | Case-specific wizard canonical text → C3, one reviewed curated fixture change | RESOLVED; platform evidence retained |
| 2026-09-28 | [Correlated live observation](c4-correlated-2026-09-28.md) | Nearest enclosing owner in three condition contexts → C4; no-metadata fallback retained | RESOLVED; platform evidence retained |
| 2026-09-29 | [Comma migration](a1-comma-2026-09-29.md) | Token-backed consumer; former raw fallback | SUPERSEDED by lexical contract; A1 remains |
| 2026-09-29 | [Tuple migration](a1-tuple-2026-09-29.md) | Token-backed closing delimiter; former raw fallback | SUPERSEDED by lexical contract; A1 remains |
| 2026-09-29 | [HAVING preservation](c9-having-2026-09-29.md) | Flat-store omission → C9 | RESOLVED |
| 2026-09-29 | [Store parity discovery](store-parity-2026-09-29.md) | Missing trailing fields/characteristics → C10 | SUPERSEDED by fix below |
| 2026-09-29 | [Preserved sections fix](c10-preserved-sections-2026-09-29.md) | Optional state/snapshot properties and permanent corpus parity gate → C10 | RESOLVED |
| 2026-09-29 | [Slot audit](c11-slot-audit-2026-09-29.md) | Malformed VT/date/cast gaps and characteristics-loss stop → C11/C12 | SUPERSEDED by C11/C12 fixes |
| 2026-09-29 | [Resumed slot audit](c11-resumed-audit-2026-09-29.md) | Comment preservation prerequisite → C16/C17 | SUPERSEDED; original rationale retained |
| 2026-09-29 | [Malformed slots fix](c11-malformed-slots-2026-09-29.md) | Expanded walker; exclusions remain explicit → C11 | RESOLVED |
| 2026-09-29 | [Characteristics EOF](c12-characteristics-eof-2026-09-29.md) | Reject unterminated raw block instead of dropping it → C12 | RESOLVED |
| 2026-09-29 | [Raw-reader EOF](c13-c15-raw-expression-eof-2026-09-29.md) | Terminating all-depth EOF checks prevent host exhaustion → C13–15 | RESOLVED |
| 2026-09-30 | [Argument comments](c16-raw-slice-comments-2026-09-30.md) | VT/ПЕРИОДАМИ comment assignment/rendering → C16; other slices → C17 | RESOLVED C16; STILL RELEVANT C17 boundary |

## Consolidation records

| Date | Record | Result → disposition |
|---|---|---|
| 2026-09-30 | [Documentation inventory and contradiction audit](documentation-consolidation-2026-09-30.md) | Complete original-path classification, cleanup plan, debt revalidation and final lost-information check |
| 2026-09-30 | [Ledger checkpoint at e3b36a5](archive/technical-debt-e3b36a5.md) | CLOSED regression rationale, corpus/shadow changes and former status narratives → HISTORICAL; current ledger replaces it |
| 2026-09-30 | [Lexical checkpoint at e3b36a5](archive/expression-lexical-e3b36a5.md) | Historical migration evidence → SUPERSEDED policy; current lexical contract owns invariants |
| 2026-09-30 | [Canvas implementation](archive/canvas-feature-baseline-2026-09-30.md) | Before/after capability matrix, C19/C20/C17 safety work and browser/host gates → RESOLVED baseline |
| 2026-09-30 | [Full Canvas roadmap history](archive/canvas-phase-reconciliation-2026-09-30.md) | Every discovered phase/subphase; remaining requirements → UX-C1–10 → HISTORICAL scope evidence |

## Original design and investigation notes

Archived from `.claude/` at e3b36a5. Original paths/names inside the reports are
historical provenance, not live imports or current instructions.

| Original date / scope | Archive | Result → disposition |
|---|---|---|
| 2026-09-18 onward, Canvas delivery | [Current-state notes](archive/canvas/new_builder_current_state.md) | Subphase/STOP observations and design constraints → HISTORICAL; current matrix supersedes status |
| 2026-09-18 onward, original roadmap | [Roadmap](archive/canvas/new_builder_roadmap.md) | Phase definitions through later UX ideas → HISTORICAL; remaining requirements in ledger |
| 2026-09, initial parity | [Capability map](archive/canvas/new_builder_capability_map.md) | Domain/Classic/Canvas comparison → SUPERSEDED by current matrix |
| 2026-09, graph intent | [Graph design](archive/canvas/new_builder_phase3_design.md) | Layout/focus/keyboard invariants → HISTORICAL design evidence |
| 2026-09, visual direction | [Visual spec](archive/canvas/new_builder_visual_spec.md) | Presentation intent → HISTORICAL; not a missing-function list |
| 2026-09, audit procedure | [Prompt](archive/canvas/prompts/new_builder_audit.md) | Historical workflow → HISTORICAL; not active agent instructions |
| 2026-09, virtual tables | [Signature/completion investigation](archive/canvas/scratch_phase2x2_virtual_table_design.md) | Book-cited signatures and completion boundaries, database-value/base-register blockers → STILL RELEVANT evidence |
| 2026-09, semantic proposals | [Plan review](archive/canvas/scratch_semantic_core_plan_review.md) | Former index/walker design → SUPERSEDED by current semantic contract/A1/A3; no arbitrary release threshold |

## Superseded planning/boundary checkpoints

- [Roadmap at e3b36a5](archive/roadmap-e3b36a5.md), 2026-09-30: detailed former
  expression-typing proposal and architecture options → SUPERSEDED sequencing;
  constraints/actual remaining work are retained by architecture and ledger.
- [Known issues at e3b36a5](archive/known-issues-e3b36a5.md), 2026-09-30: original
  scope/provenance statements and VT completion rationale → HISTORICAL;
  current safety, visible boundaries and debt have separate owners.
