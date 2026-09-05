# Known issues

## Active product limitations

- Cursor detection cannot evaluate dynamically composed BSL query strings.
- Validation is intentionally incomplete for arbitrary custom expressions and
  platform-specific SDBL.
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
