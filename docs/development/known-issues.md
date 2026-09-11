# Known issues

## Active product limitations

- Cursor detection cannot evaluate dynamically composed BSL query strings.
- Validation is intentionally incomplete for arbitrary custom expressions and
  platform-specific SDBL. Partially mitigated: `findMalformedCustomExpressions`
  (`semanticValidator.ts`) blocks Apply when a stored custom/raw expression
  fails a structural acceptor for the SDBL expression/condition grammar
  (`expressionSyntaxCheck.ts`) -- unbalanced parentheses/braces, double or
  dangling operators, an unclosed `ВЫБОР…КОНЕЦ`, a malformed `ВЫРАЗИТЬ(… КАК …)`
  cast, and similar. This is a syntax-SHAPE check, not full grammar coverage --
  it deliberately does not validate exact argument counts for specific
  built-in functions (semantics, not syntax) and treats any text containing
  1C's own template-substitution marker characters (`%`, `#`, `@`, `[`, `]`)
  as unjudgeable rather than invalid (found on real production code: query
  templates built via string substitution use these). Verified against the
  committed 1976-query golden corpus and two independent real production 1C
  configurations before shipping -- zero false positives on complete queries;
  the only hits on real code were already-incomplete fragments from runtime
  string concatenation (not something the constructor itself ever produces,
  since it always edits one complete query string).
- Three-or-more positional arguments cannot be losslessly reconstructed by the
  generic fallback for `РегистрРасчета.*.ДанныеГрафика`,
  `РегистрРасчета.*.ФактическийПериодДействия`, and
  `Последовательность.*.Границы`; marked models are blocked from apply.
- Auto-discovery is bounded and may require an explicit metadata path.
- Query-parse diagnostics (`queryConsole.queryDiagnosticsEnabled`) scan one
  string literal at a time and can flag a query assembled by string
  concatenation, where an individual fragment is not meant to parse on its
  own -- there is no full BSL AST to distinguish that from a genuinely broken
  query. Mitigated by `Warning` severity, non-committal wording, and the
  setting to disable it entirely; not something a corpus/production sweep can
  fully rule out the way `findMalformedCustomExpressions` above was, since it
  depends on how a given codebase happens to build query text at runtime.

These are documented user boundaries, not permission to weaken tests. Add a
regression test when fixing one and update all three limitations pages.

## Resolved: hover/autocomplete alias scoping

Hover (`describeChain`) and autocomplete (`resolveCompletionTarget`), both in
`hoverFieldInfo.ts`, used to resolve a table alias across the whole query
batch, first-match -- a repeated alias for a different source elsewhere in
the same batch could show/suggest the wrong table. As of the semantic-core
roadmap's Phase 3d/3e (memory: project-semantic-core-roadmap), both share
`resolveHeadTable`, which prefers `resolveAliasAt`, a position-aware resolver
that respects real JOIN-condition scoping and nearest-ancestor subquery
correlation (live-verified against real 1C). The old flat `findAliasTable`
lookup is still used, but only when `resolveAliasAt` has no data to work with
at all (a `'recovered'`/`'unavailable'` snapshot -- a broken SELECT list, the
query-parse recovery case above), never as a fallback on scope uncertainty.
