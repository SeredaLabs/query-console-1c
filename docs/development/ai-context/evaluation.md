# Graphify evaluation — 2026-10-20

Measured locally on main `38dc48e`, with this navigation tooling uncommitted,
Graphify 0.9.92, four extraction workers. These are observations, not performance
requirements. The pre-existing R11 ledger edit was preserved.

## Coverage and cost

| Measurement | Result |
|---|---|
| Scanned supported files | 563: 464 TS, 77 TSX, 5 MJS, 3 Python, 2 shell, 12 JSON |
| Scope by main directory | src 252; test 265; tooling 29; scripts 5; bench 1; root configs 11 |
| Files represented by graph nodes | 556; all 249 non-JSON source files under src |
| Missing from node representation | 7 flat JSON data dictionaries: root package.nls ×3, WebView i18n ×3, tooling captions |
| No-symbol warning | 69 scanned files; many tests have only a file node, not modeled test callbacks |
| Graph | 3,506 nodes; 12,780 edges |
| Graph JSON size | 4,210,804 bytes (4.21 MB decimal) |
| Local output with caches / measurements | About 4.6 MB; local only, grows with cache history |
| Clean build, separate empty output directory | 5.367 s |
| Existing-output refresh, changed verification script | 5.221 s |
| No-change adapter update | 0.355 s; graph not rewritten |
| Clean versus refreshed graph | Identical normalized node/edge sets |

The installed dispatch registry supports additional languages, including
Go/Rust/Java/C#/C++/SQL and Markdown. They are not part of this tested scope.
No semantic LLM extraction ran; Graphify reports zero LLM input/output tokens.
That does **not** measure the AI agent's conversation token consumption.
SDBL/BSL, YAML/XML fixtures, documentation and generated artifacts are outside
this structural graph. See [scope and limits](graphify.md).

## Correctness

Independent TypeScript compiler parsing of **12 selected modules** found 73 local
relative imports: Graphify had all 73, with zero missing or extra file edges.
Modules: QueryTextDialog, openDesignerBatch, applyGate, computeBatchText,
queryAnalysisService, producerColumns, tempTableLifetimes, tempTableSemantics,
queryStore/snapshots, panel, insertResult, buildSemanticSnapshot.

Seven source-verified direct calls were present: analyze → tryOpenBatch;
tryOpenDesignerBatch → tryOpenBatch / generateBatch; decideApply →
validateBatchText / parseBatch; deriveProducerColumns → deriveProjectionFacts;
deriveTempTableLifetimePositions → advanceTempTableRegistry.
This is a bounded sample, **not** 100% accuracy for the repository call graph.
There are zero dangling edge endpoints and 45 self edges; no claim that those
self edges are all recursion. Raw extraction retains relation distinctions;
Graphify deduplicates repeated `(source, target, relation)` occurrences, so this
is not a per-call-site graph.

`python3 scripts/verify-architecture-index.py` compares every fixture state with
a clean build:

| Transition | Native incremental merge | Adapter's full-resolution policy |
|---|---|---|
| No changes | Matches | Matches |
| Changed import and call | Matches | Matches |
| Deleted export, unchanged caller | **Extra edge** | Matches |
| Renamed file, old unresolved import | **Extra/missing nodes and edges** | Matches |
| Updated import after rename | Matches | Matches |
| Added caller | Matches | Matches |
| Deleted file, surviving importer | **Mismatch** | Matches |
| Switch back to baseline branch | Matches | Matches |
| Switch forward to changed branch | Matches | Matches |

All nine safe outputs matched. The actual adapter also passed missing-index,
freshness, no-op/no-rewrite, edited-file invalidation, stale-query refusal,
update, bounded query and HEAD-only invalidation checks.
TS/JS cache bypass is built into Graphify 0.9.92; the chosen update policy
re-extracts those files. It trades roughly five seconds per explicit changed
update for consistency. No custom dependency invalidation was implemented.

## Navigation comparison

Same three tasks, same source verification excerpts in both arms.
A = `rg -n PATTERN src test`, then source excerpts.
B = quick map + one subsystem route + bounded Graphify queries, then the same
source excerpts. Each query uses `--context import --budget 700`.
Bytes are UTF-8 output delivered as context, **not measured tokens**.
Times are median of three command runs (sum of medians for two queries);
they exclude human/model reasoning and build time. Documentation byte counts
are included in B; already cached conversation context could change the result.

| Task | Source files read A / B | A context bytes | B context bytes | A / B discovery time |
|---|---:|---:|---:|---:|
| Query Text → analysis → Designer acceptance | 4 / 4 | 30,156 | 18,645 | 0.015 / 0.547 s |
| Safeguards before editor write | 5 / 5 | 38,712 | 22,191 | 0.015 / 1.084 s |
| Temp-table schema/lifetime consumers | 5 / 5 | 22,774 | 24,813 | 0.014 / 1.079 s |

Discovery output referenced 56/13, 73/41 and 7/20 unique source paths in A/B;
these are **not** counts of whole files read. All B queries had bounded-output
truncation, so their smaller result cannot be treated as complete impact
analysis. Source verification remains necessary. The maps supply runtime
routes that static Graphify edges alone cannot establish.

Reproduction search patterns and seeds:

| Task | A pattern | B seeds |
|---|---|---|
| Query Text | `QueryTextDialog\|queryAnalysisService\|handleApplyQueryEdit\|tryOpenDesignerBatch` | `src/webview/components/QueryTextDialog.tsx` |
| Editor writes | `decideApply\|insertText\|ApplyBaseline\|insertResult` | `decideApply`, `ApplyBaseline` |
| Temp tables | `deriveProducerColumns\|deriveTempTableLifetimePositions\|advanceTempTableRegistry\|newestLifetimeAt` | `deriveProducerColumns`, `deriveTempTableLifetimePositions` |

Pass the patterns to `rg` with plain `|` alternation (the table escapes are
Markdown syntax). Source windows at this revision:

- Query Text: QueryTextDialog 75–150, queryAnalysisService 180–235,
  ConstructorView 150–185, openDesignerBatch 1–60.
- Editor writes: applyGate 65–100, WebView App 95–135, panel 180–195,
  applyBaseline 1–120, insertResult 1–140.
- Temp tables: producerColumns 1–90, tempTableLifetimes 1–90,
  tempTableSemantics 1–95, queryStore/snapshots 185–240, sdblParser 5630–5700.

These routes are known in advance: this is a reproducible navigation experiment,
not a blind independent-agent trial. It does not establish faster end-to-end
reasoning or fewer mistakes in future sessions.

**Efficient-search control:** using `rg -l` instead of line output reduces A
to **14,938 / 16,377 / 16,348 bytes**, smaller than B in all three cases.
Thus Graphify reduced context by 38% and 43% against line-heavy search in the
first two scenarios, increased it by 9% in the third, and did **not** beat
well-targeted filename search. It did not reduce mandatory source reads.

Practical decision: keep the compact routes and optional native bounded queries;
use `rg` when names are known. Do not enforce graph-first work, add an agent
framework, community wiki, watcher or automatic rebuild. A universal token
saving or navigation speedup is **not demonstrated**. The reusable graph is
useful as an additional view of unfamiliar neighbors, with explicit limits.

Local detailed results are in ignored `graphify-out/*evaluation.json`,
`import-accuracy.json` and `incremental-verification.json`; this document keeps
the reviewable measurements without committing the graph.
