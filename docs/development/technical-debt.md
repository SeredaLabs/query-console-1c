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
| C2 | OPEN · P1 | English SDBL is platform-valid in recorded RP06/07 but rejected by the Russian parser/detection; contextual keywords and metadata names also need language handling. [Platform results](audits/stage-0/platform-reprobe-results.jsonl). | Token identity spike under A1, then attested RU/EN acceptance/canonicalization pairs. |
| C6 | OPEN · P3 | Two JOIN shapes add parentheses on a second pass; [truth-table tests](../../test/unit/booleanGroupingSemantics.test.ts) verify both outputs but exempt text equality. | Bounded canonical-layout work over A1; no semantic defect inferred. |
| C17 | OPEN · P1 | Raw ГДЕ/ИМЕЮЩИЕ/JOIN/field/group/TOTALS slices still lose comments in core generation. The shared designer warns and requests confirmation before LOAD_BATCH; Cancel keeps original text unchanged, confirmation permits a candidate whose Save can lose comments. The check compares only exact comment text/counts, not placement: a standalone ГДЕ comment relocated to `afterFrom` after ИЗ counts as preserved ([contract](contracts/safety-and-preservation.md#original-text-and-designer-loading)). [Core boundary](../../test/unit/rawSliceComments.c16.test.ts), [open gate](../../test/unit/openDesignerBatch.test.ts). | Comment-aware expression rendering over shared lexical facts. Explicit consent to loss does not close preservation support. |
| C18 | OPEN · P2 | Negated condition subquery with keyword alias `В` is misparsed; malformed-expression guard blocks Apply. [Regression](../../test/unit/canvasPreserveBoundaries.test.ts). | Narrow disambiguation with corpus evidence; separate from Canvas UX. |
| C21 | UNKNOWN · P2 | Field-headed binary ORDER expressions such as `Т.Код + 1` fail during parsing on `main 3c2e66e` and the current branch. Platform documentation allows ORDER expressions generally; this exact query has no type-valid live attestation and no matching golden form. [Investigation](#c21-order-expression-evidence). | Attest an arithmetic sort key over a known numeric field, then scope a narrow `parseOrder` change under A1. No parser change in this finding. |

The [safety contract](contracts/safety-and-preservation.md) specifies refusal,
comment handling and recovery limits. No outstanding correctness item is P0.

### C21 ORDER expression evidence

Investigation: 2026-09-30. UNKNOWN concerns **platform validity of the reported
arithmetic form**, not whether the local parser rejects it. This is pre-existing
shared-parser behavior, not a regression from Canvas or comment-loss confirmation.

```sdbl
ВЫБРАТЬ Т.Код КАК А ИЗ Справочник.Валюты КАК Т УПОРЯДОЧИТЬ ПО Т.Код + 1
```

`tryOpenBatch` returns `ok: false` with:

```text
Ошибка разбора 1:69 — после конца запроса остались нераспознанные данные (получено «+»)
```

The failure reproduces with and without the corpus metadata resolver on both
`main 3c2e66e` and this branch. The baseline probe bundles core source read
from `git show 3c2e66e:<path>`; it does not switch or modify the main checkout.
The same query ordered by `Т.Код` or `ЕСТЬNULL(Т.Код, "")` opens in all four
revision/resolver combinations.

Platform evidence: the official [1C Practical developer guide, Lesson 13,
ordering query results](https://kb.1ci.com/1C_Enterprise_Platform/Tutorials/Practical_developer_guide_8.3/Lesson_13._Reports/Selecting_data_from_a_single_table/In_Designer_mode/)
describes ORDER BY as a list of fields **or expressions**, so expression-based
ordering is not universally unsupported by 1C. The [official 8.1 → 8.2
compatibility guidance](https://its.1c.ru/db/content/metod8dev/src/developers/additional/guides/i8103272.htm)
also discusses ORDER expressions and the separate DISTINCT/selection-list
restriction. These are documentation evidence, not execution of this fixture.
The reported query has no DISTINCT, but the [corpus metadata](../../test/fixtures/corpus/metadata/cf/Catalogs/Валюты.yaml)
defines `Валюты.Код` as `Строка(3)`. It must not be presented as an attested numeric
addition example. A string-concatenation variant `Т.Код + ""` locally hits the
same `+` parse failure; neither variant was executed in a live 1C base.

Corpus check: all 1976 `valid: true` records in [golden.jsonl](../../test/fixtures/corpus/golden.jsonl)
were inspected in both `input` and `query_text`. Each column parses without
failures and contains 321 non-DCS ORDER clauses. The parsed ORDER expressions
are 10 parameter keys and 11 function keys; no field/path-headed binary
arithmetic key was found by a token-aware clause scan. Examples include
`&ПоляУпорядочивания` (CommonModules-КонтрольВеденияУчетаСлужебный-Ext-Module.bsl_22.txt)
and `МАКСИМУМ(ЕСТЬNULL(ТаблицаРегистра.Период, ДАТАВРЕМЯ(3000, 1, 1)))`
(CommonModules-ОбновлениеИнформационнойБазы-Ext-Module.bsl_2.txt).
Absence from this positive corpus is not proof of platform rejection.

Code/test boundary: [parseOrder](../../src/core/query/sdblParser.ts) has special
branches for parameters, CASE, calls, comparisons and IS NULL. A field/path
followed by `+` falls through to a bare reference, leaving the operator unread.
The [parser ORDER round-trip tests](../../test/unit/sdblParser.test.ts) cover
field/alias/direction/auto/qualification cases; [hierarchy tests](../../test/unit/orderHierarchyDirection.test.ts)
cover modifier order and metadata behavior. They do not establish arithmetic
ORDER support. The [malformed-expression test](../../test/unit/semanticValidator.test.ts)
accepts a manually constructed `order.expression = 'Т.Код + 1'` structurally;
that is neither text-parser acceptance nor live type validity.

Executed investigation gate: `npx vitest run test/unit/sdblParser.test.ts test/unit/orderHierarchyDirection.test.ts`
— 303 tests / 2 files passed unchanged. No parser, test, golden, snapshot or
classification changes; no live 1C execution. The next evidence must include
known numeric metadata and platform acceptance/canonical text before promoting
this arithmetic-form finding to OPEN or implementing it.

## Architecture

| ID | Status / priority | Remaining work and evidence | Next boundary |
|---|---|---|---|
| A1 | OPEN · P1 | Shared lexer already supplies tokens/spelling/positions; generator/formatter still re-scan raw characters and repeat contextual-word roles. Undefined-temp inference also scans raw text. Four migrated generator operations follow the [lexical contract](expression-lexical-contract.md), with no raw fallback. | One consumer at a time, identical valid output and explicit unknown facts. No new token layer, parser rewrite or independent expression grammar. |
| A2 | OPEN · P2 | Parser/designer producer schemas use scalar heads; semantic schemas use all `orderedSelectElements`, including tabular/trailing projections. [Lifetimes](../../src/core/query/tempTableSemantics.ts), [parser](../../src/core/query/sdblParser.ts), [store](../../src/webview/state/queryStore.ts). | Live projection/schema evidence, then one lifetime owner and producer-column function for all consumers, with corpus/validator coverage. Keep undefined-temp inference and parser-local literal typing separate. Preserve synthetic parser kind and non-reference literal markers until evidence supports change. |
| A3 | PARTIAL · P2 | [Expression context](../../src/webview/expressionEditor/expressionContext.ts) types a lone resolved field; arbitrary expressions remain unknown ([tests](../../test/unit/expressionContext.test.ts)). | Display-only inference using A1 representation and attested result types. The old independent walker proposal is obsolete; no separate grammar. |

The import cycle, module-load hooks and synchronous resolver stack are accepted
[decomposition constraints](architecture.md#known-internal-coupling), not extra
urgent refactor tickets. A1/A2 remain required engineering work.

## Verification

| ID | Status / priority | Remaining work and evidence | Next boundary |
|---|---|---|---|
| V1 | PARTIAL · P2 | Positive recorded golden cases have no per-entry platform-build/metadata attestation; negative/English attested corpus is absent. Template-marker substitution remains unproven. Generator-derived fixtures are not an independent oracle. [Corpus policy](corpus-testing.md). | Attested negative/English/metadata-mode cases and provenance; retain ADR 0004 canonical contract. Private corpus availability is a qualification here. |
| V2 | OPEN · P2 | Grammar WASM absent in ordinary checkout/CI: [helper](../../test/helpers/assertValidSdbl.ts) warns then returns, so green tests do not mean the independent oracle ran. Artifact/toolchain unpinned; historical ABI mismatch was source-inferred. | Compatible reproducible dev-only artifact, manifest/checksum and explicit missing-oracle CI policy; no runtime dependency. |
| V3 | PARTIAL · P2 | Shared Apply gate validates structure/selected semantics and malformed generated output, but never compares input/output semantics. Structural acceptor ignores precedence; Boolean truth tables cover a subset. [Apply regressions](../../test/unit/applyGeneratedOutput.test.ts). | Bounded transformation-preservation checks and reviewed canonical evidence over A1; no mandatory live execution or theorem prover. |

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
| UX-C3 | OPEN · P2 | HAVING, recursive condition-subquery GUI and structured Boolean-tree UX. | Preserve current representation; C18 parser limitation is separate. |
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
| U1 | UNKNOWN · P2 | RP22: `#Имя` lexically accepted but live metadata-unresolved; template golden validity/substitution semantics unestablished. | Validator provenance plus reproducible metadata/substitution context. |
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

| ID | Status | Resolved class / regression reference |
|---|---|---|
| C1 | CLOSED | Missing accounting metadata preserves fallback arguments; virtualTableRoundTrip.test.ts. Live fixture validity unverified. |
| C3 | CLOSED | ORDER hierarchy retained without metadata; [case-specific live evidence](audits/c3-hierarchy-2026-09-28.md). |
| C4 | CLOSED | Nearest-ancestor condition correlation with known metadata; [live evidence](audits/c4-correlated-2026-09-28.md), correlatedConditions.test.ts. No-metadata fallback retained. |
| C5 | CLOSED | Invalid input rejected on open or blocked on Apply; invalidInputPreservation.test.ts. |
| C7 | CLOSED | Lexer-backed parameter extraction; resultProcessingTemplate/queryAnalysisService tests. |
| C8 | CLOSED | Malformed reparsed generated output blocked; applyGeneratedOutput.test.ts. |
| C9 | CLOSED | HAVING retained by store/snapshots; [report](audits/c9-having-2026-09-29.md). |
| C10 | CLOSED | trailingFields/characteristics retained; [report](audits/c10-preserved-sections-2026-09-29.md), queryStore.corpusParity.test.ts. |
| C11 | CLOSED | Malformed expression-slot traversal; [report](audits/c11-malformed-slots-2026-09-29.md). |
| C12 | CLOSED | Reject unclosed characteristics; [report](audits/c12-characteristics-eof-2026-09-29.md). |
| C13–C15 | CLOSED | EOF readers terminate instead of exhausting host heap; [report](audits/c13-c15-raw-expression-eof-2026-09-29.md). |
| C16 | CLOSED | VT/ПЕРИОДАМИ argument comment preservation; [report](audits/c16-raw-slice-comments-2026-09-30.md), rawSliceComments.c16.test.ts. |
| C19 | CLOSED | Exported navigation-head paths retained; queryStore/sourceQueryDraft tests. |
| C20 | CLOSED | Shared UNION tail ORDER/TOTALS/INDEX editing; compoundSections tests and archived Canvas report. |
| S1 | CLOSED | Structured condition-subquery scopes; conditionSubqueryScope.test.ts. Opaque conditions remain unindexed. |
| S2 | CLOSED | Offset-preserving advisory recovery; recoveryS2/queryParameters tests. Never used for Apply. |
| S3 | CLOSED | Removed unused semantic maps/partial state; semanticSnapshot tests. |
| V4 | CLOSED | Bounded Canvas browser/host regression gate; testing-and-release. |
| D1 | CLOSED | Corrected stale source-contract comments; reconciliation/near-term reports. |
| Canvas baseline | CLOSED | Current capability matrix; archived baseline and full history reconciliation. |
