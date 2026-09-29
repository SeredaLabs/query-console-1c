# C11 — malformed expression slots, 2026-09-29

Baseline: `c07e9a9` / `v0.1.94` plus the C11 resumed audit. C16 was **OPEN**
here; it is closed for VT/`ПЕРИОДАМИ` arguments in [C16](c16-raw-slice-comments-2026-09-30.md);
the other raw slices are C17.

## Change

Only `findMalformedCustomExpressions` in `semanticValidator.ts` grows its
traversal. Parser, generator, store and Apply mechanism are unchanged. The
shared Classic/Canvas gate still maps any hit to `malformedCustom`.

Checked as ordinary expressions (`isStructurallyValidExpression`), only when
the stored string is an expression position:

| Slot | Check |
|---|---|
| `VirtualParams.period` / `startPeriod` / `endPeriod` | yes |
| `VirtualParams.condition` and account-condition keys | yes, unless DCS |
| `TotalGroupField.periodBy` start/end operands | yes; the period unit is skipped |
| `TabSectionField.castPrefix` | yes |
| Non-custom `leftExpr` and comparison `param` | yes |
| Nested sources and condition subqueries | existing recursive walk |

## Exclusions (not ordinary-expression grammar)

| Slot / shape | Reason |
|---|---|
| DCS `{…}` and top-level `КАК` aliases (`{(Код = &Код) КАК Отбор}`) | Specialized VT/builder argument; the ordinary acceptor rejects a valid DCS argument. Detected by a punct `{` token, not a raw `{` character, so a string like `"{x}"` is still an ordinary condition. |
| `periodicity`, `fillMethod` | Keyword catalogs, not expressions. |
| `order`, `top` | VT ordering / `ПЕРВЫЕ` syntax. |
| `mainDimensions`, `baseDimensions`, `sections`, `subcontoTypes*` | Identifier lists, not a single expression. |
| `accountingArgs` | Transient remapping copy of the same positional strings already stored in named keys. |
| Non-custom `МЕЖДУ` / `В` `param` | BETWEEN RHS is `&a И &b`; `В` is a list or subquery. |
| JOIN structured operands | Field references, not expression text. |
| `model.characteristics` | Whole section, not an expression (C12 already rejects an unclosed block). |
| Template markers `%` `#` `@` `[` `]` | Existing acceptor fail-open. |

Controls that must still Apply: DCS `{(Код = &Код) КАК Отбор}`, `МЕЖДУ &А И &Б`,
closed `{ХАРАКТЕРИСТИКИ …}`, valid `ПЕРИОДАМИ(Месяц, &А, &Б)`.

## C16 (not fixed here)

Comment loss through `sliceSource` in `parsePositionalArgs` / `matchPeriodBy`
remains a step-8 defect. Validator-only coverage cannot recover comments already
absent from the model. Slots recorded on C16:

- VT condition: `СрезПоследних(, ИСТИНА // C16-marker)`
- `periodBy`: `ПЕРИОДАМИ(Месяц, 1 // C16-marker, 2)`

## Tests

`malformedOpaqueSlots.test.ts` failed on HEAD for the two required
double-operator cases, malformed `castPrefix`, and a synthetic non-custom
comparison `param` (6 failures / 37 passing controls). After the walker change
all 43 pass. Corpus: 0 new hits in each metadata mode on 1976 valid queries.
Fourteen synthetic valid VT argument shapes (slices, turnovers, balances,
accounting, calculation including `База` lists and `ДвиженияССубконто` order)
are not blocked. Four Classic/Canvas browser cases require a disabled Apply
button with the existing malformed-expression explanation.

## Verification

- `npm run docs:check` — passed.
- `npm run typecheck` — passed.
- `npm run test:unit` — 3617 passed (153 files). Tree-sitter oracle skipped (unvendored wasm).
- `npm run test:e2e` — 106 passed, including four C11 Classic/Canvas cases.
- `npm run test:integration` — 38 passed.
- Independent managed worktree at `c07e9a9` vs working tree: 1976 queries × 2
  metadata modes = 3952 generation pairs, **0** byte differences.

Evidence of Apply decisions is in
[c11-malformed-slots-2026-09-29.jsonl](c11-malformed-slots-2026-09-29.jsonl).
