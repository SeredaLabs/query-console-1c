# Performance

Metadata import, cache loading, WebView payload size, and corpus parse/generate
time are the relevant workloads. Use `npm run bench:metadata` for the maintained
metadata benchmark and record the machine, data set, Node version, repetitions,
and before/after measurements.

Do not optimize from arbitrary thresholds. Profile the user-visible workload,
make the smallest relevant change, and re-run the same measurement plus the
regression gate.

Editor diagnostics (`npm run bench:diagnostics`) re-check a `.bsl` module after each
edit. Baseline measured 2026-10-25 with C49, C41 stage 1 and stage 1b together (Apple M1,
Node 25.8.2, the 200 largest valid golden queries as BSL literals, 705 KB, corpus
metadata; medians and p95 of 21 alternating runs, 3 runs each). On `main` before C41 1b
every pass, including one after an edit outside the queries, re-parsed every literal
(~490 ms). Now the result of a literal is reused by its exact text and the field check
by the resolver object (`QueryProblemsCache`, ~3 MB for that module):

| Pass | Median | p95 |
|---|---|---|
| First pass without metadata | ~503 ms | ~530 ms |
| First pass with metadata (parsing is 68% of it) | ~553 ms | ~590 ms |
| Edit inside one query | ~34 ms | ~35 ms |
| Edit outside the queries (the literal scan) | ~14 ms | ~15 ms |
| Repeat without a change (the controller skips it) | ~14 ms | ~15 ms |
| Metadata update (field check only, raw expression text included) | ~62 ms | ~66 ms |

With C41 stage 2 (nested scopes and raw-text subqueries; 2026-10-26, same set-up,
clean runs): first pass with metadata ~559 ms (p95 ~572), edit inside a query ~33 ms,
outside ~14 ms, metadata update ~70.5 ms (p95 ~74) — the added nested-scope checks.
Parses of raw-text subqueries are shared with the C48 check and kept per literal, so
a metadata update does not parse them again (without that, ~103 ms in the prototype).
Open and Apply have no cache: there the raw subqueries are parsed per call (~0.2 ms per
query of the 200 largest).

The field check no longer lexes the query text again (`validateBatchSemantics` lexes it
only to place a «table not found» error). Going below the first pass would need
incremental parsing of a literal's text; not attempted.

The consolidated JSON model cache (`modelCache.ts`, mtime-invalidated against
the YAML source) exists because a cold metadata rebuild across many YAML files
was measured as dramatically slower than serving an already-built cache — the
original numbers motivating it are historical (see below) and have not been
re-measured against the current direct-XML-snapshot primary path
([0003](decisions/0003-metadata-source-of-truth.md)); re-run
`npm run bench:metadata` before citing a specific factor as current.

The point-in-time baseline captured before documentation consolidation is
historical evidence, not current promises, and is no longer kept in the
repository — see git history at or before the `pre-docs-history-cleanup` tag
if the original numbers and methodology are needed.

The Graphify navigation experiment (2026-10-20) did not demonstrate an advantage
over targeted `rg` in the three tested development scenarios. Maintaining the
index added infrastructure, and call edges alone missed dependencies represented
by imports or runtime callbacks. The project integration was removed; the
[compact AI context](ai-context/README.md) remains as source-navigation guidance.
Context bytes were a proxy, not measured token savings. Historical implementation
and measurements remain in Git at `3b8962b`.
