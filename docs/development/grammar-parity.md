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
| `title` | One-line description of the construct or question |
| `scope` | `in`, `out` (with the deciding rule) or `pending` |
| `source` | How the entry entered the catalog (e.g. `stage-0-platform-reprobe`, `1c-reference`, `edt-model`, `corpus`, `external-grammar`, `audit-probe`) |
| `origin` | Case ids behind the entry (probe, fixture, external corpus id) |
| `evidenceRef` | Repository path (and `#id`) of the platform result |
| `platformStatus` | `valid`, `invalid`, `unknown` (probed, inconclusive) or `unattested` (not probed) |
| `platformBuild` | Exact build, or `unknown` for evidence recorded without one |
| `platformMethod`, `platformDate` | How and when the platform result was obtained |
| `oursStatus` | `accepts` (opens without refusal) or `rejects` |
| `roundTripStatus` | `stable` (second pass reproduces the first), `unstable`, `not-applicable` (rejected) |
| `canonicalStatus` | `matches` / `differs` from the recorded platform canonical **query text**, `not-recorded` (no text recorded; a prose description is not evidence of text equality), `not-applicable` |
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
