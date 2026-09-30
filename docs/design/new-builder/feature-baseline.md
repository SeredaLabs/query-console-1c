# Canvas feature baseline

The functional baseline is complete. Canvas remains **opt-in Preview** alongside
Classic: enable `queryConsole.enableNewBuilderPreview`, then run
`1C: New Builder (Preview)`. Completion describes the classified editing and
preservation surface below; it does not close every UX idea or release review.
The [ledger](../../development/technical-debt.md) alone owns current debt status.

## Current capability matrix

EDIT = accessible editing workflow. PRESERVE = a successfully loaded supported
representation survives unrelated edit/Save/reopen; dedicated controls may be
absent. MISSING = an absent workflow with its stated scope. N/A = outside this
constructor surface. Safe rejection is not preservation.

| Capability | Classic | Canvas |
|---|---|---|
| Metadata sources, removal, field selection | EDIT | EDIT |
| Source aliases / aliasSynthesized | PRESERVE (no rename action) | PRESERVE |
| Virtual sources / arguments | EDIT common layouts | EDIT common forms; other layouts PRESERVE |
| Source subquery create / recursive edit | EDIT | EDIT |
| JOIN endpoints, kind, multiple conjuncts, custom expressions | EDIT | EDIT |
| Parsed JOIN tree / source ordering properties | PRESERVE | PRESERVE |
| Scalar fields, aliases, custom expressions, per-field aggregates, reorder | EDIT | EDIT |
| Tabular projections and inner columns / expressions | EDIT partially | PRESERVE |
| Field qualification, selectOrder, funcOperandQualified, exprAliasExplicit, autoAliasDotted | PRESERVE | PRESERVE |
| DISTINCT, ALLOWED, TOP | EDIT | EDIT |
| FOR UPDATE enable / source list | EDIT | EDIT |
| WHERE field/operator/parameter or custom text | EDIT | EDIT |
| Structured condition subqueries, hierarchy/negation flags | PRESERVE; replace via custom text | PRESERVE |
| HAVING | PRESERVE (no reducer editing actions) | PRESERVE |
| GROUP BY basic fields / per-field aggregate | EDIT | EDIT |
| Grouping sets, explicitGroupCount, legacy grouping aggregates | EDIT/PRESERVE | PRESERVE |
| ORDER BY add/remove/direction, auto | EDIT, including UNION tail | EDIT, including UNION tail |
| ORDER hierarchy, expression, qualified/selectAlias | PRESERVE (no hierarchy action) | PRESERVE |
| TOTALS grouping/kind/alias, aggregate function, grand total | EDIT | EDIT |
| TOTALS raw expression/operand flags, ПЕРИОДАМИ | PRESERVE | PRESERVE |
| INDEX BY sets/unique/columns/reorder | EDIT | EDIT |
| INDEX raw expression/qualified/selectAlias | PRESERVE | PRESERVE |
| Temp producer/create, append, consume, drop | EDIT | EDIT |
| Manual temp source description create/update | EDIT | EDIT |
| Package-derived temp schema | Producer owns schema | EDIT through producer; no manual override |
| Package add/remove/switch, UNION add/remove/switch/ALL/distinct | EDIT | EDIT |
| UNION column alias/reorder mapping | EDIT scalar | EDIT scalar; tabular/trailing mapping guarded PRESERVE |
| Package reordering | EDIT | PRESERVE; UX follow-up |
| Report builder dynamic blocks | EDIT | PRESERVE; advanced UX follow-up |
| Characteristics raw block, trailingFields | PRESERVE | PRESERVE |
| Bound SELECT/FROM/field comments, VT/ПЕРИОДАМИ argument comments | PRESERVE | PRESERVE |
| Raw-expression comments unsupported by core rendering | Explicit safe rejection | Explicit safe rejection |
| Contextual expression helper (field/WHERE/JOIN/VT) | EDIT | EDIT via shared Classic editor |
| Metadata cache refresh / lazy reference-field expansion | EDIT via existing bridge/actions | MISSING noncritical UX-C8; existing loaded navigation retained |
| Generated SDBL text editing / reparse | EDIT Classic dialog | Read-only dock; raw editor remains available outside Canvas |
| Execution / IDE assistance | Separate editor workflow | N/A |

## Preservation and editing boundaries

Recursive source queries use isolated local drafts and the shared reducer/model;
all six workspaces, nested sources and UNION work inside them. Back validates
before committing; Cancel preserves the parent. A source-query editor has no
package inside it. Temp packages remain at the root. Manual external-temp
schemas are session metadata: SDBL persists the source/referenced columns, not
unused description-only columns. Package schemas belong to their producer.

Common VT forms cover information/accumulation slices and existing accounting
forms; other layouts retain their loaded representations, including parser-owned
flags. Unsafe arguments remain blocked. TOTALS retains raw operand flags and
ПЕРИОДАМИ; INDEX retains raw flags. Existing canonical UNIQUE emission applies to
multiple nonempty index sets; no new single-set behavior is promised.

Grouping sets, dynamic report blocks, tabular projections, HAVING, structured
condition subqueries, source aliases, ORDER hierarchy/priority, characteristics
and trailing fields are intentional preserve-only families. They are verified
through unrelated edits, not advertised as complete contextual editors.
Advanced UNION projections suppress scalar-only mapping edits with an explicit
notice. The shared [safety/preservation contract](../../development/contracts/safety-and-preservation.md)
defines refusal and state invariants; the ledger lists UX-C1–10, C17/C18 and A2
where further support or evidence is needed.

Canvas reuses the Classic ExpressionBuilder for field/WHERE/JOIN/VT contexts.
Its highlighted generated SDBL dock is read-only, copyable, resizable and
collapsible. Basic Enter/Space activation exists; responsive/accessibility/release
review and advanced interaction are separate from functional baseline completion.

## Verification and release boundary

[Testing/release](../../development/testing-and-release.md#canvas-verification)
owns browser/real-host gate scope. V4 is a bounded regression gate, not a
feature-completion or platform-equivalence certificate. Preview removal follows
UX/polish and release hardening review; no release-count or phase-number gate is
implied. Classic remains available.

The [implementation report](../../development/audits/archive/canvas-feature-baseline-2026-09-30.md)
retains before/after findings, reviewed output changes, exact commands and commits.
The [full historical roadmap reconciliation](../../development/audits/archive/canvas-phase-reconciliation-2026-09-30.md)
retains all discovered phases/subphases, original intents, code/test status and
remaining-requirement crosswalk. These reports explain the checkpoint; current
work does not require phase numbering.
