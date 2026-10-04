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
- `coverageState`;
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
| `unreviewed` | Area not yet enumerated against the sources |
| `pending-platform-evidence` | Enumerated; at least one entry still needs a platform result |
| `covered` | Enumerated; every entry carries a platform verdict |
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
| G5 | all | Reference map: every section maps to known areas, every area is named by a section or records `referenceGap`. Coverage areas: unique ids, axis/state enums, `out-of-scope` needs `decisionRef`, `covered` needs platform verdicts for all its entries, every catalog entry names a known area. Catalog: unique, category-prefixed ids; enums; non-empty text and source/origin; traceable evidence with build (`unknown` allowed), method and date; status consistency; debt ids exist in the ledger; a valid-construct gap needs an open debt item; platform-invalid text that opens must be Apply-blocked |

No live 1C, external grammar or network access is involved.

## Current seed

RP01–RP25 from the Stage 0 live reprobe (2026-09-27): execution in the
configuration's query console plus wizard canonical text on a modern 8.3 web
client, build not recorded. They keep the status *platform-verified, build
unknown* and are not re-probed in bulk. Statuses for our side were measured on
the current code with and without the corpus metadata resolver, which agree.

| Result | Entries |
|---|---|
| Platform-valid, ours accepts, stable, Apply allowed | 12 |
| Platform-valid, ours rejects (syntax gap) | 2: English SDBL → C2 |
| Platform-invalid, ours rejects | 5 |
| Platform-invalid, ours accepts, Apply blocked (C5) | 5 (3 of them unstable on the second pass) |
| Platform unknown (U2), Apply blocked | 1 |

Canonical text is recorded and matches for 2 entries (RP01, RP20). RP02, RP19
and RP21 record the platform canonical only as prose and RP03 not at all; they
stay `not-recorded` (manual review found no known semantic discrepancy) and are
candidates for a text re-probe.

`source.template-marker` (U1) opens with a stable round trip and Apply allowed;
that behavior is retained pending platform evidence (see Scope).

The seed contains platform evidence only. It is not yet a catalog of the
grammar: walking the 1C reference and EDT model is Phase 3. Until then coverage
confidence is low by construction.
