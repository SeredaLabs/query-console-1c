# Performance

Metadata import, cache loading, WebView payload size, and corpus parse/generate
time are the relevant workloads. Use `npm run bench:metadata` for the maintained
metadata benchmark and record the machine, data set, Node version, repetitions,
and before/after measurements.

Do not optimize from arbitrary thresholds. Profile the user-visible workload,
make the smallest relevant change, and re-run the same measurement plus the
regression gate.

The point-in-time baseline captured before documentation consolidation is kept in
[`docs/history/pre-consolidation/PERFORMANCE_BASELINE.md`](../history/pre-consolidation/PERFORMANCE_BASELINE.md).
Its numbers are historical evidence, not current promises.
