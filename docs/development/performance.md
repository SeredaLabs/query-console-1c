# Performance

Metadata import, cache loading, WebView payload size, and corpus parse/generate
time are the relevant workloads. Use `npm run bench:metadata` for the maintained
metadata benchmark and record the machine, data set, Node version, repetitions,
and before/after measurements.

Do not optimize from arbitrary thresholds. Profile the user-visible workload,
make the smallest relevant change, and re-run the same measurement plus the
regression gate.

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
