# Local Graphify workflow

This optional index finds source locations and static neighbors. The
[quick map](README.md) and current [architecture](../architecture.md) describe
how to navigate; source and tests decide behavior. No application dependency,
runtime code, global agent configuration, hooks or watchers are added.

## Commands

Run from the repository with an existing `graphify` CLI on PATH:

```sh
graphify --version
python3 scripts/architecture-index.py status
python3 scripts/architecture-index.py build
python3 scripts/architecture-index.py update
python3 scripts/architecture-index.py query src/webview/components/QueryTextDialog.tsx --context import --budget 700
python3 scripts/architecture-index.py query deriveProducerColumns --context import --budget 700
```

The adapter reuses the installed CLI's Python environment; it never installs
anything. Tested with Graphify **0.9.92**. `status` exits 1 when missing/stale;
`query` refuses stale data. Freshness checks Graphify's native file manifest,
HEAD, scope/configuration, tool version and graph digest. A successful build is
stamped only after extraction; a failed run remains stale. Native detection may
refresh its local stat cache during a status check.

`update` is explicit, not scheduled. With no changes it performs no extraction.
On changes it invokes Graphify `extract --code-only --no-cluster --no-dedup
--max-workers 4 --force`. This re-resolves the entire scoped corpus. Native
incremental merge in 0.9.92 left stale edges after deleted exports, renamed
files and deleted callees; do not substitute `graphify update` without rerunning
the [verification](evaluation.md). Graphify's own caches are retained, but this
version intentionally bypasses AST cache for TS/JS. Thus changed-source updates
are **not** cheap incremental TS extraction. No custom parser or graph repair
duplicates Graphify. A commit/branch HEAD change conservatively requires refresh.

For advanced navigation after checking freshness:

```sh
graphify explain deriveProducerColumns --graph graphify-out/graph.json
graphify path tryOpenDesignerBatch tryOpenBatch --graph graphify-out/graph.json
graphify affected deriveProducerColumns --depth 1 --graph graphify-out/graph.json
```

Prefer bounded `query` output. These advanced commands may return more output;
use only for a specific symbol. `--budget` is an approximate presentation budget,
not token telemetry. Read truncation notices; narrow the seed/relation before
raising the budget. Queries load the graph inside Graphify, not into AI context.
No JSON slicing or second graph-query implementation is maintained here.

## Scope and interpretation

[.graphifyignore](../../../.graphifyignore) defines scope together with
`.gitignore`. Included: source, executable tests, tooling, scripts, bench and
relevant root JSON/configuration. The installed registry supports this repo's
TS/TSX, JS/MJS, Python, shell and JSON structurally. It also has extractors for
many other languages; their availability does not imply relevance or tested
coverage here.

Excluded: dependencies, generated bundles/harness output, build artifacts, local
agent settings, secrets, bulk fixture data, media and documentation. The local
CLI does not provide SDBL/BSL, YAML or XML code extraction; query strings and
fixtures are not a parsed SDBL graph. Current Markdown docs remain linked
authorities rather than another LLM-derived semantic layer.

`imports_from` identifies file dependencies; symbol import/call relations help
navigation. An import is not necessarily a runtime call. TS types, callbacks,
React rendering, registries and message dispatch can be incomplete or
over-approximated. In particular, inspect both ends of host/WebView messages.
Do not infer absence of consumers from a missing edge. External imports may
be stub nodes, not indexed third-party implementation.

Some test/data modules have a file node but no extracted symbols. Self edges
may represent recursion or resolution artifacts, not proven bugs. There is no
community clustering, HTML visualization or LLM semantic enrichment: none is
needed for the measured navigation tasks.

## Stored state and maintenance

`graphify-out/` is ignored by Git: native graph, manifest/cache and a small
adapter provenance stamp. It is reproducible, not a release asset. Do not commit
the large graph or load it wholesale into an agent conversation. Keep other
Graphify semantic experiments in a separate output directory; this scope is
structural only.

After changing scope, Graphify version or update policy:

```sh
python3 scripts/verify-architecture-index.py
python3 scripts/architecture-index.py update
npm run docs:check
```

Verification creates isolated temporary repositories, compares native incremental
and safe full-resolution output with clean builds, and tests the adapter's
freshness/no-op/stale-query behavior. It never switches the working repository's
branch. Review mismatches; do not hide them by changing expected graphs.

When the index has no useful answer, use targeted `rg` and source reads.
The [evaluation](evaluation.md) records when Graphify costs more context.
