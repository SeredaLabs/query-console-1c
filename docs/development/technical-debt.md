# Technical debt

The sole current engineering status ledger, revalidated against code/tests on
2026-09-30; open items updated 2026-10-18. [Architecture](architecture.md) explains dependencies,
[known issues](known-issues.md) describes visible limitations, and
[roadmap](roadmap.md) owns sequencing. [Audits](audits/README.md) preserve discovery
and platform evidence; their statuses are historical.

Each area below starts with a one-line table; long evidence follows under the
item's own heading. The [open items](#open-items) table lists all unfinished work in
one place, ordered by priority.

**Status and priority.** OPEN = confirmed work; PARTIAL = capability exists with a defined gap; UNKNOWN = platform evidence is insufficient; CLOSED = no further work within the stated scope — a closed row names its kind: fixed (the default), superseded (another mechanism does the job) or declined (no consumer or deliberately not done); ACCEPTED = a deliberate, documented divergence from the platform's canonical text, kept by decision (not work; the grammar-parity gate accepts only the constructs listed for it in `ACCEPTED_DIVERGENCES`); REOPENED = a closed item with new confirmed cases. P0 = ordinary editing can crash/hang the host; P1 = meaningful capability loss or preservation risk; P2 = bounded behavior/verification gap; P3 = cosmetic, hardening or maintenance. Historic severity labels do not set current priority.

## Open items

21 items: P1 — 1, P2 — 14, P3 — 6. No item is P0.

| ID | Status / priority | Area | What is left |
|---|---|---|---|
| V5 | OPEN · P1 | Verification | Query Core v1 gate: 0 known platform-valid grammar gaps. Phase 5 partial: 88 adapted cases on 8.3.15.1489; 53 fully attested cases produce the same platform canonical text. Modern-version and metadata coverage, catalog promotion, C37–C40 remain open; C36 is an accepted divergence. |
| C29 | PARTIAL · P2 | Correctness | Metadata column synthesis: four platform rules fixed; cases absent from SL_kza and the old-YAML fallback path remain unverified. |
| C41 | OPEN · P2 | Correctness | Metadata validation (open, Apply, editor diagnostics) skips field paths kept as raw expression text: `ПолеN` aliases, arithmetic, non-aggregate functions, `ВЫБОР`, WHERE/JOIN conditions. |
| A3 | PARTIAL · P2 | Architecture | The expression editor types resolved fields and simple literals, numeric arithmetic over constants/direct metadata fields, and bounded SUBSTRING calls; other compound expressions stay untyped. |
| V1 | PARTIAL · P2 | Verification | Golden corpus entries have no per-entry platform/metadata attestation; no attested negative or English cases. |
| V3 | PARTIAL · P2 | Verification | The Apply gate never compares input and output semantics. |
| U2 | UNKNOWN · P2 | Platform unknowns | Sequence `Границы` argument layout unconfirmed (no base with sequences); such queries are Apply-blocked. |
| UX-C1 | OPEN · P2 | Canvas UX | Contextual grouping-set, dynamic report block and tabular projection editors. |
| UX-C2 | OPEN · P2 | Canvas UX | Package move controls and advanced source alias / ORDER hierarchy controls. |
| UX-C3 | OPEN · P2 | Canvas UX | HAVING, recursive condition-subquery GUI and structured Boolean-tree UX. |
| UX-C4 | OPEN · P2 | Canvas UX | Responsive, keyboard, accessibility and release review of recursive workflows. |
| UX-C5 | OPEN · P2 | Canvas UX | UI → generated SDBL cross-highlight. |
| UX-C6 | OPEN · P2 | Canvas UX | Advanced field-to-field JOIN drag, shortcuts and find/focus helpers. |
| UX-C8 | OPEN · P2 | Canvas UX | Canvas cache refresh and lazy reference-field expansion parity. |
| UX-C9 | OPEN · P2 | Canvas UX | Full positional UNION mapping for tabular/trailing projections. |
| C40 | PARTIAL · P3 | Correctness | Apply now refuses scalar subqueries in comparisons, ВЫБОР, join conditions and function arguments (rejected by 8.3.15.1489); only the newer-platform verdict is missing. |
| R11 | PARTIAL · P3 | Correctness | Constructor-parity GROUP BY: three rewrites were removed (they over-fired on every probe in the repository); the platform's own GROUP BY reconstruction is not modelled and historical positive witnesses are unavailable. The Designer keeps GROUP BY as written. |
| C34 | PARTIAL · P3 | Correctness | English calculation-register, chart-of-calculation-types and sequence names are mapped, but not platform-attested (two names from the official 1C guide, four from a third-party grammar); `Base<Register>` is deliberately not mapped. |
| C37 | OPEN · P3 | Correctness | RIGHT JOIN canonicalization differs from the platform; generated text is platform-equivalent. |
| C38 | OPEN · P3 | Correctness | ПЕРИОДАМИ omitted arguments differ from platform canonical text; generated text is platform-equivalent. |
| C39 | OPEN · P3 | Correctness | English standard field names remain English in Russian output; platform canonical text translates them. |

## Correctness

| ID | Status / priority | Summary |
|---|---|---|
| C29 | PARTIAL · P2 | Metadata column synthesis: four platform rules fixed; cases absent from SL_kza and the old-YAML fallback path remain unverified. [Details](#c29-metadata-column-synthesis). |
| C41 | OPEN · P2 | Metadata validation skips field paths kept as raw expression text (`ПолеN` aliases, arithmetic, non-aggregate functions, `ВЫБОР`, WHERE/JOIN conditions). [Details](#c41-metadata-validation-of-raw-expressions). |
| R11 | PARTIAL · P3 | Constructor-parity GROUP BY: three rewrites were removed (they over-fired on every probe in the repository); the platform's own GROUP BY reconstruction is not modelled and historical positive witnesses are unavailable. The Designer keeps GROUP BY as written. [Details](#r11-group-by-semantics). |
| C34 | PARTIAL · P3 | English calculation-register, chart-of-calculation-types and sequence names are mapped, but not platform-attested (two names from the official 1C guide, four from a third-party grammar); `Base<Register>` is deliberately not mapped. [Details](#c34-english-sdbl-leftovers). |
| C37 | OPEN · P3 | RIGHT JOIN canonicalization differs from the platform; generated text is platform-equivalent. [Evidence](audits/v5-phase5-2026-10-21.md). |
| C38 | OPEN · P3 | ПЕРИОДАМИ omitted arguments differ from platform canonical text; generated text is platform-equivalent. [Evidence](audits/v5-phase5-2026-10-21.md). |
| C39 | OPEN · P3 | English standard field names remain English in Russian output; platform canonical text translates them. [Evidence](audits/v5-phase5-2026-10-21.md). |
| C40 | PARTIAL · P3 | Apply now refuses scalar subqueries in comparisons, ВЫБОР, join conditions and function arguments (rejected by 8.3.15.1489); only the newer-platform verdict is missing. [Evidence](../../test/fixtures/platform/c40-scalar-subquery.json). |

The [safety contract](contracts/safety-and-preservation.md) specifies refusal,
comment handling and recovery limits. No outstanding correctness item is P0.

### C29. Metadata column synthesis

**Status:** PARTIAL · P2

Metadata column synthesis differed from the platform in four rules (СхемаЗапроса and `get_metadata_structure` on SL_kza, 2026-10-11; 97 objects compared, all others equal including common attributes and their order). The four rules are fixed in the parsers with XML regressions (`test/unit/metadataSynthesis.c29.test.ts`); the snapshot format version is raised to 2, so a snapshot built by the old parser is rebuilt from XML (regression in the same file).

1. `Проведен` after `Дата` in every document, whatever `Posting` says. Platform: confirmed, also for `Запретить` (`Встреча`, `ДокументРасчетовСКонтрагентом`). XML: the fixture document has no `Posting` element.

2. `ДатаОбмена` is not a column of an exchange plan. Platform: `Field not found` everywhere. XML: the standard attribute `ExchangeDate` is listed and stays in the parsed XML; only the column is dropped.

3. A data separator (`DataSeparation = Separate`) used `Auto` with `AutoUse = Use` is a column only of exchange plans. Platform: confirmed for every kind in SL_kza. XML: `ОбластьДанныхОсновныеДанные` lists all 211 items as `DontUse`, so `Auto` is an unlisted object, which `mergeCommonAttributes` already attached only to exchange plans; an explicitly listed `Auto` item now follows the same rule, but no configuration has such an item, so that branch rests on the platform rule only.

4. `Порядок` after `Наименование` when `OrderLength > 0`. Platform: confirmed (`ПланСчетов.Хозрасчетный`). XML: the fixture chart has `OrderLength = 0` and no `Порядок`.

Unverified (not platform parity): a chart of accounts with `OrderLength = 0` having no `Порядок`; a non-separator common attribute used `Auto` (behaviour unchanged; none in SL_kza); an explicitly listed `Auto` separator item; calculation registers (absent in SL_kza).

Caches: a YAML generation is rebuilt from XML by the same parsers; an existing YAML dir is read only when both XML builds fail, and it is not versioned by parser: a YAML built by the old parser still shows the old columns on that last-resort path (the stale warning fires only when the XML is newer than the YAML). The committed corpus YAML (`test/fixtures/corpus/metadata/cf`) was generated by the old parser and still lists `ДатаОбмена`; its source XML is not in the repository, so it was not regenerated (corpus output unchanged).

**Next boundary:** Confirm the unverified cases on a configuration that has them before C24 step 1 relies on completeness there.

### R11. GROUP BY semantics

**Status:** PARTIAL · P3

GROUP BY semantics.

Step 1 (2026-10-12): the six GROUP BY rewrites that copy the 1C query constructor (`dropRedundantGroupDerefs`, `moveBeforePrefixGroupDerefToEnd`, `moveLeadingMovementCaseToEnd`, `dropFunctionallyDeterminedMovementCase`, `relocateKeptMovementCase`, `substituteGroupFieldWithSelectExpr`) run only in the constructor-parity mode (oracle/corpus); the Designer (`preserve`) and hover (`analysis`) keep the GROUP BY items and their order.

Fixed production P1: they ran in the Designer whenever the batch had a temp table (the temp-table resolver passed their `if (!resolver)` gate), and `substituteGroupFieldWithSelectExpr` replaced a nested query's `Т.Наименование` by a `ВЫБОР` selecting on it — СхемаЗапроса keeps the GROUP BY; `execute_query` (SL_kza 2026-10-12): 11 rows → 2 after Apply; also when `Т.Наименование` was only inside a string literal ([regression](../../test/unit/groupByPreserve.r11.test.ts), evidence `test/fixtures/platform/r11-group-by.json`). A corpus-wide Designer check (306 runs, with and without a temp table) finds no other GROUP BY change except equivalent parenthesis normalization inside `*`/`/` chains and the parameter case registered as C31.

Step 2 (2026-10-13): the seven raw-text gates of these rules read code through the shared lexer — `hasAggregateCall` (former `AGG_RE`, three rules; English names stay for C2), the aggregate-consumer check of `moveBeforePrefixGroupDerefToEnd` (former `includes`, also matched inside a longer name), `containsFieldRef`, `derefInResultPosition`, `normExpr` (literals compared exactly), `isMovementCaseExpr`, `isMovementResultExpr` (former `MOVEMENT_RE`); field names still match case-sensitively. A code-like literal no longer changes the GROUP BY, as on the platform (S2, S3b, S6 now as СхемаЗапроса; new L1–L4 neutral/code-like pairs and L2b in `r11-group-by.json`, [regression](../../test/unit/groupByLexerGates.r11.test.ts)); corpus unchanged in both modes.

Remaining (constructor parity only, the Designer keeps the GROUP BY): the rules themselves differ from СхемаЗапроса for some shapes, also with a neutral literal — `substituteGroupFieldWithSelectExpr` replaces a nested query's field where the platform keeps it (S1, L1_agg_subst, L4), `dropRedundantGroupDerefs` keeps a reference consumed after `ТОГДА` where the platform drops it and groups the `ВЫБОР` (L1_agg_drop), `moveBeforePrefixGroupDerefToEnd` moves a reference used in an aggregate where the platform keeps the order (L2b_same_name).

**Next boundary:** Rule-level parity of these three rules against СхемаЗапроса (corpus accept:oracle evidence and the L/S probes disagree: find the distinguishing condition first); close R11 after it.

**First bounded slice (triaged 2026-10-19):** Start with `substituteGroupFieldWithSelectExpr` in `dropRedundantGroupDerefs.ts`, using S1, `L1_agg_subst` and `L4_norm_literal` from the existing platform fixture. The latter two currently have neutral/payload invariance assertions in `groupByLexerGates.r11.test.ts`, not direct assertions that our GROUP BY equals the platform's. Green tests therefore do not close this parity gap. Add direct platform-result regressions first, identify the distinguishing condition against the existing corpus, then narrow this one rule. Keep the other two rules and the preserve/analysis policy unchanged. Validate with both R11 suites and a reviewed before/after corpus comparison in both modes; do not update golden output merely to make the suite pass. This triage does not establish the missing condition or close R11.

**Slice investigation (2026-10-20):** Direct platform comparisons now cover S1,
both L1 substitution variants and both L4 variants, plus four fresh
[`validate_query` probes](../../test/fixtures/platform/r11-substitution-probes.json)
(no execution; the tool did not report the platform build). All nine constructor
comparisons fail on the current implementation; they are explicitly `it.fails`
in `groupByLexerGates.r11.test.ts`, with parsing/generation outside the expected-failure
assertions. The same nine cases pass in preserve and analysis. A field in the CASE
result rather than its condition, and removing the aggregate column, do not by
themselves make the platform substitute it.

An instrumented temporary build found **zero substitutions across the 1,976
committed corpus inputs with metadata in constructor mode**. That corpus cannot
distinguish a correct narrowing from disabling the rule. A control run on the four
new probes recorded four substitutions, confirming the instrumentation observes
the rule (checked 2026-10-21). Historical commits
`2593a0e2` and `b1b1f4c7` cite a positive `ЗависшиеЗадачи` case in the private
17,933-query corpus, but do not include its query/expected output; that case is
absent from the committed corpus and the default local `tmp/` corpus is absent.
No production rule was changed. Next prerequisite: obtain a reproducible positive
platform substitution case (ideally that original input/output and metadata),
then compare controlled variants before narrowing the rule. R11 remains PARTIAL;
expected failures are evidence of the gap, not completed parity.

**Other two rules (2026-10-21):** Direct expected-failure comparisons now also
cover both `L1_agg_drop` variants and `L2b_same_name`. Three fresh
[move probes](../../test/fixtures/platform/r11-move-probes.json) keep the GROUP BY
order on the platform whether the dereference appears inside an aggregate,
outside it, or in both positions; restricting the rule to occurrences outside
aggregates is therefore insufficient. All six comparisons are explicit
`it.fails`; preserve/analysis controls compare against the authored GROUP BY,
not the constructor's rewrite. Temporary bundled-code experiments separately
disabled the result-position exemption in `dropRedundantGroupDerefs` and the
entire `moveBeforePrefixGroupDerefToEnd` rule: each changed **0/1,976** committed
corpus outputs with metadata in constructor mode. No source implementation or
golden changed. Positive historical witnesses (`Взаимозачет bsl_21` for keeping
the dereference; `ФормированиеПартийЗЕРНО bsl_5` for moving it) are still needed
to test a distinguishing condition. These experiments do not justify removing
either rule or claim coverage of the unavailable private corpus.

**Rule removal (2026-10-21).** Three constructor-parity rewrites were removed:
`substituteGroupFieldWithSelectExpr`, `moveBeforePrefixGroupDerefToEnd` and the
result-position exemption of `dropRedundantGroupDerefs`.

- *Evidence against them:* every comparison recorded in this repository (15 direct
  comparisons: S1, L1, L2b, L4 and the substitution and move probes) shows the rule
  firing where the platform keeps the GROUP BY. After the removal the constructor
  GROUP BY equals the platform's in all 15 (the former `it.fails` tests are ordinary
  regressions).
- *Not evidence either way:* the committed corpus — 0 of 7,904 outputs changed
  (1,976 inputs × constructor/preserve × with/without metadata) only shows that the
  rules never fire there.
- *Historical positive witnesses (not reproducible now):* the rules were added to
  match the live `validate_query` oracle on the private 17,933-query corpus —
  `ЗависшиеЗадачи_1` for the substitution (`2593a0e2`, `b1b1f4c7`, then
  `accept:oracle` 17,932/17,933), `Взаимозачет_21` for the exemption (`9fae78ca`,
  17,933/17,933) and `ФормированиеПартийЗЕРНО bsl_5` for the move (cited in the rule's
  comment, `c9549f1e`). Their inputs, outputs and metadata are not in the repository
  and the private corpus is unavailable, so constructor parity for those shapes is
  now expected to be lost. The platform build of that oracle is not recorded.
- *Open question:* `L1_agg_drop` shows the platform rebuilding a top-level GROUP BY
  (dropping `Т.ВалютаКонтрагента.Код`, grouping the `ВЫБОР`), against `b1b1f4c7`'s
  "the top-level GROUP BY is kept verbatim". The distinguishing condition may be the
  platform build or base rather than the query shape (hypothesis, not checked).

The Designer (`preserve`) and hover (`analysis`) never ran these rules: product
behaviour is unchanged. The remaining constructor rules (`dropRedundantGroupDerefs`
without the exemption, `moveLeadingMovementCaseToEnd`,
`dropFunctionallyDeterminedMovementCase`, `relocateKeptMovementCase`) are unchanged.

**Next boundary:** model the platform's GROUP BY reconstruction from reproducible
witnesses (input, metadata, platform build and canonical output). Do not restore the
removed rules without such a witness.

### C34. English SDBL leftovers

**Status:** PARTIAL · P3

C2 leftovers (2026-10-17): English names of `РегистрРасчета`, `ПланВидовРасчета` and
`Последовательность` and their virtual tables were not mapped, because the probe base
SL_kza has none of these objects. The CLI corpus extractor uses `queryDialect.ts` like
the editor since 2026-10-17.

Platform attestation is not possible on SL_kza: `validate_query` answers
`Table not found` alike for `CalculationRegister.Тест`, `Catalog.НетТакого` and an
invented `Blabla.Тест` (2026-10-21). By the user's decision of 2026-10-21 the names are
mapped in `sdblEnglish.ts` from non-platform sources, kept apart:

- official 1C developer guide, lesson 18: `CalculationRegister`, `ScheduleData`
  (`CalculationRegister.Accruals.ScheduleData(…)`);
- third-party only, the bilingual SDBL lexer of 1c-syntax/bsl-parser
  (`SDBLLexer.g4` @ `d446af2`): `ChartOfCalculationTypes`, `Sequence`,
  `ActualActionPeriod`, `Boundaries`. This is a deliberate exception to the V2 rule
  that external grammars are not a verdict, limited to these names.

Not mapped: the base table `Base<Register>` (the guide shows `….BaseAccruals(…)`,
but a recalculation is also a third segment of a calculation register, so renaming
`Base…` could change a valid query; such a name stays as written), standard attribute
names of these kinds (`RegistrationPeriod`, `CalculationType`, …) — English standard fields in output in general are C39 — and the standard tabular sections of a chart of
calculation types. Editor diagnostics are parse-only, so an unmapped name gives no
false error. [Regressions](../../test/unit/englishCalculation.c34.test.ts): each mapped
source parses as its Russian twin; recalculation and base-table names, including
`Base…` in any letter case, are kept through Designer → Apply.

**Next boundary:** attest the six names on a base that has these objects; map
`Base<Register>` only where the source has a parameter list and the platform confirms
the printed name.

### C35. UNION column count with a kept wildcard

**Status:** CLOSED (bounded, 2026-10-19)

The platform-accepted `u_star_vs_explicit` query ([fixture](../../test/fixtures/platform/c24-completion.json)) now opens and applies without treating a kept `*` as one output column. The validator compares only known widths; an unknown member does not hide a mismatch between two explicit members. Proven batch-temp expansion still participates in the count.

Both scalar and tabular/trailing UNION generation preserve each member's select list when any member keeps a wildcard. They do not pad the lists with `NULL`: select-item positions cannot establish output-column positions in that case. Explicit-column UNION alignment is unchanged. No automatic wildcard expansion or metadata-count approximation was introduced.

The initial validator-only experiment was reverted after Classic and Canvas added `NULL КАК Поле2` to `Т.* ОБЪЕДИНИТЬ ВСЕ Б.Код, Б.Наименование`. The coordinated fix covers that regression with exact output assertions and Apply/reopen in both UIs. [Unit regressions](../../test/unit/c35UnionWildcardCount.test.ts); [browser regressions](../../test/e2e/c24Union.spec.ts). The 1,976-query corpus has zero byte changes in both preserve and constructor modes (3,952 comparisons).

**Boundary:** Unknown wildcard widths remain unvalidated; platform-invalid `mixed_*` inputs in the fixture can still pass local validation. Resolving a source in the catalog does not prove metadata completeness. Exact metadata-based width validation depends on the C36 completeness/provenance decision. Full positional mapping UI (UX-C9) is separate.

### C37–C40. Phase 5 findings

**C37 / C38 / C39: OPEN · P3; C40: PARTIAL · P3 (was OPEN · P2).**
[Audit and exact probes](audits/v5-phase5-2026-10-21.md), 2026-10-21,
platform 8.3.15.1489 (build confirmed by the user).

- **C37:** `PQ-join.kinds.3`: platform rewrites RIGHT JOIN as a swapped LEFT JOIN;
  ours keeps RIGHT JOIN. Open, reopen and Apply pass; platform canonicalization
  of our generated text equals canonicalization of the original.
- **C38:** `PQ-totals.clause.2`: platform emits `ПЕРИОДАМИ(ДЕКАДА, , )`;
  ours keeps `ПЕРИОДАМИ(ДЕКАДА)`. Same successful platform equivalence check.
- **C39:** `PQ-language.english`: ours preserves qualified `Code`, `Description`,
  `Ref`, `DeletionMark`; platform emits their Russian standard-field names.
  Generated output remains platform-valid with identical platform canonical text.
  Do not globally translate arbitrary identifiers: metadata/alias context matters.
- **C40:** `PQ-expression.scalar-subquery`: platform rejects a SELECT used as the
  right operand of `=`; ours opened it and permitted Apply (text preserved, not
  corrupted). Not covered by the old C5 cases.
  *Fix (2026-10-21):* the structural acceptor (`isStructurallyValidExpression`,
  `expressionSyntaxCheck.ts`) skipped any `(ВЫБРАТЬ …)` group, and the parser keeps
  such a condition as custom text, so `findMalformedCustomExpressions` never saw it.
  A subquery is now accepted only as the operand of `В` / `НЕ В` / `В ИЕРАРХИИ`. The
  existing shared blocker (`findStaticApplyBlocker` → `malformedCustom`) refuses
  Apply in Classic and Canvas with the existing message; editor diagnostics, which
  use the same check, mark the form too. Opening and the source text are unchanged.
  Evidence ([fixture](../../test/fixtures/platform/c40-scalar-subquery.json),
  `validate_query`, 8.3.15.1489): rejected — `=` on either side, `<>`, a ВЫБОР
  condition, a join condition, a function argument, the select list; accepted and
  still applied — `В`, `НЕ В`, `В ИЕРАРХИИ`, a tuple `(А, Б) В (…)`, `В (…)` in a join
  condition. Committed corpus: 0 of 7,882 malformed-expression checks changed
  (1,976 inputs and platform texts, with and without metadata; 326 contain a nested
  `(ВЫБРАТЬ`). [Regressions](../../test/unit/scalarSubquery.c40.test.ts), e2e in
  `canvas.spec.ts` (both editors).
  *Version boundary:* every verdict is from 8.3.15.1489; no newer platform was
  probed and no 1C documentation of scalar subqueries was found. If a newer
  platform accepts them, the refusal is over-strict (Apply refused, nothing
  written), and the rule would need a target-version decision.

**Next boundary:** separate bounded fixes or explicit canonical-policy decisions
for C37–C39; for C40, a verdict from a current platform build (close C40 if it also
rejects; otherwise decide how the refusal depends on the target version).
No production code or golden output changed in this audit.

### C41. Metadata validation of raw expressions

**Status:** OPEN · P2

`validateBatchText` (opening a query, Apply, editor diagnostics) checks field
paths against metadata only in structured slots: a plain field with its own alias,
an aggregate over a field, ORDER BY, GROUP BY and structured conditions. A field
reference kept as raw expression text is not checked, nor is an unknown source
alias inside it. Probe with a resolver over `Справочник.Валюты` (fields Ссылка, Код,
Наименование, ЗагружаетсяИзИнтернета), 2026-10-22:

| Query (`… ИЗ Справочник.Валюты КАК В`) | Result |
|---|---|
| `ВЫБРАТЬ В.Нет КАК Х`, `СУММА(В.Нет) КАК Х`, `… УПОРЯДОЧИТЬ ПО В.Нет`, `… СГРУППИРОВАТЬ ПО В.Код, В.Нет` | invalid: `Поле "Нет" не найдено` |
| `ВЫБРАТЬ В.Нет КАК Поле1` (the parser keeps a `Поле{n}`-aliased field as an expression) | accepted |
| `В.Код + В.Нет`, `ЕСТЬNULL(В.Нет, 0)`, `ВЫБОР КОГДА В.Нет = 1 …`, `В.Код + Ъ.Код` | accepted |
| `ГДЕ В.Нет = 1`, `ГДЕ В.Нет = &П`, `ГДЕ В.Нет`, `ГДЕ Ъ.Код = 1`, `ЛЕВОЕ СОЕДИНЕНИЕ … ПО В.Нет = Б.Код` | accepted |

Expected: each unknown field is refused like the plain-field case. Effect: Apply
writes a query the platform rejects (`Field not found`), and editor diagnostics do
not flag it; no user text is lost. Reachable from the UI: a field added through
the expression editor gets a `Поле{n}` name. The G1 e2e in `canvas.spec.ts` covers
only the plain-field slot.

**Next boundary:** decide which raw-expression references can be resolved without
false positives (corpus sweep in `semanticValidatorCorpus.test.ts`), then extend
the existing field-path check; no separate expression grammar. Prerequisite C43
(composite references) is closed.

### C46. Empty join conjunct printed as `И ()`

**Status:** CLOSED (2026-10-24; recorded 2026-10-22 as P3, found during C45; raised
to P2 by the [structured/raw research](audits/structured-raw-2026-10-23/README.md))

```text
ВЫБРАТЬ А.Код КАК Код ИЗ Справочник.Валюты КАК А ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Валюты КАК Б ПО А.Код = Б.Код И И А.Код = 1
```

Since C45 the parser keeps such a join condition as one custom expression and
OK / Save refuses it, but the generator's AND-chain expansion
(`expandAndChainConjuncts` → `splitTopLevelAnd`, `sdblGenerator.ts`) split it again
and printed every empty operand as `()`:

| Authored `ПО …` | Generated before |
|---|---|
| `А.Код = Б.Код И И А.Код = 1` | `А.Код = Б.Код И () И (А.Код = 1)` |
| `И А.Код = Б.Код` | `() И А.Код = Б.Код` |
| `А.Код = Б.Код И`, `(А.Код = Б.Код И)` | `А.Код = Б.Код И ()` |
| `И` | `() И ()` |

The refusal did not survive that text. «Показать запрос» opens Query Text with the
generated text, «Применить» is enabled without an edit, and the reopened text was
valid conjuncts plus an empty group that the structural acceptor took as a value
(`acceptGroupContent` accepts an empty list for a call). The static blocker
disappeared and OK wrote `И ()`, which the platform refuses
(`Wrong parameters "И"`). A typed empty group was accepted the same way in every
condition slot (`ГДЕ ()`, `ГДЕ Т.Код = 1 И ()`, `ИМЕЮЩИЕ … И ()`, `ПО … И ()`; the
platform refuses `ГДЕ ()`: `Operation not allowed in clause "ГДЕ"`).
[Evidence](../../test/fixtures/platform/c46-empty-group.json).

The expansion now leaves a chain with an empty operand as one conjunct, so the
generated text keeps every authored `И` (`ПО А.Код = Б.Код` / `И ` / `И А.Код = 1`,
the empty slot printed as a trailing space) and reopens as the same refused custom
condition. The acceptor refuses an empty group as a value (`()`, `(())`, `НЕ ()`,
`a И ()`); a call with an empty argument list (`Ф()`) is accepted as before. The golden
corpus has no `()` at all; golden, grammar-parity and store gates are unchanged.
[Regressions](../../test/unit/emptyJoinConjunct.c46.test.ts) (the ledger forms,
`ИЛИ`, a comment and English `AND AND` stay refused through three Query Text
reopens; typed `()` in `ГДЕ`/`ИМЕЮЩИЕ`/`ПО`; valid controls),
[acceptor cases](../../test/unit/expressionSyntaxCheck.test.ts), e2e in `queryText.spec.ts`. *Not changed:* an
empty value list `В ()` (a different acceptor path, not a value group).

### C51. Tuple IN-subquery changed on the second Save

**Status:** CLOSED · P3 (2026-10-22; found in the C50 review, the same on `main`)

```text
ВЫБРАТЬ Т.Код, Т.Наименование ИЗ Справочник.Валюты КАК Т СГРУППИРОВАТЬ ПО Т.Код, Т.Наименование ИМЕЮЩИЕ (Т.Код, Т.Наименование) В (ВЫБРАТЬ Х.Код, Х.Наименование ИЗ Справочник.Валюты КАК Х)
```

A non-reference left side of `В (ВЫБРАТЬ …)` (a tuple) whose subquery is written
compactly is parsed as `leftExpr` + `subquery` (`trySimpleCondition`,
`sdblParser.ts`, phase 6.15.27). The generated text is multi-line, so the next parse
kept it as a raw custom condition. The raw leaf path normalises three things the
`leftExpr` path did not, and the second Save changed the text once, then it was
stable:
- in `ИМЕЮЩИЕ`, the subquery moved from 3 tabs to 2 (the raw-leaf base);
- `(a, b) НЕ В` became `НЕ (a, b) В`, one tab deeper (`moveNotBeforeTuple`);
- a bare tuple under a single source became qualified (`qualifyBareFields`).

No text was lost; only layout and qualification drifted. The same tuple in `ГДЕ`
with qualified fields, and any form inside a condition subquery, were already
stable.

The `leftExpr` path now prints what the raw leaf path prints:
- the generator uses the raw-leaf subquery base (root `ГДЕ` 3, otherwise 2);
- `qualifyBareFields` qualifies `leftExpr` with the same rule as raw condition
  text (sole source, or the one source that has the field in metadata);
- a tuple `(a, b) НЕ В` is parsed as `negated` with the tuple as `leftExpr`, the
  same model as `НЕ (a, b) В`. A non-tuple left side (`(Т.Код + 1) НЕ В`, `1 НЕ В`)
  and the inner `НЕ` of `НЕ (a, b) НЕ В` keep `НЕ` in `leftExpr`, as before.

The base applies to every `leftExpr` condition, so a non-tuple left side in
`ИМЕЮЩИЕ` (`КОЛИЧЕСТВО(Т.Код) В (…)`, `1 В (…)`), which drifted the same way, now
prints its second-Save text at once. For all these inputs the first Save now prints
the text `main` printed on the second Save. One reviewed output change: a subquery
with a line comment kept the `leftExpr` path on every Save, so `main` was stable
there, in a layout unlike the uncommented form (`(a, b) НЕ В` on 3 tabs, `ИМЕЮЩИЕ`
on 3, bare fields). It now prints the uncommented form's layout with the comment in
place; the meaning is the same. Fixture texts (golden corpus, grammar parity, oracle, platform: 4,246
distinct texts, with and without comments) produce byte-identical output; the corpus
has no affected text. Not changed: a single-field `ИМЕЮЩИЕ Т.Код В (ВЫБРАТЬ …)`
still prints base 3 against the raw-leaf rule's 2. No platform or oracle evidence
shows a root-`ИМЕЮЩИЕ` subquery, so changing it needs a platform probe first.
[Regressions](../../test/unit/tupleInSubquery.c51.test.ts) (9 forms unstable on
`main` and a nested `ИМЕЮЩИЕ`; non-tuple `ИМЕЮЩИЕ` left sides; commented subqueries;
`НЕ В` meaning and double negation; owner ambiguity; controls). Found in the review,
the same on `main` and not changed here: [C52](#c52-doubled-не-before-an-in-subquery-shifts-it-once),
[C53](#c53-line-comment-inside-a-tuple-left-side) (both fixed separately).

### C52. Doubled НЕ before an IN-subquery shifts it once

**Status:** CLOSED · P3 (2026-10-22; found in the C51 review, the same on `main`)

```text
ВЫБРАТЬ Т.Код ИЗ Справочник.Валюты КАК Т ГДЕ НЕ НЕ Т.Код В (ВЫБРАТЬ Х.Код ИЗ Справочник.Валюты КАК Х)
```

The first Save printed `НЕ НЕ Т.Код В` with `(ВЫБРАТЬ` on 4 tabs, the second on 5,
then it was stable (also with a tuple left side, `НЕ НЕ НЕ`, in `ИМЕЮЩИЕ` and in a
condition subquery). The leading `НЕ` is modelled as `negated` and the second one
stays in `leftExpr`; the `leftExpr` path added a tab only for `negated`, while the
raw leaf that the generated text re-parses into adds one per leading `НЕ`
(`reindentLeafSubquery`). The `leftExpr` path now counts the leading `НЕ` of the
printed left side too. Not matched (stable after one shift, the same on `main`): the
raw-leaf rule also counts an `НЕ` right after a leading `(` (`(НЕ Т.Флаг, Т.Код) В`);
whether that count is right for a tuple element needs a decision first. The first
Save prints what `main` printed on the second; a single `НЕ` and `НЕ (a, b) НЕ В`
are unchanged. No platform verdict on the
layout of a doubled `НЕ` (the raw-leaf rule is kept).
[Regressions](../../test/unit/inSubqueryLeftSide.c52-c53.test.ts).

### C53. Line comment inside a tuple left side

**Status:** CLOSED · P3 (2026-10-22; found in the C51 review, the same on `main`)

```text
ВЫБРАТЬ Т.Код ИЗ Справочник.Валюты КАК Т ГДЕ (Т.Код, // поле
 Т.Наименование) В (ВЫБРАТЬ Х.Код, Х.Наименование ИЗ Справочник.Валюты КАК Х)
```

The first Save printed the tuple as `(Т.Код,` + a column-0 line
` Т.Наименование) В`; the second Save joined it into one line. With a commented
subquery, `НЕ В` or a function call (`ЕСТЬNULL(Т.Код,\n 0) В`) the broken layout
stayed. The cause was not the comment: any left side split over lines kept its
line break in `leftExpr`, while the raw leaf prints it on one line
(`flattenMultilineLeaf`). The `leftExpr` path now flattens it the same way. The
helper refuses subqueries, `ВЫБОР`, `И`/`ИЛИ` and braces, so such a left side
(`(Т.Код И\n Т.Код, …) В`) keeps its column-0 line, stably, as on `main`.

Moving the comment in front of the condition is the existing C17 rule for a
condition with a modelled subquery (the same for `Т.Код // c` before `В`), not part
of this item. It never changed syntax or meaning: 13 forms (`ГДЕ`, `ИМЕЮЩИЕ`, join,
`ВЫБОР`, `И`, `ИЛИ`, `НЕ`, `НЕ В`, nested, English) keep every comment and the
same code tokens, and the output parses. Changed output for inputs that were stable
on `main` (no column-0 line any more): `(a, // c\n b) НЕ В`, a tuple with a
commented subquery, and a multi-line function call left side. Otherwise the first
Save prints what `main` printed on the second.
[Regressions](../../test/unit/inSubqueryLeftSide.c52-c53.test.ts).

### C50. Nested raw subqueries parsed 2^depth times

**Status:** CLOSED (2026-10-22; found while measuring C48, the same on `main` before it)

A subquery kept in raw condition or field text (`… ИЛИ Х.Код В (ВЫБРАТЬ …)`, outer
alias `В`, `ВЫБОР КОГДА … В (…)`) is parsed for bare-field qualification
(`qualifySubquerySpan`, `qualifyBareFields.ts`): once by `parseDocument`, whose own
qualification pass reaches the next nested level, and once more by the
`qualifyExpression` walk over the same text. Each nested raw subquery was
therefore parsed twice per level — 2^depth `parseDocument` calls (8, 16, 32 at
depth 3, 4, 5). Opening such a query took 0.1 s at depth 10, 2.9 s at depth 14 and
25–47 s at depth 18, on the extension host (diagnostics, hover) as well as in the
Designer. Modelled subqueries (`В (…)`, `И … В (…)`, `ИЗ (…)`) were linear.

The injected subquery parser (`setSubqueryParser`, `sdblParser.ts`) now shares
these parses within one outer `parseDocument`, keyed by subquery text and the
current subquery recursion depth (the recursion-limit error depends on it; a
text-only key changed the model of queries near the limit). Parse errors are kept
too; a different resolver bypasses the cache, and it is dropped when the outer
call returns. Only qualification uses these parses; the model, the generator and
Apply are unchanged. Growth is now polynomial (about depth³) instead of 2^depth:
`ИЛИ` form depth 10: 103 → 6 ms, depth 30: about 0.5 s; join `ПО` depth 10:
11.7 s → about 0.1 s. Golden corpus, classification and grammar-parity gates are
unchanged; the review compared 4,064 texts × 3 parse modes (with and without the
corpus metadata, with and without comments) against `main`: byte-identical
output. The C48 check on deep nesting is no longer exponential either (depth 16:
32 ms).
[Regressions](../../test/unit/nestedSubqueryParse.c50.test.ts) (three raw forms at
depth 18 under a generous bound with a stable round trip; qualification per level,
across recursion depths and of a repeated subquery text).

### C48. Broken condition in a raw-text subquery not refused

**Status:** CLOSED (2026-10-22; recorded the same day in the C45 review, the same on
`main` before C45)

The recorded cause was wrong. A plain condition subquery
`ГДЕ Т.Код В (ВЫБРАТЬ … ГДЕ Х.Код = 1 И)` gets a subquery model
(`Condition.subquery`), `findMalformedCustomExpressions` walks it, and OK / Save was
already refused. The review's reproduction used the outer alias `В`
(`ГДЕ В.Код В (ВЫБРАТЬ …)`): there, and whenever the whole condition stays one custom
text, there is no subquery model. Such forms are a top-level `ИЛИ`, `НЕ (… ИЛИ … В (…))`,
`ВЫБОР КОГДА … В (…)` in a field and a join `ПО … И А.Код В (…)`. The structural
acceptor (`isStructurallyValidExpression`) skips a `(ВЫБРАТЬ …)` group by bracket
balance only, so `Х.Код = 1 И`, `Х.Код = `, a lone `И` or a broken subquery
(`ВЫБРАТЬ Х.Код ИЗ`) inside it passed the static Apply blocker and Query Text, and
OK / Save wrote a platform-invalid query (text kept as typed). An unclosed
parenthesis, HAVING and source subqueries were already refused.

`findMalformedCustomExpressions` now takes the top-level `(ВЫБРАТЬ …)` / `(SELECT …)`
groups of every accepted custom text (`embeddedSubqueryTexts`,
`expressionSyntaxCheck.ts`: lexer tokens, so brackets in strings and comments do
not count; text with a template marker is not judged, as by the acceptor). It
parses each group with `parseDocument` and walks it like `Condition.subquery`; a
parse error is a hit. Each group is a strict substring of its parent, so the
recursion ends, and sibling groups do not overlap. A group nested in raw text is
parsed at its own level again (its parent's parse only tokenized it). The check is
structural and needs no metadata: an unknown table or a reference to the outer
alias is not refused. It refuses what the parser refuses at the top level (for
example DCS braces in `ГДЕ`, `ИНДЕКСИРОВАТЬ` in a subquery) and inherits its
tolerance (an empty trailing `ГДЕ`, a trailing comma in the select list are still
accepted, as in a modelled subquery). The result for each subquery text is kept
until the next call, because the static blocker runs on every model change; a
call on another document (`decideApply` checks the generated text) replaces it.

Golden corpus (3,941 texts, 558 embedded `(ВЫБРАТЬ …)` groups): 0 new hits, 0
blocked; grammar-parity unchanged. Static blocker over the 2,871 distinct corpus
texts: repeated calls (editing) 235 → 247 ms in total, worst text unchanged
(4.0 ms); the first call 250 → 335 ms, worst text 4.2 → 33 ms (13 nested raw
subqueries; opening that text costs about the same). Parsing nested raw `ИЛИ … В
(…)` subqueries was exponential (about ×2 per level), and an uncached check cost
about the same again; fixed by [C50](#c50-nested-raw-subqueries-parsed-2depth-times).
Parser, generator, recovery
and the Apply gate's logic are unchanged. Found in the review: a raw subquery with
`ГРУППИРУЮЩИМ НАБОРАМ` is now refused because its text was already corrupted by the
parser ([C49](#c49-grouping-sets-qualified-in-a-raw-text-subquery)).
[Regressions](../../test/unit/subqueryMalformed.c48.test.ts) (7 raw-text forms ×
4 broken inner queries refused, × 7 valid inner queries not refused, token
boundaries, deep nesting, template marker), e2e in `queryText.spec.ts`.

### C55. Operator word taken as a field

**Status:** CLOSED (2026-10-24; found by the [structured/raw research](audits/structured-raw-2026-10-23/README.md), P1 when recorded)

```text
ВЫБРАТЬ Т.Код ИЗ Справочник.Валюты КАК Т ГДЕ Т.Код = 1 И НЕ
```

An incomplete condition ending in an operator word was taken as a bare field.
Under a sole source the root `ГДЕ` bare-field rule (`interpretCondition` →
`tryBareField`, `sdblParser.ts`) qualified it: `… И НЕ` was saved as `… И Т.НЕ`,
`ГДЕ ЕСТЬ` as `ГДЕ Т.ЕСТЬ`, for `НЕ`, `ВЫБОР`, `КОГДА`, `ТОГДА`, `ИНАЧЕ`, `КОНЕЦ`,
`ЕСТЬ`, `МЕЖДУ`, `ПОДОБНО`, `В`, `СПЕЦСИМВОЛ` and their English forms. The acceptor
took `Т.НЕ` as a path, raw field references are not checked against metadata (C41),
and OK / Save wrote the invented field also with metadata. Without a sole source
(two sources, `ИМЕЮЩИЕ`, `ПО`) the word stayed as written, but the structural
acceptor took it as a field (C45 refused only `И`/`ИЛИ`), so the incomplete text
was written as well; only `НЕ` and `ВЫБОР` were refused there. The platform refuses
the input (`Syntax error`), the qualified output (`Field not found "Т.НЕ"`) and the
unqualified form (`… И ЕСТЬ`: `Syntax error "ЕСТЬ"`).
[Evidence](../../test/fixtures/platform/c55-operator-as-field.json).

A shared `OPERATOR_WORDS` set (`sdblKeywordSets.ts`) holds the eleven words.
`interpretCondition` no longer qualifies a lone operator word (also after a leading
`НЕ`); the raw-text qualifier already skipped these words. The acceptor refuses an
operator word as an operand; followed by a dot it is a path head as before
(`В.Код` with the platform-invalid source alias `В`, RP11; a field `Т.В`).
`ССЫЛКА` is not in the set (`Ссылка` is a field of every object). No metadata name and
no golden-corpus text uses another of these words as a name; golden, grammar-parity
and store gates are unchanged.
[Regressions](../../test/unit/operatorAsField.c55.test.ts) (11 words × 7 forms and
English, refused through Query Text with no invented field; controls for bare fields,
`Ссылка`, `МЕЖДУ`, `ВЫБОР`, `ЕСТЬ NULL` and alias `В`),
[acceptor cases](../../test/unit/expressionSyntaxCheck.test.ts), e2e in `queryText.spec.ts`.
*Not changed:* other bare-field slots (select list, ORDER/GROUP BY, the left side of a
comparison); an incomplete `ВЫБОР` is printed with a closing `КОНЕЦ` (`… И ВЫБОР` /
`КОНЕЦ`) and stays refused.

### C56. Compact scalar НЕ В subquery refused

**Status:** CLOSED (2026-10-24; found by the [structured/raw research](audits/structured-raw-2026-10-23/README.md), P2 when recorded; waited for C57)

```text
ВЫБРАТЬ Т.Код ИЗ Справочник.Валюты КАК Т ГДЕ Т.Ссылка НЕ В (ВЫБРАТЬ Ш.Ссылка ИЗ Справочник.Валюты КАК Ш)
```

A compact `X НЕ В (ВЫБРАТЬ …)` with a non-tuple left side was parsed as `leftExpr`
`X НЕ` + subquery (`trySimpleCondition`, `sdblParser.ts`); the acceptor refuses that
`leftExpr`, so OK / Save refused a platform-valid query, while the multi-line form
passed. C51 moved that `НЕ` into `negated` for a tuple only. The same held for a
literal or an expression on the left, in `ИМЕЮЩИЕ`, in a modelled or raw-text nested
subquery, with a comment in the subquery (refused even after reopening), and for a
double negation `НЕ X НЕ В`, including a tuple. The platform accepts the field and the
double-negation forms and prints `НЕ Т.Ссылка В` / `НЕ НЕ Т.Ссылка В`
([research probes](audits/structured-raw-2026-10-23/claude-platform-verification.json));
the other left sides were not probed.

A compact `X НЕ В (…)` is now parsed again without that `НЕ` and negated, for any left
side: a field gets the model of `НЕ <поле> В (…)` (also stable in `ИМЕЮЩИЕ`), other
left sides a `leftExpr`. `НЕ X НЕ В` gets the model of `НЕ НЕ X В`. The multi-line
form, `НЕ В (&С)` lists, `В ИЕРАРХИИ` and the source alias `В` are unchanged. Five
C51 and one C52/C53 expectation pinned the text of these refused models and now hold
the prefix form: `НЕ НЕ (a, b) В` (subquery one tab deeper) and `НЕ 1 В`,
`НЕ (Т.Код + 1) В`, `НЕ (Т.Код) В`. Golden, grammar-parity and store gates are
unchanged. Of the 19,761 research round-trip records (golden, grammar parity, platform
fixtures, variations, pairwise) only 8 changed — 4 inputs, all forms above: Apply
refused → allowed, with the same `НЕ`/`И`/`ИЛИ` and boolean structure. [Regressions](../../test/unit/scalarNotIn.c56.test.ts) (each infix form
equals its prefix form in text and model through three reopens; nested, `ИМЕЮЩИЕ`,
double negation; owners and metadata; unchanged forms).
*Not changed (R2):* a grouped left side (`(Т.Код + 1) НЕ В`, `(Т.Код) НЕ В`), a
compact `НЕ В ИЕРАРХИИ` and `НЕ (X НЕ В …)` change once more on the second Save, as
the same prefix forms typed directly do; the meaning is kept.

### C57. Infix НЕ moved out of its operand

**Status:** CLOSED (2026-10-24; recorded the same day as P1, found while implementing
C56; the same in v0.4.0)

```text
ВЫБРАТЬ Т.Код ИЗ Справочник.Валюты КАК Т ГДЕ Т.Код = &К ИЛИ Т.Ссылка В (ВЫБРАТЬ Х.Ссылка ИЗ Справочник.Валюты КАК Х ГДЕ Х.Ссылка НЕ В (&С))
```

Save prints `… ИЛИ НЕ Т.Ссылка В (ВЫБРАТЬ … ГДЕ Х.Ссылка В (&С))`: the negation of the
inner condition becomes a negation of the outer membership, and OK / Save writes it
(Designer and constructor-parity modes alike). The platform keeps the meaning:
`validate_query` prints `ИЛИ Т.Ссылка В (… ГДЕ НЕ Х.Ссылка В (&С))`.
[Evidence](../../test/fixtures/platform/c57-nested-not-in.json).

Rule 3 of `canonicalizeLeafLexemes` (`exprFormatter.ts`, called from
`normalizeLeafCase` for condition leaves, fields and virtual-table arguments) turns the
first `НЕ` before `В`/`ПОДОБНО` of a one-line leaf into a prefix of the whole leaf. It
assumes an atomic comparison, but counts neither parentheses nor `И`. Measured on
`main` `c6011b93`, every form applied:

| Authored | Saved |
|---|---|
| `… ИЛИ Т.Ссылка В (ВЫБРАТЬ … ГДЕ Х.Ссылка НЕ В (&С))` (also `ИМЕЮЩИЕ`) | `… ИЛИ НЕ Т.Ссылка В (… ГДЕ Х.Ссылка В (&С))` |
| `… ГДЕ Х.Наименование НЕ ПОДОБНО "а%")` in the same place | `НЕ Т.Ссылка В (… Х.Наименование ПОДОБНО "а%")` |
| `ГДЕ ЕСТЬNULL(Т.Код НЕ В (&С), ЛОЖЬ)` | `ГДЕ НЕ ЕСТЬNULL(Т.Код В (&С), ЛОЖЬ)` |
| `СрезПоследних(&Д, Кратность = 1 И Валюта НЕ В (&В))` | `СрезПоследних(&Д, НЕ Кратность = 1 И Валюта В (&В))` |

A compact `НЕ В (ВЫБРАТЬ …)` in the same nested place was refused only because of the
scalar NOT IN refusal ([C56](#c56-compact-scalar-не-в-subquery-refused)); fixing that
first would have let this rewrite be written, so C56 waited for C57. Unchanged and correct: a top-level
`X НЕ В (&С)` / `X НЕ ПОДОБНО` / `(Т.Код + 1) НЕ В` (printed `НЕ X В`), a `ВЫБОР` or
an `И` chain in a select field, and join `ПО` conditions.

Rule 3 now moves `НЕ` only when it stands at the leaf's top parenthesis level with no
`И`/`ИЛИ`/`ВЫБОР`/`КОГДА`/`ТОГДА`/`ИНАЧЕ` before it at that level; otherwise the text
stays as written (`Кратность = 1 И Валюта НЕ В (&В)` keeps its infix `НЕ`, unlike the
platform's canonical text, with the same meaning). The recorded probe is printed byte
for byte as the platform prints it. Golden, grammar-parity and store gates are
unchanged; the 19,760 research round-trip records (golden, grammar parity, platform
fixtures, layout/case/parenthesis variations, pairwise) give the same text and Apply
decision as before. [Regressions](../../test/unit/nestedNotIn.c57.test.ts) (the four
forms and `ИМЕЮЩИЕ` keep `НЕ` with its operand through three reopens; the probe; 12
top-level controls still print `НЕ X В`).

### C54. Negated field operand loses its parentheses

**Status:** CLOSED (2026-10-24; recorded 2026-10-22 as P2, found in the C52/C53 review)

```text
ВЫБРАТЬ Т.Код ИЗ Справочник.Валюты КАК Т ГДЕ (НЕ Т.ПометкаУдаления) В (&П)
```

`stripNegatedFieldParens` (`exprFormatter.ts`) removed the parentheses of
`(НЕ Алиас.Поле)` at the start of a leaf and kept any tail after them — a rule from the
first import, when a condition could still swallow the next section
(`(НЕ Т.Поле)\n\nУПОРЯДОЧИТЬ …`). Before an operator that tail changed the meaning:
`НЕ Т.Поле В (…)` negates the membership, `НЕ Т.Поле ЕСТЬ NULL` the NULL check. The
helper serves `ГДЕ`/`ИМЕЮЩИЕ` leaves, `И`/`ИЛИ` chains (`formatExpression`) and
virtual-table conditions, so the rewrite also hit a nested raw-text subquery and a
virtual-table condition; a compact `В (ВЫБРАТЬ …)` lost them on the second Save. Join
`ПО` and select fields were not affected. Executed on the platform (constant derived
tables): `(НЕ Т.Ф) В (ИСТИНА, ЛОЖЬ)` 1 row → `НЕ Т.Ф В (…)` 0 rows for a false `Ф`;
`(НЕ Т.Ф) ЕСТЬ NULL` 1 row → `НЕ Т.Ф ЕСТЬ NULL` 0 rows for a NULL `Ф`. The platform's
canonical text keeps the parentheses before `=`, `>` and `ЕСТЬ NULL` and drops them
before `В`. The backend does not report the platform build, so these results are not
tied to a version. [Evidence](../../test/fixtures/platform/c54-negated-operand.json).

The parentheses are now kept when `В`, `НЕ`, `ЕСТЬ`, `ПОДОБНО`, `МЕЖДУ`, `ССЫЛКА`, an
ordering comparison or arithmetic follows; a whole negated field, `И`/`ИЛИ` and the old
section tails, `=` and `<>` (the same result either way) are printed as before. Before
`ЕСТЬ NULL` and `>` the Designer now prints the platform's text; before `В` it keeps the
authored parentheses against the platform's canonical text — the
[boolean operand scope exception](decisions/0004-querymodel-round-trip-contract.md#boolean-operand-scope-exception-2026-10-24)
of ADR 0004. No golden or grammar-parity text has `(НЕ поле)` before an operator, so no
`ACCEPTED_DIVERGENCES` entry is needed; golden, grammar-parity and store gates are
unchanged. [Regressions](../../test/unit/negatedOperandParens.c54.test.ts) (11 forms
kept on three Saves; the platform text for `ЕСТЬ NULL` and `>`; the `В` difference with
its executed result; 10 controls).
*Not changed:* `(НЕ поле) = ИСТИНА` is printed `НЕ поле = ИСТИНА` (same result; the
platform keeps the parentheses); a compact `В (ВЫБРАТЬ …)` changes its layout once more
on the second Save (R2). Not probed on the platform: `ПОДОБНО`, `МЕЖДУ`, `ССЫЛКА` and
arithmetic after `(НЕ поле)` (hardly valid for a Boolean operand).

### C49. Grouping sets qualified in a raw-text subquery

**Status:** CLOSED (2026-10-25; preservation only, recorded 2026-10-22 in the C48
review, P2 when recorded)

```text
ВЫБРАТЬ Т.Код КАК Код ИЗ Справочник.Валюты КАК Т ГДЕ Т.Код = 1 ИЛИ Т.Код В (ВЫБРАТЬ Х.Код ИЗ Справочник.Валюты КАК Х СГРУППИРОВАТЬ ПО ГРУППИРУЮЩИМ НАБОРАМ ((Х.Код), (Х.Наименование)))
```

The condition stays raw custom text, and the sole-source qualification of the raw
subquery (`qualifySubquerySpan` → `qualifyExpression`, `qualifyBareFields.ts`; the
ledger first named `qualifyBareFieldsInExpression`) took `ГРУППИРУЮЩИМ` and `НАБОРАМ`
for fields: `Х.ГРУППИРУЮЩИМ Х.НАБОРАМ`. Before C48 OK / Save wrote that text; since
C48 Apply refused the query. The same in a field `ВЫБОР`, a join `ПО`, `ИМЕЮЩИЕ`, a
multi-line or a nested raw subquery. A structured subquery and a top-level grouping
were not affected.

Three steps changed the text, each fixed narrowly:

- the two words are in the qualifier's `STRUCTURAL` set;
- `stripRedundantLeafParens` (`exprFormatter.ts`) removes nothing inside a
  `НАБОРАМ (…)` list: its parentheses are grammar, not operand grouping. Before, a
  one-line subquery lost the parentheses of the first set (`((Х.Код), …)` →
  `(Х.Код, …)`, a form the parser refuses), so the first Save was allowed and the
  reopened text refused;
- `reindentLeafSubquery` glues a closing-only last line to the body only when it
  closes no bracket opened inside the body (counted in code, not in literals or
  comments, with `codeRanges`). Before, the second Save glued the `)` of the set list,
  printed on its own line by the generator, to the last set.

Grouping sets in a raw subquery are now kept and applicable on three Saves with the
text stable after the first one, as in a structured subquery; forms the parser does
not read (an empty set `()`, `СГРУППИРОВАТЬ ВСЕ ПО`) stay refused with their text kept.
**Platform:** not confirmed. The available backend (build unknown) and 8.3.15.1489
refuse `ГРУППИРУЮЩИМ НАБОРАМ`; the grammar-parity area `group.grouping-sets` stays
`pending-platform-evidence` (probe `PQ-group.grouping-sets`). Corpus sweep: 28 of
19,769 records changed, all with grouping sets in raw text (refused → applicable,
same meaning, stable at Save 1); golden, grammar-parity and store gates are unchanged.
[Regressions](../../test/unit/groupingSetsRaw.c49.test.ts) (8 contexts and 4 set
forms on three Saves; refused forms; controls; brackets in literals and comments,
deep nesting and broken balance at the closing line).
*Not changed:* `СГРУППИРОВАТЬ ВСЕ ПО` is not read by the parser in any form; other
second-Save layout changes of compact subqueries (R2).

### C45. Trailing И dropped from a condition

**Status:** CLOSED (2026-10-22)

`splitJoinConjuncts` (`sdblParser.ts`), which splits WHERE/HAVING and join
conditions on a top-level `И`, silently skipped an empty conjunct: a leading
`И`, `И И` or a trailing `И` (also before `;`, `УПОРЯДОЧИТЬ ПО`, a comment, inside
parentheses or after `МЕЖДУ a И b`) disappeared, and OK / Save wrote e.g.
`ГДЕ В.Код = 1` for `ГДЕ В.Код = 1 И` without a warning. Such a condition now
stays one custom condition with its source text (the rule already used for a
top-level `ИЛИ`; the parenthesized group is not flattened), checked before the
sole-source bare-field rule so that `ГДЕ И` / `ГДЕ НЕ И` no longer become an
invented field `Т.И`. The structural acceptor (`isStructurallyValidExpression`)
no longer takes `И`/`AND`/`ИЛИ`/`OR` as an operand or a path head, so `И`,
`НЕ И`, `… И И`, `… И НЕ И`, `(И)` and conditions on the platform-invalid source
alias `И` (`И.Код = 1`) are refused by `malformedCustom`; a field named `И` after
a dot (`Т.И`) stays valid. The English slice fix [C47](#c47-english-last-token-cut-to-its-russian-length)
was needed for `WHERE AND`. Valid conjunctions split exactly as before; the golden
corpus has no empty conjunct and its gates are unchanged (3,941 texts: 0
differences from `main` in generated text, malformed count and Apply blocker).
Grammar parity: `source.alias-reserved-word-i` (platform-invalid) round trip
became stable, still accepted and Apply-blocked (catalog note). Generator,
recovery and the Apply gate's logic are unchanged (only its acceptor, above).
[Regressions](../../test/unit/conditionEmptyConjunct.c45.test.ts) (WHERE/HAVING forms
keep every `И` and are refused; join forms refused; English; alias `И`; 8 unchanged
controls), [acceptor cases](../../test/unit/expressionSyntaxCheck.test.ts), e2e in
`queryText.spec.ts`. No platform verdict was collected (the input is not valid
SDBL). Join text: [C46](#c46-empty-join-conjunct-printed-as-и-); a condition
subquery: [C48](#c48-broken-condition-in-a-raw-text-subquery-not-refused).

### C47. English last token cut to its Russian length

**Status:** CLOSED (2026-10-22, fixed within C45 — it made the English form of a C45
blocker writable)

`sliceSource` and the qualified-slice builder `qualifyBareFieldsInExpression`
(`sdblParser.ts`) ended the kept slice at `last.pos + last.value.length`; a token's
`value` is its normalized Russian form, so a slice ending in an English keyword was
cut (`WHERE Т.Код = 1 AND` → `Т.Код = 1 A`, `WHERE AND` → bare `A`, then qualified to
the field `Т.A`, not refused). Both now use the source token text length. Golden
corpus and grammar-parity gates are unchanged.
[Regressions](../../test/unit/conditionEmptyConjunct.c45.test.ts) (English cases).

### C44. Query Text accepted an incomplete condition

**Status:** CLOSED (2026-10-22)

`tryOpenDesignerBatch` keeps an incomplete condition such as `ГДЕ В.Код = ` or
`ГДЕ (В.Код = 1` as custom text, so the Query Text status bar (`analyze`) showed
"✓" and Apply loaded it into the model; only the shared static blocker
(`findStaticApplyBlocker` → `malformedCustom`) then refused OK / Save and the
Classic ↔ Canvas switch. `analyze` and `ConstructorView.handleApplyQueryEdit`
(top-level and nested designer) now run the same `findMalformedCustomExpressions`
on the parsed text and report `constructor.malformedCustom`; the text stays in
the editor and the model is unchanged. The diagnostic has no text position
(the check does not know one), so there is no lint marker. Grammar, generator,
recovery and the final Apply gate are unchanged.
[Regressions](../../test/unit/queryTextMalformed.c44.test.ts) (analysis agrees with
the final gate for incomplete comparison, unclosed parenthesis, HAVING, a later
batch statement and a subquery; six valid controls), e2e in `queryText.spec.ts`
(status and Apply refuse, then the fixed text applies).

*Not covered here:* a trailing `И` (`ГДЕ В.Код = 1 И`) was dropped by the parser
before `malformedCustom` could see it; fixed by [C45](#c45-trailing-и-dropped-from-a-condition).

### C43. Composite reference fields

**Status:** CLOSED (2026-10-22)

`resolveFieldPath` follows only a field's first reference type, so
`ВЫБРАТЬ С.Пользователь.Служебный КАК Служебный ИЗ РегистрСведений.СоставыГруппПользователей КАК С`
was refused on open, Apply and in editor diagnostics with
`Поле "Служебный" не найдено в "Справочник.ВнешниеПользователи"`, although
`Пользователь` is `Справочник.ВнешниеПользователи | Справочник.Пользователи` and the
second catalog has the field (same in ORDER BY / GROUP BY). The golden corpus holds 8
platform-valid queries with this path in conditions that the check does not read.
The field-path check now reports a missing field only when every reference target
proves it missing; a target without metadata stays unknown. `resolveFieldPath` and
its other consumers are unchanged.
[Regressions](../../test/unit/semanticValidator.test.ts) (`C43`).

### C42. Unclosed condition closed by a designer switch

**Status:** CLOSED (2026-10-22)

`ВЫБРАТЬ Т.Код КАК Код ИЗ Справочник.Валюты КАК Т ГДЕ (Т.Код = &А ИЛИ Т.Наименование = &Б`
opens with the `malformedCustom` Apply block. Generation writes the condition as
`(Т.Код = &А ИЛИ Т.Наименование = &Б)`; a Classic ↔ Canvas switch reopened that
text without the block, so a later edit + Save wrote the closed condition (a guessed
repair of a query the platform rejects; no user text was lost).

Fix: `prepareDesignerSwitch` refuses every model with a static Apply blocker
(`findStaticApplyBlocker`: `unsafeVirtualTable`, `malformedCustom`) with that
blocker's message, so the switch no longer depends on how generation renders a
malformed expression. Keeping the unclosed text in the generator was rejected: it
would change generated output in every slot. A model blocked before the switch now
stays in its UI until fixed (48 malformed cases among 2,916 openable corpus/test
queries, 2 of them previously erased); the other 2,845 queries switch as before.
[Regressions](../../test/unit/designerSwitch.test.ts), e2e in `canvas.spec.ts`
(both directions).

## Architecture

| ID | Status / priority | Remaining work and evidence | Next boundary |
|---|---|---|---|
| A3 | PARTIAL · P2 | [Expression context](../../src/webview/expressionEditor/expressionContext.ts) types a lone resolved field and simple literals, numeric arithmetic over constants/direct metadata fields, and bounded SUBSTRING calls; other compound expressions remain unknown ([tests](../../test/unit/expressionContext.test.ts)). [Audit type boundary](audits/query-core-edt-2026-10-01.md#semantictype-model): parser temp-table `Строка` markers also cover number/Boolean literals and mean non-reference, not their actual result type. | Display-only inference using A1 representation and attested result types; keep type facts separate from validation and do not infer types from compatibility markers. The old independent walker proposal is obsolete; no separate grammar. |

A3 literal slice (2026-10-21): display-only primitive labels reuse SDBL lexer tokens, including signed numbers and English Boolean spelling. No precision/length qualifiers are guessed; at this step NULL, parameters, functions and compound expressions remained unknown. Field metadata qualifiers and validation are unchanged. Live SmartLogistic DEV `execute_query` over constants only confirmed `ПРЕДСТАВЛЕНИЕ(ТИПЗНАЧЕНИЯ(...))`: `42` and `-1.25` → `Number`, `"текст"` → `String`, `ИСТИНА` → `Boolean`; platform build was not reported. Unit regressions and the Classic expression-editor status/save/reopen test cover the slice. A3 remains PARTIAL.

A3 numeric arithmetic slice (2026-10-21): a structurally accepted expression containing only numeric literals, `+ - * /` and parentheses displays `Число`, without evaluating it or guessing precision. Empty parentheses provide no type fact even where the structural acceptor admits them. Fields, parameters, NULL, functions, comparisons and string operations are excluded from this rule. Live constant-only `ПРЕДСТАВЛЕНИЕ(ТИПЗНАЧЕНИЯ(...))` probes returned `Number` for `1 + 2`, `(10 - 3) * 2`, `-6 / 4`, and `1 + 2 * 3` (SmartLogistic DEV, build not reported). Unit tests cover malformed/unsupported boundaries; Classic status/save/reopen is covered in E2E. This is not a runtime-validity or division-by-zero check. A3 remains PARTIAL.

A3 direct numeric fields slice (2026-10-21): the expression-source adapter labels metadata versus derived sources only in the editor context (no persisted schema change). Arithmetic can use direct fields with exactly one numeric type from metadata-labeled sources, retaining qualifiers for standalone fields but showing only `Число` for arithmetic. Unmarked/derived sources, composite types, reference navigation, functions and parameters remain outside arithmetic inference. Live metadata confirmed numeric `Справочник.Контрагенты.ПериодИнвойса` and `ПериодОплаты`; a read-only `ПЕРВЫЕ 1` query returned only `Number` type labels for `Т.ПериодОплаты + 1`, `(Т.ПериодИнвойса - Т.ПериодОплаты) * 2`, and `Т.ПериодОплаты / 2` (SmartLogistic DEV, build not reported). No database values were recorded. Existing standalone-field typing, diagnostics and Apply policy remain unchanged; A3 stays PARTIAL.

A3 substring slice (2026-10-21): a whole `ПОДСТРОКА` / `SUBSTRING` call with a string literal or direct, single-string-type metadata field and two numeric literal arguments displays `Строка`, without a length qualifier. Unknown/derived/composite fields, reference navigation, NULL, parameter arguments, nested calls and enclosing expressions remain untyped by this rule. It reuses lexer tokens and existing field resolution; no second expression parser or validation rule. Live SmartLogistic DEV (8.3.15.1489, user-confirmed build): `ПРЕДСТАВЛЕНИЕ(ТИПЗНАЧЕНИЯ(ПОДСТРОКА("abcdef", 2, 3)))` and the English spelling both returned `String`; a `ПЕРВЫЕ 1` query using `Справочник.Валюты.Наименование` also returned only the `String` type label. `validate_query` rejected the two-argument form. No database values were recorded. Unit boundaries and Classic status/save/reopen cover the change; shared Canvas expression workflows remain regression coverage. Type hints are not a guarantee of runtime validity or non-nullness; validation and Apply are unchanged. A3 remains PARTIAL.

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
urgent refactor tickets. A1 closed on 2026-10-11 and A2 on 2026-10-14; A3 remains
partial, as recorded in the architecture table above.

## Verification

| ID | Status / priority | Summary |
|---|---|---|
| V5 | OPEN · P1 | Query Core v1 gate: 0 known platform-valid grammar gaps. Phase 5 partial: 88 adapted cases on 8.3.15.1489; 53 fully attested cases produce the same platform canonical text. Modern-version and metadata coverage, catalog promotion, C37–C40 remain open; C36 is an accepted divergence. [Details](#v5-grammar-parity-gate-query-core-v1). |
| V1 | PARTIAL · P2 | Golden corpus entries have no per-entry platform/metadata attestation; no attested negative or English cases. [Details](#v1-corpus-attestation). |
| V3 | PARTIAL · P2 | The Apply gate never compares input and output semantics. [Details](#v3-apply-semantic-preservation). |

V4 is CLOSED for the bounded [Canvas browser/real-host gate](testing-and-release.md#canvas-verification).
It does not certify every UI action, live-platform equivalence or release readiness.

### V5. Grammar parity gate (Query Core v1)

**Status:** OPEN · P1

Query Core v1 blocker, not a defect of the current product. [Grammar parity](grammar-parity.md) gate: 0 known platform-valid grammar gaps across the reviewed SDBL construct catalog, every entry with source/provenance and platform evidence where required, reported with coverage confidence. Core v1 = ordinary SDBL / Query Designer; DCS `{…}` is out of scope.

The [catalog](../../test/fixtures/grammar-parity/catalog.jsonl) holds 153 entries (RP01–RP25 and 128 golden-attested forms, build unknown); no open catalog gap; C36 is an accepted divergence (its two listed constructs only) (C2 fixed 2026-10-17, C24 fixed 2026-10-18). The Phase 5 evidence adds C37–C39 canonical differences and C40 safety evidence pending catalog promotion. [Proposal](audits/sdbl-grammar-parity-proposal-2026-10-04.md).

**Next boundary:** Phase 3 inventory remains 70 areas = 35 covered + 34 pending + 1 out of scope. [Phase 5 partial audit](audits/v5-phase5-2026-10-21.md) records 88 adapted cases addressing 80 form IDs across 31 queued areas; this is not full coverage of those forms. 53 full platform verdicts have stable local round trips and platform-equivalent generated output. The original queue/catalog remain unchanged pending reviewed promotion. Finish modern-version and missing-metadata probes, resolve the incomplete characteristics probe, and review C37–C40 before claiming the gate. Gates G2/G3/G5 run in the unit suite.

### V1. Corpus attestation

**Status:** PARTIAL · P2

Positive recorded golden cases have no per-entry platform-build/metadata attestation; negative/English attested corpus is absent. Template-marker substitution remains unproven. Generator-derived fixtures are not an independent oracle. [Corpus policy](corpus-testing.md).

**Next boundary:** Attested negative/English/metadata-mode cases and provenance; retain ADR 0004 canonical contract. Private corpus availability is a qualification here.

### V3. Apply semantic preservation

**Status:** PARTIAL · P2

Shared Apply gate validates structure/selected semantics and malformed generated output, but never compares input/output semantics. Structural acceptor ignores precedence; Boolean truth tables cover a subset. [Apply regressions](../../test/unit/applyGeneratedOutput.test.ts).

**Next boundary:** Bounded transformation-preservation checks and reviewed canonical evidence over A1; no mandatory live execution or theorem prover.

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
| UX-C7 | CLOSED | Sort-priority buttons in Classic and Canvas (2026-10-19). | Shared `MOVE_ORDER_FIELD` moves whole entries by index; direction, hierarchy, expressions, aliases and section comments survive. UNION tail routing and filtered Canvas indices are covered by [unit](../../test/unit/orderPriority.uxc7.test.ts) and [browser](../../test/e2e/orderPriority.spec.ts) regressions. |
| UX-C8 | OPEN · P2 | Canvas cache refresh and lazy reference-field expansion parity. | Classic has refresh/ref message handling and SET_REF_FIELDS; Canvas lacks controls/response wiring. Reuse host/session; loaded navigation already works. |
| UX-C9 | OPEN · P2 | Full positional UNION mapping for tabular/trailing projections. | Scalar-only deriveUnionColumns differs from generator orderedSelectElements. Preserve-only guard suppresses partial mapping. Shared alignment plus safe alias/reorder contract; coordinate A2 without requiring full A2 completion first. |
| UX-C10 | CLOSED (declined) | Global stable Query/Scope ID proposal: not needed (2026-10-21). | No current consumer needs persistent cross-tree identity. Local recursive drafts work with parent source IDs; this is not a baseline or release prerequisite. Closed by decision: reopen when a concrete consumer needs cross-tree identity. |

EXISTS/NOT EXISTS, scalar SELECT subqueries and structured JOIN subqueries remain
unsupported shared grammar/model ideas, not promised Canvas features. Raw JOIN
expressions are editable; new grammar needs a separately scoped shared task.

## Platform unknowns

| ID | Status / priority | Evidence boundary | Needed evidence |
|---|---|---|---|
| U2 | UNKNOWN · P2 | RP24: live base had no sequences; SL_kza (platform 8.3.15.1489) has none either (`list_metadata_objects` Sequences empty, 2026-10-15); `Границы` real argument layout unconfirmed. Marked models are Apply-blocked. | Sequence-enabled base and canonical output. |

C1 accounting-fixture validity remains an evidence qualification, not a duplicate
UNKNOWN ticket. A2 nested-INTO rejection is recorded in its platform fixture;
other projection/schema behavior is not implied by that evidence. Metadata cannot
provide database values; dynamic BSL/execution and unresolved reference types are
product boundaries, not automatic debt.

## Closed regression register

Long discovery/fix histories, reviewed output changes and former severity/counts
are retained in the [pre-consolidation ledger](audits/archive/technical-debt-e3b36a5.md)
and [audit index](audits/README.md).

| ID | Status | Resolved class / regression reference |
|---|---|---|
| A1 | CLOSED | Query Core lexical facts are read through the shared lexer only (2026-10-11). [Details](#a1-lexical-facts-have-one-owner). |
| A2 | CLOSED | One owner each for producer columns and temp-table lifetimes (2026-10-14, PR #51–53). [Details](#a2-producer-columns-and-temp-table-lifetimes). |
| C1 | CLOSED | Missing accounting metadata preserves fallback arguments; virtualTableRoundTrip.test.ts. Live fixture validity unverified. |
| C2 | CLOSED | English SDBL: recognised, diagnosed and opened in the Designer, written in Russian (2026-10-17, 0.2.0). Leftovers: C34. [Details](#c2-english-sdbl). |
| C3 | CLOSED | ORDER hierarchy retained without metadata; [case-specific live evidence](audits/c3-hierarchy-2026-09-28.md). |
| C4 | CLOSED | Nearest-ancestor condition correlation with known metadata; [live evidence](audits/c4-correlated-2026-09-28.md), correlatedConditions.test.ts. No-metadata fallback retained. |
| C5 | CLOSED | Invalid input rejected on open or blocked on Apply; invalidInputPreservation.test.ts. |
| C6 | CLOSED | Two JOIN shapes gained a parenthesis pair on the second pass; split on the first pass now. [Details](#c6-join-conjunct-parentheses). |
| C7 | CLOSED | Lexer-backed parameter extraction; resultProcessingTemplate/queryAnalysisService tests. |
| C8 | CLOSED | Malformed reparsed generated output blocked; applyGeneratedOutput.test.ts. |
| C9 | CLOSED | HAVING retained by store/snapshots; [report](audits/c9-having-2026-09-29.md). |
| C10 | CLOSED | trailingFields/characteristics retained; [report](audits/c10-preserved-sections-2026-09-29.md), queryStore.corpusParity.test.ts. |
| C11 | CLOSED | Malformed expression-slot traversal; [report](audits/c11-malformed-slots-2026-09-29.md). |
| C12 | CLOSED | Reject unclosed characteristics; [report](audits/c12-characteristics-eof-2026-09-29.md). |
| C13–C15 | CLOSED | EOF readers terminate instead of exhausting host heap; [report](audits/c13-c15-raw-expression-eof-2026-09-29.md). |
| C16 | CLOSED | VT/ПЕРИОДАМИ argument comment preservation; [report](audits/c16-raw-slice-comments-2026-09-30.md), rawSliceComments.c16.test.ts. |
| C17 | CLOSED | User `//` comments survive open → edit → Save → reopen in every known slot. [Details](#c17-comment-preservation). |
| C18 | CLOSED | DUPLICATE/ABSORBED in C5 / RP11: platform-invalid source alias `В`; [RP11 platform evidence](audits/stage-0/platform-reprobe-results.jsonl), unchanged [Apply-blocking regression](../../test/unit/canvasPreserveBoundaries.test.ts) and [C5 invalid-input coverage](../../test/unit/invalidInputPreservation.test.ts). [Details](#c18-absorbed-into-c5). |
| C19 | CLOSED | Exported navigation-head paths retained; queryStore/sourceQueryDraft tests. |
| C20 | CLOSED | Shared UNION tail ORDER/TOTALS/INDEX editing; compoundSections tests and archived Canvas report. |
| C21 | CLOSED | Arithmetic ORDER keys headed by a field/path, `(` or unary `-` use the existing token reader and expression model; [report](audits/c21-order-expressions-2026-09-30.md), [regressions](../../test/unit/orderExpressions.c21.test.ts). Full platform expression/type validity remains outside this fix. [Pre-fix evidence](#c21-order-expression-evidence). |
| C22 | CLOSED | A multiline TOTALS aggregate inside a nested query no longer gains a tab per reopen; fixed with C23. [Regression](../../test/unit/nestedRawIndent.c23.test.ts); the TOTALS and ORDER comment matrices include nested wrappers again. |
| C23 | CLOSED | Raw multi-line text of a nested query no longer gains indentation on every reopen. [Details](#c23-nested-query-raw-indentation). |
| C35 | CLOSED | Kept wildcard widths are unknown; mixed UNION lists survive open / Apply without NULL padding. [Details](#c35-union-column-count-with-a-kept-wildcard). |
| C24 | CLOSED | `*` is never written invalid, kept in the Designer, expanded only by the explicit command (2026-10-18). Follow-ups: C35, C36. [Details](#c24-wildcard-projection). |
| C25 | CLOSED | Query transformations preserve string-literal bytes (closed again 2026-10-05). [Details](#c25-string-literal-bytes). |
| C26 | CLOSED | Parentheses inside string literals no longer add an outer pair on every reopen. [Details](#c26-parentheses-inside-literals). |
| C27 | CLOSED | Six vs eight `Обороты` positions without metadata: confirmed cosmetic on the platform. [Details](#c27-accounting-обороты-arity). |
| C28 | CLOSED | A removed parenthesis no longer leaves a double space (ИТОГИ reopen instability). [Details](#c28-итоги-reopen-instability). |
| C30 | CLOSED | Result-column names after Designer → Apply equal the platform's (`columnNames.ts`). [Details](#c30-result-column-names). |
| C31 | CLOSED | A parameter used as a BSL template placeholder survives Designer → Apply as written. [Details](#c31-bsl-query-template-parameters). |
| C32 | CLOSED | OK / Save without a change no longer rewrites the query. [Details](#c32-safe--no-op-apply). |
| C33 | CLOSED | An unaliased `#Имя` source gets no synthesized `КАК` in the Designer (2026-10-18). [Details](#c33-unaliased-template-marker-source). |
| C42 | CLOSED | A Classic ↔ Canvas switch no longer erases an Apply block: a model with a static Apply blocker does not switch (2026-10-22). [Details](#c42-unclosed-condition-closed-by-a-designer-switch). |
| C43 | CLOSED | A field reached through a composite reference is found if any target has it; open/Apply/diagnostics no longer refuse it (2026-10-22). [Details](#c43-composite-reference-fields). |
| C44 | CLOSED | Query Text no longer shows "✓" or applies an incomplete custom condition that OK / Save refuses: the status bar and Apply use the same `malformedCustom` check (2026-10-22). [Details](#c44-query-text-accepted-an-incomplete-condition). |
| C45 | CLOSED | An empty `И` conjunct in WHERE/HAVING/join no longer disappears on Save: the condition keeps its text and `malformedCustom` refuses it (2026-10-22). [Details](#c45-trailing-и-dropped-from-a-condition). |
| C46 | CLOSED | A join condition with an empty `И` operand is no longer printed with `()`, so its refusal survives Query Text «Применить»; a typed empty group `()` is refused in every condition slot (2026-10-24). [Details](#c46-empty-join-conjunct-printed-as-и-). |
| C55 | CLOSED | An incomplete condition ending in an operator word (`… И НЕ`, `ГДЕ ЕСТЬ`) is refused: it is no longer qualified as a field (`Т.НЕ`) and the acceptor no longer takes the word as a value (2026-10-24). [Details](#c55-operator-word-taken-as-a-field). |
| C56 | CLOSED | A compact `X НЕ В (ВЫБРАТЬ …)` with any left side (and `НЕ X НЕ В`) is applied in the platform's prefix form; before, OK / Save refused it (2026-10-24). [Details](#c56-compact-scalar-не-в-subquery-refused). |
| C57 | CLOSED | An infix `НЕ В` / `НЕ ПОДОБНО` inside a subquery or a function argument, or after `И` in a virtual-table condition, stays with its operand on Save; before, it negated the whole expression (2026-10-24). [Details](#c57-infix-не-moved-out-of-its-operand). |
| C54 | CLOSED | `(НЕ поле)` keeps its parentheses before `В`, `ЕСТЬ NULL`, ordering comparisons and other operators whose result depends on them; before `В` this is the ADR 0004 boolean operand scope exception (2026-10-24). [Details](#c54-negated-field-operand-loses-its-parentheses). |
| C49 | CLOSED | `ГРУППИРУЮЩИМ НАБОРАМ` in a raw-text subquery is no longer qualified as fields, and its set parentheses are kept; such queries are applicable and stable after the first Save. Preservation only: grouping sets are not confirmed on an available platform (2026-10-25). [Details](#c49-grouping-sets-qualified-in-a-raw-text-subquery). |
| C53 | CLOSED | A non-reference left side of `В (ВЫБРАТЬ …)` split over lines (a line comment or a line break in a tuple) is printed on one line on the first Save, like a raw leaf; left sides the helper does not flatten (`И`/`ИЛИ`, `ВЫБОР`) keep their lines (2026-10-22). [Details](#c53-line-comment-inside-a-tuple-left-side). |
| C52 | CLOSED | `НЕ НЕ X В (ВЫБРАТЬ …)` no longer moves the subquery one tab on the second Save (2026-10-22). [Details](#c52-doubled-не-before-an-in-subquery-shifts-it-once). |
| C51 | CLOSED | A tuple left side of `В (ВЫБРАТЬ …)` written compactly no longer changes on the second Save (in `ИМЕЮЩИЕ`, with `НЕ В`, or with bare fields) (2026-10-22). [Details](#c51-tuple-in-subquery-changed-on-the-second-save). |
| C50 | CLOSED | Nested subqueries kept in raw text are no longer parsed 2^depth times during bare-field qualification (depth 18: tens of seconds → about 0.1 s) (2026-10-22). [Details](#c50-nested-raw-subqueries-parsed-2depth-times). |
| C48 | CLOSED | A broken condition inside a `(ВЫБРАТЬ …)` kept in raw custom text (outer alias `В`, `ИЛИ`, `ВЫБОР`, join) is refused like one in a modelled subquery (2026-10-22). [Details](#c48-broken-condition-in-a-raw-text-subquery-not-refused). |
| C47 | CLOSED | A custom condition/expression slice ending in an English keyword is no longer cut to the length of its Russian form (`… AND` → `… A`): `sliceSource` and `qualifyBareFieldsInExpression` use the token text (2026-10-22, within C45). [Details](#c47-english-last-token-cut-to-its-russian-length). |
| C36 | ACCEPTED | The Designer keeps `*` where the 1C constructor expands it; accepted permanently (2026-10-21). [Details](#c36-kept--versus-the-constructor-canonical-text). |
| D1 | CLOSED | Corrected stale source-contract comments; reconciliation/near-term reports. |
| N1 | CLOSED | A `КАК` inside a DCS-brace literal no longer counts as an alias (`aliasDcsBraceExprs`, `wrapDcsBraceParam`) (`d562339`); dcsBraceAlias.n1.test.ts. |
| N3 | CLOSED | `reindentVtCondition` counts group parentheses by code ranges; reproduced (8 multi-line literal cases) and fixed (`f628dbf`); vtConditionParens.n3.test.ts. |
| N4 | CLOSED | Accounting VTs merge adjacent DCS braces like the other VT paths; matches the platform text (`70474a2`); accountingDcsMerge.n4.test.ts. The `Хозрасчетный.Обороты` trailing-position difference is C27. |
| R4 | CLOSED | Field casing (`canonicalizeFieldCasing.canonExprText`) rewrites only code; comments and literals stay byte for byte (`941ce19`); fieldCasingComments.r4.test.ts. |
| R5 | CLOSED | Comment/literal content no longer becomes structure: `inferUndefinedTempTables` reads `<alias>.<col>` and stars from lexer tokens (`7c71a10`), so `// см. Т.Фантом`, `"Т.Строка"`, `"Т.*"` and `// *` create no columns and `Т.Ціна` is inferred whole; inferredTempTables.lexical.test.ts. |
| R6 | CLOSED | Period units in `EXPR_STOP_WORDS` come from `PERIOD_WORDS`; `НАЧАЛОПЕРИОДА(Т.Дата, ПОЛУГОДИЕ)` no longer becomes `Т.ПОЛУГОДИЕ` (was Designer → Apply ok; platform keeps every unit) (`9c3f8d7`); periodUnits.r6.test.ts. |
| R7 | CLOSED | Template markers (`%`, `#`, `@`, `[`, `]`) count only in code, so `Т.А + "50%" +` is malformed like `Т.А + "x" +`; the lifted bypass also exposed and fixed infix `НЕ ПОДОБНО` / `НЕ МЕЖДУ` false rejections and an ИТОГИ alias false Apply block (`ВЫБОР … КОНЕЦ КАК Код`; ИТОГИ check applyBlocked 45096 → 0) (`2cad5d7`, `a74ce68`); templateMarkerLiterals.r7, totalsAliasApply tests. |
| R8 | CLOSED | `nestingPad` skips lines that start inside a literal; a literal line starting with a section word no longer moves the nested query (`18f1d49`); nestingPadLiterals.r8.test.ts. |
| R12 | CLOSED | Dead Cyrillic `\b` guards removed (they never fired on query text; they misfired only between ASCII word characters such as `_ВЫБРАТЬ_`) (`5bc9473`); deadWordBoundary.r12.test.ts. |
| R13 | CLOSED | JOIN single-CASE reflow (`renderJoinConjunct`) read `ВЫБОР` at a line end and the `КОНЕЦ` count from raw text, so literal content switched the layout (Designer → Apply ok, layout only). Found by the post-A1 residual audit; checks now count only code (`d525c7c`); joinCaseGate.r13.test.ts. |
| S1 | CLOSED | Structured condition-subquery scopes; conditionSubqueryScope.test.ts. Opaque conditions remain unindexed. |
| S2 | CLOSED | Offset-preserving advisory recovery; recoveryS2/queryParameters tests. Never used for Apply. |
| S3 | CLOSED | Removed unused semantic maps/partial state; semanticSnapshot tests. |
| U1 | CLOSED | `#Имя` template markers: Apply is refused when a marker's neighbouring code changes. [Details](#u1-template-markers). |
| U3 | CLOSED | A join condition sees only its own comma-root chain, as on the platform. [Details](#u3-comma-separated-from-roots). |
| V2 | CLOSED (superseded) | External grammar oracle superseded by the live platform oracle (2026-10-21). [Details](#v2-external-grammar-oracle). |
| V4 | CLOSED | Bounded Canvas browser/host regression gate; testing-and-release. |
| Canvas baseline | CLOSED | Current capability matrix; archived baseline and full history reconciliation. |

### Closed item details

#### C18. Absorbed into C5

C18 is absorbed into C5 / RP11: the [recorded RP11 platform evidence](audits/stage-0/platform-reprobe-results.jsonl)
rejects the source alias at `КАК В` with “Name expected”. The C18 input opens,
but the malformed-expression guard blocks Apply, satisfying C5's invalid-input
contract. Rejecting every `КАК В` on open was deliberately not adopted in C5
because existing tests and fixtures use that alias. The same negated
`В ИЕРАРХИИ` condition subquery with the valid alias `Вал` parses structurally
and has a stable generated round trip; there is no parser defect for this valid
input. The existing C18 regression remains unchanged and pins the Apply blocker.

#### A1. Lexical facts have one owner

**Status:** CLOSED

Query Core lexical facts have one owner, the shared lexer (2026-10-11, [A1 closure check](audits/a1-closure-2026-10-10.md#addendum-2026-10-11-closure)). Slices A1-1…A1-7: word roles via `isWordToken`, parser/generator/formatter gates read only code (`codeRanges`, `isCodeAt`, `replaceInCodeRanges`), identifier names via `isNameToken` / `isIdentifierName` (live 1C evidence for `&Ціна`, `&Gültig`, `ПРЕДСТАВЛЕНИЕ(ВТ.Ціна)`), undefined temp-table inference and `parseStar` (`7ff2490`) on lexer tokens; unknown lexical facts preserve text. All seven exit criteria pass; remaining scanners and patterns are named exceptions in the closure check.

Regressions: lexicalGates.a16, formatterLexicalGates.a15, unicodeIdentifiers, inferredTempTables.lexical, starUnknownMetadata tests.

Separate debts keep their own rows (C24, C26, C2, V5, R4, R6–R8, R11, R12, N1, N3, N4).

Post-closure residual audit (2026-10-11, [summary](audits/a1-closure-2026-10-10.md#post-closure-residual-audit-2026-10-11)): one missed consumer (R13, fixed), no systemic issue.

#### A2. Producer columns and temp-table lifetimes

**Status:** CLOSED

Producer columns and temp-table lifetimes have one owner each (2026-10-14, PR #51–53). `deriveProjectionFacts` holds print order and C30 names; [producerColumns](../../src/core/query/producerColumns.ts) derives temp-table columns for the parser registry, the Designer and semantics; [tempTableLifetimes](../../src/core/query/tempTableLifetimes.ts) owns create/append/drop transitions for all three.

Fixed on the way: scalar columns after `*` are kept (a downstream `*` no longer loses them), an unresolved `Н.*` is no longer a Designer column, a shadowed temp-table schema is no longer revived after create/create/drop, an unknown redefinition no longer reuses stale columns, a repeated name in a later UNION member is rejected like in member 0 (#52), and repeated names follow one suffix rule everywhere (#53).

Remaining policy differences apply only to platform-invalid input (nested projection into a temp table; repeated explicit names) or to an unknown source shape, and are documented in `producerColumns.ts`; inference of undefined temp tables and parser literal markers stay separate by design.

Platform evidence: [nested projections and scalar columns after `*`](../../test/fixtures/platform/a2-nested-projection-temp.json), [repeated names](../../test/fixtures/platform/a2-duplicate-temp-columns.json); limits: one database (SL_kza), platform 8.3.15.1489, СхемаЗапроса via `validate_query` and `execute_query` (not the interactive constructor window). A downstream `*` over an incomplete producer schema in `analysis`/`constructor` mode is a pre-existing C24 item, not A2. [Policy audit](audits/a2-producer-policy-audit-2026-10-14.md), [regressions](../../test/unit/producerColumns.a2.test.ts).

#### C2. English SDBL

**Status:** CLOSED

English SDBL (2026-10-17, release 0.2.0, PR #61–#63).

Platform evidence ([fixture](../../test/fixtures/platform/c2-english.json), SL_kza 8.3.15.1489): one bilingual word table, languages mix freely, alias reservation is the same in both languages, the canonical text is Russian.

Slice 1: an English keyword is its Russian keyword token, contextual words match through `isWordToken`/`wordOf` (`sdblEnglish.ts`), a word right after `.` is a name.

Slice 2: a literal's dialect (`queryDialect.ts`: `sdbl`/`nativeSql`/`unknown`) drives detection; diagnostics only for `sdbl`.

Slice 3: English kinds, virtual tables and standard attributes resolve (`canonicalTableName`, `findField`).

Slice 4: the Designer opens an English query in Russian words (`translateEnglish.ts`, guarded by a same-model check; names kept). All 145 Apply texts of the English probes are platform-valid. Russian corpus and Designer round trips unchanged at every slice.

Leftovers: C34.

#### C6. JOIN conjunct parentheses

**Status:** CLOSED

Two JOIN shapes (`((a ИЛИ b) И c) И d`, `a И ((b ИЛИ c) И d)`) wrapped one more conjunct in parentheses on the second pass. A JOIN conjunct whose ИЛИ sits only in nested parentheses is now split at its top-level И on the first pass, as reopening did; И is associative. [booleanGroupingSemantics](../../test/unit/booleanGroupingSemantics.test.ts) no longer exempts any shape from text equality and still checks truth tables for both passes.

#### C17. Comment preservation

**Status:** CLOSED

User `//` comments survive open → edit → Save → reopen in every known slot: WHERE/HAVING and JOIN conditions, SELECT projections, GROUP/ORDER/TOTALS sections (after their header), VT/ПЕРИОДАМИ arguments (C16), and — relocated after ИЗ or before ВЫБРАТЬ — source names/aliases, JOIN/comma sources, ИНДЕКСИРОВАТЬ, ДЛЯ ИЗМЕНЕНИЯ, ПОМЕСТИТЬ, UNION separators (including between ОБЪЕДИНИТЬ and ВСЕ), a comma-only line, a comment after the final `;` and УНИЧТОЖИТЬ. A token-gap fuzz over the corpus (one comment after every token) finds no loss and no refused open; the remaining reopen instability was the pre-existing C23 layout drift, since closed. Original intra-expression placement is not promised; text and occurrence counts are. The consent dialog stays as a safety net for renderer regressions. [Contract](contracts/safety-and-preservation.md#original-text-and-designer-loading); suites `*.c17.test.ts`, `rawSliceComments.c16.test.ts`.

#### C23. Nested query raw indentation

**Status:** CLOSED

Raw multiline text of a nested query (conditions such as `ВЫБОР … КОНЕЦ = ВЫБОР … КОНЕЦ` with subqueries, TOTALS expressions, …) kept the nesting padding of its text, which the generator added again on every reopen (also on 0.1.96, without comments). `parseDocument` rebases continuation lines of every multiline string in the parsed model by the query's own section-line indentation, skipping literal contents, lexically rejected text and nested subqueries (normalized by their own parse); a top-level query has no padding and is unchanged. [Regressions](../../test/unit/nestedRawIndent.c23.test.ts); full-corpus comment fuzz and corpus outputs unchanged.

#### C24. Wildcard projection

**Status:** CLOSED

Wildcard projection (closed 2026-10-18, PR #70 and the completion PR).

Step 0: `* КАК Поле1` / `Т.* КАК Поле1` (platform syntax errors) are never written; a wildcard gets no `Поле{n}`.

Step 1a: the Designer (`preserve`) never removes a wildcard and expands it only when every column is proven from the batch text.

Mitigations: an incomplete metadata resolver is not authoritative; a wildcard over a nested SELECT or over a temp table whose creator kept a wildcard is kept.

Step 1b decided: no automatic expansion over configuration metadata (completeness unprovable); an explicit "Expand `*`" command instead (PR #70).

Completion: a kept wildcard in a UNION gets no column alias (`Т.* КАК Т.*` was a syntax error) in generator, parser and the synthetic columns of a nested source (which also had a fictitious `Т.*` column for a single-member nested SELECT); the constructor-parity / analysis expansion names columns by C30 (D4: `*, Т.Б` → `Б`, `Б1`, was `Б1`, `Б`) with synthesized names, so `В (ВЫБРАТЬ * …)` prints no `КАК`. `PQ-C24` run.

Platform evidence: [completion](../../test/fixtures/platform/c24-completion.json), [command](../../test/fixtures/platform/c24-expand-command.json); constructor-mode texts equal СхемаЗапроса byte for byte; corpus outputs and Designer round trips unchanged.

Follow-ups: C35 (UNION column count with `*`), C36 (deliberate canonical divergence). [Regressions](../../test/unit/c24Completion.test.ts).

#### C25. String-literal bytes

**Status:** CLOSED

Invariant: query transformations covered by the C25 verification preserve string-literal bytes. Closed again 2026-10-05.

Reopened because the v2 check had no multi-line tuple-head context: `reindentLeafSubquery` collapses a multi-line tuple head before a membership subquery (`(Т.Код,⏎"a  b") В⏎(ВЫБРАТЬ …)`) with whitespace regexes over the whole head, literals included: `"a  b"` → `"a b"`, tab → space, `"a ,b"` → `"a,b"` (`[ \t]+`, `\s+,`; `\(\s+`/`\s+\)` latent behind the tuple gate).

Reproduced in WHERE, JOIN, HAVING, VT condition, nested-source WHERE, CASE WHEN and SELECT; Apply allows it.

Present since the initial import (`b9b37c9`) and on the closure commit `c6886a7`.

C25 v2 missed it because all its tuple heads were single-line; the verification adds a tuple-head family (v3).

Fix: `reindentLeafSubquery` runs the head normalization only on code (`replaceInCodeRanges`); regression [tuple head](../../test/unit/tupleHeadCollapse.literals.test.ts) (65 tests; 64 fail on `09cfe8f`, all on literal bytes).

Evidence (dev scripts, not in the repo): property check v3 = v2 (script `bef639e`, positions and order unchanged) plus the tuple-head family appended after them (script `b5d37cb`, 3 head forms × 9 slots = 27 positions, same 2260-payload pool, seed `20261004`); 347,924 variants, 2,783,392 executions; `09cfe8f` 47,040 literal corruptions (11,760 Apply-reachable) → fix 0, all in the new family; the v2 positions stay at 0 with unchanged counters (R1/R2/R3/R9 roots); supplemental ИТОГИ check `b740375` stays at 0 with unchanged counters (R10), pool hash `57b658c`.

Differential `09cfe8f` vs fix: 10,000 checks, 768 differences, all literal preservation with the neutral-literal layout, unchanged structure and QueryModel and a stable reopen; 0 other.

Gates: corpus 7904/7904 byte-identical; unit 5810 passed + 5 skipped; G2/G3/G5 533/533; e2e 172; integration 46; typecheck, docs:check and diff --check green. Reopen instability seen by the checks (6,964 in v3, of which 2,154 in the new family; 6,012 in ИТОГИ) is unchanged by the fix and is not C25. No known literal-byte corruption remains within the C25 verification coverage.

Historical evidence of the first closure (`c6886a7`), kept for reference: Fixed cases: the 9 [A1](audits/a1-lexical-audit-2026-10-04.md) cases (C25a `renderConditionSubquery`; C25b-1..3 `stripNotFieldParens`, `stripRedundantLeafParens` post-pass, `appendIsNotNullToLine`; C25c-1 `wrapDcsBraceParam`, `aliasDcsBraceExprs`, `mergeDcsBraces`, membership left operand; C25c-2 `reindentVtCondition`), C25d `reindentLeafBool`, and after the reopen R1 `mergeDcsBraces` brace scan (also resolves N2), R2 `stripRedundantCallWrapParens` cleanup, R3 `reindentLeafSubquery`, R9 `reindentVtCondition` CASE detection and head trim, R10 `ПЕРИОДАМИ` period-unit upper-casing.

Regressions: [C25a](../../test/unit/conditionSubqueryLiterals.c25.test.ts), [C25b-1](../../test/unit/stripNotFieldParens.literals.test.ts), [C25b-2](../../test/unit/stripRedundantLeafParens.literals.test.ts), [C25b-3](../../test/unit/appendIsNotNullTrailingSpace.literals.test.ts), [C25c-1 DCS](../../test/unit/vtDcsBraces.literals.test.ts), [C25c-1 lhs](../../test/unit/membershipLhs.literals.test.ts), [C25c-2](../../test/unit/vtConditionReindent.literals.test.ts), [C25d](../../test/unit/reindentLeafBool.literals.test.ts), [R1](../../test/unit/dcsBraceMerge.literals.test.ts), [R2](../../test/unit/callWrapParens.literals.test.ts), [R3](../../test/unit/leafSubquery.literals.test.ts), [R9](../../test/unit/vtConditionCase.literals.test.ts), [R10](../../test/unit/periodsByLiterals.test.ts).

Closure evidence (dev scripts, not in the repo; one literal payload replaced per variant, literal bytes compared before/after through the generator in four modes, Designer open without and with a resolver, `decideApply` and reopen; no R-specific expectations).

Main property check v2: script `bef639e`, seed `20261004`, 2260 payloads (lexer delimiters, whitespace/newlines, escaped quotes, 111 words from the project's keyword sets; singles, pairs, keyword/delimiter combinations, newline variants, triples), 122 generated contexts + 466 corpus literal positions, 286,904 variants, 2,295,232 executions per version; historical sensitivity R2 30,322 → 27,442, R1 27,442 → 27,426, R3 27,426 → 144, R9 144 → 0; merged `main` `6eb474b`: 0 literal corruptions.

Supplemental ИТОГИ check: script `b740375`, same 2260-payload pool, seed `20261004`, pool hash `57b658c`, 37 valid ИТОГИ contexts, 83,620 variants, 668,960 executions; R10 3,448 → 0 (Apply-reachable 862 → 0); merged `main` `6eb474b`: 0 literal corruptions.

Both checks on `6eb474b`: 0 parse, generation, unlexable-output, Designer-open, Apply-rejection (except the 45,096 context-level blocks of four ИТОГИ expression forms, also with a neutral literal) and missing-literal cases.

Gates on `6eb474b`: corpus 7904/7904 byte-identical; unit 5726 passed + 5 skipped; G2/G3/G5 533/533; e2e 172; integration 46; typecheck, docs:check and diff --check green.

Non-goals: this is not evidence of structural isolation, reopen fixed-point stability, semantic equivalence, comment preservation, English SDBL (C2), date literals or live-1C parity.

Separate: C26, R8, N1, N3, N4, R4–R7 ([A1 reconciliation](audits/a1-reconciliation-2026-10-04.md#separate-findings-not-a1-classification-only)), V3, the live-1C probe for a string as the `ПЕРИОДАМИ` unit, and the reopen instability seen by the checks (4,810 in v2, 6,012 in ИТОГИ), which is not C25.

Residual risk: finite mutation space (no combinations beyond triples; corpus positions get 24 payloads each; generated templates are mostly single-literal). The checks' permanent place, a reduced CI set, a full verification mode, shrinking and a structural-isolation property check are decided in a Test Architecture Audit.

#### C26. Parentheses inside literals

**Status:** CLOSED

Parentheses inside string literals no longer add an outer pair on every reopen: `sdblParser.stripOuterParens` (builder `{ГДЕ …}`, arbitrary JOIN conjunct/condition) and `sdblGenerator.stripOneEnclosingParen` (JOIN И-chain split) count parentheses only in the shared lexer's code ranges; unknown lexical facts keep the pair (`6164e72`, `c69e5de`). The JOIN cases equal the platform text (СхемаЗапроса, SL_kza 2026-10-11). C25 v3 reopen instability 6598 → 0 (all of it this class), 0 corruption; literalParens.c26.test.ts.

Separate observation, not changed: inside `{ГДЕ (… ИЛИ …)}` the platform puts `ИЛИ` on its own line, the generator keeps one line (same with a neutral literal).

#### C27. Accounting Обороты arity

**Status:** CLOSED

Accounting `Обороты` arity without metadata (2026-10-17): the Designer prints six positions (`Хозрасчетный.Обороты(&Н, &К, , , , )`, no correspondence assumed), while 1C prints all eight for a register with correspondence.

Confirmed cosmetic: the written, the six- and the eight-position form get the same canonical text on the platform (СхемаЗапроса, SL_kza 8.3.15.1489; also with a DCS condition, [fixture](../../test/fixtures/platform/c27-accounting-turnovers-arity.json)).

Without metadata the correspondence flag stays unknown and is not guessed; with metadata the existing `accountingPositionKeys` path prints all positions. No code change.

#### C28. ИТОГИ reopen instability

**Status:** CLOSED

ИТОГИ reopen instability (2026-10-17).

Root cause corrected: not the multi-line literal itself — it only routes the expression to the CASE reflow (`reindentLeafCase`), whose `stripRedundantCallWrapParens` replaced each removed parenthesis with a space even next to existing whitespace, so `(МАКСИМУМ(Код)) + ВЫБОР …` became `МАКСИМУМ(Код)  + ВЫБОР` until the next open. A removed parenthesis is now a space only between two tokens.

Synthetic scan (4 aggregates × 3 operators × 3 literals × 2 orders × ИТОГИ/select, 144 forms): 24 unstable before, 0 after; corpus outputs and Designer round trips unchanged (0 of 23,712 / 1,976). The original 6,012-case supplemental run was not repeated (its tool is not in the repository). [Regression](../../test/unit/totalsParenSpace.c28.test.ts).

#### C30. Result-column names

**Status:** CLOSED

Result-column names after Designer → Apply now equal the platform's: one owner `columnNames.ts` (explicit `КАК` reserved first, the rest left to right with the smallest free suffix; field paths and aggregates name by their joined path — bare or qualified; a bare parameter by its name; `ПРЕДСТАВЛЕНИЕ(…)` by the path after the source alias + `Представление`, without a `Поле{n}` number; other expressions the next free `Поле{n}`). The parser stores expression names marked `aliasSynthesized` (a rename makes them explicit; names are not renumbered by later edits); the generator, UNION headers, the temp-table registry, hover/`tempTableSemantics`, the Designer store and C24 proven columns all read the same names.

Fixed: silent renames (`ПРЕДСТАВЛЕНИЕ(…)` shifting `Поле{n}`, dotted `ПРЕДСТАВЛЕНИЕ`, UNION member 0, temp table / nested SELECT read later by name, `МАКСИМУМ(Код), Код` and bare dotted paths/aggregates taking the last segment) and valid queries refused or blocked by missing dedup.

Evidence: 49 СхемаЗапроса probes (SL_kza 2026-10-12, `test/fixtures/platform/c30-column-names.json`); the curated oracle 0043 (bare dotted → last segment, from the original fork) contradicted them and was corrected. [columnNames.c30](../../test/unit/columnNames.c30.test.ts): every probe through Designer → Apply → reopen, name → expression for UNION / temp tables / nested SELECTs, outer references, renames.

Corpus 0 diffs, C25 v3/totals unchanged.

Text-only difference left: the platform also qualifies a bare argument of `ПРЕДСТАВЛЕНИЕ`.

#### C31. BSL query template parameters

**Status:** CLOSED

BSL query templates (P1, silent change after the code's text substitution): a parameter used as a placeholder now survives Designer → Apply as written — a bare select-list parameter without `КАК` (`&ВыбираемыеКолонки`), `СГРУППИРОВАТЬ ПО &ПоляГруппировки`, the parentheses of `И (&Условие)` / `НЕ (&Условие)` in ГДЕ/ИМЕЮЩИЕ, and of such an operand inside an expression — `ВЫБОР КОГДА … И (&Условие) ТОГДА` in the select list, ГДЕ, ПО and УПОРЯДОЧИТЬ ПО, a boolean select column, a condition subquery inside ВЫБОР (before: a changed value, 0 → 1 rows, a changed row order; `expr_*` evidence); a temp table or nested SELECT filled by such a parameter is not a proven `*` source (C24). The generator takes the parser's `preserve`/`constructor` split as an explicit option (`GenerateOptions`, no QueryModel field); `constructor` (oracle/corpus) still prints what СхемаЗапроса prints. The mode belongs to one generator call: a call without the option is always `preserve`, nested generation (subqueries, the formatter's subquery reflow, UNION members, batch statements) inherits it; the temporary marker that protects `(&Условие)` during formatting is chosen absent from the input in any letter case and restored from lexer tokens, each exactly once, otherwise the condition stays as written.

Before the fix, after the substitution: 0 → 1 and 9 → 10 rows, 2 groups → 1, a syntax error (`… КАК Имя КАК ВыбираемыеКолонки`), a renamed column; now the original and the applied text return the same rows and columns for every case, and so do ordinary parameter values (execute_query, SL_kza 2026-10-12, `test/fixtures/platform/c31-template-params.json`). [templateParams.c31](../../test/unit/templateParams.c31.test.ts): the three forms through Designer → Apply → reopen (3 cycles), nested SELECT / UNION / temp tables, the grouping tab after an edit, ordinary parameters, the verified Designer texts; checks read the text with the shared lexer.

Corpus: constructor mode unchanged; the production-mode differences are only these three forms (84 queries).

Not covered by design: a placeholder written without parentheses (`ГДЕ А И &Условие`, `&Значение = Т.Код`) is printed as an ordinary parameter (operands of a comparison may swap) — the template's own precedence is the author's; Query Core does not analyse the BSL substitution.

#### C32. Safe / no-op Apply

**Status:** CLOSED

Safe Apply / No-op Apply: OK / Save without a change no longer rewrites the query.

Before, Classic and Canvas always wrote the regenerated text (`insertText` → `insertResult` replaced the literal; corpus: different from the input for 868 of 1976 queries), so an unchanged OK depended on every generator rule staying semantics-neutral. The host now keeps, per Designer panel and source query, the text Apply would write right after the first successful open (`ApplyBaseline`; the webview reports it once per `loadModel.loadId`, after a confirmed comment loss too); an Apply with exactly that text closes the panel without touching the document — no re-encoding (the decoded literal does not reproduce its `|` indentation), no clipboard fallback, also on a stale document.

Late, repeated, unknown or post-switch reports are ignored, so edits made before a Classic ↔ Canvas switch stay changes; without a source query (new query, result-processing code, no editor) or an accepted report Apply keeps its path.

Comparing the generated text, not the state: navigation changes `QueryState` for 1975 of 1976 corpus queries and never the text; the text also covers the Classic "Save comments" choice. QueryModel, parser, generator and `generationPolicy` unchanged. An unchanged OK therefore no longer reformats the query (accepted 2026-10-13). [Unit](../../test/unit/applyBaseline.c32.test.ts), [session](../../test/unit/designerSession.baseline.c32.test.ts), [webview E2E](../../test/e2e/noopApply.c32.spec.ts), [Extension Host](../../test/vscode-integration/noopApply.test.ts).

#### C33. Unaliased template marker source

**Status:** CLOSED

Unaliased `#Имя` template marker source (2026-10-18). In `preserve` (the Designer) the synthesized `КАК <name>` of a marker source is not printed when nothing in the query is qualified by that alias (`dropUnusedMarkerAliases` in the generator); the constructor-parity mode keeps 1C's `КАК`. The 5 of 85 corpus marker packages that were refused (`ИЗ #Таблица` with `*`, `КОЛИЧЕСТВО(*)`, `&Поля`, `СОЕДИНЕНИЕ #… ПО ИСТИНА`) are now applied; no other corpus output changed.

Platform (SL_kza 8.3.15.1489, [fixture](../../test/fixtures/platform/u1-template-markers.json) `afterC33`): every U1 template's new Designer text, substituted, is accepted with the original's columns. A marker whose alias qualifies a field (`ВЫБРАТЬ Код ИЗ #Таблица` → `Таблица.Код`) keeps it and Apply stays refused by U1 (left as is: printing such fields bare would need the opaque source through the parser, generator and field lists).

#### U1. Template markers

**Status:** CLOSED

`#Имя` template markers (2026-10-15). BSL replaces a marker with arbitrary text (a table, a nested query, a join, a condition, a field list), so the core does not interpret it.

Platform evidence ([fixture](../../test/fixtures/platform/u1-template-markers.json), SL_kza 8.3.15.1489): the Designer's synthesized `КАК` on an unaliased marker source broke substituted templates (`Field not found`, double `КАК`).

Fix: a general Apply rule — every marker must keep its neighbouring code tokens in the written text compared with the query as opened from the document (`findChangedTemplateMarker`; layout, comments and keyword case ignored; `#` in literals/comments is not a marker; the comparison uses the document text also after a Classic ↔ Canvas switch). Otherwise Apply is refused with the marker's name.

Corpus: exactly the 5 marker packages whose surroundings the Designer changes are refused, the other 80 apply. Editing those 5 is C33. [Regressions](../../test/unit/templateMarkers.u1.test.ts), [E2E](../../test/e2e/templateMarkers.u1.spec.ts).

#### U3. Comma-separated FROM roots

**Status:** CLOSED

Comma-separated FROM roots and join visibility (2026-10-17).

Platform evidence ([fixture](../../test/fixtures/platform/u3-comma-join-visibility.json), SL_kza 8.3.15.1489): a join condition sees only its own join chain — another comma root is `Field not found`, before or after the chain — and a bare name present in the chain and in another root binds to the chain. `computeJoinVisibility` gave every root all tables; it now splits top-level joins into one chain per comma root (a join continues the chain that already contains its seed) and resolves each by the existing chain rules.

Joins without chain positions (created in the UI) keep the previous all-visible fallback.

Bare-name qualification (analysis/constructor) now matches the platform (`Т3.Символ`); a name only in another root is no longer bound to it.

Corpus and Designer round trip unchanged (0 of 23,712 outputs, 0 of 1,976). [Regressions](../../test/unit/commaJoinVisibility.u3.test.ts), [chain rules](../../test/unit/joinVisibility.test.ts).

#### C36. Kept `*` versus the constructor canonical text

**Status:** ACCEPTED (2026-10-21)

The Designer keeps `*` over configuration tables where the 1C constructor's canonical text expands it — a deliberate divergence since the C24 step 1b decision (2026-10-18): metadata completeness (extensions, a stale dump) cannot be proven, so no automatic expansion; the explicit "Expand `*`" command exists. Owns the grammar-parity entries `select.star-star` / `select.star-source-star` (canonical text differs).

**Former next boundary:** A completeness/provenance signal for the metadata (extensions loaded, dump freshness) before any automatic expansion or exact metadata-based UNION width validation — or accept the divergence and unknown width permanently.

**Decision (2026-10-21):** the divergence is accepted permanently. Metadata
completeness (extensions, a stale dump) stays unprovable, so the Designer keeps `*`
as written and wildcard widths stay unknown; "Expand `*`" remains the explicit way
to get the constructor's columns. The grammar-parity gate accepts exactly the two
listed constructs, `select.star-star` and `select.star-source-star`
(`ACCEPTED_DIVERGENCES` in `grammarParity.catalog.test.ts`): any other canonical
difference fails even under C36, and every other gap still needs an open item. A provenance signal for the metadata (extensions loaded, dump
freshness) would be a new item, not a reopening of C36.

#### V2. External grammar oracle

**Status:** CLOSED (2026-10-21, superseded)

Optional external grammar oracle. 1C Platform / Query Designer is authoritative for platform acceptance and canonicalization; external grammars (tree-sitter-bsl, bsl-parser ANTLR, Lezer) are development-only differential signals, never a verdict, and no extension runtime, build, normal CI, package or release step depends on them. Not a prerequisite for Query Core v1; grammar parity gaps are correctness items (e.g. C2), not V2.

Without the uncommitted grammar WASM the [helper](../../test/helpers/assertValidSdbl.ts) is a no-op, and tests whose only assertion is the oracle report *skipped*.

The working differential is the pinned Stage 0 CLI probe ([differential.ts](audits/stage-0/probes/differential.ts)): 5 packages tree-sitter-only, 4 constructs, all platform-checked: 2 valid (RP08 → C3 closed, RP06 → C2), 2 over-accepted (RP09, RP10). `build-wasm.sh` is unpinned; its ABI compatibility with web-tree-sitter 0.22.6 is unverified.

**Former next boundary:** Opt-in pinned runner (grammar sha, CLI version, checksum) that reports disagreements when available and exits SKIP with an explicit reason when not; disagreements go to platform reprobe, never directly to code or canonical output.

**Decision (2026-10-21):** closed as superseded, not implemented. The live platform
oracle (`validate_query` on SL_kza, recorded in `test/fixtures/platform/*.json` and
the grammar-parity catalog) gives the verdicts V2 could only hint at, and it already
settled the four tree-sitter disagreements. The optional helper and the Stage 0
probe stay as they are. Reopen only if a pinned external grammar becomes useful for
a concrete question the platform oracle cannot answer.

#### C21 ORDER expression evidence

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
