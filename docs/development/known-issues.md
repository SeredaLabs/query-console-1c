# Known issues

## Active product limitations

- Cursor detection cannot evaluate dynamically composed BSL query strings.
- Validation is intentionally incomplete for arbitrary custom expressions and
  platform-specific SDBL. Partially mitigated: `findUnbalancedCustomExpressions`
  (`semanticValidator.ts`) blocks Apply when a stored custom/raw expression has
  unbalanced parentheses/braces -- the most dangerous concrete case (an
  unclosed paren in a condition silently swallows the rest of the query, e.g.
  a following ORDER BY, into the custom text). This is a syntax-BALANCE check,
  not a full expression grammar -- it does not catch every possible malformed
  expression (e.g. a double operator), only ones that break bracket balance.
  A full standalone SDBL expression grammar (checked against the whole corpus
  to avoid false rejections) remains a separate, larger follow-up.
- Three-or-more positional arguments cannot be losslessly reconstructed by the
  generic fallback for `РегистрРасчета.*.ДанныеГрафика`,
  `РегистрРасчета.*.ФактическийПериодДействия`, and
  `Последовательность.*.Границы`; marked models are blocked from apply.
- Auto-discovery is bounded and may require an explicit metadata path.

These are documented user boundaries, not permission to weaken tests. Add a
regression test when fixing one and update all three limitations pages.

The former mixed-language issue inventory is preserved at
[`docs/history/pre-consolidation/KNOWN_ISSUES.md`](../history/pre-consolidation/KNOWN_ISSUES.md)
for traceability; closed items there are not active issues.
