# Roadmap

Execution order derived from current [debt](technical-debt.md), not old stages or
Canvas phase numbers. The ledger owns status/priority and exit boundaries;
[contracts](contracts/safety-and-preservation.md) constrain every slice.

## Recommended engineering sequence

1. **Release and verification baseline:** ship the closed preservation work
   (C17, C22, C23, C6) and make V2's grammar oracle a real CI gate, so green
   runs again include the independent grammar check.
2. **Incremental architecture:** migrate A1 lexical consumers one at a time;
   obtain A2 producer/projection evidence, then unify lifetime/column facts.
   Retain accepted cycle/hooks/synchronous resolver discipline. A3 inference uses
   shared representation and attested types; no independent walker.
3. **Compatibility and verification:** start C2 from a bounded token-identity
   spike and attested RU/EN pairs. Improve V1 provenance/negative coverage and
   add bounded V3 transformation
   checks. Acquire U1–U3 platform evidence rather than treating local tests as
   platform verdicts. These evidence tasks can accompany architecture slices.
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
