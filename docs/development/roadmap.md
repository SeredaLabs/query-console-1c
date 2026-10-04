# Roadmap

Execution order derived from current [debt](technical-debt.md), not old stages or
Canvas phase numbers. The ledger owns status/priority and exit boundaries;
[contracts](contracts/safety-and-preservation.md) constrain every slice.

## Recommended engineering sequence

1. **Release baseline:** the closed preservation work (C17, C22, C23, C6)
   shipped in 0.1.97. The external grammar oracle (V2) is optional dev tooling,
   not a CI gate and not a prerequisite for Query Core v1: 1C Platform / Query
   Designer is authoritative for platform acceptance and canonicalization.
2. **Incremental architecture:** migrate A1 lexical consumers one at a time;
   obtain A2 producer/projection evidence, then unify lifetime/column facts.
   Retain accepted cycle/hooks/synchronous resolver discipline. A3 inference uses
   shared representation and attested types; no independent walker.
3. **Grammar parity and verification (Query Core v1 gate, V5):** run the
   [grammar parity](grammar-parity.md) phases: attested suites and catalog
   consistency gate, then the catalog from independent sources, fuzz, a
   deduplicated live 1C batch and bounded per-construct fixes. Start C2 (P1)
   from a bounded token-identity spike and attested RU/EN pairs, after or with
   A1. Improve V1 provenance/negative coverage and add bounded V3
   transformation checks. Acquire U1–U3 platform evidence rather than treating
   local tests as platform verdicts. The first phases need no live 1C and can
   accompany architecture slices.
4. **Product UX:** prioritize concrete UX-C1–3/7–9 workflows from the current
   Canvas matrix. Advanced UNION needs safe shared alignment, not full A2 first.
   Cross-highlight requires output ranges; persistent global IDs require a
   consumer.
5. **Release hardening:** review responsive, keyboard/accessibility and recursive
   workflows (UX-C4/6), rerun [release gates](testing-and-release.md), then make a
   separate Preview-removal decision. V4 and functional baseline alone do not
   authorize release readiness. Classic remains available.

No parser rewrite, runtime grammar replacement, database execution or unrelated
architecture optimization is implied. The [archived proposal](audits/archive/roadmap-e3b36a5.md)
retains earlier investigation detail; it is not an implementation requirement.
