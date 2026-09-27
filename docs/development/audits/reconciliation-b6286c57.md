# Documentation and debt reconciliation — b6286c57

Investigation date: 2026-09-27. Correctness baseline:
`b6286c57cfa64ff8cb9f937347c376d4b98d55c8`. Checkout:
`23188a414984a599dc12a037bd54fec2a2973504` (only changelog/package version differs).
The working tree was clean before this documentation-only task. No production
edits, new regression tests, fixture updates or implementation stages; the
documentation was committed as `8dd270c`.

This is a fixed evidence record. The [technical-debt ledger](../technical-debt.md)
is the sole current status authority; [roadmap](../roadmap.md) owns ordering and
[known issues](../known-issues.md) owns product limitations. Historical
[Stage 0](stage-0.md) retains its original findings and severity labels.

## Executive result and counting rules

- **7 repaired historical defects:** RP01–RP03, RP08, RP13, RP14 (six RP rows),
  plus Boolean grouping/RP13a (not one of the 25 original RP cases).
- RP01–RP25 disposition: **13 CLOSED** (six repaired + seven no-gap/control
  dispositions), **3 OPEN**, **7 ABSORBED** into invalid-input hardening,
  **2 UNKNOWN**. ABSORBED does not mean fixed.
- **18 active ledger tasks:** 14 OPEN + 4 PARTIAL; separately **3 UNKNOWN**
  evidence tasks. These include architecture/verification work, not 18 proven
  semantic defects. Accepted coupling and permanent product boundaries are
  excluded from the count. A1/C2/C6 are distinct architecture, language-support
  and cosmetic outcomes; they are not three copies of the RP13 bug.
- **9 factually stale claim groups** are identified below (D01–D09).
  Markdown is corrected; source comments remain untouched and tracked by D1.
  Historical assertions, missing status and duplication are counted separately.

Stage names match the accepted work list: Boolean grouping (also referred to as
RP13a) is Stage 1B.3 in `booleanGroupingSemantics.test.ts`, and RP14 is Stage 1B.4
in `emptyTableColumns.test.ts`. Identity is still based on behavior/tests, not
numbering.

## RP01–RP25 reconciliation

Old source for every RP row: Stage 0 G/H/J/M and
[recorded platform results](stage-0/platform-reprobe-results.jsonl).
Current outputs for both no-resolver and corpus-resolver modes are retained in
[local probe results](reconciliation-b6286c57.jsonl). Platform verdicts were not
rerun live; local parse/generate results cannot upgrade platform UNKNOWNs.

| RP | Stage 0 verdict | Current status | Evidence at baseline | Still debt? | Action |
|---|---|---|---|---|---|
| RP01 | Valid; P0-Critical double qualification | CLOSED | `fullNameQualification.test.ts`: top-level canonical and second pass; `interpretCondition` strips owner prefix | No | Retain regression |
| RP02 | Valid; P0-Critical subquery qualification | CLOSED | Same suite: subquery canonical preserved in both modes | No | Retain regression |
| RP03 | Valid; canonical fixture corrupted on reopening | CLOSED | Same suite: fixtures 0163/0164 both first and second passes | No | Retain fixture expectations |
| RP04 | Platform-invalid fifth Обороты argument; P3 | ABSORBED | `parseVirtualParams` drops tail, no unsafe marker; local Apply approximation accepts output | Yes, C5 | Invalid-input safety, not grammar support |
| RP05 | Platform-invalid sixth ОстаткиИОбороты argument; P3 | ABSORBED | Same missing marker/truncation, both modes | Yes, C5 | Same task as RP04 |
| RP06 | Valid English; rejected; historical P0 | OPEN | Both modes fail at SELECT; Russian lexer/parser entry point | Yes, C2/P1 | A1 spike → English support |
| RP07 | Valid English including Catalog; rejected | OPEN | Same entry-point failure; metadata normalization also missing | Yes, C2/P1 | Same language task |
| RP08 | Valid ИЕРАРХИЯ УБЫВ; rejected | CLOSED | `parseOrderModifiers` and generator order; `orderHierarchyDirection.test.ts` covers asc/desc and invalid reversed order | No | Retain regression |
| RP09 | Two ИТОГИ platform-invalid; ours correctly rejects | CLOSED | Current parse rejects second ИТОГИ | No | Do not implement competitor over-acceptance |
| RP10 | Bare keyword alias platform-invalid | CLOSED | Current parse rejects extra Ссылка token | No | Keep rejection |
| RP11 | Alias В platform-invalid; ours over-accepts | ABSORBED | Parse succeeds, malformed static blocker; text unstable | Yes, C5 | Negative-input consistency |
| RP12 | Alias И platform-invalid; ours over-accepts | ABSORBED | Same class; malformed static blocker | Yes, C5 | Same task |
| RP13 | Valid keyword parameter; mangled, Apply blocked | CLOSED | `blocksKeywordStart`; 11 names × 14 contexts × two modes in `keywordNamedParameters.test.ts` | No | Preserve parameter identity |
| RP14 | Valid ПУСТАЯТАБЛИЦА columns mangled/blocked | CLOSED | Qualifier exclusion, shared `parseEmptyTableColumns`, canonical generator; valid/invalid Apply tests | No | Retain regression |
| RP15 | Scalar SELECT subquery platform-invalid | ABSORBED | First parse accepts; generated text fails reparse/final validation, Apply blocked | Yes, C5 | No valid-grammar gap |
| RP16 | Parenthesized nested join platform-invalid | CLOSED | Current parser still rejects | No | Keep rejection |
| RP17 | INDEX BY without INTO platform-invalid | ABSORBED | Clause omitted; generated text accepted | Yes, C5 | Define invalid-input preservation/rejection |
| RP18 | NOT arithmetic parentheses; equal recorded row counts | CLOSED | Current two-pass output stable; old data comparison supports, does not prove, equivalence | No proven defect | Do not conflate with RP13a |
| RP19 | Fixture 0150 matched platform GROUP BY canonical | CLOSED | Existing oracle suite and local stable round-trip retain parameter omission | No | Keep canonical contract |
| RP20 | Platform keeps hierarchy; ours differs without resolver | OPEN | No resolver drops ИЕРАРХИЯ; corpus resolver keeps it | Yes, C3/P2 | Hardening; review fixture 0078, do not refresh blindly |
| RP21 | Fixture 0127 matched platform TOTALS alias canonical | CLOSED | Existing oracle suite/local stable output retain Валюта2 | No | Keep canonical contract |
| RP22 | # source syntax-valid but metadata-unresolved | UNKNOWN | Locally accepted; no new validator/substitution provenance | U1 | Obtain provenance, not another parser vote |
| RP23 | Quoted date platform-invalid; ours accepts | ABSORBED | Still accepted and Apply approximation permits it | Yes, C5 | Negative-input contract |
| RP24 | Sequence metadata absent; real layout unknown | UNKNOWN | Generic layout; unsafe marker present, Apply blocked | U2 | Sequence-enabled platform evidence |
| RP25 | Valid task VT control, unchanged round-trip | CLOSED | Stable both modes through generic layout | No | Keep control |

## Closure evidence and remaining historical observations

Paths below are relative to the repository; tests listed here were executed as
part of the unmodified full unit suite.

| Finding | Production implementation | Regression evidence / disposition |
|---|---|---|
| Full-name binding | `src/core/query/sdblParser.ts`: `stripOwnerFullName`, `interpretCondition`, section owner binding | [fullNameQualification](../../../test/unit/fullNameQualification.test.ts), 34 tests, both resolver modes, grouping/order/totals and subquery controls |
| Hierarchy direction | `sdblParser.parseOrderModifiers`; `sdblGenerator.renderOrder` | [orderHierarchyDirection](../../../test/unit/orderHierarchyDirection.test.ts), 32 tests; does not close RP20 |
| Keyword parameters | `sdblGenerator.blocksKeywordStart`, Boolean/CASE/JOIN raw scanner boundaries; lexer already has atomic param token | [keywordNamedParameters](../../../test/unit/keywordNamedParameters.test.ts), 314 tests |
| Boolean grouping/RP13a | `exprFormatter.stripRedundantLeafParens`, Boolean `Parser` group handling/rendering | [booleanGroupingSemantics](../../../test/unit/booleanGroupingSemantics.test.ts), 454 tests; four atom variants per shape, truth tables for both passes; two JOIN layout exceptions remain C6 |
| Empty-table columns | `qualifyBareFields.qualifyExpression`; `expressionSyntaxCheck.parseEmptyTableColumns`; `semanticValidator.findMalformedCustomExpressions`; `sdblGenerator.formatSelectExpression` | [emptyTableColumns](../../../test/unit/emptyTableColumns.test.ts), 42 tests; select-only exception, canonical empty lists, invalid names/expressions remain blocked |
| C06/C13 | Parser retains raw field swallowing FROM; snapshot recovery runs only after throw | OPEN/S2: replay has zero aliases/sources, `complete`, no hover/completion, malformed warning |
| C18/C19 | Repair changes SELECT only; failure outside it remains | OPEN/S2: `unavailable`; adding a valid first statement still gives empty package model |
| C21 / C12 | `collectSymbols.collectFromModel` and `resolveAliasAt.descend` recurse through `table.subquery` only; condition subquery model alone is insufficient | OPEN/S1: valid C21 yields only outer symbol, no inner completion, no diagnostics |
| C11 | Incomplete condition subquery becomes opaque | ABSORBED/S2, scope part depends on S1 |
| C00–05, C07–10, C14–17, C20, C23–24 | Existing tolerant/position-aware behavior | CLOSED as debt candidates: existing recovery probes retain assistance; not claims of full grammar validity |
| C22 | Hover on a source-subquery output alias has no concrete metadata table | Intentional fail-open boundary; no new ticket |
| Empty snapshot maps / unreachable partial | Builder returns complete/recovered/unavailable; symbols populated once; resolver consumes symbols and computes scopes on demand | PARTIAL/S3, no mandate to build unused indices |
| Opaque coverage / incomplete field validation | Custom storage intentional; metadata validation only checks supported structured paths | ABSORBED/A1/V3 for shared interpretation/verification, not a demand to structure all 6341 historical opaque spans |
| Stage 0 detector candidates/competitor grammar gaps | Detector had canonical false positives; grammar acceptance not platform truth | CLOSED as defect claims without evidence; no severity inherited |
| Stage 0 corpus/oracle issues | Positive-only golden; optional absent WASM | PARTIAL/V1, OPEN/V2; new negative unit examples do not close corpus gap |
| Old flat alias resolver / raw-node Apply omissions | Production uses positional resolver; malformed-expression traversal now includes trailing/group/order/index/tabular/builder slots | CLOSED; existing hover/resolver/Apply/semantic-validator tests. Frozen flat resolver is intentional tooling, not production debt |

## Expression architecture and English dependency

| Subsystem | Independently interpreted knowledge | Existing reuse / consequence |
|---|---|---|
| `sdblLexer` / `sdblKeywordSets` | Token boundaries, parameter identity, a subset of RU structural keywords; shared literal/period sets | Useful base already exists. Canonicalization must retain `.text`, offsets and contextual identifiers |
| `sdblParser` | Section word sets, `collectConditionTokens`, operator/condition splitting, raw slices, metadata-kind/VT dispatch | Reuses lexer but does not deliver a shared expression representation |
| `sdblGenerator` | Character scanners split AND/OR/BETWEEN/CASE, recognize subqueries and keyword starts; normalize raw fields | RP13 required a separate `&` boundary fix despite lexer already recognizing parameters |
| `exprFormatter` | Token-based Boolean tree, `ArithReprinter`, precedence and redundant parentheses; additional raw scans | Internal printing trees are not QueryModel expression AST; grouping fix had to preserve precedence here |
| `qualifyBareFields` | `STRUCTURAL`, primitive/type prefixes, name/function/type roles and reparsed subquery text | Tokenizes again; RP14 needed an explicit column-name exception |
| `expressionSyntaxCheck` | Separate structural recursive acceptor, RU/EN word pairs, special empty-table parser | Ignores precedence by design; accepts some English expressions but not complete English queries |
| `semanticValidator` | Walks raw slots, reuses syntax acceptor and empty-table parser; field lookup skips opaque text/subquery conditions | Traversal/semantic scope also matters; this is not a second full parser |
| Apply | Static markers + malformed traversal, then generated text parsed and semantically checked | Reuses validation. It owns no equivalence checker and is not another independent lexer |

The duplication is semantic knowledge (word roles, protected parameters, grouping,
CASE/BETWEEN boundaries), not a regex count. Proposed A1 is a **spike**, compatible
with ADR 0001/0004 if it extends the existing hand-written core and preserves
canonical output/opaque spelling/source maps. Prefer token spans for opaque slots;
an eventual AST needs evidence and an explicit decision. Runtime Tree-sitter or a
separate recovery grammar would conflict with the accepted ADRs.

English blockers: `SELECT` is an identifier while parser expects RU keyword;
contextual `ВОЗР`, `ВНЕШНЕЕ`, Boolean words and VT slices are matched separately;
generator/formatter raw scans recognize Russian spellings; qualifier type prefixes
and primitive types are RU-specific with only partial EN operator exceptions.
`buildModelResolver`/YAML resolver index actual RU full names; metadata parsers
create standard fields such as `Ссылка`/`Код`, with no end-to-end `Catalog`/standard
attribute alias map. `queryAtCursor.QUERY_KEYWORDS` is RU-only. Apply reparses through
the same unsupported path. Merely extending lexer KEYWORDS cannot solve this.
Therefore **A1 spike → English implementation** is justified; it does not require
finishing every expression migration before any English work can begin.

Type inference currently resolves only a complete single field in
`expressionContext.analyzeExpression`; `FUNCTION_CATALOG` has no return types.
The old separate-walker plan would add yet another expression grammar. Its product
goal remains PARTIAL/A3, but its implementation step is STALE and absorbed into A1.

## Resolver, temporary-table and Apply evidence

`09-rb-oboroty`: existing fixture tests run **without** a resolver and pass. The
corpus metadata contains no `РегистрБухгалтерии.Хозрасчетный`. With that resolver,
`applyAccountingMeta` uses `(base?.subcontoCount ?? 0)` and false correspondence,
clears positional keys, and deletes `accountingArgs`. First pass loses
`Организация = &Орг` and `СубконтоДт1 = &Суб`; an initially inferred correspondence
flag survives until the second parse, so pass two removes another empty slot.
An empty resolver reproduces it; a synthetic base with `subcontoCount: 3` and
`correspondence: true` preserves all three passes. It is **not merely whitespace
canonicalization**. Argument loss is confirmed; valid-input/platform result-set
semantics remain unverified. Do not label a generated fixture a live oracle.

The three temp-table implementations are still reachable: parser registry used
mid-parse/star expansion; designer lifetimes used for Classic/Canvas pickers and
continuity; semantic lifetimes/schema used by validation/hover/completion. In the
probe `Т.Ссылка, Т.Товары.(Номенклатура), Т.Код ПОМЕСТИТЬ ВТ`, a subsequent `В.*`
expands only `Ссылка`; semantic schema contains `Ссылка, Товары, Код`. Corpus
resolver cannot resolve this synthetic source, so its metadata validation failure
is expected and is not proof of platform-invalid projection. A2 remains OPEN;
the correct platform projection schema remains an oracle prerequisite.

Apply static checks inspect the model being written; generated text then passes
`validateBatchText` (parse + selected semantic checks). Unsafe markers are not
universal, custom metadata validation is incomplete, VT expression arguments are
not all walked by `findMalformedCustomExpressions`, and template markers are
intentionally unjudgeable. Nothing compares original and generated expression
meaning. V3 is a bounded verification task; syntax success must not be advertised
as equivalence. RP13a is closed by production fix plus truth-table tests, not by
an improved Apply theorem prover.

## Forgotten-debt triage

Search covered production, tests, tooling and Markdown for the requested debt,
raw/unsafe/recovery and compatibility terms (including text-mode search of the
NUL-containing semantic validator). A fallback was not counted merely for existing.

| Candidate | Reachable / production? | Intent and observable downside | Disposition |
|---|---|---|---|
| `extractQueryParamNames` versus lexer parameter collection | Yes: boilerplate and Query Text analysis; hover/completion use lexer | Regex matches quoted/comment `&name`, case variants differ; `ВЫБРАТЬ "&Ложный" … &Реальный … // &Комментарий` gives three names vs one | C7 OPEN; lexical consistency part depends on A1 |
| Bare `&` / lexically incomplete parameter scan | Yes: parameter completion branch calls strict lexer on the entire text, hover also calls it outside its metadata catch | Scratch replay throws on `ВЫБРАТЬ &Дата КАК Дата, &` and an unclosed quote; provider failure path is inferred from call sites, not run in Extension Host | ABSORBED/S2; preserve already-recognized parameters during recovery |
| Two exempt JOIN shapes in Boolean regression | Yes, generator | Added parentheses on pass two; truth tables pass both outputs | C6 OPEN/P3, no semantic defect inferred |
| Disconnected-source JOIN visibility | Yes: qualifier and IDE resolver | Deliberate all-visible fallback, explicitly tested; actual platform scope unverified | U3 UNKNOWN |
| Bare correlated condition binding | Yes: parser/generator; documented known issue | Wrong inner ownership possible; validator skips conditions | C4 OPEN, not closed by select-list correlation tests |
| Canvas parity/browser gate | Yes, opt-in preview | Unit reuse tests exist; browser suite targets Classic harness; formal preview exit evidence absent | V4 OPEN; Phase 13 feature work is roadmap scope, not a newly discovered bug |
| Import cycle/hooks/module-scoped synchronous resolver | Yes | Accepted and guarded (`unionModel.test.ts`); refactor hazard, synchronous stack restored in finally | Accepted A1 constraint, no separate refactor |
| YAML/LKG, empty scan, cache ownership/rollback | Yes | Intentional safety behavior with loader/generation tests; unknown differs from invalid | STILL CORRECT; preserve ADR 0003 |
| Unknown field/reference types, opaque/custom nodes, generic supported VT fallback | Yes | Intentional fail-open and partial representation; no new downside proved beyond named items | Preserve; do not create blanket cleanup debt |
| Database-backed subconto values/base-register dimensions, dynamic BSL | Product boundaries | Metadata lacks data rows/linkage; no full BSL data flow promised | Not debt by default; keep known scope |
| `it.todo` mechanism / legacy flat resolver | Test/tooling only | No todo fixtures skipped in current run; flat resolver is frozen shadow oracle | No production debt |

## Documentation drift register

D01–D09 are the nine factually stale groups counted above. Source/test paths are
recorded here without modifying them, as required by task scope.

| ID / file | Old claim | Why stale / what changed | Classification / action |
|---|---|---|---|
| D01 `roadmap.md` | Add independent expression token walker; merge grammar later | Repeats demonstrated keyword/precedence knowledge duplication | FACTUALLY STALE plan: shared-contract dependency replaces that step; A3 PARTIAL |
| D02 `query-model.md` | Records unsafeExtraArgs wherever positional data cannot be preserved | RP04/05 and C1 demonstrate unmarked losses | FACTUALLY STALE: documented actual marker coverage and exceptions |
| D03 `src/core/semantic/collectSymbols.ts` header | Symbols deliberately not wired into SemanticIndex | Builder materializes symbols; resolver consumes them | FACTUALLY STALE; D1 follow-up, source untouched |
| D04 `src/core/semantic/semanticSnapshot.ts` factory comment | Index populated in future phases; nonempty source maps only for complete | Factory stays empty intentionally, but real builder populates symbols and recovered maps now | FACTUALLY STALE phase/position guidance; architecture clarifies; D1 |
| D05 `src/core/query/validateBatch.ts` header | Opening/Apply correct iff parser does not throw | `tryOpenBatch`/`validateBatchText` invoke semantic validation too | FACTUALLY STALE; query-model boundary corrected; D1 |
| D06 `src/core/query/resultProcessingTemplate.ts` contract comment | Level 0 parameters not started; helper used only for boilerplate | Query hover/completion are shipped, and queryAnalysisService also calls helper | FACTUALLY STALE; D1; Levels 1/2 remain intentional scope boundaries |
| D07 `src/webview/applyGate.ts`, `queryModel.ts`, `semanticValidator.ts` marker comments | Unsafe marker described as generic positions 3+ only | Calculation-register arity 1/4 overflow also marked; turnover overflow still unmarked | FACTUALLY STALE narrow scope; query-model corrected; D1 |
| D08 `src/core/query/semanticValidator.ts` malformed traversal comment | Same raw slot set as classification walker | Traversal now includes extra slots; historical Stage 0 already measured coverage differences | FACTUALLY STALE description; D1 |
| D09 `src/extension/queryHoverProvider.ts` parameter comment | Lexer parameter scan never throws | `collectQueryParameterOccurrences` directly calls tokenizer, which throws on a bare `&` or unclosed string; parameter provider branches do not catch this | FACTUALLY STALE; S2 recovery gap and D1 comment follow-up |
| `audits/stage-0.md` | Stage 1 not started, P0 findings open, earlier corpus/probe counts | True for original baseline; subsequent fixes are separate evidence | HISTORICAL — KEEP: add status banner only |
| `known-issues.md` / roadmap temp-model sections | Full duplicated engineering backlog | Still real debt, but two status owners | DUPLICATED: consolidated A2, roadmap keeps ordering, known issues keeps impact |
| `known-issues.md` | No consolidated English/recovery/C21/accounting/Apply-equivalence status | Current limitations absent rather than falsely closed | MISSING CURRENT STATUS: add concise boundaries |
| `architecture.md` | No current snapshot-field/expression-boundary summary | Types alone invite overinterpretation | MISSING CURRENT STATUS: add actual producers/consumers and ADR compatibility |
| `corpus-testing.md` | Positive golden/optional oracle described without full provenance and negative/English boundary | Tests are still correct; description could imply stronger evidence | MISSING CURRENT STATUS: distinguish recorded/live and generator-derived evidence |
| `test/fixtures/oracle/0078-…json`, `oracleGolden.test.ts` | Expected hierarchy omission; curated fixture suite | Fixture conflicts with recorded live case in no-resolver mode; no build-attested universal result | Preserve baseline; C3/V1 review, not blind refresh |
| `booleanGroupingSemantics.test.ts`, `emptyTableColumns.test.ts` | Stage 1B.3 / 1B.4 labels | Match the accepted stage numbering (1B.3 = Boolean grouping/RP13a, 1B.4 = RP14) | STILL CORRECT; mapping recorded above |
| `sdblParser.fixtures.test.ts` | Fixtures are generator-produced canonical texts | No-resolver equality passes; does not establish resolver-mode or platform correctness | STILL CORRECT with evidence limit now explicit |
| `decisions/0001–0004`, metadata fallback, runtime-parser boundary | Pure query core, message contract, XML→YAML→LKG, platform-canonical contract | Matches current code; private-corpus history is not a new run | STILL CORRECT; no ADR decision revised |

## Verification and reproduction

Executed before documentation edits:

```sh
npm run docs:check
npm run typecheck
npm run test:unit
npx --no-install tsx docs/development/audits/stage-0/probes/recoveryProbes.ts "$PWD" > /tmp/query-debt-recovery.json
npx --no-install tsx docs/development/audits/stage-0/probes/vtOverflow.ts "$PWD" > /tmp/query-debt-overflow.jsonl
npx --no-install tsx docs/development/audits/stage-0/probes/applyGate.ts "$PWD" > /tmp/query-debt-apply.jsonl
npx --no-install tsx /tmp/query-debt-probe.ts > /tmp/query-debt-current.json
npx --no-install tsx /tmp/query-debt-accounting.ts > /tmp/query-debt-accounting.jsonl
```

The last two commands ran scratch scripts that are not kept in the repository.
Their procedure is described at the end of this section and their outputs are
recorded in [reconciliation-b6286c57.jsonl](reconciliation-b6286c57.jsonl); the
resolver-dependent fixture can be reproduced with the portable snippet below.

Typecheck: all three projects passed. Unit: **131 files, 3162 tests passed**,
including 1976-entry corpus regression, classification, semantic-validator corpus
and shadow baseline. Tree-sitter emitted its missing-WASM warning; no independent
grammar execution is claimed. Docs baseline: 57 Markdown files / 48 reachable doc
pages. Scratch scripts only read fixtures and call existing production functions;
they are not new repository tests. Their outputs are the linked JSONL evidence.
The Apply probe approximates UI batch assembly; existing Apply tests cover the
real gate. Recovery probe field `repairApplied` means the separately invoked
repair returned text, not that the snapshot used it; `completeness` reports that.

Portable reproduction of the resolver-dependent fixture (from repository root):

```sh
npx --no-install tsx -e '
const fs = require("fs");
const {parseBatch} = require("./src/core/query/sdblParser");
const {generateBatch} = require("./src/core/query/sdblGenerator");
const {buildYamlResolver} = require("./src/core/metadata/buildYamlResolver");
const q = fs.readFileSync("test/fixtures/queries/09-rb-oboroty.sdbl", "utf8");
const resolver = buildYamlResolver("test/fixtures/corpus/metadata/cf");
for (const r of [undefined, resolver]) {
  const once = generateBatch(parseBatch(q, r));
  const twice = generateBatch(parseBatch(once, r));
  console.log({resolver: !!r, stable: once === twice, once, twice});
}'
```

For each RP, the scratch probe reads `reprobeOracleRecord.исходныйТекстЗапроса`
from `stage-0/platform-reprobe.jsonl`, calls `parseBatch`/`generateBatch` twice in
both modes above, and checks unsafe/malformed markers plus `validateBatchText`.
A second-pass exception is recorded separately from original parse rejection.
Additional parameter probes call `collectQueryParameters` with a trailing bare
`&` and an unclosed string, catching and recording both lexer errors in JSONL.
Accounting controls replace the resolver with `{ tableByFullName: () => undefined }`
and a synthetic matching accounting base carrying `subcontoCount: 3` and
`correspondence: true`. Synthetic metadata is diagnostic, not platform evidence.

After edits: `npm run docs:check` passed (59 Markdown files, 50 reachable doc
pages, all internal links/anchors/case/reference links and locale parity checked);
`git diff --check` passed. Tracked and untracked paths were reviewed. No production behavior, tests, snapshots, golden outputs,
classification files or corpus baselines were changed. No E2E, Extension Host,
private corpus, live platform or Tree-sitter execution was performed; this task
changes documentation only. Recommended engineering order is maintained once in
[roadmap](../roadmap.md#recommended-engineering-sequence).

## Documentation changes and Git state

All paths below are documentation. LOC is additions/deletions for files that
already existed, or total lines for new files. No source/test changes; all of
them were committed together as `8dd270c`.

| File | Reason | LOC |
|---|---|---|
| `docs/development/architecture.md` | Actual snapshot contract and ADR-compatible expression direction | +21/−0 |
| `docs/development/audits/stage-0.md` | Historical banner only | +7/−0 |
| `docs/development/corpus-testing.md` | Evidence/provenance and oracle boundaries | +26/−0 |
| `docs/development/index.md` | Make ledger reachable | +1/−0 |
| `docs/development/known-issues.md` | Current user limits; move duplicated engineering backlog | +32/−65 |
| `docs/development/query-model.md` | Correct unsafe-marker and Apply guarantees | +22/−3 |
| `docs/development/roadmap.md` | One recommended sequence; remove independent grammar walker | +48/−70 |
| `docs/en/limitations.md` | Mirror current product limitations | +19/−1 |
| `docs/ru/limitations.md` | Mirror current product limitations | +19/−1 |
| `docs/uk/limitations.md` | Mirror current product limitations | +19/−1 |
| `docs/development/technical-debt.md` | Authoritative live ledger | 85 new |
| `docs/development/audits/reconciliation-b6286c57.md` | Fixed reconciliation, drift, evidence and verification | 292 new |
| `docs/development/audits/reconciliation-b6286c57.jsonl` | Local reproduction evidence; no historical outputs overwritten | 91 new |

Before the commit, `git status --short` showed ten modified Markdown files plus
the three new files above. Original Stage 0
body equality was checked after removing only the banner; `src/`, `test/`,
package files, tooling and all historical audit data remain unchanged.
