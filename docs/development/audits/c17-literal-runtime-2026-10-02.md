# C17 prerequisite: multiline literals affect executed values

Date: 2026-10-02. Baseline: `25ac0e3`. Evidence only; no production or test edits.

## Result

The proposed canonical-padding restoration is unsafe. Executing synthetic
SELECTs in the supplied web query console proves that adding tabs after a
newline inside a string changes its value. The native constructor's output is
therefore not a sufficient semantic oracle for this case.

[Exact inputs and observed results](c17-literal-runtime-2026-10-02.json) record
two completed probes. The client previously reported platform 8.3.15.1489 in
the same session. Queries used only constants and derived tables; no business
tables, writes, parameters, or stored-query saves were involved. Results came
from the rendered result table, not local simulation or constructor acceptance.

| Equality probe | Displayed result |
|---|---|
| Original literal against itself | Yes |
| One-tab literal against itself | Yes |
| Original against one-tab continuation | No |
| Original against two-tab continuation | No |
| Original against three-tab continuation | No |
| Original against `ab` | No |
| Original against `a b` | No |

The second probe embeds the exact source-SELECT input and recorded current/native
outputs from the [canonical audit](c17-field-audit-2026-10-01.md) as three derived
tables, then compares their projected values in one execution:

| Comparison | Displayed result |
|---|---|
| Original against itself | Yes |
| Current generator against original | No |
| Native constructor against original | No |
| Current generator against native constructor | No |

Both probes returned one row. The second result confirms a current generator
semantic defect for this synthetic source-SELECT, not merely a textual mismatch.
The original continuation has zero tabs, current has one, and native/pre-JOIN
output has two. Restoring the old nesting padding would still change the value.
The direct `indentStringLiteralNewlines` SELECT padding predates the JOIN commit.

## Decision and remaining scope

Keep the existing protection against inserting nesting padding inside literal
tokens while resolving the SELECT policy. Do not restore literal padding simply
to satisfy native canonical output. No implementation is changed in this audit.

[ADR 0004](../decisions/0004-querymodel-round-trip-contract.md) requires canonical
output equality, while [AGENTS.md](../../../AGENTS.md) sections 25, 29 and 33
require user-content safety and a stop on a material contract contradiction.
The new execution evidence exposes that contradiction concretely. The prior
recommendation to correct nesting toward native output is superseded.

Next bounded task: reconcile the literal-value invariant with ADR 0004, capture
affected corpus cases without rewriting baselines, and implement a consistent
value-preserving policy with regression tests. This includes the existing SELECT
padding, rather than disguising the issue as a JOIN-only formatting correction.
Do not proceed to the remaining C17 field/group/TOTALS/ORDER comment slots until
this prerequisite has a tested resolution. C17 remains OPEN.

These probes establish the listed equalities on the observed platform only.
They do not measure string lengths or establish all newline, escaping, date,
nesting, metadata, or platform-version combinations. The earlier four-shape
canonical audit is still valid as formatting evidence. Runtime coverage here
is the equality matrix plus one source-SELECT end-to-end comparison, not all
four original query executions.

## Verification

- `npx vitest run test/unit/multilineStringCloseParen.test.ts test/unit/joinComments.c17.test.ts test/unit/conditionComments.c17.test.ts`: 517 tests / 3 files passed.
- `npm run docs:check`: passed.
- `git diff --check`: passed.

No production/test changes, snapshot/golden/classification updates, commit or
push. Full unit, typecheck, corpus, E2E and integration gates were not rerun for
this evidence-only update; targeted tests do not establish absence of the newly
demonstrated SELECT semantic defect.


## Resolution follow-up

The [bounded SELECT literal fix](c17-literal-preservation-fix-2026-10-02.md)
fixes leaf SELECT padding and records the explicit ADR exception,
regression gates and successful runtime equality check. Earlier stop decisions
remain historical evidence; remaining C17 comment slots are still OPEN.

Review qualification: [two uncovered paths](c17-literal-review-2026-10-02.md)
keep the overall literal prerequisite PARTIAL; do not infer universal literal
preservation from the successful leaf fix.
