# C17 GROUP review: structural-path regression

Date: 2026-10-03. Compared uncommitted GROUP changes with `6bab85f`.
Historical status: **NOT READY**; now [resolved by the ownership guard](c17-group-review-fix-2026-10-03.md). Review only; no production fix or commit in this pass.

## P1: any-comment trigger discards formerly preserved raw content

`trySimpleCondition` now chooses structured parsing for any commented literal-LHS
IN subquery (`hasPreservedComments`). This extends beyond the GROUP ownership
case: formatted subqueries containing ORDER, TOTALS or source-path comments used
to stay raw and retain those comments. The new structured path drops them.

Example:

```sdbl
ВЫБРАТЬ 1 КАК А ГДЕ 1 В (
ВЫБРАТЬ
Т.Код КАК А
ИЗ Справочник.Валюты КАК Т
УПОРЯДОЧИТЬ ПО А // order
)
```

HEAD retains `// order`; worktree output has none. `tryOpenDesignerBatch` refuses
ordinary opening and returns the loss-confirmation candidate. The UI therefore
does not silently load it, but previously working preservation has regressed.
The same loss reproduces in TOTALS and source-path comments. This is one trigger
defect affecting three slots, not a claim that all unsupported slots are new.
[Exact inputs and outputs](c17-group-review-2026-10-03.json).

The fix must constrain structural selection to a preservation-safe case and test
mixed supported/unsupported comments, while retaining GROUP reopen stability.
Simply treating all commented subqueries as structurally supported is unsafe.

## Independent GROUP probe

`node /tmp/c17-group-review.cjs` inserted comments after each token of eight GROUP
shapes, with standalone, source-subquery, UNION and literal-LHS IN wrappers.
All 288 probes parsed and retained exact comment counts and byte-stable reopening.
These metadata-free synthetic probes do not establish platform validity or
universal coverage. The targeted before/after regression probes above are separate.

Prior full gates still describe passing tested coverage, but omitted the
non-GROUP cases affected by the expanded condition. No expectations or baselines
were changed to hide the finding. No full suite rerun for this documentation-only
review; docs and diff checks are run after recording the evidence.
