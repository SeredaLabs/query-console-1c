# Technical debt

The sole current engineering status ledger, revalidated against code/tests on
2026-09-30. [Architecture](architecture.md) explains dependencies,
[known issues](known-issues.md) describes visible limitations, and
[roadmap](roadmap.md) owns sequencing. [Audits](audits/README.md) preserve discovery
and platform evidence; their statuses are historical.

OPEN = confirmed work; PARTIAL = capability exists with a defined gap;
UNKNOWN = platform evidence is insufficient; CLOSED = resolved within the stated
scope. P0 = ordinary editing can crash/hang the host; P1 = meaningful capability
loss or preservation risk; P2 = bounded behavior/verification gap; P3 = cosmetic,
hardening or maintenance. Historic severity labels do not set current priority.

## Correctness

| ID | Status / priority | Remaining work and evidence | Next boundary |
|---|---|---|---|
| C2 | OPEN · P1 | English SDBL is platform-valid in recorded RP06/07 but rejected by the Russian parser/detection; contextual keywords and metadata names also need language handling. [Platform results](audits/stage-0/platform-reprobe-results.jsonl). In scope for the Query Core v1 [grammar parity](grammar-parity.md) gate (V5); Core v1 does not ship with this known gap. | Token identity spike under A1, then attested RU/EN acceptance/canonicalization pairs; implemented after or together with A1, not as more contextual-keyword special cases. |
| C24 | OPEN · P1 | Wildcard projection is rewritten during the Designer round trip and Apply allows the changed text: the open path parses without metadata (`tryParseBatch`), so `ВЫБРАТЬ *` becomes `* КАК Поле1` and `Т.*` becomes `Т.* КАК Поле1` (reproduced through the store and `decideApply`). Platform validity of the rewritten form is not yet attested; the golden canonical text expands the star. P1 because opening the Designer alone changes the projection and Apply writes the change. Dates from the initial import; found by the [grammar parity](grammar-parity.md) review. | Phase 5 probe `PQ-C24` (acceptance and Designer canonicalization of the original and rewritten forms); then never rewrite `*` with an alias. |

The [safety contract](contracts/safety-and-preservation.md) specifies refusal,
comment handling and recovery limits. No outstanding correctness item is P0.

### C21 ORDER expression evidence

Current status: CLOSED for the bounded arithmetic-key parser gap. The
[implementation report](audits/c21-order-expressions-2026-09-30.md) records the
token-based change, regression gates and unchanged corpus outputs. The following
table records the **pre-fix** behavior; it is not the current acceptance matrix.

Investigation: 2026-09-30. Pre-existing shared-parser behavior on `main 3c2e66e`,
not a regression from Canvas or comment-loss confirmation. Syntax probes used
source `РегистрНакопления.Продажи КАК Т`. This source is absent from the corpus
metadata, so the acceptance result below describes the metadata-free path,
not successful metadata-backed opening of that table:

| `УПОРЯДОЧИТЬ ПО …` | Result |
|---|---|
| `Т.Количество + 1` | rejected: «после конца запроса остались нераспознанные данные (получено «+»)» |
| `Т.Количество * Т.Сумма УБЫВ` | rejected at `*` |
| `-Т.Количество` | rejected: «ожидался псевдоним поля упорядочивания (получено «-»)» |
| `(Т.Количество + 1)` | rejected at `(` |
| `ЕСТЬNULL(Т.Количество, 0) + 1 УБЫВ` | opens; generated text is identical |

The originally reported `Справочник.Валюты … УПОРЯДОЧИТЬ ПО Т.Код + 1` fails the
same way. `Валюты.Код` is `Строка(3)` in the corpus metadata, but the parser
rejects the form before any typing, as the numeric-field probes show; field
types do not affect this finding.

Platform evidence: the official [1C Practical developer guide, Lesson 13,
ordering query results](https://kb.1ci.com/1C_Enterprise_Platform/Tutorials/Practical_developer_guide_8.3/Lesson_13._Reports/Selecting_data_from_a_single_table/In_Designer_mode/)
describes ORDER BY as a list of fields **or expressions**; the [official 8.1 → 8.2
compatibility guidance](https://its.1c.ru/db/content/metod8dev/src/developers/additional/guides/i8103272.htm)
also discusses ORDER expressions and the separate DISTINCT/selection-list
restriction. No form above was executed in a live 1C base.

Corpus check: all 1976 `valid: true` records in [golden.jsonl](../../test/fixtures/corpus/golden.jsonl)
were inspected in both `input` and `query_text`. Each column parses without
failures and contains 321 non-DCS ORDER clauses. The parsed ORDER expressions
are 10 parameter keys and 11 function keys; no field/path-headed binary
arithmetic key was found by a token-aware clause scan. Examples include
`&ПоляУпорядочивания` (CommonModules-КонтрольВеденияУчетаСлужебный-Ext-Module.bsl_22.txt)
and `МАКСИМУМ(ЕСТЬNULL(ТаблицаРегистра.Период, ДАТАВРЕМЯ(3000, 1, 1)))`
(CommonModules-ОбновлениеИнформационнойБазы-Ext-Module.bsl_2.txt).
Absence from this positive corpus is not proof of platform rejection.

Pre-fix code/test boundary: [parseOrder](../../src/core/query/sdblParser.ts) had special
branches for parameters, CASE, calls, comparisons and IS NULL. A field/path
followed by an operator fell through to a bare reference, leaving the operator
unread; a leading `(` or `-` was not accepted as a key head at all.
The [parser ORDER round-trip tests](../../test/unit/sdblParser.test.ts) cover
field/alias/direction/auto/qualification cases; [hierarchy tests](../../test/unit/orderHierarchyDirection.test.ts)
cover modifier order and metadata behavior. Those existing tests alone did not establish arithmetic
ORDER support. The [malformed-expression test](../../test/unit/semanticValidator.test.ts)
accepts a manually constructed `order.expression = 'Т.Код + 1'` structurally;
that is neither text-parser acceptance nor live type validity.

Historical investigation gate: `npx vitest run test/unit/sdblParser.test.ts test/unit/orderHierarchyDirection.test.ts`
— 303 tests / 2 files passed unchanged. No parser, test, golden, snapshot or
classification changes were made in that investigation; no live 1C execution.
Its initial UNKNOWN/live-probe prerequisite was superseded by the numeric-form
classification and the scoped C21 implementation. Regression tests use explicit
numeric test metadata: the corpus has no `РегистрНакопления.Продажи` table, so
that source name alone does not attest numeric metadata or live acceptance.

## Architecture

| ID | Status / priority | Remaining work and evidence | Next boundary |
|---|---|---|---|
| A1 | OPEN · P1 | Shared lexer already supplies tokens/spelling/positions; generator/formatter still re-scan raw characters and repeat contextual-word roles. Undefined-temp inference also scans raw text. Four migrated generator operations follow the [lexical contract](expression-lexical-contract.md), with no raw fallback. [EDT reference audit](audits/query-core-edt-2026-10-01.md#lexerparserserializer-boundaries) supports the layer separation; it does not establish EDT's internal scanner reuse. | One consumer at a time, identical valid output and explicit unknown facts. No new token layer, parser rewrite or independent expression grammar. |
| A2 | OPEN · P2 | Parser/designer producer schemas use scalar heads; semantic schemas use all `orderedSelectElements`, including tabular/trailing projections. [Audit reproduction](audits/query-core-edt-2026-10-01.md#projectionschema-model): producer/generator/semantic schema see `ID`, `Строки`, `Хвост`; parser registry/designer see only `ID`. Metadata-free evidence proves internal divergence, not platform validity of tabular output into a temp table. [Lifetimes](../../src/core/query/tempTableSemantics.ts), [parser](../../src/core/query/sdblParser.ts), [store snapshots](../../src/webview/state/queryStore/snapshots.ts). | Start with shared derived projection facts over the existing QueryModel, without output changes. Obtain live projection/schema evidence before switching schema consumers; converge on one lifetime owner and producer-column function with corpus/validator coverage. Keep undefined-temp inference and parser-local literal typing separate. Preserve synthetic parser kind and non-reference literal markers until evidence supports change. |
| A3 | PARTIAL · P2 | [Expression context](../../src/webview/expressionEditor/expressionContext.ts) types a lone resolved field; arbitrary expressions remain unknown ([tests](../../test/unit/expressionContext.test.ts)). [Audit type boundary](audits/query-core-edt-2026-10-01.md#semantictype-model): parser temp-table `Строка` markers also cover number/Boolean literals and mean non-reference, not their actual result type. | Display-only inference using A1 representation and attested result types; keep type facts separate from validation and do not infer types from compatibility markers. The old independent walker proposal is obsolete; no separate grammar. |

The [2026-10-01 EDT audit](audits/query-core-edt-2026-10-01.md) confirms the
existing A1/A2/A3 direction without new debt IDs or status/priority changes.
Continue in small gated steps under the [roadmap](roadmap.md); preservation work,
including C17, retains its priority. The audit does not justify a parser or
persisted QueryModel rewrite, a full expression AST, or EDT runtime dependencies.
Full DCS/SKD remains a future downstream layer for a concrete consumer, not a
current QueryModel expansion. EDT API structure is reference evidence, not
platform truth; canonical output changes still require platform evidence.

The import cycle, module-load hooks and synchronous resolver stack are accepted
[decomposition constraints](architecture.md#known-internal-coupling), not extra
urgent refactor tickets. A1/A2 remain required engineering work.

## Verification

| ID | Status / priority | Remaining work and evidence | Next boundary |
|---|---|---|---|
| V1 | PARTIAL · P2 | Positive recorded golden cases have no per-entry platform-build/metadata attestation; negative/English attested corpus is absent. Template-marker substitution remains unproven. Generator-derived fixtures are not an independent oracle. [Corpus policy](corpus-testing.md). | Attested negative/English/metadata-mode cases and provenance; retain ADR 0004 canonical contract. Private corpus availability is a qualification here. |
| V2 | OPEN · P2 | Grammar WASM absent in ordinary checkout/CI: [helper](../../test/helpers/assertValidSdbl.ts) warns then returns, so green tests do not mean the independent oracle ran. Artifact/toolchain unpinned; historical ABI mismatch was source-inferred. | Compatible reproducible dev-only artifact, manifest/checksum and explicit missing-oracle CI policy; no runtime dependency. |
| V3 | PARTIAL · P2 | Shared Apply gate validates structure/selected semantics and malformed generated output, but never compares input/output semantics. Structural acceptor ignores precedence; Boolean truth tables cover a subset. [Apply regressions](../../test/unit/applyGeneratedOutput.test.ts). | Bounded transformation-preservation checks and reviewed canonical evidence over A1; no mandatory live execution or theorem prover. |
| V5 | OPEN · P1 | Query Core v1 blocker, not a defect of the current product. [Grammar parity](grammar-parity.md) gate: 0 known platform-valid grammar gaps across the reviewed SDBL construct catalog, every entry with source/provenance and platform evidence where required, reported with coverage confidence. Core v1 = ordinary SDBL / Query Designer; DCS `{…}` is out of scope. The [catalog](../../test/fixtures/grammar-parity/catalog.jsonl) holds 153 entries (RP01–RP25 and 128 golden-attested forms, build unknown); known gaps: C2, C24. [Proposal](audits/sdbl-grammar-parity-proposal-2026-10-04.md). | Phase 3 review done: 70 areas = 35 covered + 34 pending + 1 out of scope; known gaps C2, C24. Phase 5: run the 34-probe queue (96 forms) on a live base, recording the platform build. Gates G2/G3/G5 run in the unit suite. |

V4 is CLOSED for the bounded [Canvas browser/real-host gate](testing-and-release.md#canvas-verification).
It does not certify every UI action, live-platform equivalence or release readiness.

## Canvas UX and release work

Functional capabilities and preserve-only boundaries live in the
[current Canvas matrix](../design/new-builder/feature-baseline.md). The functional
baseline is CLOSED; Canvas remains opt-in Preview. These are separate follow-ups,
not missing critical baseline work or a continuation of phase numbering.

| ID | Status / priority | Remaining work | Contract / dependency |
|---|---|---|---|
| UX-C1 | OPEN · P2 | Contextual grouping-set, dynamic report block and tabular projection editors. | Loaded representations survive unrelated edits; reuse domain/actions. |
| UX-C2 | OPEN · P2 | Package move controls and advanced source alias / ORDER hierarchy controls. | Keep loaded order/properties; use existing shared actions where available. |
| UX-C3 | OPEN · P2 | HAVING, recursive condition-subquery GUI and structured Boolean-tree UX. | Preserve current representation. |
| UX-C4 | OPEN · P2 | Responsive, keyboard, accessibility and release review of recursive workflows. | Baseline Enter/Space exists. Spatial navigation, all-workspace contrast/focus, minimap/viewport and screen-reader review remain before Preview removal. |
| UX-C5 | OPEN · P2 | UI → generated SDBL cross-highlight. | Generator has no semantic output-range contract; parser input maps are insufficient. Design stable model/output ranges first; no heuristic text search. Read-only dock/highlight/copy/resize/collapse is complete. |
| UX-C6 | OPEN · P2 | Advanced field-to-field JOIN drag, shortcuts and find/focus helpers. | Existing drag/pan/zoom/search/basic activation stays; narrow UX design, no domain duplication. |
| UX-C7 | OPEN · P2 | Sort-priority reorder UI. | Array order is preserved; no MOVE_ORDER action exists. Add a narrow shared action with both-UI tests. |
| UX-C8 | OPEN · P2 | Canvas cache refresh and lazy reference-field expansion parity. | Classic has refresh/ref message handling and SET_REF_FIELDS; Canvas lacks controls/response wiring. Reuse host/session; loaded navigation already works. |
| UX-C9 | OPEN · P2 | Full positional UNION mapping for tabular/trailing projections. | Scalar-only deriveUnionColumns differs from generator orderedSelectElements. Preserve-only guard suppresses partial mapping. Shared alignment plus safe alias/reorder contract; coordinate A2 without requiring full A2 completion first. |
| UX-C10 | OPEN · P3 · DEFERRED | Global stable Query/Scope ID proposal. | No current consumer needs persistent cross-tree identity. Local recursive drafts work with parent source IDs; this is not a baseline or release prerequisite. |

EXISTS/NOT EXISTS, scalar SELECT subqueries and structured JOIN subqueries remain
unsupported shared grammar/model ideas, not promised Canvas features. Raw JOIN
expressions are editable; new grammar needs a separately scoped shared task.

## Platform unknowns

| ID | Status / priority | Evidence boundary | Needed evidence |
|---|---|---|---|
| U1 | UNKNOWN · P2 | RP22: `#Имя` lexically accepted but live metadata-unresolved; template golden validity/substitution semantics unestablished. [Grammar parity](grammar-parity.md): syntax in scope; syntax/preservation confirmed locally; substitution semantics UNKNOWN; current Apply behavior retained pending platform evidence. | Validator provenance plus reproducible metadata/substitution context; answer whether Query Core editing/generation can change the value or scope of `#Имя` (if yes, add a safety gate). |
| U2 | UNKNOWN · P2 | RP24: live base had no sequences; `Границы` real argument layout unconfirmed. Marked models are Apply-blocked. | Sequence-enabled base and canonical output. |
| U3 | UNKNOWN · P2 | Disconnected FROM roots deliberately see each other in computeJoinVisibility; [fallback regression](../../test/unit/joinVisibility.test.ts) is not platform attestation. | Minimal live comma-source/JOIN scope probes before narrowing visibility. |

C1 accounting-fixture validity and A2 projection output remain evidence
qualifications on those items, not duplicate UNKNOWN tickets. Metadata cannot
provide database values; dynamic BSL/execution and unresolved reference types are
product boundaries, not automatic debt.

## Closed regression register

Long discovery/fix histories, reviewed output changes and former severity/counts
are retained in the [pre-consolidation ledger](audits/archive/technical-debt-e3b36a5.md)
and [audit index](audits/README.md).

C18 is absorbed into C5 / RP11: the [recorded RP11 platform evidence](audits/stage-0/platform-reprobe-results.jsonl)
rejects the source alias at `КАК В` with “Name expected”. The C18 input opens,
but the malformed-expression guard blocks Apply, satisfying C5's invalid-input
contract. Rejecting every `КАК В` on open was deliberately not adopted in C5
because existing tests and fixtures use that alias. The same negated
`В ИЕРАРХИИ` condition subquery with the valid alias `Вал` parses structurally
and has a stable generated round trip; there is no parser defect for this valid
input. The existing C18 regression remains unchanged and pins the Apply blocker.

| ID | Status | Resolved class / regression reference |
|---|---|---|
| C1 | CLOSED | Missing accounting metadata preserves fallback arguments; virtualTableRoundTrip.test.ts. Live fixture validity unverified. |
| C3 | CLOSED | ORDER hierarchy retained without metadata; [case-specific live evidence](audits/c3-hierarchy-2026-09-28.md). |
| C4 | CLOSED | Nearest-ancestor condition correlation with known metadata; [live evidence](audits/c4-correlated-2026-09-28.md), correlatedConditions.test.ts. No-metadata fallback retained. |
| C5 | CLOSED | Invalid input rejected on open or blocked on Apply; invalidInputPreservation.test.ts. |
| C6 | CLOSED | Two JOIN shapes (`((a ИЛИ b) И c) И d`, `a И ((b ИЛИ c) И d)`) wrapped one more conjunct in parentheses on the second pass. A JOIN conjunct whose ИЛИ sits only in nested parentheses is now split at its top-level И on the first pass, as reopening did; И is associative. [booleanGroupingSemantics](../../test/unit/booleanGroupingSemantics.test.ts) no longer exempts any shape from text equality and still checks truth tables for both passes. |
| C7 | CLOSED | Lexer-backed parameter extraction; resultProcessingTemplate/queryAnalysisService tests. |
| C8 | CLOSED | Malformed reparsed generated output blocked; applyGeneratedOutput.test.ts. |
| C9 | CLOSED | HAVING retained by store/snapshots; [report](audits/c9-having-2026-09-29.md). |
| C10 | CLOSED | trailingFields/characteristics retained; [report](audits/c10-preserved-sections-2026-09-29.md), queryStore.corpusParity.test.ts. |
| C11 | CLOSED | Malformed expression-slot traversal; [report](audits/c11-malformed-slots-2026-09-29.md). |
| C12 | CLOSED | Reject unclosed characteristics; [report](audits/c12-characteristics-eof-2026-09-29.md). |
| C13–C15 | CLOSED | EOF readers terminate instead of exhausting host heap; [report](audits/c13-c15-raw-expression-eof-2026-09-29.md). |
| C16 | CLOSED | VT/ПЕРИОДАМИ argument comment preservation; [report](audits/c16-raw-slice-comments-2026-09-30.md), rawSliceComments.c16.test.ts. |
| C18 | CLOSED | DUPLICATE/ABSORBED in C5 / RP11: platform-invalid source alias `В`; [RP11 platform evidence](audits/stage-0/platform-reprobe-results.jsonl), unchanged [Apply-blocking regression](../../test/unit/canvasPreserveBoundaries.test.ts) and [C5 invalid-input coverage](../../test/unit/invalidInputPreservation.test.ts). |
| C19 | CLOSED | Exported navigation-head paths retained; queryStore/sourceQueryDraft tests. |
| C20 | CLOSED | Shared UNION tail ORDER/TOTALS/INDEX editing; compoundSections tests and archived Canvas report. |
| C17 | CLOSED | User `//` comments survive open → edit → Save → reopen in every known slot: WHERE/HAVING and JOIN conditions, SELECT projections, GROUP/ORDER/TOTALS sections (after their header), VT/ПЕРИОДАМИ arguments (C16), and — relocated after ИЗ or before ВЫБРАТЬ — source names/aliases, JOIN/comma sources, ИНДЕКСИРОВАТЬ, ДЛЯ ИЗМЕНЕНИЯ, ПОМЕСТИТЬ, UNION separators (including between ОБЪЕДИНИТЬ and ВСЕ), a comma-only line, a comment after the final `;` and УНИЧТОЖИТЬ. A token-gap fuzz over the corpus (one comment after every token) finds no loss and no refused open; the remaining reopen instability was the pre-existing C23 layout drift, since closed. Original intra-expression placement is not promised; text and occurrence counts are. The consent dialog stays as a safety net for renderer regressions. [Contract](contracts/safety-and-preservation.md#original-text-and-designer-loading); suites `*.c17.test.ts`, `rawSliceComments.c16.test.ts`. |
| C21 | CLOSED | Arithmetic ORDER keys headed by a field/path, `(` or unary `-` use the existing token reader and expression model; [report](audits/c21-order-expressions-2026-09-30.md), [regressions](../../test/unit/orderExpressions.c21.test.ts). Full platform expression/type validity remains outside this fix. |
| C22 | CLOSED | A multiline TOTALS aggregate inside a nested query no longer gains a tab per reopen; fixed with C23. [Regression](../../test/unit/nestedRawIndent.c23.test.ts); the TOTALS and ORDER comment matrices include nested wrappers again. |
| C23 | CLOSED | Raw multiline text of a nested query (conditions such as `ВЫБОР … КОНЕЦ = ВЫБОР … КОНЕЦ` with subqueries, TOTALS expressions, …) kept the nesting padding of its text, which the generator added again on every reopen (also on 0.1.96, without comments). `parseDocument` rebases continuation lines of every multiline string in the parsed model by the query's own section-line indentation, skipping literal contents, lexically rejected text and nested subqueries (normalized by their own parse); a top-level query has no padding and is unchanged. [Regressions](../../test/unit/nestedRawIndent.c23.test.ts); full-corpus comment fuzz and corpus outputs unchanged. |
| S1 | CLOSED | Structured condition-subquery scopes; conditionSubqueryScope.test.ts. Opaque conditions remain unindexed. |
| S2 | CLOSED | Offset-preserving advisory recovery; recoveryS2/queryParameters tests. Never used for Apply. |
| S3 | CLOSED | Removed unused semantic maps/partial state; semanticSnapshot tests. |
| V4 | CLOSED | Bounded Canvas browser/host regression gate; testing-and-release. |
| D1 | CLOSED | Corrected stale source-contract comments; reconciliation/near-term reports. |
| Canvas baseline | CLOSED | Current capability matrix; archived baseline and full history reconciliation. |
