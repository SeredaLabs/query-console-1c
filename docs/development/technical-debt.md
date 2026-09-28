# Technical debt

Authoritative current engineering-debt ledger. Baseline reconciliation: 2026-09-27
against `b6286c57cfa64ff8cb9f937347c376d4b98d55c8`; implementation follow-up: 2026-09-28. Update status here; keep historical findings in
[audits](audits/stage-0.md), product boundaries in [known issues](known-issues.md),
and execution sequencing in [roadmap](roadmap.md).

Evidence and the complete RP01–RP25 disposition are in the
[baseline reconciliation](audits/reconciliation-b6286c57.md). That reconciliation used recorded platform verdicts and local reproduction.
The subsequent [C3 live observation and fix](audits/c3-hierarchy-2026-09-28.md)
records the supplied web-client probe and its evidence limits.
The [2026-09-28 implementation report](audits/near-term-2026-09-28.md) records
C1/D1/V4 closure and exact test commands; the linked C3 follow-up closes its
initial evidence boundary.

Statuses: **CLOSED** resolved/no remaining finding; **OPEN** confirmed outstanding;
**PARTIAL** some capability exists, work remains; **UNKNOWN** evidence insufficient;
**STALE** superseded claim/plan; **DUPLICATE** tracked elsewhere; **ABSORBED** included
in a named broader task. P1 = meaningful capability loss or preservation risk;
P2 = bounded behavior/verification gap; P3 = hardening, cosmetic, or maintenance.
No current item is promoted to P0 solely because Stage 0 used that label.

## Correctness

| ID / status / severity | Area, evidence and impact | Dependency → next action |
|---|---|---|
| C1 · CLOSED · P1 | Missing-register metadata no longer triggers accounting argument remapping: `applyAccountingMeta` retains the existing no-metadata fallback. Six regressions cover absent/empty/corpus/compatible metadata, unrelated edits, reopening and the known no-subconto layout. `09-rb-oboroty.sdbl` is unchanged. | Local preservation loss fixed; live validity of the fixture remains unverified and is not claimed by these tests. |
| C2 · OPEN · P1 | English SDBL, RP06/RP07: recorded platform-valid input is rejected at `SELECT`; Russian-only detection, contextual words and metadata names also block end-to-end support. | A1 spike → English acceptance/canonicalization stage with platform-recorded RU/EN pairs. |
| C4 · CLOSED · P1 | With metadata, a bare condition field of a sole-source subquery in ГДЕ/ИМЕЮЩИЕ/ПО binds to the enclosing owner when the inner source lacks it and the nearest enclosing level has exactly one owner — the live-verified nearest-ancestor rule already used for the select list. Explicit `Внешний.Поле` paths there are no longer double-qualified (`В.А.Флаг`). No metadata, unknown inner schema or same-level ambiguity keep the previous binding. 24 regressions in `correlatedConditions.test.ts`; golden output unchanged in both modes (1976/1976). | [Live wizard check](audits/c4-correlated-2026-09-28.md): three condition shapes are byte-identical to the 1C query wizard with metadata. Without metadata the old binding remains (documented limitation). `checkFieldPaths` still skips subquery conditions (fail-open kept). |
| C3 · CLOSED · P2 | Live query-wizard text confirms RP20: `Г.Наименование ИЕРАРХИЯ` survives for `ИдентификаторыОбъектовМетаданных`. Unknown metadata now preserves the entered modifier; known-metadata rules remain. Added 18 unit regressions and Classic/Canvas browser checks; corrected only curated fixture 0078. | [Evidence, compatibility and baseline impact](audits/c3-hierarchy-2026-09-28.md). No new universal nonhierarchical-source or platform-build claim. |
| C7 · CLOSED · P2 | Result-processing boilerplate (`extractQueryParamNames`) and Query Text analysis now take parameters from the lexer-backed, typing-tolerant `collectQueryParameters`. Nothing from strings or comments; case variants are one parameter with the first spelling; names with non-Russian letters stay whole (the old regex cut `&Ціна` to `&Ц`); `usageCount` counts tokens. 5 regressions in `resultProcessingTemplate.test.ts`/`queryAnalysisService.test.ts`. | No BSL data-flow feature (the Level 0 boundary in `resultProcessingTemplate.ts` is unchanged). |
| C5 · CLOSED · P3 | Contract for platform-invalid input: reject on open, or open but block Apply; never write text with lost or altered content. RP04/05: nonempty extra `Обороты`/`ОстаткиИОбороты` args now set `unsafeExtraArgs` (Apply blocked; trailing empty slots still accepted). RP17: INDEX BY without the first member's ПОМЕСТИТЬ is rejected on open. RP23: `'…'` literals are rejected on open (lexer still tokenizes them). RP11/12 (malformed blocker) and RP15 (final reparse fails) already refused Apply; now locked by regressions. All in `invalidInputPreservation.test.ts`. | RP11/12/15 still open successfully: rejecting В/И aliases on open would contradict many existing tests/fixtures using `КАК В`, so it is not done here. |
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
| S1 · CLOSED · P2 | Structured ГДЕ/ИМЕЮЩИЕ `В (ВЫБРАТЬ …)` subqueries now record source-map events (`whereSubquery`/`havingSubquery`, written after member post-passes) and get a model-path segment; `collectSourceAliasSymbols`, `resolveSymbolTable` and `resolveAliasAt.descend` traverse them, so C21/C12 hover and completion resolve inner aliases with outer correlation. Events carry `depth`; descent matches by depth and parent range. That also fixed a latent bug: inside a source subquery with ОБЪЕДИНИТЬ every member resolved like member 0. 12 regressions in `conditionSubqueryScope.test.ts`; model/text unchanged with positions recorded. | Shadow baseline regenerated after review: 413 changed entries. 192 now agree with the legacy lookup. Of the other 221, 208 point to the source declared in the enclosing block, 11 point to subquery sources that the check cannot inspect, and 2 now return unknown instead of a wrong answer: a metadata name inside `ТИП(…)`, and an unstructured `НЕ ИСТИНА В (…)`. Subqueries kept as custom text (`ИЛИ` chains, `НЕ ИСТИНА В`) remain unindexed. |
| S2 · CLOSED · P2 | Recovery for the Stage 0 probes, semantic snapshot only (Apply never uses it). C06/C13: an unclosed `(` is repaired first even when the plain parse succeeds (a non-subquery `(` becomes a space). C11: an unclosed `(ВЫБРАТЬ` gets `)` at its statement end: appended after the last statement, otherwise written over the whitespace before or after its `;`, or inserted before it when there is none; inserted characters are listed and the snapshot maps event positions back to the source. So the inner aliases resolve through S1. Parentheses are counted per batch statement. C18/C19: ГРУППИРОВКА/ИМЕЮЩИЕ/ПОРЯДОК/ИТОГИ/ИНДЕКС sections are blanked at statement level, then also inside subqueries. The blank ends with a placeholder (`ДЛЯ ИЗМЕНЕНИЯ`, or `И 1`/`ГДЕ 1` for short sections; `ГДЕ 1` always fits) so the cursor stays inside the member range. A broken section inside a condition subquery does not fail the parse (the subquery silently becomes custom text): with such sections the nested repair is also tried and kept only when it yields more aliases. Bare `&`/unclosed literals: `SdblLexError` carries its offset; `repairLexicalErrorsForRecovery` blanks each failure (length-preserving, rethrows when it cannot make progress) and serves both the parameter scan and the snapshot, so alias assistance survives too. An unclosed string still swallows the statements after it. Every repair keeps original offsets. 21 + 5 regressions (`recoveryS2.test.ts`, `queryParameters.test.ts`). Corpus: all 1976 still `complete` (19 texts get the extra nested attempt), shadow baseline unchanged. | No known residual among the Stage 0 recovery probes; recovery stays a snapshot-only aid and is never used for Apply. |
| S3 · CLOSED · P3 | Snapshot contract narrowed to what is produced and consumed: `SemanticIndex` keeps only `symbolsById`. The always-empty `scopesById`/`referencesBySymbolId` (only a unit test read them) and their `Scope`/`Reference` types were removed. So was the never-produced `partial` completeness value (no consumer branched on it). Compatibility: internal in-memory type, not persisted, exported or part of any message protocol. | Scopes stay on-demand via source-map events (`resolveAliasAt`). A reference index or partial-tree state is added only with its first consumer. The frozen Stage 0 probe script under `audits/` still names the old maps and is not compiled. |

## Verification / corpus

| ID / status / severity | Area, evidence and impact | Dependency → next action |
|---|---|---|
| V1 · PARTIAL · P2 | 1976 golden entries pass, all positive and none starting with English SELECT. Negative unit examples exist, but no platform-attested negative/English corpus. Golden provenance lacks per-entry platform build/metadata attestation; 85 inputs contain `#`. Query fixtures are generator-derived, hence not an independent oracle. | Preserve ADR 0004 canonical contract → attested negative/English/metadata-mode cases and explicit provenance; U1 remains unknown. |
| V2 · OPEN · P2 | Tree-sitter oracle unavailable in ordinary checkout/CI. Helper warns then returns; Vitest counts tests as passed. Source/toolchain/artifact are unpinned; Stage 0 recorded ABI 15 vs runtime 13–14 incompatibility. | Reproducible compatible dev-only artifact + manifest/checksum → explicit CI missing-oracle policy. Never add a runtime dependency. |
| V3 · PARTIAL · P2 | Apply has parser acceptance, selected semantic checks and static unsafe/malformed guards. It has no input/output semantic-equivalence check, and the expression acceptor deliberately ignores precedence. Boolean truth-table regressions cover a subset. | A1 → bounded transformation-preservation checks and reviewed canonical evidence; not a theorem prover or mandatory live query execution. |
| V4 · CLOSED · P2 | Recorded gate added: six Classic/Canvas browser round-trips, Canvas alias/condition/sort edits, duplicate-alias recovery, unsafe/malformed Save guards and load failure. A real VS Code webview test loads the production Canvas bundle, edits an alias, clicks Save and verifies only the captured BSL literal changes through the real bridge. | See [verification scope](testing-and-release.md#canvas-verification). This is a bounded regression gate, not exhaustive UI coverage or live-platform equivalence; Canvas stays opt-in preview. |

## Documentation

| ID / status / severity | Area, evidence and impact | Dependency → next action |
|---|---|---|
| D1 · CLOSED · P3 | Corrected source comments for symbol wiring, recovered source maps, semantic Apply checks, shipped parameter support, unsafe-marker coverage, malformed-expression traversal and lexer failures (D03–D09 in the reconciliation). | Comment-only maintenance; no remaining implementation dependency. |

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
