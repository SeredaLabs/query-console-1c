# SDBL grammar parity audit: proposal for the Query Core v1 gate

Status: PROPOSED, not started; the scope decisions below were accepted in
review on 2026-10-04. This document plans an audit; it changes no code, status
or priority. The [ledger](../technical-debt.md) remains the status authority;
the decisions and findings move there as C/U items in a separate change.

## Goal and exit criterion

Query Core v1 gate:

> **0 known platform-valid grammar gaps across the reviewed SDBL construct
> catalog, with every catalog entry carrying source/provenance and platform
> evidence where required.**

This is a correctness requirement, not an optional quality goal, and it is
separate from V2: external grammars only help find candidates.

The claim is deliberately bounded. It does not say "the whole 1C grammar is
proven"; that cannot be shown. It says that after a systematic, independent
audit no platform-valid gap is known. "0 known gaps" is therefore only as
strong as the catalog behind it, and the gate reports it together with
**coverage confidence**:

| Coverage confidence signal | Required for the v1 claim |
|---|---|
| Catalog sources | Every section of the 1C query-language reference and the EDT query wizard model is walked and recorded as covered, out of scope or pending; external grammar rule names and real-code corpora are cross-checked |
| Entry provenance | Every catalog entry names its source (reference section, Designer output, EDT, corpus, external grammar, audit probe) |
| Platform evidence | Every entry whose status matters for the gate (in-scope valid, any ours/external disagreement, any canonicalization claim) has a platform result with build, method and date; the rest are marked unattested |
| Pending entries | Zero in-scope entries left pending at exit; each remaining unknown is a U item with a stated boundary |
| Review | The catalog is reviewed as a whole before exit; a construct missing from it is an audit gap, not a pass |

A small catalog with zero gaps is a weak result and must be reported as such,
not as parity.

| Authority | Role |
|---|---|
| 1C Platform / Query Designer | Authoritative for platform acceptance and canonicalization |
| External grammars (tree-sitter-bsl, bsl-parser ANTLR, Lezer) | Development-only differential signals (V2); never a verdict |
| Our parser / generator / QueryModel | The Query Core under test; never replaced by an external grammar |

Three metrics are tracked separately and never merged into one score:

| Metric | Definition | v1 target |
|---|---|---|
| **Syntax coverage** | 1C accepts → ours parses and opens without refusal | 0 known gaps in scope, except constructs explicitly excluded from v1 by a recorded decision |
| **Round-trip coverage** | ours parses → QueryModel → generate → parse | 0 semantic/data loss and stable second pass for supported constructs; output equals platform canonical text wherever it is recorded ([ADR 0004](../decisions/0004-querymodel-round-trip-contract.md)) |
| **Over-acceptance** | 1C rejects → ours accepts | Not a grammar gap. Governed by the C5 contract: rejected on open or Apply blocked. Reported, not part of the exit criterion |

## Current evidence baseline

**Stage 0 differential, external test corpora:** 5 packages tree-sitter-only →
4 constructs, all platform-checked
([results](stage-0/platform-reprobe-results.jsonl)).

| Construct | Packages | 1C | Outcome |
|---|---|---|---|
| RP06 English SDBL | 1 | valid | Syntax gap → C2, OPEN · P1 |
| RP08 `ИЕРАРХИЯ УБЫВ` | 1 | valid | Syntax gap → C3, CLOSED |
| RP09 two `ИТОГИ` | 2 | invalid | Tree-sitter over-acceptance; our rejection is correct |
| RP10 bare keyword alias `Ссылка` | 1 | invalid | Tree-sitter over-acceptance; our rejection is correct |

Half of the external grammar's disagreements were real gaps and half were its
own errors. That ratio is why disagreements go to the platform, never straight
to code.

**Stage 0 audit probes** (113, [construct-probes](stage-0/construct-probes.jsonl))
repeat the same constructs (O04, T04, X01, X02) and add:
- `neither`: J07 parenthesized nested join (RP16, platform-invalid) and X03
  English DROP (C2 class);
- `ours-only` without platform status: S05 modifier order, E14 cast with
  dereference, E29 tuple IN subquery, G03 grouping sets, T01 `ИТОГИ ПО ОБЩИЕ`,
  P01 temp table + drop, X05 `#Имя`, X06 `{ГДЕ …}`. E30 is attested invalid
  (RP15). These are over-acceptance candidates, not syntax gaps.

**Platform build:** RP01–RP25 record no exact platform build (neither do the
C3/C4 live observations). They stay valid evidence; Phase 1 records them as
"modern 8.3, build not recorded" and captures the build for every new probe.

**Re-probe of the 25 platform verdicts on main (85e3414):**
- RP06/RP07 are still rejected (C2).
- RP08, RP13 and RP14 were re-run and produce the recorded canonical text.
  RP01–03 are covered by `fullNameQualification.test.ts`, which passes.
- RP11, RP17 and RP23 are now rejected on open. RP15 is accepted on open, but
  the generated text fails reparse, so Apply is blocked.

**Repository corpora:**
- 1976 golden packages, platform-recorded and 100% accepted by ours: 601
  SUPPORTED, 1375 RECOVERED (at least one raw/custom slot), 0 UNSUPPORTED.
- Limits:
  - one BSP-based configuration;
  - positive-only;
  - no English;
  - no per-entry platform build;
  - the private 17933-query corpus is not available.

  A 100% acceptance rate on this corpus therefore says little about grammar
  completeness ([Stage 0 L](stage-0.md)).

**Structural limit of fuzzing:** a fuzzer driven by our own grammar only
generates what we already accept. It measures round-trip coverage. It cannot
discover syntax gaps. Syntax gaps come only from sources independent of our
parser:
- the 1C syntax reference;
- Query Designer output;
- real configuration code;
- EDT;
- external grammars.

## Scope: "Query-Designer-relevant"

Core v1 = ordinary SDBL as opened by the 1C Query Designer: query text as
assigned to `Запрос.Текст`. Concretely:
- batch packages with `;`, `ПОМЕСТИТЬ`, `ИНДЕКСИРОВАТЬ ПО` and `УНИЧТОЖИТЬ`;
- SELECT modifiers;
- all source kinds, including virtual table parameters, nested queries and
  temp tables;
- joins;
- the complete expression/condition language, including functions, `ВЫБОР`,
  `ВЫРАЗИТЬ`, `ССЫЛКА`, `В ИЕРАРХИИ`, `ПОДОБНО … СПЕЦСИМВОЛ`, tuples and
  subqueries;
- grouping and grouping sets, HAVING, UNION / UNION ALL;
- ORDER with hierarchy and auto-order, TOTALS, `ДЛЯ ИЗМЕНЕНИЯ`;
- characteristics;
- English syntax (C2).

### Scope decisions (accepted in review, 2026-10-04)

1. **Platform version.** Core v1 is not tied to one 8.3.x build.
   - Every probe records the exact platform build.
   - A construct confirmed on a supported modern 8.3, with no evidence that it
     is version-specific, is part of SDBL.
   - Behavior that differs between versions is recorded as a separate
     compatibility fact and is never a reason to narrow the grammar.
   - The first phases use the platform instance behind RP01–RP25; no
     multi-version matrix.
2. **DCS braces `{…}`: out of scope for Core v1 grammar parity.** They are a
   data-composition (СКД) extension over the ordinary query model, consistent
   with the EDT split.
   - A future DCS layer gets its own coverage contract.
   - Current behavior on such text is unchanged by this audit.
3. **Template markers `#Имя` (U1): syntax in scope, substitution semantics
   UNKNOWN.**
   - Parse and preserve are required: if the platform/Designer accepts the
     construct, ours must not fail only because of `#Имя`.
   - No interpretation or transformation is invented before platform evidence.
   - Where safe Apply cannot be guaranteed without understanding
     substitution, Apply is blocked.
4. **English SDBL (C2): in scope, P1.** Core v1 does not ship with this known
   platform-valid gap (RP06/RP07 are direct evidence). It is implemented after
   or together with the A1 token-identity work, not as another layer of
   contextual-keyword special cases.

Out of scope: DCS `{…}` (decision 2), dynamic BSL text assembly, query
execution and database values.

## Pipeline

```text
construct catalog (scope above)
   ↑ sources: 1C syntax reference sections, Designer output, EDT query wizard API,
   │          external grammar rule names (own examples, no copied text),
   │          existing corpora and Stage 0 probes
   ↓
candidates: catalog examples + corpus + mutation fuzz + grammar fuzz
   ↓
Query Core: parse → open gate → model → generate → parse
   ↓                                   ↘ (opt-in V2) external grammars
classification per construct key: ours × external × round-trip
   ↓
deduplicated interesting set:
  ours rejects / refuses open            (syntax-gap candidate)
  round-trip changed / unstable / lossy  (round-trip candidate)
  ours accepts, external rejects         (over-acceptance candidate)
   ↓
selected live 1C verification (validate_query via oracle:reprobe; Designer
canonical text via the real-constructor driver where canonicalization matters)
   ↓
attested result → regression corpus
  valid   → positive attested suite (+ canonical when recorded) and a C item if ours fails
  invalid → negative attested suite (C5 contract) and an "external over-acceptance" note
```

The construct catalog is the central artifact. It is a committed manifest. Each
construct record holds:
- id, category and a minimal original example;
- relevance (in / out / decision-pending);
- platform status (valid / invalid / unknown), with platform build, method,
  date and the path to the result file;
- ours status (parse, open, round-trip);
- the linked ledger item, if any.

External corpora stay outside the repository; only ids and hashes are recorded,
as in Stage 0.

## Candidate generation

| Source | Measures | Notes |
|---|---|---|
| Golden / meta1c / oracle / queries corpora | Round-trip; regression | Already gated; keep byte-identical |
| Catalog examples | Syntax and round-trip per construct | One minimal case per construct plus nesting variants (top level, nested source, condition subquery, UNION member) |
| Mutation fuzz over corpus | Syntax candidates and round-trip | Keyword case, modifier order, optional `КАК`, synonyms (`ЕСТЬ NULL`, `НЕ … В`), parenthesization, whitespace/comment placement (generalizing the one-off C17 token-gap fuzz, 76548/76548, not yet a committed gate) |
| Grammar fuzz from catalog | Round-trip only | Pairwise combinations of sections, modifiers and nesting; deterministic seed |
| External grammars (V2, opt-in) | Candidate signal only | Disagreements enter triage, never code directly |

## Gates

CI gates are deterministic and need no external parser, service or platform.

| Gate | Checks | Where |
|---|---|---|
| G1 Golden | 4 modes byte-identical (existing) | normal CI |
| G2 Attested-valid suite | Each platform-valid construct parses, opens without refusal, reaches a stable second pass, matches recorded canonical text, and Apply is allowed | normal CI |
| G3 Attested-invalid suite | Each platform-invalid construct is rejected on open or Apply-blocked; nothing is silently normalized | normal CI |
| G4 Round-trip fuzz | Deterministic seed. `P→G→P→G` fixed point; identifier, parameter, literal and comment multisets preserved; Boolean truth tables where applicable | normal CI (bounded size) |
| G5 Catalog consistency | Every entry has source/provenance. Every in-scope construct has a platform status (with build) or is listed as pending. Every valid construct has a G2 case. A valid construct that ours rejects must reference an open C item. Reports coverage-confidence counts (sources walked, attested, unattested, pending) | normal CI |
| External differential | V2 opt-in runner; SKIP with reason when unavailable | developer machine |
| Live 1C verification | Batched, recorded with attestation | manual / MCP |

## Phases (each a small, separately reviewable PR)

1. **Scope and catalog schema:** transfer the accepted decisions to the
   ledger/roadmap; define the catalog schema with provenance, platform-build
   and coverage-confidence fields; seed it from Stage 0 (113 probes, RP01–25)
   and the ledger. Docs and data only.
2. **Attested suites:** G2/G3/G5 over existing platform evidence. Tests only. A
   failing case becomes a C item, not a test edit.
3. **Catalog enumeration:**
   - walk the 1C syntax reference, the EDT query wizard API
     ([audit](query-core-edt-2026-10-01.md)) and external grammar rule names;
   - add unattested constructs with original examples.
4. **Fuzz:** mutation and grammar fuzz with G4; a disagreement report. Tooling
   and tests only.
5. **Platform batch:** verify the deduplicated interesting set; record the
   results. The negative attested corpus also narrows V1.
6. **Fixes:** one C item per construct, bounded, each with its catalog
   regression. C2 is handled here under its P1 priority, after the A1 token
   spike.
7. **Exit review:** report the gate together with its coverage confidence.
   - For every construct in scope, either the platform has confirmed ours
     supports it, or it is out of v1 by a recorded decision.
   - No in-scope entry is pending.
   - U1–U3 are resolved or their scope is explicitly bounded.

Phases 1–4 change no parser, generator or canonical output. Phase 6 may, but
only with platform evidence and the corpus/golden review policy.

## Constraints

- No parser rewrite.
- No switch to tree-sitter, ANTLR or Lezer.
- No external grammar text as source of truth.
- No mandatory external parser or service in install, build, normal CI, package
  or release.
- No canonical-output change without platform evidence.
- No blind golden or snapshot refresh.
- Private queries, credentials and external corpus texts stay out of the
  repository.

## Risks

- **Platform access:** the batch needs a reachable `validate_query` endpoint
  and Designer web client. Without them phases 1–4 proceed and phase 5 waits.
- **Version drift:** verdicts without a recorded platform build are weak
  evidence. Every new result records its build.
- **Catalog completeness:** the 1C reference, not our parser, defines the
  checklist. A construct missing from the catalog is an audit gap, not a pass;
  coverage confidence makes this visible instead of hiding it behind "0 gaps".
- **Triage volume:** dedupe by construct key before platform calls; fuzz false
  positives stay in reports, not in the ledger.
