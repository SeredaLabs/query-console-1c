# Review request (v3): SemanticIndex architecture for a future SDBL semantic layer

This is a third review pass. Two prior passes critiqued earlier versions of
this same design; both critiques were verified (several claims checked
directly against the parser source, not accepted on faith) and folded in.
The most recent pass ended in near-total convergence — please critique THIS
version, not the earlier ones, and focus on what's actually still open
rather than re-litigating settled points (marked below).

## Context

`query-console-1c` is a VS Code extension for 1C:Enterprise/BAS. It has a
mature, corpus-proven SDBL (1C's SQL-like query language) parser/generator
(`src/core/query/sdblParser.ts`, ~5200 lines; `sdblGenerator.ts`, ~3200 lines;
`exprFormatter.ts`, ~5000 lines) whose entire job is: parse a query-text
literal embedded in `.bsl` source into a `QueryModel`, let a visual
constructor UI edit that model, regenerate text that matches the REAL 1C
platform's own canonical output byte-for-byte. This is gated by a golden
regression corpus of 1976 committed queries (full corpus 17933) — any change
to `sdblGenerator.ts`/`exprFormatter.ts` risks silently regressing formatting
fidelity against a closed-source, undocumented pretty-printer, so changes
there require full corpus-parity proof.

`QueryModel` today has ZERO position information (no `pos`/`line`/`col` on
any node — verified via grep), and expressions
(`SelectedField.expression`/`Condition.expression`/etc.) are opaque strings,
not a structured AST. Field-path/alias resolution for hover/completion
currently works via a flat, first-match lookup across the whole query batch
(`hoverFieldInfo.ts`) — a documented, publicly-known limitation
(`docs/development/known-issues.md`, `docs/{en,ru,uk}/limitations.md`).
Hover/completion ALSO already has a real, shipped recovery mechanism
(`repairSelectListsForRecovery`, v0.1.33) for queries broken by something as
mundane as one missing comma — built after a real user's hover/completion
silently stopped working entirely on an otherwise-fine query. Any future
replacement must not regress this.

This is a **long-term, explicitly deferred** plan — nothing below has been
implemented. The goal of THIS review is to critique the plan before any of
it starts.

## Settled — please don't re-litigate these

- **Node identity is per-snapshot only, not cross-reparse.**
  `SelectedTable.id = 't' + index` (`sdblParser.ts:1902`) is deterministic
  within one parse but NOT stable across reparses (verified directly).
  Given `SemanticSnapshot { documentVersion, sourceHash, model, index }` is
  always built/discarded together (no incremental cache, no rename session,
  no cross-version diff anywhere in this plan), identity only needs to
  survive within one snapshot. `type SemanticNodeId = number`, generated
  fresh per snapshot; `ModelRef { kind; path: ModelPath }` structurally
  meaningful only inside the current snapshot.
- **Source-location side-channel is shaped as a context object, not a raw
  callback**, matching an existing precedent already in this exact parser:
  `SectionResolveContext`, threaded via `inheritedSectionCtx?`/`ctxOut?`
  params (`sdblParser.ts:607-608,910-919`). So: `interface ParseContext {
  tokens; sourceMap?: SourceMapSink }` with `SourceMapSink.record(kind, ref,
  startToken, endToken)`, not `onNodeParsed?: (event) => void` threaded
  individually through every function signature. Same invariant either way:
  sink absent ⇒ byte-identical old-parser behavior — but this must be
  PROVEN on the real corpus via a dedicated source-map oracle test suite
  (range containment within the query's own bounds, `source.slice(range)`
  actually matching the construct that produced the `ModelRef`, sibling
  ranges never overlapping, correct nesting) — NOT just "corpus stays
  green" (text-round-trip parity is orthogonal to range correctness; a
  systematically swapped pair of sibling ranges would never show up in a
  text-diff-based test).
- **Temp tables (`ПОМЕСТИТЬ`/`ДОБАВИТЬ`) need a separate `BatchEnvironment`
  concept, not the same `Scope` tree as everything else.** Verified
  directly: `sdblParser.ts:4975-4986` (`parseBatch`) accumulates
  `tempTables = new Map()` STATEMENT-BY-STATEMENT in source order, passed
  forward to each subsequent statement — a sequential, mutable,
  order-dependent registry, fundamentally different from a parent→child
  scope tree. Scoped down to just enough sequential source-visibility to
  answer "is this temp-table alias in scope at this position" — not full
  `ПОМЕСТИТЬ`/`ДОБАВИТЬ` schema tracking (that's out of scope for this
  phase entirely).
- **Visibility-rule scope splits into `Phase 2a` (core, blocks the
  resolver) vs `Phase 2x` (extended, doesn't block it)**, converged on by
  both review passes independently. The concrete test for what belongs in
  2a: a rule belongs in core only if `resolveAliasAt(position)` cannot give
  a correct/fail-open answer without it.
  - **2a (core)**: FROM aliases, JOIN aliases including the multi-JOIN
    chained-`ПО` case (see open question 1 below), subquery-local aliases,
    correlated access to outer aliases, UNION-member sealing, temp-table
    sequential visibility (`BatchEnvironment`, scoped as above).
  - **2x (extended, its own later sub-phase)**: SELECT output-alias
    visibility in `УПОРЯДОЧИТЬ`/`ИМЕЮЩИЕ`/`ИТОГИ`, virtual-table argument
    resolution, `&Параметр` binding.
- **Shadow-mode migration needs disagreement CLASSIFICATION, not a raw
  rate, plus a separate curated oracle.** A raw "N disagreements out of
  10,000" number is a bad gate on its own — it can't distinguish "new
  resolver found something old one missed" from "new resolver confidently
  resolved the wrong table." Classify: same-resolved /
  different-resolved [needs review] / old-resolved-new-ambiguous /
  old-resolved-new-unknown / old-unknown-new-resolved. Judge correctness
  only against a SEPARATE, small, curated, manually-verified fixture set —
  the large corpus can only discover disagreements, never adjudicate who's
  right (same two-tier pattern as the existing golden-corpus +
  `test/fixtures/oracle/*.json` split used for parser/generator work).
  Start shadow instrumentation DURING resolver development (rule by rule),
  not only once the whole resolver is "done."
- **A second architecture invariant beyond import-direction: semantic
  analysis failures are values, never exceptions that reach
  `parseBatch`/`generateBatch`.** The analyzer can fail/crash internally, a
  provider can catch and fail-open, but the round-trip engine must never
  even know `SemanticIndex` exists, let alone be affected by its failures.
  Add this to the negative-architecture-test list alongside the
  import-direction check.
- **`SemanticCompleteness = 'complete' | 'recovered' | 'partial' |
  'unavailable'`** formalizes the tolerant snapshot from Phase 1c, letting
  different consumers (completion vs. diagnostics) apply different trust
  thresholds to the same snapshot.
- **Don't over-plan Phases 4+ in detail right now.** Treat them as a
  direction, not a committed roadmap — what Phase 3f (the FieldPathResolver
  integration) actually reveals about real SDBL semantics may make a
  different next feature more valuable than the originally-listed
  expression AST. Re-evaluate after 3f.
- Everything from the first review pass not superseded above: DBeaver/
  DataGrip/mssql reference points, the `SemanticIndex` shape (scopesById/
  symbolsById/nodesByRef/referencesBySymbolId/rangeIndex), `Resolution<T>`,
  `SemanticIndex` never becoming a second `QueryModel`, snapshot discipline
  reusing `insertResult.ts`/`queryDiagnosticsController.ts`'s existing
  staleness pattern, expression-AST decoupling from round-trip.

## The proposed architecture (unchanged shape, see "Settled" for what's inside it)

```text
                   QuerySnapshot
                  /             \
          QueryModel          SemanticIndex
             │                    │
             │                    ├─ scopesById
             │                    ├─ symbolsById
             │                    ├─ nodesByRef (ModelRef → SemanticNode[])
             │                    ├─ referencesBySymbolId
             │                    └─ rangeIndex (position → nearest node)
             │
             └──── ModelRef (per-snapshot only) ────┘
```

`src/core/query` keeps its corpus-proven round-trip behavior untouched — the
actual protected asset, not "zero source-file changes" as a literal rule. A
new, parallel `src/core/semantic` reads `QueryModel`, raw source text, and
the optional `ParseContext.sourceMap` side-channel, producing a derived
`SemanticIndex`. The generator never reads anything from `src/core/semantic`.

### Current phase breakdown (all still deferred, not started)

```text
Phase 1a  SemanticSnapshot lifecycle + dependency-direction boundaries,
          INCLUDING the exception-safety invariant (analyzer failures are
          values, never exceptions reaching parseBatch/generateBatch) —
          negative architecture tests written FIRST
Phase 1b  ParseContext.sourceMap side-channel + a DEDICATED source-map
          oracle test suite (range containment/non-overlap/nesting
          invariants — fixtures: repeated identical expressions, nested
          subqueries, UNION, joins, virtual-table params, temp tables,
          comments) — not just "corpus stays green"
Phase 1c  Tolerant/recovered/partial snapshot semantics
          (SemanticCompleteness enum) + cancellation/staleness guards —
          BEFORE any hover/completion migration
Phase 2a  CORE name-visibility spec + oracle fixtures against real 1C
          (FROM/JOIN incl. multi-JOIN chained-ПО/subquery/correlated-outer/
          UNION/temp-table sequential visibility) — blocks 3b
Phase 2b  Lexical scope implementation (from 2a)
Phase 2c  Batch temporal environment (BatchEnvironment, scoped to
          source-visibility only, not full temp-table schema semantics)
Phase 3a  Alias/source symbols (per-snapshot SemanticNodeId)
Phase 3b  resolveAliasAt(position) → Resolution<T>, WITH shadow-mode
          instrumentation (disagreement classification + curated oracle)
          running continuously DURING development, not as a separate later
          phase
Phase 3d  Migrate hover (queryHoverProvider.ts) onto the new resolver
Phase 3e  Migrate completion (queryCompletionProvider.ts)
Phase 3f  Wire in the existing FieldPathResolver kernel incrementally
--- STOP AND RE-EVALUATE what Phase 4+ should actually be, informed by
    what 3f revealed about real SDBL semantics — do not commit further
    than this without re-planning first ---
Phase 2x  (later, own sub-phase, sized once there's real experience from
          2a-3f) Extended name visibility: SELECT output-alias visibility
          in УПОРЯДОЧИТЬ/ИМЕЮЩИЕ/ИТОГИ, virtual-table args, &Параметр
```

## What's still genuinely open — please focus here

1. **The multi-JOIN chained-`ПО` visibility question itself, not just
   whether it belongs in scope.** Both prior review passes agreed this
   belongs in `Phase 2a` (verified: `sdblParser.ts`'s JOIN-condition parsing
   — `JOIN_COND_STOP`, `STD_JOIN_OPERATORS`, dispatch around lines
   1920-1993/3129-3295 — is purely syntactic today, resolves nothing, so
   this is a genuinely open design question, not one the code already
   answers). Concretely: given
   `ИЗ A ЛЕВОЕ СОЕДИНЕНИЕ B ПО Б.X=А.X ЛЕВОЕ СОЕДИНЕНИЕ C ПО В.Y=Б.Y`, does
   the SECOND `ПО` see only `Б` (immediately preceding), or `А` and `Б`
   both? What's the actual real-1C answer here (not a guess), and does it
   generalize simply ("every `ПО` sees every FROM/JOIN source declared
   before it in the same statement, full stop") or are there exceptions
   (e.g. does join order in the generated/round-tripped text ever get
   reordered by the constructor UI in a way that would change this
   answer)?
2. **Is `Phase 2c`'s narrowed scope ("only insofar as it affects
   `Alias.Field` source resolution") actually cheaper to build than full
   temp-table semantics, or does answering "is this temp-table alias in
   scope here" already require most of the same batch-order bookkeeping
   that full schema tracking would need anyway** — i.e. is this a real
   scope reduction or just deferred column-shape tracking with the harder
   "is it visible at all" part kept?
3. **`ParseContext.sourceMap` threading risk.** Is an optional field on a
   context object, threaded through a ~5200-line recursive-descent parser,
   actually safe from subtle behavioral coupling via shared mutable state or
   ordering-dependent side effects when the sink IS present — even though
   "sink absent ⇒ unchanged" is easy to prove, "sink present ⇒ doesn't
   perturb parsing order/decisions" needs its own argument, not just an
   absence proof.
4. **Shadow-mode's actual go/no-go threshold.** Classification into buckets
   is now specified, but what CONCRETE criterion (e.g. "zero
   different-resolved-and-wrong cases across N corpus runs plus the full
   curated oracle set, sustained across M consecutive days of shadow
   running") gates the actual Phase 3d/3e cutover? "Until confidence is
   established" is still a judgment call, not a checkable gate.
5. Anything else underspecified, overconfident, or likely to bite whoever
   implements this, given everything above — including whether the phase
   list's sizing (e.g. treating 2a as one phase despite covering 6+ distinct
   scoping rules each needing real-1C verification) still risks hiding
   complexity behind a deceptively simple-sounding name, the same failure
   mode already caught and corrected twice in this plan's history.

Be concrete and cite specifics rather than general principles. This project
verifies claims against real code before trusting them — if you assert
something is a problem, describe the exact scenario that would trigger it.
