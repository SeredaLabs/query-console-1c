# Technical debt

Authoritative current engineering-debt ledger, reconciled on 2026-09-27 against
`b6286c57cfa64ff8cb9f937347c376d4b98d55c8`. The checkout `23188a4` differs only in
release metadata/changelog. Update status here; keep historical findings in
[audits](audits/stage-0.md), product boundaries in [known issues](known-issues.md),
and execution sequencing in [roadmap](roadmap.md).

Evidence and the complete RP01–RP25 disposition are in the
[baseline reconciliation](audits/reconciliation-b6286c57.md). No new live-platform
run was performed. Recorded platform verdicts and local reproduction are distinct.

Statuses: **CLOSED** resolved/no remaining finding; **OPEN** confirmed outstanding;
**PARTIAL** some capability exists, work remains; **UNKNOWN** evidence insufficient;
**STALE** superseded claim/plan; **DUPLICATE** tracked elsewhere; **ABSORBED** included
in a named broader task. P1 = meaningful capability loss or preservation risk;
P2 = bounded behavior/verification gap; P3 = hardening, cosmetic, or maintenance.
No current item is promoted to P0 solely because Stage 0 used that label.

## Correctness

| ID / status / severity | Area, evidence and impact | Dependency → next action |
|---|---|---|
| C1 · OPEN · P1 | Accounting VT preservation: `09-rb-oboroty.sdbl` loses `Организация = &Орг` and `СубконтоДт1 = &Суб` with an empty/corpus resolver; `sdblParser.applyAccountingMeta` treats missing metadata as no subconto. No-resolver and compatible synthetic-resolver controls are stable. Input's live validity/result impact remains unverified. | Record metadata/layout provenance → focused preservation hardening, including unavailable metadata; do not refresh the fixture to hide loss. |
| C2 · OPEN · P1 | English SDBL, RP06/RP07: recorded platform-valid input is rejected at `SELECT`; Russian-only detection, contextual words and metadata names also block end-to-end support. | A1 spike → English acceptance/canonicalization stage with platform-recorded RU/EN pairs. |
| C4 · OPEN · P1 | Correlated bare conditions: parser binds `Цена > 0` to the sole inner source even if only an outer source owns `Цена`. `checkFieldPaths` skips subquery conditions to avoid false errors. Select-list correlation is already tested/correct. | Confirm condition canonical text on 1C → targeted qualification correction; preserve current fail-open validation until ownership is reliable. |
| C3 · OPEN · P2 | RP20: `sdblGenerator.renderOrder` drops `ИЕРАРХИЯ` from a string field without metadata; corpus resolver keeps it. Fixture 0078 protects the old no-resolver output, not the recorded live canonical. | Focused platform evidence, including metadata absent/nonhierarchical cases → conservative modifier-preservation task. |
| C7 · OPEN · P2 | Parameter listing: `extractQueryParamNames` scans strings/comments and deduplicates case-sensitively, unlike lexer-backed `queryParameters`. Both result boilerplate and Query Text analysis use it. A quoted `"&Ложный"` adds a false parameter. | A1 lexical contract → align existing consumers, preserving incomplete-text behavior; no BSL data-flow feature. |
| C5 · OPEN · P3 | Invalid-input safety: RP04/05 truncate extra VT args without `unsafeExtraArgs`; RP17 drops INDEX BY; RP11/12/15/23 are over-accepted or normalized. These are platform-invalid, not missing valid grammar. | Explicit preservation/rejection contract → negative fixtures and narrow guards; retain template tolerance. |
| C6 · OPEN · P3 | Cosmetic JOIN idempotence: `booleanGroupingSemantics.test.ts` explicitly exempts two shapes from text equality on pass two; both passes pass truth-table checks. | A1 → bounded canonical-layout task; no semantic-corruption claim. |

## Architecture

| ID / status / severity | Area, evidence and impact | Dependency → next action |
|---|---|---|
| A1 · OPEN · P1 | Lexical/expression knowledge duplicated across parser, generator raw scanners, formatter Boolean/arithmetic parsers, qualifier and syntax acceptor. RP13/grouping/RP14 required coordinated fixes. Existing `Token` and `sdblKeywordSets` are useful foundations, not a shared expression contract. | Spike `source → lexer → CanonicalToken[] → parser → QueryModel`, with `ExpressionTokens` for opaque slots. Preserve original spelling, parameter identity, positions, comments and precedence; incremental migration only. See evidence matrix. |
| A2 · OPEN · P2 | Three temp-table models remain. Parser/designer use head fields; semantic schema uses all ordered select elements. Projection + trailing-field probe expands `В.*` to `Ссылка` while semantic schema contains `Ссылка, Товары, Код`. | Live projection/schema oracle → shared lifetime and producer-column facts. Keep incremental registry, undefined-temp inference and parser-local literal typing separate. |
| A3 · PARTIAL · P2 | Expression type inference: single resolved field types exist; arbitrary-expression types remain unknown. The former independent token-walker plan is STALE and absorbed into A1's contract design. | A1 + capability to obtain real result types → display-only inference over shared representation; no separate grammar or automatic expression AST. |

A2 remains a required follow-up, not optional cleanup. Its exit gate is one
owner for designer/semantic lifetimes and one producer-column function used by
all three consumers, with corpus/validator/oracle coverage. Preserve the parser's
synthetic `kind: 'Справочник'` unless evidence requires a change; literal columns
use `Строка` as an internal non-reference marker, not a shared inferred type.

Accepted coupling: the parser/generator/union/comment cycle, module-load hooks and
synchronous resolver state remain as described in [architecture](architecture.md).
They are decomposition constraints for A1, not extra urgent refactor tickets.

## IDE semantics / recovery

| ID / status / severity | Area, evidence and impact | Dependency → next action |
|---|---|---|
| S1 · OPEN · P2 | C21: valid condition-subquery completion has only the outer alias indexed. `collectSourceAliasSymbols` and `resolveAliasAt.descend` traverse source subqueries, not condition subqueries. C12 shares this gap. | Extend existing model paths, symbol traversal and source-map scope coverage together; no parallel grammar. |
| S2 · OPEN · P2 | C06/C13: open parentheses swallow FROM, parse succeeds with zero sources and `complete`. C18/C19: ORDER/GROUP failure makes the entire package `unavailable`. C11 also lacks inner context. Parameter completion after bare `&` calls the strict lexer and throws; the parameter hover branch also lacks a local catch. Core failures reproduced; Extension Host path not executed. | A1 boundaries, S1 scope contract → targeted recovery retaining trustworthy positions; never use recovered models for Apply. |
| S3 · PARTIAL · P3 | Snapshot contract: `symbolsById` is produced and consumed; `scopesById`/`referencesBySymbolId` are empty and unconsumed; `partial` is not produced by the text builder. | Decide during S1/S2 whether a concrete consumer needs each field. Prefer narrowing/removing unused promises after compatibility review over materializing an unused index. |

## Verification / corpus

| ID / status / severity | Area, evidence and impact | Dependency → next action |
|---|---|---|
| V1 · PARTIAL · P2 | 1976 golden entries pass, all positive and none starting with English SELECT. Negative unit examples exist, but no platform-attested negative/English corpus. Golden provenance lacks per-entry platform build/metadata attestation; 85 inputs contain `#`. Query fixtures are generator-derived, hence not an independent oracle. | Preserve ADR 0004 canonical contract → attested negative/English/metadata-mode cases and explicit provenance; U1 remains unknown. |
| V2 · OPEN · P2 | Tree-sitter oracle unavailable in ordinary checkout/CI. Helper warns then returns; Vitest counts tests as passed. Source/toolchain/artifact are unpinned; Stage 0 recorded ABI 15 vs runtime 13–14 incompatibility. | Reproducible compatible dev-only artifact + manifest/checksum → explicit CI missing-oracle policy. Never add a runtime dependency. |
| V3 · PARTIAL · P2 | Apply has parser acceptance, selected semantic checks and static unsafe/malformed guards. It has no input/output semantic-equivalence check, and the expression acceptor deliberately ignores precedence. Boolean truth-table regressions cover a subset. | A1 → bounded transformation-preservation checks and reviewed canonical evidence; not a theorem prover or mandatory live query execution. |
| V4 · OPEN · P2 | Canvas preview has unit/shared-gate coverage, but lacks the recorded Classic/Canvas semantic-parity gate and Canvas browser load/edit/save/insertion E2E identified in the roadmap. The 1A–1B.4 fixes are in the shared path Canvas also uses (`parseBatch`, `assembleBatch` + `generateBatch`, `webview/applyGate.ts`), so they cover Canvas for queries opened from text and written back; models produced by Canvas-specific editing actions are not covered by those regressions. | Separate preview-release verification stage; retain preview boundary. |

## Documentation

| ID / status / severity | Area, evidence and impact | Dependency → next action |
|---|---|---|
| D1 · OPEN · P3 | Source comments still claim unwired symbols, future-only parameter semantics, syntax-only Apply, complete-only source maps and a narrower unsafe-marker/traversal scope. Exact stale claims are recorded in the reconciliation. | Comment-only maintenance task authorized separately: this reconciliation deliberately changes no `src/` or tests. Current Markdown boundaries are corrected. |

## Unknown / awaiting evidence

| ID / status / severity | Area, evidence and impact | Dependency → next action |
|---|---|---|
| U1 · UNKNOWN · P2 | RP22: `#Имя` is lexically accepted but unresolved by live metadata; template golden validity/substitution semantics are not established. | Validator provenance + reproducible metadata/substitution context. |
| U2 · UNKNOWN · P2 | RP24: sequence `Границы` layout unknown because the recorded live base had no sequences; marked models remain Apply-blocked. | A base with sequence metadata + canonical output. |
| U3 · UNKNOWN · P2 | `computeJoinVisibility` deliberately treats disconnected FROM roots as mutually visible; fallback is tested, platform scope behavior is not verified. | Minimal live comma-source/JOIN scope probes before narrowing visibility. |

Accounting input validity (C1), temporary projection canonical output (A2), and
private-corpus availability/provenance (V1) remain evidence qualifications on those
tasks, not duplicate UNKNOWN tickets. Dynamic BSL, metadata-only inability to
list database values, unknown reference types and accepted fallback behavior are
product/design boundaries, not automatic debt.
