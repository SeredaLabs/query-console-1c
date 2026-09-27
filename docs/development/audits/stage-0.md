# Stage 0 — evidence-based SDBL differential audit

> Historical audit baseline: `35c9c6aaae1fe28d107343fd53e9f862626b125b`.
> Current correctness baseline: `b6286c57cfa64ff8cb9f937347c376d4b98d55c8`.
> Several findings have since been resolved. The status and verdicts below
> describe the historical audit, not the current backlog. See the
> [current debt ledger](../technical-debt.md) and
> [baseline reconciliation](reconciliation-b6286c57.md).

Status: **Stage 0a approved. Stage 0b complete, awaiting approval. Stage 1
not started.**

This is a research artifact, not a plan of record. It changes no production
code. Every number below is reproducible from the raw files in
[`stage-0/`](stage-0/environment.json) with the commands listed in
`stage-0/environment.json`. Tree-sitter, ANTLR and other third-party grammars
are never used here as evidence of 1C validity.

## Stage 0a

### A. Baseline

| Item | Value |
|---|---|
| Repository | `SeredaLabs/query-console-1c` @ `35c9c6aaae1fe28d107343fd53e9f862626b125b`, branch `main`, clean tree at start, version 0.1.90 |
| Node | local v25.8.2 (npm 11.11.1); CI uses Node 20 (`.github/workflows/release.yml`) |
| Parsing/oracle deps | `web-tree-sitter` 0.22.6 (devDependency only), typescript 5.9.3, vitest 1.6.1, esbuild 0.21.5 |
| Local toolchain | no tree-sitter CLI, no emscripten, no docker |
| `npm run typecheck` | exit 0 |
| `npx vitest run` | 126 files, **2286 passed, 0 failed, 0 skipped**. The tree-sitter oracle printed its skip warning twice (two test files); its 35 `assertValidSdbl` call sites returned without checking anything, and vitest does not count them as skipped. |
| E2E / integration | not run (not relevant to 0a) |

**Corpus, measured on the current tree** (`stage-0/corpus-sizes.json`). One
package is one query text as the console receives it. The union-member count is
for top-level members of each statement only; nested subqueries are not counted.

| Source | Packages | Parsed by us | Statements | Top-level union members | Multi-statement packages | Packages with UNION |
|---|---|---|---|---|---|---|
| `test/fixtures/corpus/golden.jsonl` | 1976 | 1976 | 2536 | 2740 | 285 | 144 |
| `test/fixtures/corpus/meta1c/*.txt` | 133 | 133 | 133 | 133 | 0 | 0 |
| `test/fixtures/queries/*.sdbl` | 28 | 28 | 30 | 32 | 1 | 1 |
| `test/fixtures/oracle/*.json` (platform oracle fixtures) | 181 | 181 | 188 | 191 | 7 | 3 |

- `input === query_text` in 1061 of 1976 golden entries.
- `corpus-classes.json`: SUPPORTED 601, `CORPUS_RECOVERED` 1375,
  UNSUPPORTED 0, INVALID 0. The file itself spells the second class
  `RECOVERED`. It is renamed here because it is **unrelated to
  `SemanticCompleteness.recovered` and to `selectListRepair`**: an entry is
  `CORPUS_RECOVERED` when it round-trips byte for byte but at least one model
  node is a raw/custom fallback (`tooling/corpus-verify/classification.ts:80`).
  So **70% of the golden corpus already contains at least one opaque node**,
  which is a direct input to the Structure axis in 0b.

**Provenance of validity.** No entry was re-verified against a live 1C
platform in this environment. A `valid: true` flag is not treated as platform
evidence on its own.

| Source | Class | Basis |
|---|---|---|
| golden (1976) | **expected-valid, platform-recorded** | The only writer in the repo, `harvestOracle.ts:51-53`, appends an entry only when live `validate_query` returns `valid`, and stores the platform's own `query_text`. The committed file carries no per-entry attestation and was not re-verified here. It is the strongest evidence in the repo and the basis of the ADR 0004 contract, but it is not re-confirmed. |
| oracle fixtures (181) | **unknown provenance** | Test title: "curated constructor references" (`test/unit/oracleGolden.test.ts:10`). The files came with the upstream fork import (`b9b37c9`), and how they were produced is not recorded. |
| meta1c (133) | **expected-valid, unknown provenance** | Per the comment in `sdblGolden.test.ts:9-22`, these are 1C-saved reference texts (BOM, CRLF). Their origin is not recorded. |
| queries (28) | **unknown provenance** | Hand-authored fixtures from the upstream import. |
| **platform-confirmed in this run** | **0** | No live oracle is available here. Every verdict that needs 1C goes to the 0b reprobe queue. |

- **Selection bias:** all four sources are 100% accepted by our parser, and
  every source is either expected-valid or of unknown provenance. The
  repository has no negative (invalid) corpus, so the `neither` and
  `competitor-only` buckets in 0b cannot be large by construction.
- The private 17933-query corpus cited in ADR 0004 and `corpus-testing.md`
  is not present in this environment (`tmp/` does not exist): **UNKNOWN**.

**External repositories, pinned** (`git ls-remote … HEAD`, 2026-09-27):

| Repository | SHA |
|---|---|
| `1c-syntax/bsl-parser` | `a89b827bee085d3f0c280629dea53d2bc0afba6b` |
| `alkoleft/tree-sitter-bsl` | `5752667f4d40879a533c4ffe3005da10ff0b5e29` (0.1.7, 2026-05-26; SDBL corpus: 46 cases in `grammars/sdbl/test/corpus/`) |
| `tormozit/Query-language-grammar-for-1C` | `8f10ef72b2e44f04921ec3876ad644c4c41e0fee` |
| `1c-syntax/codemirror-lang-bsl` | `303503f74bf87c137dfa0d145ef63a246a37149f` (pinned; whether it adds independent coverage is decided in 0b) |

### B. Known facts

| # | Claim | Result | Evidence |
|---|---|---|---|
| 1 | `SemanticCompleteness.partial` exists but production never returns it | **CONFIRMED** | Type at `src/core/semantic/semanticSnapshot.ts:109`. The only producer, `buildSemanticSnapshotFromText`, returns `'complete'` (`buildSemanticSnapshot.ts:84`), `'recovered'` (`:99`, `:101`) or `'unavailable'` (`:107`). |
| 2 | `symbolsById` is materialized; `scopesById` and `referencesBySymbolId` stay empty | **CONFIRMED** | Written only at `buildSemanticSnapshot.ts:51`. No write to the other two maps exists anywhere in `src/` (grep), and all 25 probes report size 0. Nuances: `symbolsById` holds source aliases of `ИЗ` sources, including `ИЗ` subqueries, but not aliases declared inside condition subqueries (probe C21 below). The header of `collectSymbols.ts:12-17` still says symbols are "deliberately NOT wired into SemanticIndex", which is outdated. |
| 3 | Tree-sitter oracle is not a mandatory CI gate | **CONFIRMED, and worse than documented** | See C. With the current upstream grammar, the oracle could not run even if the artifact were built (ABI mismatch). |
| 4 | `Последовательность.*.Границы` with extra positional args is a documented limitation | **PARTIALLY TRUE** | The `Границы` part is confirmed: `sdblParser.ts:2205-2207` sets `unsafeExtraArgs`, `findUnsafeVirtualTables` reports it, and Apply is blocked (probe `vt-overflow.jsonl`, row 4). It is **not the only case**, though: `Обороты` (`:2159`) and `ОстаткиИОбороты` (`:2167`) drop arguments beyond arity 4/5 **without** setting `unsafeExtraArgs`, so generation silently loses them and nothing blocks Apply (rows 1-2). Whether the platform accepts such input is **UNKNOWN**; it goes to the 0b reprobe queue. The generic `[period, condition]` fallback also covers every other unrecognised slice (for example `Задача.*.ЗадачиПоИсполнителю`). It round-trips positionally, but its behaviour there is not measured yet. |
| 5 | Expression type inference is planned/deferred with defined boundaries | **CONFIRMED** | `docs/development/roadmap.md:102` onward: display-only, oracle first, no expression AST, no parser rewrite, no effect on Apply. |
| 6 | Recovery via `selectListRepair` is used by hover, completion and the semantic snapshot | **CONFIRMED, with a scope nuance** | Hover and completion go through `resolveHeadTable` (`src/extension/hoverFieldInfo.ts:98`) into `buildSemanticSnapshotFromText`, which calls repair (`buildSemanticSnapshot.ts:88`). Editor diagnostics deliberately use strict `tryParseBatch` (`queryDiagnostics.ts`). Repair runs **only when `parseBatch` throws**, and in practice most broken queries do not throw (see E). |

### C. ADR and architecture constraints

| Source | Constraint relevant to future stages |
|---|---|
| ADR 0001 (`decisions/0001-platform-independent-core.md:26-29`) | Parser, lexer and generator are hand-written. `web-tree-sitter` may be used only as an optional devDependency test oracle, never on the runtime parse path. `src/core` has no `vscode`/DOM. |
| ADR 0004 (`decisions/0004-querymodel-round-trip-contract.md`) | The contract is `generateBatch(parseBatch(input)) === platform canonical output`. Hover and completion may use the snapshot's recovery path but **"must not introduce a separate grammar"** (`:33`). |
| `roadmap.md:188` | Migrating the SDBL parser to ANTLR or Tree-sitter as the runtime engine is *explicitly considered and not planned*. |
| `roadmap.md` priority 4 | The Tree-sitter oracle may become a CI gate once its artifact can be built reproducibly. This needs no ADR revision. |
| `roadmap.md:102` | Type inference: pure core, display-only, oracle-verified first. Adding an expression AST is out of scope. |
| `known-issues.md` | Three temp-table models must be unified (a required task). Hover/completion field lookups for subquery-alias tables stay fail-open by design. |
| `AGENTS.md` §14-15, §28 | Migration order is introduce → validate → switch → remove. Cleanup is separate. Temporary code must be marked. |

**REQUIRES ADR REVISION** (marked here so no later stage can present these as
ordinary steps):
- Any runtime use of Tree-sitter, including a "fallback partial tree" for
  hover or completion. Conflicts with ADR 0001 (runtime WASM dependency) and
  ADR 0004 ("separate grammar").
- A second, independent grammar for partial parsing, if it is not a mode of
  the existing parser. Conflicts with ADR 0004.
- An expression AST as part of type inference. This conflicts with a roadmap
  decision rather than an ADR, but the rule is the same: it needs an explicit
  decision.

### D. Oracle infrastructure

**What exists**

- `test/helpers/assertValidSdbl.ts` has 35 call sites in
  `test/unit/sdblParser.fixtures.test.ts` and `test/unit/sdblGenerator.test.ts`.
  It loads `test/fixtures/tree-sitter-sdbl.wasm` and fails when
  `rootNode.hasError()`.
- `test/fixtures/tree-sitter.wasm` is the web-tree-sitter **runtime** and is
  committed. It is byte-identical to `node_modules/web-tree-sitter` 0.22.6.
- `test/fixtures/tree-sitter-sdbl.wasm` is the **grammar** and is not committed.
- `tooling/scripts/build-wasm.sh` builds from `tmp/tree-sitter-bsl`. That
  directory exists only after `.devcontainer/copy-sibling-repos.sh` copies a
  sibling checkout **with `.git` excluded**, so no grammar SHA is recorded
  anywhere. `.devcontainer/Dockerfile:20` installs `tree-sitter-cli`
  unpinned (latest is currently 0.27.0).
- CI (`release.yml`) never builds the grammar. The sibling repository is also
  absent on this machine.
- Adjacent tooling (`harvestOracle`, `reprobeOracle`, `oracleDiff`,
  `oracleAccept*`) talks to a live 1C `validate_query` over MCP, configured in
  the gitignored `.mcp.json`, and needs the private corpus and metadata cache.

**What runs today:** none of the grammar checks. Suites stay green because the
helper returns early.

**Why it is not reproducible**

1. The grammar source is not pinned.
2. The toolchain is not pinned.
3. The artifact is not committed.
4. **ABI mismatch.** `alkoleft/tree-sitter-bsl@5752667` ships
   `grammars/sdbl/src/parser.c` with `LANGUAGE_VERSION 15` (tree-sitter-cli
   0.25.10), while `web-tree-sitter` 0.22.6 accepts ABI 13-14
   (`tree-sitter@v0.22.6:lib/include/tree_sitter/api.h:29,35`). A grammar
   built today would be rejected by `Language.load` ("Incompatible language
   version"), and the helper would then *throw* rather than skip. This
   conclusion comes from source constants and was not exercised empirically,
   because no build was performed.

**Recommendation for a future CI gate (not implemented): A**, a committed
WASM plus a provenance manifest and checksum.

- *Why A.* CI stays offline and fast and needs no emscripten or wasi toolchain.
  Determinism holds by construction. A checksum test catches silent
  replacement, and the rebuild script documents how to regenerate the file.
- *Cost of A.* A binary lives in the repository, grammar bumps are manual,
  and the artifact is trusted. The manifest mitigates this by recording source
  repo, grammar SHA, CLI version, ABI and sha256.
- *Why not B.* B has better provenance, but it adds a pinned toolchain
  container, network-dependent builds and CI time for an optional oracle.
  It is worth revisiting only if grammar bumps become frequent.
- *Precondition for both.* Resolve the ABI mismatch, either by upgrading
  `web-tree-sitter` to ABI-15-capable 0.25+ (its import shape changes, and it
  remains a devDependency, which ADR 0001 permits) or by regenerating the
  grammar for ABI 14. Which of the two works must be validated first.

**Relevant for 0b (reprobe queue format)**

- `harvestOracle` reads `*.txt`, **deletes every file the platform rejects**
  and records no invalid verdict. That makes it unsuitable for confirming
  `platform-confirmed-invalid`.
- `reprobeOracle` reads per-case JSON (`файл`, `исходныйТекстЗапроса`,
  `текстВалидатора`) and does print `LIVE: INVALID (message)`, so the reprobe
  queue should map to that format.
- `validate_query` runs against a specific infobase. Reprobe cases must
  therefore use metadata objects that exist there (the names in
  `test/fixtures/corpus/metadata/cf`). Otherwise a case fails for metadata
  reasons, not syntax.

### E. Recovery baseline

The probes (`stage-0/probes/recoveryProbes.ts`, raw output in
`stage-0/recovery-probes.json`) replay the pure part of the real providers on
a BSL source. They run `findQueryAt`, then `findChainForCompletion` /
`findChainAt`, then `rawOffsetToQueryTextOffset`, then
`resolveCompletionTarget` / `describeChain`, and finally
`computeQueryParseProblems`, all against a two-table in-memory resolver.

A hover probe always targets a well-formed chain elsewhere in the same package.

| Probe | Input class | Current behavior | Semantic context retained? | User-visible impact |
|---|---|---|---|---|
| C00 | control: complete query | `complete` | yes | normal |
| C01-C03 | trailing `T.` / `Т.` (the user's example, Latin and Cyrillic; also as the only field) | **Parses**: `Т.` becomes an opaque field. `complete`, no repair | **yes**: completion after `T.` lists the source fields, hover works | ok, plus a `malformedExpression` warning |
| C04 | broken SELECT expression (`Т. +`) | parses as opaque, `complete` | yes | ok, plus warning |
| C05 | missing comma after `Т.Ссылка` (line break) | parses as one opaque field `Т.Ссылка Т.Наименование`, `complete` | yes | ok, plus warning |
| — | missing comma between two plain fields (`repair-trigger.txt`) | throws, then repair, then snapshot `SemanticCompleteness.recovered` | yes | ok |
| C06 | unfinished function `ПОДСТРОКА(Т.` | **Parses, but the open paren swallows `ИЗ …` into the raw field. The model has 0 tables and is still reported as `complete`, so repair never runs** | **no** | no completion, no hover for the whole statement; warning shown |
| C07 | unfinished `ВЫБОР КОГДА Т.` | parses as opaque, `complete` | yes | ok, plus warning |
| C08 | unfinished JOIN `ПО Т.` | parses, `complete` | yes (both aliases) | ok, plus warning |
| C09, C10 | broken `ГДЕ` (dangling `=`, missing operand) | parses as a custom condition, `complete` | yes | ok, plus warning |
| C11 | unclosed subquery in `ГДЕ … В (ВЫБРАТЬ К.` | parses; the whole subquery becomes raw condition text | outer: yes; inner `К.`: **no** | no completion inside the subquery |
| C12 | closed condition subquery with a broken select list | parses; the subquery is structured | outer: yes; inner: **no** | same as C21: not a recovery issue |
| C13 | unmatched `(` in SELECT | same as C06: 0 tables, `complete` | **no** | no completion or hover |
| C14, C15 | package: statement 2 broken (SELECT or `ГДЕ`), hover in statement 1 | parses, `complete` | yes, both statements | ok, plus warning |
| C16 | package: temp table producer, then broken `В.` over `ВТ` | parses, `complete`, temp schema derived | yes | completion offers `Ссылка` |
| C18 | broken `УПОРЯДОЧИТЬ ПО Т. ,` | **throws; repair only touches SELECT lists, so the result is `unavailable`** | **no, for the whole package** | no hover or completion anywhere in the package; parse diagnostic |
| C19 | broken `СГРУППИРОВАТЬ ПО Т. ,` | same as C18 | **no** | same |
| C20 | UNION: member 2 broken, hover in member 1 | parses, `complete` | yes | ok, plus warning |
| C21 | **control, complete query**: completion inside `ГДЕ … В (ВЫБРАТЬ К.¦…)` | `complete`, but the symbol index holds only `Т` | **no** | no completion inside condition subqueries, even on valid text. Root cause not yet isolated. |
| C22 | control: hover on an `ИЗ`-subquery alias `П.Ссылка` | none | by design | documented fail-open |
| C23 | `ИЗ` subquery with a broken select list | parses, `complete` | yes (inner and outer) | ok, plus warning |
| C24 | control: JOIN with hover/completion in `ПО` | `complete` | yes | normal |

**Findings**

1. The main recovery mechanism in practice is the **parser's own tolerance**
   (opaque raw expressions), not `selectListRepair`. None of the 25 probes
   reached snapshot `SemanticCompleteness.recovered`. Repair is reached when a select list throws, for
   example a same-line missing comma or an empty list. Whether a malformed
   select list throws or silently becomes opaque depends on token content:
   `Ссылка` is also the keyword `ССЫЛКА`, compare C05 with `repair-trigger.txt`.
2. **A snapshot reported as `complete` is not always structurally sound.** An
   unbalanced `(` in SELECT (C06, C13) swallows `ИЗ`, which produces a model
   with no sources. Because parsing did not throw, recovery is never attempted.
   Hover and completion lose the whole statement. The generator then emits
   `…ПОДСТРОКА(Т. ИЗ Справочник.Товары КАК Т КАК Поле2`. The input is
   invalid, and diagnostics flag it through the same checker that gates Apply,
   so this is a recovery gap (**P2**), not silent corruption of valid SDBL.
3. A hard failure outside SELECT lists (C18 `УПОРЯДОЧИТЬ ПО`, C19
   `СГРУППИРОВАТЬ ПО`) loses **the whole package** (**P2**).
4. Aliases declared in condition subqueries are absent from the symbol index,
   and completion there fails **even for complete, valid queries** (C21). This
   is an editor-semantics gap, not a recovery gap. It is a potential **P1**
   because it weakens an existing use case. The root cause (symbol collection
   or scope/source-map coverage) is left for isolation.

**Candidate solution classes, not chosen and not implemented**

1. Extend the current repair: blank a broken `УПОРЯДОЧИТЬ`/`СГРУППИРОВАТЬ`
   section, and also trigger repair when a parse "succeeds" with zero sources
   despite a top-level `ИЗ`. Compatible with the ADRs.
2. Lexer-level `ИЗ`/source extraction. It reuses the existing lexer, like
   `selectListRepair`, and is compatible with the ADRs.
3. A lightweight partial parser: allowed only as a mode of the existing
   parser. As an independent grammar it is **REQUIRES ADR REVISION** (0004).
4. A Tree-sitter fallback: **REQUIRES ADR REVISION** (0001, 0004).

### Other observations recorded, not fixed

- `vt-overflow.jsonl`: `Обороты`/`ОстаткиИОбороты` silently drop arguments
  beyond their arity and are not marked unsafe (see B4). Platform validity is
  UNKNOWN; this goes to the 0b reprobe queue. It is a potential P0-Critical
  only if the platform accepts such input.
- Test-signal gap: the suite reports 0 skipped while the grammar oracle is
  entirely inactive.
- Documentation drift: the `collectSymbols.ts:12-17` header (B2).

### Stage 0a exit

Items 0a.1-0a.5 are done. The only repository changes are this page, the
`stage-0/` artifacts (probe scripts, raw outputs, `environment.json`) and one
link from the development index so the page passes the docs orphan check. No
production code, test or grammar changed.

## Stage 0b

All numbers below come from `stage-0/summary.json`, which
`probes/summarize.ts` derives from the raw files `results.jsonl` (2373 corpus
packages), `construct-probes.jsonl` (113 audit probes), `apply-gate.jsonl` and
`platform-reprobe.jsonl`. `TS@5752667` stands for
`alkoleft/tree-sitter-bsl@5752667f4d40879a533c4ffe3005da10ff0b5e29:grammars/sdbl/grammar.js`.

**Ground rules applied throughout**

- Tree-sitter output is never used as evidence of 1C validity or semantic
  equivalence. It serves only as a candidate source and a structural-difference
  detector.
- Nothing is marked platform-confirmed, because no live platform was available
  (see A, Provenance). Golden `query_text` counts as platform-recorded canonical
  output, which is the ADR 0004 contract, but it was not re-verified here.

### Tooling (temporary, removed after the run)

- tree-sitter CLI 0.25.10, installed with npm into a scratch directory.
- `alkoleft/tree-sitter-bsl@5752667`, compiled natively with Apple clang 15.
  The compiled library was written to scratch through `TREE_SITTER_LIBDIR`,
  not to `~/Library/Caches`. No WASM was built.
- **Smoke check before the run.** The grammar SHA matched. Representative RU
  and EN queries parsed without errors. `ERROR` and `MISSING` nodes were
  detected. Output was identical across 5 repeated runs once the per-file timing
  column was dropped.
- ANTLR (`1c-syntax/bsl-parser`), tormozit and codemirror were inspected
  statically only. codemirror's `src/sdbl.grammar` (164 lines) is a
  highlighting overlay, not an independent parser, so it adds no coverage.
- Scripts are kept in `stage-0/probes/`. `differential.ts` needs the CLI as an
  external prerequisite and never installs or vendors it. `applyGate.ts`,
  `buildReprobeQueue.ts` and `summarize.ts` need no tree-sitter.

### F. Differential results (unit: query package)

Package, statement and union-member totals per source are listed in
`summary.json` (`packagesBySource`, `statementsBySource`,
`unionMembersBySource`). Only package-level counts appear below.

**Axis 1 — Acceptance** (2373 corpus packages)

| Source | both | ours-only | competitor-only | neither |
|---|---|---|---|---|
| golden (1976) | 1894 | 82 | 0 | 0 |
| meta1c (133) | 133 | 0 | 0 | 0 |
| queries (28) | 18 | 10 | 0 | 0 |
| oracle fixtures (181) | 173 | 8 | 0 | 0 |
| ext tree-sitter-bsl test corpus (46) | 41 | 1 | 4 | 0 |
| ext bsl-parser test corpus (9) | 5 | 2 | 1 | 1 |

- **Selection bias.** The repository corpus is positive-only, so
  `competitor-only = 0` there says nothing about grammar completeness. Every
  `competitor-only` case comes from the competitors' own test corpora or from
  audit probes.
- **What tree-sitter rejects** among the 100 `ours-only` repository packages
  (multi-label, `competitorRejectsRepoPackages`):

  | Category | Packages |
  |---|---|
  | identifiers that start with a keyword (`СсылкаНаТом`, a field named `Значение`) | 27 |
  | `#` template markers | 26 |
  | `ВЫРАЗИТЬ(…).Поле` | 12 |
  | unclassified | 11 |
  | `УНИЧТОЖИТЬ` | 10 |
  | report-builder `{}` | 8 |
  | modifier order | 4 |
  | accounting VT with omitted args | 4 |
  | `ИТОГИ … ОБЩИЕ` | 3 |
  | trailing `;` | 2 |
  | `… ПО НАБОРАМ` | 2 |

  These are competitor gaps on text the platform recorded as valid. They are
  not our gaps.
- **Competitor-only cases** (all need 1C, see H):
  - English syntax: ext-bsl-parser `select06`.
  - From the tree-sitter corpus: `… ИЕРАРХИЯ УБЫВ` in ORDER BY; two `ИТОГИ`
    clauses; a field alias without `КАК` whose name is the keyword `Ссылка`.
- **`neither`:** ext-bsl-parser `drop.sdbl`, which contains English `Drop`.

**Axis 2 — Round-trip** (methods applied strictly in order)

| Source | Method | Result |
|---|---|---|
| golden | golden comparison | unchanged 1061, canonical-confirmed 915, **oracle-mismatch 0** |
| meta1c / queries | text identity | unchanged 133 / 28 |
| oracle fixtures | structural tree (fixture `expected` has unknown provenance, so it is only evidence) | unchanged 35, structural-equivalent 108, **structural-difference-candidate 28**, unknown 10 |
| ext corpora | structural tree | equivalent 25, **difference-candidate 17**, unknown 13 |

- **Idempotence `P→G→P→G`** was checked on 2367 accepted packages. Exactly 2
  fail, **oracle fixtures 0163 and 0164**, both on text and on model. See J.
- **Detector calibration.** The detector was run on the 915 golden changes that
  are already platform-canonical. Result: equivalent 739, difference-candidate
  115, unknown 61. On canonical input that is a **13.5% false-positive rate**
  (115 of 854 evaluable). The remaining false positives are qualification of
  implicit names, `*` expansion and single-line package separators, none of
  which can be normalized without metadata.
  - Three normalization rules were added after calibration and are documented
    in `differential.ts`: collapse a `query_expression` wrapper, ignore a
    trailing `;`, and treat an explicit alias equal to the implied name as
    preserved. Before them the false-positive rate was about 28%.
  - A `difference-candidate` therefore means "look at this", never "defect".
- **Manual review of the 45 corpus candidates** (28 oracle + 17 ext):
  - Most are qualification of bare fields, `*` expansion, `ВНЕШНЕЕ` / `ВОЗР`
    dropped, `X НЕ В` rewritten to `НЕ X В`, parenthesization, and function
    names uppercased.
  - Structure-changing transforms whose only evidence is a fixture of unknown
    provenance:
    - 0078 / 0121: ORDER BY `ИЕРАРХИЯ` dropped.
    - 0127: ИТОГИ `Валюта` rewritten to `Валюта2`.
    - 0150: a bare parameter dropped from GROUP BY.
  - Ext corpus: `ИНДЕКСИРОВАТЬ ПО` without `ПОМЕСТИТЬ` is dropped.
    `НЕ (a + 2*b > 10)` loses its parentheses.
  - All of these go to the reprobe queue.

**Axis 3 — Structure**

| Source | structured | partially-structured | unsupported |
|---|---|---|---|
| golden | 598 | 1378 | 0 |
| meta1c | 14 | 119 | 0 |
| queries | 14 | 14 | 0 |
| oracle | 46 | 135 | 0 |
| ext | 13 | 36 | 6 |

`partially-structured` (1378) differs from `CORPUS_RECOVERED` (1375) by 9 and
6 packages. The audit walker also counts raw virtual-table parameters and
`ИТОГИ` expressions, which `findRawFallbackHits` ignores.

### G. Confirmed grammar gaps

The reprobe queue was run on a live platform afterwards (see "Platform reprobe
on a live 1C base" below). The following items are now platform-confirmed:

| Construct | Evidence | Our behavior | Competitor behavior | Severity |
|---|---|---|---|---|
| Full-name-qualified field as a condition (`ГДЕ Справочник.X.Поле`, top level and in subqueries) | RP01-RP03 valid; platform canonical is `X.Поле` at top level and unchanged in subqueries | double-qualified (`X.Справочник.X.Поле`); Apply would write it | not applicable (acceptance only) | **P0-Critical** |
| English-syntax SDBL (`SELECT … FROM … WHERE NOT …`) | RP06/RP07 valid; the platform constructor canonicalizes to Russian | rejected entirely | tree-sitter accepts | **P0** |
| `УПОРЯДОЧИТЬ ПО … ИЕРАРХИЯ УБЫВ` | RP08 valid (2825 rows) | rejected | tree-sitter accepts (`order_by_clause:86`) | **P0** |
| Parameter named like a keyword (`&И`) | RP13 valid | emitted as `& И`; Apply blocked | accepts | P0 (visible) |
| `ПУСТАЯТАБЛИЦА.(…)` in the select list | RP14 valid | column names get qualified; Apply blocked | accepts | P0 (visible) |

### H. Candidate gaps and the reprobe queue

`stage-0/platform-reprobe.jsonl` holds **25 minimal cases**: 7 high, 12 medium
and 6 low priority. They use metadata from `test/fixtures/corpus/metadata/cf`,
and 4 rows are marked `metadataCheck`. Each row has a `reprobeOracleRecord` in
the shape `reprobeOracle` reads. **Do not run `harvestOracle` on them**, because
it deletes rejected inputs.

| Priority | IDs | Question | Potential severity if the platform accepts |
|---|---|---|---|
| high | RP01-RP03 | Full-name-qualified boolean field as a condition, at top level and in subqueries, plus the fixture 0163 canonical text | **P0-Critical** (J1) |
| high | RP04-RP05 | `Обороты` with a 5th argument, `ОстаткиИОбороты` with a 6th | **P0-Critical** (J2) |
| high | RP06-RP07 | English keywords (with RU or EN type names) | **P0**: every English-syntax query is rejected |
| medium | RP08 | `ИЕРАРХИЯ УБЫВ` | P0 |
| medium | RP09 | two `ИТОГИ` clauses | P0; if invalid, competitor over-acceptance (H-class) |
| medium | RP10 | alias without `КАК` named `Ссылка` | P0 (narrow) |
| medium | RP11-RP13 | alias `В`/`И`, parameter `&И` | P0, visible (Apply blocked) |
| medium | RP14 | `ПУСТАЯТАБЛИЦА.(…)` | P0, visible (Apply blocked) |
| medium | RP17 | `ИНДЕКСИРОВАТЬ ПО` without `ПОМЕСТИТЬ` | **P0-Critical** (J3) |
| medium | RP19-RP21 | fixture-claimed transforms 0150 / 0078 / 0127 | P0-Critical if the fixture is wrong |
| medium | RP22 | `#` marker as a source | affects golden provenance (85 golden packages contain markers) |
| low | RP15, RP16, RP18, RP23-RP25 | scalar subquery in SELECT, parenthesized nested join, `НЕ (…)` canonical form, quoted date literal, `Границы` 3-arg layout, `ЗадачиПоИсполнителю` | P0 / P3 / layout confirmation |

### I. Raw / opaque coverage (golden, 1976 packages)

- **Slots holding opaque text**, as packages / spans:
  - `ГДЕ` conditions 950/1967
  - select fields 755/2021
  - JOIN (whole) 317/831
  - JOIN conditions 306/1341
  - `ИМЕЮЩИЕ` 36/45
  - GROUP BY 24/43
  - ORDER BY 20/21
  - ИТОГИ fields 12/55
  - VT parameters 9/13
  - INDEX BY 2/2
- **Total:** 6341 opaque spans.
- **Constructs inside those spans**, as packages / occurrences (multi-label,
  lexer-based):
  - comparison 777/3051
  - literal 870/2510
  - parameter 597/1526
  - `НЕ` 409/819
  - `И` 308/716
  - `ЗНАЧЕНИЕ()` 254/444
  - `ВЫБОР` 213/439
  - `ЕСТЬNULL` 181/506
  - `В (…)` 175/365
  - `ИЛИ` 149/277
  - `ЕСТЬ NULL` 149/244
  - aggregate over an expression 143/254
  - `ТИПЗНАЧЕНИЯ` 115/292
  - arithmetic 100/167
  - subquery 74/121
  - `ТИП` 73/189
  - `ВЫРАЗИТЬ` 68/161
  - `ДАТАВРЕМЯ` 55/131
  - `ПОДОБНО` 36/51
  - `СПЕЦСИМВОЛ` 33/48
  - `ССЫЛКА` 7/11
  - `МЕЖДУ` 5/10
  - function calls: 18 distinct names; the lexer heuristic also counts
    `СТРОКА(n)`/`ЧИСЛО(n,m)` inside `ВЫРАЗИТЬ` and `КОГДА (` as calls
  - 167 packages hold a plain field path that is stored opaque
- **What the model structures at all.** `QueryModel` has **no expression
  tree**. It structures `alias.path` fields, `AGG(alias.path)`, and simple
  conditions of the form `path <op> &param/field`. It also structures `В (&p)`,
  `В ИЕРАРХИИ (&p)`, `МЕЖДУ &a И &b`, `В (subquery)`, joins with simple
  conditions, GROUP BY, ORDER BY, TOTALS and INDEX BY. Everything else is a
  string (`queryModel.ts:111-517`).
- **Impact** (classification, not a defect list):
  - **P1:** field-existence validation (`checkFieldPaths`) skips custom
    conditions and expressions. This is documented in `known-issues.md`.
  - **P2, roadmap-deferred:** expression result types are unknown.
  - **No impact on hover/completion:** both work on text chains plus
    position-aware alias scope, so opaque storage does not block them (0a,
    section E).
  - **Visual editor:** these constructs appear as "custom expression". That is
    the design (`query-model.md`).

### J. Silent semantic-change risks

**How this was checked**
- Method 1 (golden) on 1976 packages: 0 mismatches.
- Method 2 (idempotence) on 2367 packages: 2 failures.
- Method 3 (structural tree) on 195 non-golden changed packages: 133
  equivalent, 45 candidates (all reviewed by hand), 17 unknown.
- 113 construct probes.
- For every text-changing probe, an Apply-gate simulation (`apply-gate.jsonl`,
  mirroring `src/webview/applyGate.ts`: static blockers, then
  `validateBatchText` on the output).

**Behavior confirmed in code.** Validity is still pending, but the output is
garbage or data is lost, and Apply would write it:

1. **Double qualification.**
   - R01: `ГДЕ Справочник.Валюты.ПометкаУдаления` becomes
     `ГДЕ Валюты.Справочник.Валюты.ПометкаУдаления`.
   - R02/R03: inside an IN or IN-HIERARCHY subquery without alias, the result
     is `Справочник.X.Справочник.X.Поле`.
   - A second pass over the oracle fixture 0163/0164 `expected` text corrupts
     it the same way, so reopening already-canonical text breaks it.
   - The comparison form (`Справочник.X.Код = &p`, probe R04) is unaffected.
   - Golden has 0 inputs of this shape, so the corpus never exercised it.
   - Apply gate: no blocker, final check `ok`, **Apply would write**.
2. **VT arguments beyond arity.** `Обороты` (5th argument, on both a turnover
   and a balance register) and `ОстаткиИОбороты` (6th) are dropped with no
   `unsafeExtraArgs`, and **Apply would write** (V05-V07). By contrast
   `Остатки`, the generic fallback and `Границы` are marked unsafe and blocked
   (V08, V10). This contradicts the `query-model.md` safety-marker contract
   ("records `unsafeExtraArgs` where positional arguments cannot be represented
   losslessly") whatever the platform says about validity.
3. **`ИНДЕКСИРОВАТЬ ПО` without `ПОМЕСТИТЬ`** is dropped from the output, and
   **Apply would write** (RP17).

**Visible, not silent** (Apply blocked by `malformedCustom` or by the final
check):
- Alias `В`/`И`: `НЕ В.Поле` becomes `НЕ В. В .Поле`; `НЕ И.Поле` becomes
  `И.НЕ И .Поле` (K01, K02, K04).
- Parameter `&И` becomes `& И` (K05).
- `ПУСТАЯТАБЛИЦА.(Код, …)` becomes `ПУСТАЯТАБЛИЦА.(Вал.Код, …)` (P03).
- A scalar subquery in SELECT loses its parentheses (E30).

**Equivalent changes the detector flagged:**
- W06: outer parentheses added around `a ИЛИ b И НЕ c`.
- J05: `ВНЕШНЕЕ` dropped.
- J06: bare `СОЕДИНЕНИЕ` becomes `ВНУТРЕННЕЕ`.
- O02: `ВОЗР` dropped.
- S05: modifier order.
- S08/S09: `*` expansion (metadata-driven, as in golden).
- X04: comments are dropped by `parseBatch`'s default; the UI option preserves
  them.

### K. Structural coverage matrix (parser and grammar only)

Ours means our structural representation. Competitor means tree-sitter
acceptance on the same probe, which says nothing about structure. Platform
evidence is `n/a` wherever the reprobe queue does not list the probe.

| Construct | Probe | Ours | TS accepts | TS@5752667 rule |
|---|---|---|---|---|
| SELECT, DISTINCT, TOP, ALLOWED | S01-S04 | STRUCTURED | yes | `select_section:47`, `top_clause:164` |
| modifiers in any order | S05 | STRUCTURED (reordered, canonical per fixture 0052) | **no** | — |
| alias without `КАК` (field, source) | S06, S07 | STRUCTURED | yes | `field_alias:178`, `source_alias:268` |
| alias without `КАК` named like a keyword | RP10 | **UNSUPPORTED** | yes | — |
| `*`, `alias.*` | S08, S09 | STRUCTURED (expanded by metadata) | yes | `wildcard:180` |
| INNER/LEFT/RIGHT/FULL [OUTER] JOIN, bare `СОЕДИНЕНИЕ` | J01-J06 | STRUCTURED | yes | `join_clause:270`, `join_kind:280` |
| parenthesized nested join source | J07 | UNSUPPORTED | no | — |
| JOIN condition with `ИЛИ` | J08 | OPAQUE | yes | `binary_expression:349` |
| subquery source | Q01 | STRUCTURED | yes | `nested_query_source:266` |
| `ГДЕ` path = &param, `И` of those | W01, W02 | STRUCTURED | yes | `where_clause:291` |
| `ГДЕ` with `ИЛИ` / `НЕ` / mixed precedence | W03-W06 | OPAQUE | yes | `binary_expression:349`, `unary_expression:340` |
| `В (list)` / `В (&p)` / `В (subquery)` | E01 / E03 / E02 | OPAQUE / STRUCTURED / STRUCTURED | yes | `membership_expression:393` |
| `В ИЕРАРХИИ` | E04 | STRUCTURED | yes | `membership_expression:393` (`:400`) |
| `МЕЖДУ &a И &b` | E05 | STRUCTURED | yes | `between_expression:409` |
| `ПОДОБНО` literal, `СПЕЦСИМВОЛ` | E06, E07 | OPAQUE (only a `&param` right-hand side is structured) | yes | `like_expression:422` |
| `ЕСТЬ [НЕ] NULL`, `ССЫЛКА` | E08-E10 | OPAQUE | yes | `null_check_expression:434`, `reference_check_expression:445` |
| `ВЫБОР` (nested, no `ИНАЧЕ`) | E11, E12 | OPAQUE | yes | `case_expression:557` |
| `ВЫРАЗИТЬ` | E13 | OPAQUE | yes | `cast_expression:582` |
| `ВЫРАЗИТЬ(…).Поле` | E14 | OPAQUE | **no** | — |
| `AGG(alias.path)`, `КОЛИЧЕСТВО(РАЗЛИЧНЫЕ …)` | E15, E16 | STRUCTURED | yes | `aggregate_function:527` |
| `КОЛИЧЕСТВО(*)`, nested calls, built-ins, date functions, `ПРЕДСТАВЛЕНИЕ` | E17, E21, E22, E31, E32 | OPAQUE | yes | `function_call:509` |
| arithmetic, unary minus, concatenation | E18-E20 | OPAQUE | yes | `binary_expression:349`, `unary_expression:340` |
| literals, `ДАТАВРЕМЯ`, quoted date, `ЗНАЧЕНИЕ`, `ТИП`/`ТИПЗНАЧЕНИЯ` | E23-E28 | OPAQUE | yes | `date_time_literal:455`, `predefined_value_literal:498`, `type_literal:478` |
| tuple `(a, b) В (subquery)` | E29 | PARTIAL (left side raw, subquery structured) | **no** | — |
| scalar subquery in SELECT | E30 | OPAQUE (mangled, blocked) | no | — |
| dotted navigation through reference | E33 | STRUCTURED | yes | `dotted_identifier:617` |
| GROUP BY, HAVING | G01, G02 | STRUCTURED | yes | `group_by_clause:293`, `having_clause:296` |
| `ГРУППИРУЮЩИМ НАБОРАМ` | G03 | STRUCTURED | **no** | — |
| UNION [ALL] | U01, U02 | STRUCTURED | yes | `union_clause:63` |
| ORDER BY, `ИЕРАРХИЯ`, AUTOORDER, output alias | O01-O06 | STRUCTURED (`ВОЗР` dropped as default) | yes | `order_by_clause:70`, `auto_order_clause:89` |
| `ИЕРАРХИЯ УБЫВ` | O04 | **UNSUPPORTED** | yes | `order_by_clause:86` |
| TOTALS `ПО ОБЩИЕ`, `ТОЛЬКО ИЕРАРХИЯ [КАК]`, `ПЕРИОДАМИ` | T01, T02, T05, T03 | STRUCTURED | T01 **no**; T02/T03/T05 yes | `totals_clause:91`, `totals_periods_clause:127` |
| two `ИТОГИ` clauses | T04 | UNSUPPORTED | yes | `totals_clause:91` |
| INDEX BY, `ПО НАБОРАМ` | I01, I02 | STRUCTURED | yes | `index_by_clause:288` |
| FOR UPDATE [table] | F01, F02 | STRUCTURED | yes | `for_update_clause:298` |
| package, temp table, `УНИЧТОЖИТЬ`, `ДОБАВИТЬ` | P01, P02 | STRUCTURED | P01 **no**, P02 yes | `query_package:31`, `into_clause:216`, `add_clause:218`, `destroy_statement:220` |
| `ПУСТАЯТАБЛИЦА.(…)` | P03 | OPAQUE (mangled, blocked) | yes | `empty_table_expression:205` |
| tabular-section nested fields, tabular section as source, `&param` source | P04-P06 | STRUCTURED | yes | `nested_table_field_expression:182` |
| VT `СрезПоследних`, `Остатки`, `Обороты`, `ОстаткиИОбороты`, `Границы`, `ЗадачиПоИсполнителю`, external-source cube | V01-V04, V09, Z01, Z02 | STRUCTURED (positional raw args by design) | yes | `virtual_table_source:242` |
| VT arguments beyond arity | V05-V08, V10 | see J2 | yes | — |
| English keywords | X01-X03 | **UNSUPPORTED** | yes (except `DROP`) | `keyword()` pairs, `:3` |
| comments, lowercase keywords | X04, X07 | STRUCTURED | yes | `extras:24` |
| `#` marker, builder `{}` | X05, X06 | STRUCTURED | **no** | — |

**Static vocabulary check.** Every Russian keyword in the tree-sitter (70) and
tormozit (98) grammars also appears in our core source. From ANTLR (138), only
`ЗАДАЧИПОИСПОЛНИТЕЛЮ`, `КУБ` and `ТАБЛИЦАИЗМЕРЕНИЯ` do not. Both are covered by
the generic fallback, and probes Z01/Z02 round-trip unchanged. A word appearing
in our source does not imply support; the probes above are the evidence.

### L. Corpus quality and external sources

**Covered**
- A 1976-package golden corpus from one BSP-based configuration (file names
  match BSP subsystems), recorded against the platform.
- 181 curated fixtures of unknown provenance.
- 133 select-all queries and 28 hand fixtures.

**Not covered**
- **No negative corpus**, so over-acceptance cannot be measured.
- No English syntax.
- No full-name-qualified conditions (the J1 shape).
- No VT with extra arguments.
- The golden corpus contains zero keyword-named aliases or parameters.
- Only one configuration family.
- 85 golden packages carry `#` template markers, so golden `valid` may not be
  a pure platform verdict for them (RP22).

**External sources** (licenses read from the file at the pinned SHA):

| Source @ SHA | License | Size | Automatic extraction | Derived fixtures in repo? |
|---|---|---|---|---|
| `1c-syntax/ssl_3_1` @ `da8aa1f` (БСП 3.1 mirror) | CC-BY-4.0 (`LICENSE.md`) | ~1 GB repo | yes (`npm run extract` / `extractQueries`) | Allowed with attribution. Likely overlaps our golden (same subsystems), so its value lies mostly in newer versions. |
| `Pr-Mex/vanessa-automation` @ `9f6f57d` | BSD-3-Clause | ~200 MB | yes | allowed with notice; queries are sparse |
| `alkoleft/tree-sitter-bsl` @ `5752667` test corpus | MIT | 46 cases | yes (used here) | allowed; not copied, ids only |
| `1c-syntax/bsl-parser` @ `a89b827` test resources | LGPL-3.0 | 9 files | yes (used here) | **audit job only**; not copied |
| `1C-Company/v8-code-style` @ `c054a53` | EPL-2.0 | small | few queries | audit job only |
| `1C-Company/dt-demo-configuration` @ `1f4b628` | **none declared** | small | yes | **do not use** |
| `1c-syntax/bsl-language-server` @ `e4ef088` test resources | LGPL-3.0 | unknown | yes | audit job only |

**Recommendation.** Extract a negative and an English sub-corpus through the
reprobe loop first. External positive corpora mostly add volume on
constructs we already accept.

### M. Stage 1 candidates

Updated with the live-platform verdicts ("Platform reprobe on a live 1C base"
below).

**Confirmed by the platform**
1. **P0-Critical: double qualification of full-name-qualified fields in
   conditions** (RP01-RP03). It also affects the second pass over the
   repository's own canonical fixtures 0163/0164, the only idempotence
   failures in 2367 packages. It reproduces with the metadata resolver, which
   is the real extension mode.
2. **P0: English-syntax SDBL is rejected** (RP06/RP07). The platform accepts it
   and its constructor emits Russian canonical text.
3. **P0: `ИЕРАРХИЯ УБЫВ` in ORDER BY is rejected** (RP08).
4. **P0 (visible, Apply blocked):**
   - parameter `&И` is mangled (RP13);
   - `ПУСТАЯТАБЛИЦА.(…)` columns get qualified (RP14).
5. **P2: without a metadata resolver, ORDER BY `ИЕРАРХИЯ` on a non-reference
   field is dropped.** The platform keeps it (RP20). Fixture 0078 encodes the
   dropping behavior and contradicts this platform build. With the resolver our
   output matches byte for byte.

**Invalid inputs we silently normalize (P3, not grammar gaps)**
- `Обороты` / `ОстаткиИОбороты` with arguments beyond arity (RP04/RP05,
  "Wrong parameters"). This still violates the `query-model.md`
  `unsafeExtraArgs` contract.
- `ИНДЕКСИРОВАТЬ ПО` without `ПОМЕСТИТЬ` (RP17).
- Aliases `В`/`И` (RP11/RP12).
- Scalar subquery in SELECT (RP15).
- Quoted date literal (RP23).

**Closed with no gap**
- RP09 (two `ИТОГИ`) and RP10 (keyword alias without `КАК`) are tree-sitter
  over-acceptance; our rejection is correct.
- RP16 is rejected by both parsers, correctly.
- RP18: our output is equivalent on data.
- RP19 and RP21 (fixtures 0150/0127) match the platform byte for byte.
- RP25 is accepted.

**Still UNKNOWN**
- RP24 `Границы`: the base has no sequences.
- RP22: `#Имя` is lexically valid, but how golden entries carrying `#` markers
  were resolved is not established.

**Excluded from Stage 1 by scope**
- Opaque expression storage (I). It is a design choice with no defect found.
- Detector false positives.
- All competitor gaps.
- **C21, a separate semantic-core side finding:** completion inside condition
  subqueries on valid text. It is not a grammar item.

### Platform reprobe on a live 1C base (2026-09-27)

**Setup**
- Base: a copy of a working configuration on БСП 3.1.3, 1C:Enterprise 8.3 web
  client (build number not recorded).
- Accessed through the base's "Консоль запросов" in the in-app browser, after
  the user signed in.
- Read-only `ВЫБРАТЬ` statements only; nothing was saved or written.
- **Acceptance** comes from executing the query: a result means valid, a
  `Syntax error` / `Wrong parameters` / `Name expected` message means invalid,
  and `Table not found` / `Field not found` means metadata-unresolved.
- **Canonical text** comes from the platform's own query wizard ("Конструктор
  запроса…" → More actions → Query), which was then closed without applying.

**Metadata substitutions.** This is a different configuration from the corpus,
so several objects were replaced. Each substitution is recorded per row in
`stage-0/platform-reprobe-results.jsonl`:

| Corpus object | Replaced by |
|---|---|
| `РегистрНакопленияОбор` | `АктивированныеПромокоды` |
| `РегистрНакопленияОст` | `БезнадежнаяЗадолженностьКонтрагентовНеРаспределенная` |
| `ГруппыДоступа` | `ИдентификаторыОбъектовМетаданных` |
| `Наценка` | `КурсыВалют.Курс` |

**Results (25 cases)**

| Verdict | Count | IDs |
|---|---|---|
| valid | 13 | RP01-RP03, RP06-RP08, RP13, RP14, RP18-RP21, RP25 |
| invalid | 10 | RP04, RP05, RP09-RP12, RP15-RP17, RP23 |
| syntax-valid, metadata-unresolved | 1 | RP22 |
| unknown (metadata absent) | 1 | RP24 |

**Canonical-text comparisons** (`oursEqualsPlatform`)

| Case | Match? |
|---|---|
| RP01 | **no** (P0-Critical) |
| RP02 | **no** (P0-Critical) |
| RP06 | **no** (we reject the input) |
| RP19 | yes |
| RP21 | yes |
| RP20 | yes with resolver, **no** without |

### Stage 0b exit and cleanup

**Exit criteria**

| # | Criterion | Status |
|---|---|---|
| 1 | External grammars pinned | done (A, `environment.json`) |
| 2 | Whole corpus run at package level | 2373 packages |
| 3 | Three axes for every case | yes, in `results.jsonl` |
| 4 | Confirmed separated from candidates | 0 confirmed; 25 in the reprobe queue |
| 5 | Tree-sitter never used as validity evidence | yes |
| 6 | Silent changes checked by methods 1-3 in order | yes (J) |
| 7 | Opaque not reported as structured | yes (I, K) |
| 8 | Recovery baseline by probes | yes (0a, section E) |
| 9 | External sources with licenses | yes (L) |
| 10 | No production changes | only `docs/development/audits/**` and one index link |
| 11 | Every number reproducible | `summary.json` is regenerated by `probes/summarize.ts` |

**Cleanup of temporary tooling** (after the run, 2026-09-27)

Removed from the scratch directory:
- the tree-sitter CLI 0.25.10 install
- the `alkoleft/tree-sitter-bsl` checkout
- the natively compiled `sdbl.dylib`
- competitor clones (`bsl-parser`, tormozit, codemirror)
- temporary input files and the CLI config

Also removed: `~/.cache/tree-sitter`, which the CLI created during the run and
which held only an empty `lock` directory.

Not removed: npm's content-addressed download cache (`~/.npm/_cacache`) still
holds the `tree-sitter-cli` tarball. It is outside the repository, is not
installed anywhere, and could only be removed by clearing the whole npm cache.

**Repository state**
- `package.json`, `package-lock.json`, `node_modules` and the existing
  `web-tree-sitter` devDependency are unchanged.
- No tree-sitter CLI, native grammar, WASM or build artifact exists in the
  repository, and no new runtime, extension or CI integration was added.
- Tree-sitter-related files remaining in the repository are text only. The
  grammar SHA, CLI version and commands appear in `environment.json` and this
  page. `results.jsonl`, `construct-probes.jsonl` and `summary.json` record
  tree-sitter acceptance per case. `probes/differential.ts` needs the CLI and
  documents it as an external prerequisite that it never installs or vendors.
  `applyGate.ts`, `buildReprobeQueue.ts` and `summarize.ts` only mention it in
  comments.
- External corpus text is not stored. External rows carry ids, hashes and
  verdicts. The only vocabulary recorded from them is function names inside
  construct counts.
