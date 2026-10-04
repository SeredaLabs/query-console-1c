# SDBL grammar parity

Current contract for the Query Core v1 grammar gate. The
[proposal](audits/sdbl-grammar-parity-proposal-2026-10-04.md) records the
reasoning and phases; the [ledger](technical-debt.md) (V5) owns status.

## Gate

> **0 known platform-valid grammar gaps across the reviewed SDBL construct
> catalog, with every catalog entry carrying source/provenance and platform
> evidence where required.**

The gate is a Query Core v1 blocker (ledger V5, P1): Core v1 cannot be
declared until it holds with sufficient coverage confidence. It is not a claim
that the current product is unsafe; concrete known gaps are separate C items
(C2).

The claim is bounded: it never says the whole 1C grammar is proven, and it is
always reported with coverage confidence:
- catalog sources walked;
- entries attested by the platform, unattested, and pending.

A small catalog with zero gaps is a weak result, not parity.

| Authority | Role |
|---|---|
| 1C Platform / Query Designer | Authoritative for platform acceptance and canonicalization |
| External grammars (tree-sitter-bsl, bsl-parser ANTLR, Lezer) | Development-only differential signals (V2); never a verdict |
| Our parser / generator / QueryModel | The Query Core under test |

The catalog is built from sources independent of our parser:
- the 1C query-language reference;
- Query Designer output;
- the EDT query wizard model;
- platform evidence;
- real-world queries;
- external grammar rule names (own examples, no copied text).

A fuzzer driven by our own grammar measures round-trip only. It cannot find
syntax gaps.

## Scope

Core v1 is ordinary SDBL as opened by the 1C Query Designer.

| Decision | Rule |
|---|---|
| Platform version | Not tied to one 8.3.x build. Every new probe records the exact build. A construct confirmed on a supported modern 8.3, with no evidence that it is version-specific, is SDBL. Version differences are separate compatibility facts, never a reason to narrow the grammar. |
| DCS braces `{…}` | Out of scope for Core v1 grammar parity: a data-composition extension over the query model. A future DCS layer gets its own coverage contract. |
| Template markers `#Имя` (U1) | Syntax in scope: ours must not fail only because of `#Имя`. Syntax/preservation confirmed locally (open → stable round trip → Apply); substitution semantics UNKNOWN; nothing is interpreted or transformed; current Apply behavior retained pending platform evidence. U1 must answer whether Query Core editing/generation can change the value or scope of `#Имя`: if yes, a safety gate is required; if it stays opaque preserved syntax, no Apply block is needed. |
| Reference gaps | Absence from the 8.3.20 reference is not evidence of invalidity or exclusion. A construct is in scope if the ordinary 1C Query Designer accepts and preserves it as part of the query, whatever its origin; it is out of scope only if it exists solely in the DCS query layer, like `{…}`. Until probed, such areas stay pending with a concrete question. |
| English SDBL (C2) | In scope, P1. Core v1 does not ship with this known gap. It is implemented after or together with A1, not as more contextual-keyword special cases. |

Also out of scope:
- dynamic BSL text assembly;
- query execution;
- database values.

## Catalog

[`test/fixtures/grammar-parity/catalog.jsonl`](../../test/fixtures/grammar-parity/catalog.jsonl)
holds one JSON object per construct. External corpus texts never enter the
repository; only ids and hashes do.

| Field | Values / meaning |
|---|---|
| `constructId` | Stable dotted id, `<category>.<construct>` |
| `category` | Grammar area: `select`, `source`, `join`, `condition`, `expression`, `literal`, `parameter`, `group`, `order`, `totals`, `batch`, `virtual-table`, `language`, … |
| `area` | Coverage area id from the [inventory](#coverage-inventory) |
| `title` | One-line description of the construct or question |
| `text` | The query text whose behavior is recorded; for platform entries, exactly the probed text |
| `scope` | `in`, `out` (with the deciding rule) or `pending` |
| `source` | How the entry entered the catalog (e.g. `stage-0-platform-reprobe`, `1c-reference`, `edt-model`, `corpus`, `external-grammar`, `audit-probe`) |
| `origin` | Case ids behind the entry (probe, fixture, external corpus id) |
| `evidenceRef` | Repository path (and `#id`) of the platform result |
| `platformStatus` | `valid`, `invalid`, `unknown` (probed, inconclusive) or `unattested` (not probed) |
| `platformBuild` | Exact build, or `unknown` for evidence recorded without one |
| `platformMethod`, `platformDate` | How and when the platform result was obtained |
| `oursStatus` | `accepts` (opens without refusal) or `rejects` |
| `roundTripStatus` | `stable` (second pass reproduces the first), `unstable`, `not-applicable` (rejected) |
| `canonicalStatus` | `matches` / `differs` from the recorded platform canonical **query text** (`platformCanonical` in the evidence row), `not-recorded` (no text recorded; a prose description is not evidence of text equality), `not-applicable` |
| `applyStatus` | `allowed`, `blocked`, `not-applicable`. Separates parser over-acceptance (platform-invalid, opens, Apply blocked) from a safety-contract violation (platform-invalid, opens, Apply allowed) |
| `debtId` | Ledger item that owns a gap, unknown or related fix, else `null` |
| `note` | Qualifications of the evidence |

**Gap rule:**
- `platformStatus: valid` with `oursStatus: rejects` is a syntax gap and must
  reference an open C item.
- `platformStatus: valid` with `unstable`, `differs` or a blocked Apply is a
  round-trip gap.
- `platformStatus: invalid` with `oursStatus: accepts` and `applyStatus:
  blocked` is parser over-acceptance: tracked under C5, not a grammar gap.
- `platformStatus: invalid` with `oursStatus: accepts` and `applyStatus:
  allowed` violates the safety contract and is a correctness defect.

## Coverage inventory

[`coverage-areas.jsonl`](../../test/fixtures/grammar-parity/coverage-areas.jsonl)
lists the SDBL surface areas the catalog must cover. Area names come from
independent sources, not from our parser. Each area is one record:
- `areaId`, `axis`, `title`;
- `sources`: where each independent source names the area;
- `corpusPattern` and `corpusPackages`: a recorded discovery snapshot over the
  golden `input` texts (Python `re`, IGNORECASE, 2026-10-04). It is not
  recomputed in tests and is not a support claim;
- `coverageState`, `forms` (the area's contract: one entry per form, linked
  to the catalog `constructId` that attests it, or `null`) and `probeId`;
- `decisionRef`, `referenceGap` (why the 1C reference has no section for the
  area) and `note`.

Axes keep the catalog from collapsing into a flat query list:
- `package-union`;
- `modifier-ordering`;
- `syntax-construct`;
- `expression-form`;
- `contextual-keyword`;
- `virtual-table-shape`.

| Coverage state | Meaning |
|---|---|
| `unreviewed` | Area not yet enumerated against the sources (none left) |
| `pending-platform-evidence` | Forms enumerated; at least one has no platform verdict, and one executable probe in the queue covers exactly those forms |
| `covered` | Forms enumerated; every form is linked to a catalog entry with a platform verdict (known gaps keep their open debt item) |
| `out-of-scope` | Excluded by a recorded decision (`decisionRef`) |

**Phase 3 exit:**
- every in-scope area is `covered` or `pending-platform-evidence`;
- no area is `unreviewed`;
- every source below is reviewed or its gap is recorded.

New platform-valid gaps found during the review become C items. They are not
fixed in the same change.

### Sources

| Source | Pin / access (2026-10-04) | Role |
|---|---|---|
| 1C syntax assistant: query language (`shquery_ru.hbk`) and query tables in the context help (`shcntx_ru.hbk`) | Local platform install 8.3.20.1838 (`/opt/1cv8/8.3.20.1838`). Read from the help containers; only section titles, paths and parameter names are recorded | **Primary checklist** |
| 1C web documentation (its.1c.ru, v8.1c.ru, 1c-dn.com Developer Guide 8.3.27) | Not reachable or sign-in required from the dev environment | Not used; the local help is the same reference for 8.3.20 |
| 1c-dn.com query language overview | Public page, fetched | Weak, official: dereferencing, nested tables, auto-order, totals, virtual tables |
| EDT 2024.2 `ql.model` API | edt.1c.ru NXDOMAIN; secondary record in the [EDT audit](audits/query-core-edt-2026-10-01.md) | Model-level cross-check; class names only |
| bsl-parser ANTLR (`SDBLParser.g4`, `SDBLLexer.g4`) | 1c-syntax/bsl-parser `a89b827b` | Discovery: rule and token names only, never rules |
| tree-sitter-bsl `grammars/sdbl/grammar.js` | alkoleft/tree-sitter-bsl `5752667f` | Discovery: rule names only |
| Golden corpus | 1976 packages, one BSP configuration | Real-world presence; blind spots below |
| Platform evidence | Stage 0 RP01–RP25, C3/C4 observations | Verdicts (build unknown) |

### Reference section map

[`reference-sections.jsonl`](../../test/fixtures/grammar-parity/reference-sections.jsonl)
maps every section of the 8.3.20.1838 syntax assistant to coverage areas:
- all 195 nodes of the query-language tree;
- the 68 nodes of "Таблицы запросов" in the context help, one per table or
  virtual table.

Each section is recorded as `construct` (it names at least one area),
`container` (an overview node) or `out-of-scope` (with a note). Virtual tables
also carry their documented `parameters`.

G5 enforces both directions:
- every section maps to known areas;
- every area is named by a section or records a `referenceGap`.

Help text is not copied into the repository.

### Inventory baseline

70 areas. All are `unreviewed`, except `dcs.braces`, which is `out-of-scope`.
The seed touches 19 areas. The reference map has 263 sections: 238 construct,
24 container, 1 out of scope (executing queries from the built-in language).

| Axis | Areas | With seed entries | Zero golden packages |
|---|---|---|---|
| package-union | 7 | 1 | `package.for-update` |
| modifier-ordering | 5 | 2 | `order.autoorder` |
| syntax-construct | 24 | 5 | `select.empty-table`, `source.external-data-source`, `source.filter-criterion`, `group.grouping-sets`, `characteristics.block` |
| expression-form | 22 | 6 | `expression.math-functions`, `expression.grouped-by` |
| contextual-keyword | 3 | 2 | — (not pattern-countable) |
| virtual-table-shape | 9 | 3 | 7 of 8 named tables (only slices occur) |

**Findings:**
- **The 1C reference adds areas** that the first draft missed:
  - string, date and math function families (including `Лев`, `Прав`,
    `СтрНайти` and math functions);
  - ordering inside nested tables;
  - data source aliases;
  - change-registration tables (`.Изменения`);
  - filter criterion tables;
  - recalculation and base-data tables of calculation registers;
  - the cube dimension table of an external data source.
- **Virtual-table arity is documented.** For example, `Обороты` has 4
  parameters, `ОстаткиИОбороты` has 5 and `ОборотыДтКт` has 8. This agrees with
  RP04/RP05 (5th and 6th arguments platform-invalid). `Границы` lists no
  parameters, so U2 stays open from the reference side too.
- **Seven areas have no reference section** (`referenceGap`):
  - `package.drop`: only the bilingual keyword row;
  - `characteristics.block`;
  - `source.parameter-table`;
  - `source.template-marker`;
  - `keyword.as-identifier`;
  - `expression.scalar-subquery`;
  - `dcs.braces`.
- **`ХАРАКТЕРИСТИКИ` is absent from the query-language reference.** Its scope
  stays pending under the reference-gap rule (see Scope); the open question is
  whether the ordinary Query Designer accepts and preserves it.
- **Two other constructs are not in the 8.3.20 reference:**
  `ИНДЕКСИРОВАТЬ ПО НАБОРАМ` and `УНИКАЛЬНЫЙИДЕНТИФИКАТОР`. They are candidates
  for a version/platform probe. A version difference is a compatibility fact
  (decision 1), not a reason to narrow the grammar.
- **The golden corpus is blind to most virtual tables.** It has 0 packages with
  `Остатки`, `Обороты`, `ОстаткиИОбороты`, the accounting and calculation
  tables, `Границы` or `ЗадачиПоИсполнителю`. Its 100% acceptance says nothing
  about these areas.
- 8 golden packages contain DCS braces. They are out of scope for Core v1 and
  keep their current behavior.

## Coverage review

All 70 areas are reviewed. Each area's forms come from the 1C reference
sections, plus forms found through discovery sources: `УНИКАЛЬНО` in
`ИНДЕКСИРОВАТЬ ПО` (ANTLR) and `СГРУППИРОВАТЬ ВСЕ ПО ГРУППИРУЮЩИМ НАБОРАМ`
(reference text). That gives 246 forms.

A form is attested by one of two kinds of evidence:
- a Stage 0 platform verdict;
- a golden corpus package recorded as platform-valid by `validate_query`.

For golden evidence, the shortest example is used. It must have a recorded
`query_text` and contain no comments, template markers or DCS braces. The `*`
forms are the exception: their examples keep the `*`.

| Axis | Areas | Covered | Pending | Out of scope |
|---|---|---|---|---|
| package-union | 7 | 5 | 2 | — |
| modifier-ordering | 5 | 3 | 2 | — |
| syntax-construct | 24 | 9 | 14 | 1 |
| expression-form | 22 | 16 | 6 | — |
| contextual-keyword | 3 | 1 | 2 | — |
| virtual-table-shape | 9 | 1 | 8 | — |
| **Total** | **70** | **35** | **34** | **1** |

### Findings

- **`УНИЧТОЖИТЬ`** is covered by 14 platform-recorded golden packages. The
  1C reference lists it only in the bilingual keyword table.
- **C24.** The Designer round trip rewrites a wildcard projection
  (`ВЫБРАТЬ *` → `* КАК Поле1`, `Т.*` → `Т.* КАК Поле1`), and Apply allows the
  changed text. The platform canonical text expands the star. Whether the
  platform accepts the rewritten form is not yet attested (`PQ-C24`). The area
  stays covered, with an open debt item.
- **Example selection matters.** Golden `ИЗ`-source and `Источник.Таблица.*`
  hits inside DCS braces do not attest the ordinary form. The tabular `.*`
  form is therefore pending.
- **Virtual tables have the weakest evidence.** 8 of 9 areas are pending; only
  the task-by-performer table has a platform verdict.

### Probe queue

[`probe-queue.jsonl`](../../test/fixtures/grammar-parity/probe-queue.jsonl)
holds one executable probe per pending area (34 probes over 96 forms), plus
debt probes for open items found by the review (`PQ-C24`). Each
probe has a question, a query text and its metadata needs, and records the
platform build, acceptance and the Designer canonical text. Texts use the
corpus fixture object names; as in Stage 0, substitutions for the live base
are recorded per result.

| Area | Forms | Question |
|---|---|---|
| `package.index-by` | 2 | Are ИНДЕКСИРОВАТЬ ПО НАБОРАМ and ИНДЕКСИРОВАТЬ ПО <field> УНИКАЛЬНО accepted after ПОМЕСТИТЬ, and since which platform version? |
| `package.for-update` | 2 | Does the Query Designer accept and preserve ДЛЯ ИЗМЕНЕНИЯ both without and with a table list? |
| `order.autoorder` | 1 | Does the Query Designer preserve АВТОУПОРЯДОЧИВАНИЕ alone and after УПОРЯДОЧИТЬ ПО? |
| `order.nested-tables` | 1 | Is an ORDER key on a nested-table field accepted together with a top-level key, and how does the Designer canonicalize it? |
| `select.fields-aliases` | 1 | Is a field alias without КАК accepted, and does the Designer canonicalize it to КАК? |
| `select.tabular-section` | 1 | Is <source>.<tabular section>.* accepted in an ordinary select list (outside DCS braces), and how is it canonicalized? |
| `select.empty-table` | 1 | Is ПУСТАЯТАБЛИЦА.() with an empty column list accepted, and is it canonicalized as ПУСТАЯТАБЛИЦА.( КАК Поле1)? |
| `source.metadata-table` | 10 | Do the ten unattested object-table kinds open as sources with the expected canonical alias? |
| `source.external-data-source` | 3 | Which external data source names are accepted as sources (table, cube, cube dimension table), and how are they canonicalized? |
| `source.aliases` | 1 | Is a source alias without КАК accepted, and does the Designer canonicalize it to КАК? |
| `source.change-tables` | 12 | Do change-registration tables of the twelve unattested object kinds open as sources? |
| `source.filter-criterion` | 1 | Is a filter criterion accepted as a source with its value parameter, and how is it canonicalized? |
| `join.kinds` | 4 | Does the Designer canonicalize bare СОЕДИНЕНИЕ and the ВНЕШНЕЕ spellings to the short join kinds? |
| `join.structure` | 1 | Is the nested ON-placement join form accepted, and how does the Designer canonicalize it? |
| `group.by` | 1 | Is an expression key in СГРУППИРОВАТЬ ПО accepted and preserved by the Designer? |
| `group.grouping-sets` | 2 | Are СГРУППИРОВАТЬ ПО ГРУППИРУЮЩИМ НАБОРАМ and its ВСЕ variant accepted on 8.3.20, and how are they canonicalized? |
| `totals.clause` | 1 | Is ПЕРИОДАМИ accepted for each period unit with and without bounds, and how is it canonicalized? |
| `characteristics.block` | 1 | Does the ordinary Query Designer accept and preserve a ХАРАКТЕРИСТИКИ block (with and without DCS braces), or is it DCS-only? |
| `expression.string-functions` | 10 | Are the ten unattested string functions accepted on 8.3.20 and canonicalized unchanged? |
| `expression.date-functions` | 6 | Are the six unattested date functions accepted and canonicalized unchanged? |
| `expression.math-functions` | 12 | Are the twelve math functions accepted on 8.3.20 and canonicalized unchanged? |
| `expression.value-functions` | 2 | Are АВТОНОМЕРЗАПИСИ() and УНИКАЛЬНЫЙИДЕНТИФИКАТОР(<ref>) valid SDBL, in which contexts, and since which platform version? |
| `expression.grouped-by` | 1 | Is СГРУППИРОВАНОПО(<field>) accepted with grouping sets, and how is it canonicalized? |
| `expression.scalar-subquery` | 1 | Is a scalar subquery accepted as a comparison operand in ГДЕ? |
| `keyword.spelling` | 1 | Does the Query Designer accept lower- and mixed-case keywords and canonicalize them to upper case? |
| `language.english` | 1 | Does the platform accept every English keyword of the bilingual table, and does the Designer emit the Russian canonical text? |
| `virtual-table.balance` | 2 | Is Остатки accepted for accumulation and accounting registers with their documented parameters (2 and 4), and how is it canonicalized? |
| `virtual-table.turnovers` | 2 | Is Обороты accepted for accumulation (4 parameters) and accounting (8 parameters) registers, and how is it canonicalized? |
| `virtual-table.balance-and-turnovers` | 2 | Is ОстаткиИОбороты accepted for accumulation (5 parameters) and accounting (7 parameters) registers, and how is it canonicalized? |
| `virtual-table.slices` | 1 | Is СрезПервых accepted with (Период, Условие) and canonicalized unchanged? |
| `virtual-table.accounting` | 3 | Are Субконто, ДвиженияССубконто and ОборотыДтКт accepted with their documented parameters, and how are they canonicalized? |
| `virtual-table.calculation` | 4 | Are the calculation-register tables (recalculation, ФактическийПериодДействия, ДанныеГрафика, БазовыеДанные) accepted with their documented parameters? |
| `virtual-table.sequence-boundaries` | 1 | Which argument layout does Последовательность.<name>.Границы accept, and how is it canonicalized (U2)? |
| `virtual-table.argument-shape` | 1 | Which periodicity values does the Периодичность argument accept, and are they canonicalized unchanged? |

## Executable gates

[`grammarParity.catalog.test.ts`](../../test/unit/grammarParity.catalog.test.ts)
runs in the normal unit suite. Our side is measured on every run with the same
steps as the product, without and with the corpus metadata resolver:
- the Designer open gate;
- generation;
- a second pass;
- the Apply gate.

Recorded and measured status must match exactly, so a regression and an
improvement both fail until the entry is updated with evidence. The failure
message names which: `catalog evidence is stale` (support improved for a valid
construct, for example after a C2 fix; update the entry and its debt item) or
`Query Core regression` (a valid construct lost support, or a non-valid one
became more permissive).

| Gate | Entries | Rule |
|---|---|---|
| G2 | `platformStatus: valid` | Recorded status holds; an in-scope entry without an open debt item opens, has a stable second pass and Apply allowed; `canonicalStatus: matches` reproduces the recorded canonical text |
| G3 | `platformStatus: invalid` | Recorded status holds; rejected on open or Apply blocked. Parser over-acceptance alone is not a failure |
| — | `unknown`, `unattested` | No verdict; recorded status holds. `unknown` needs an open U item |
| G5 | all | Review: no `unreviewed` area; every reviewed area lists unique forms linked to catalog entries of the same area; `covered` has a verdict for every form; each pending area has exactly one probe covering exactly its unattested forms. Reference map: every section maps to known areas, every area is named by a section or records `referenceGap`. Coverage areas: unique ids, axis/state enums, `out-of-scope` needs `decisionRef`, `covered` needs platform verdicts for all its entries, every catalog entry names a known area. Catalog: unique, category-prefixed ids; enums; non-empty text and source/origin; traceable evidence with build (`unknown` allowed), method and date; status consistency; debt ids exist in the ledger; a valid-construct gap needs an open debt item; platform-invalid text that opens must be Apply-blocked |

No live 1C, external grammar or network access is involved.

## Catalog contents

153 entries:
- 25 from the Stage 0 live reprobe;
- 128 from the golden corpus, one per golden-attested form.

Statuses for our side are measured on the current code with and without the
corpus metadata resolver, and the two modes agree.

**Stage 0 entries** (RP01–RP25, 2026-09-27): execution in the configuration's
query console, plus the wizard canonical text, on a modern 8.3 web client.
- They keep the status *platform-verified, build unknown* and are not
  re-probed in bulk.
- Canonical text matches for RP01 and RP20.
- RP02, RP19 and RP21 record the canonical only as prose, and RP03 not at all.
  These stay `not-recorded` for a later text re-probe.

| Stage 0 result | Entries |
|---|---|
| Platform-valid, ours accepts, stable, Apply allowed | 12 |
| Platform-valid, ours rejects (syntax gap) | 2: English SDBL → C2 |
| Platform-invalid, ours rejects | 5 |
| Platform-invalid, ours accepts, Apply blocked (C5) | 5 (3 of them unstable on the second pass) |
| Platform unknown (U2), Apply blocked | 1 |

**Golden entries** are platform-valid (`validate_query` at harvest; build and
date not recorded).
- All 128 open with a stable second pass and Apply allowed.
- The canonical `query_text` matches for 122.
- It differs for 2: the `*` forms, C24.
- It is not compared for 4, whose only examples carry comments, templates or
  no recorded text.

`source.template-marker` (U1) opens with a stable round trip and Apply allowed;
that behavior is retained pending platform evidence (see Scope).
