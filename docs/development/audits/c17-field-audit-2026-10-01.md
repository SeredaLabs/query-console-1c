# C17 SELECT-field audit: multiline literal contract boundary

Date: 2026-10-01. Baseline: `25ac0e3`. Audit only; no production or test changes.
C17 remains OPEN. Field implementation has not started.

## Finding before implementation

Raw scalar fields pass through `parseOneField` → `interpretField` →
`buildFieldLines` / UNION `fieldExpr` → `formatSelectExpression` in the shared
[parser](../../../src/core/query/sdblParser.ts) and
[generator](../../../src/core/query/sdblGenerator.ts). `sliceSource` removes raw
comments. Simple fields and aggregates may become structured fields, so retaining
a raw slice alone is insufficient. Scalar projections after tabular projections
use `trailingFields`; comment binding/rendering also needs its actual projection
order considered before claiming support. No A2 schema change is authorized here.

The blocking finding is the existing multiline literal contract:

- `indentStringLiteralNewlines` documents SELECT literal continuation padding
  as checked against live `validate_query`, including extra subquery padding.
  This implementation predates the current work (present in initial import).
- `test/unit/sdblParser.test.ts`, the package-splitting cases 5/6, explicitly
  expect added tabs inside SELECT literals and describe live-oracle provenance.
- The C17 JOIN commit introduced `literalContinuationLines` for nested source
  and condition renderers in all comment modes. It deliberately stopped adding
  nesting padding inside literals and changed two closing-parenthesis expectations.
- Consequently SELECT still adds its own literal padding, but nesting no longer
  adds the former extra padding. This is a change to uncommented query output,
  not solely a new comment-preservation case.

The source comments record historical platform checks; they are not a fresh
platform execution or proof that literal bytes must define runtime equivalence.
Conversely local token equality alone does not prove correct platform canonical
output. [ADR 0004](../decisions/0004-querymodel-round-trip-contract.md) and the
[corpus policy](../corpus-testing.md) distinguish those contracts.

## Reproduction

[Exact synthetic inputs and outputs](c17-field-literal-contract-2026-10-01.json)
compare frozen pre-JOIN `cd3250c7b55e88a35b84595385acdc84e1742c82` against `25ac0e3`.
Here `N` is the number of tabs before the continuation `b` in the literal `"a\nb"`:

| Shape | Before JOIN | Current | Finding |
|---|---:|---:|---|
| top-level SELECT literal | 1 | 1 | Existing SELECT policy unchanged |
| source-subquery SELECT literal | 2 | 1 | Nesting policy changed |
| source-subquery WHERE literals | 1 | 0 | Nesting policy changed |
| structured condition-subquery WHERE literal | 3 | 0 | Nesting policy changed |

All inputs parse locally. Three of four outputs differ. These examples were not
covered by the previous zero-difference corpus comparison; that result remains
true for its 15,808 recorded outputs, but cannot establish this contract.
The first two cases are metadata-independent. The last case deliberately uses
the same metadata-free shape as the closing-parenthesis regression.

The probe uses esbuild to load the current core and frozen parent source files;
no files/baselines are rewritten. `node /tmp/c17-field-contract-probe.cjs` produced
the attached JSON. The configured CLI client was inspected for live validation:
no MCP_URL or usable `.mcp.json` endpoint is configured, so no network validation
or live query execution occurred. No endpoint or credentials are recorded.

## Verification and stopping boundary

`npx vitest run test/unit/commentsRoundTrip.test.ts test/unit/rawSliceComments.c16.test.ts test/unit/openDesignerBatch.test.ts test/unit/conditionComments.c17.test.ts test/unit/joinComments.c17.test.ts test/unit/unionModel.test.ts`
— 595 tests / 6 files passed before any implementation.

`npm run docs:check` and `git diff --check` validate this documentation-only update.
No full unit, E2E, integration or corpus sweep was rerun; no production/test,
golden, snapshot or classification changes were made.

Under [AGENTS.md](../../../AGENTS.md) sections 1 and 29, conflicting repository
contracts and behavior that cannot be determined safely require a stop before
risky implementation. Next: obtain current constructor-canonical output for the
four synthetic inputs, distinguish it from runtime literal semantics, and decide
whether to narrow the JOIN literal change or explicitly revise the canonical
contract with evidence. Then resume bounded field-comment preservation.

The prior JOIN report's description of both old expectations as erroneous
padding was not sufficiently qualified against the existing canonical policy.
Its passing tests and corpus results remain valid, but platform compatibility
of the multiline change is not established. No automatic rollback or broader
SELECT formatting change is made by this audit.


## Web-constructor evidence recorded 2026-10-02

[Exact live observations](c17-field-literal-live-2026-10-02.json) retain three
outputs from the preceding web-client session. Synthetic text was pasted into
the native Query wizard's Query editor, applied, and reopened. The textarea
value was read directly to preserve tabs and newlines. Queries were not executed.
During the resumed fourth-case check, About reported `1C:Enterprise 8.3
(8.3.15.1489)`; the preceding session did not capture a version. The earlier JSON remains the historical
local comparison; its unavailable MCP status does not describe these UI checks.

| Shape | Before JOIN | Current | Native constructor |
|---|---:|---:|---:|
| top-level SELECT literal | 1 | 1 | 1 |
| source-subquery SELECT literal | 2 | 1 | 2 |
| source-subquery WHERE literals | 1 | 0 | 3 |
| structured condition-subquery WHERE literal (outer `П.Код` control) | 3 | 0 | 2 |

Counts are tabs before continuation `b`, as above. The source-SELECT result
confirms that the JOIN change diverged from this constructor's canonical output.
The source-WHERE result also exposes a pre-existing mismatch: simply restoring
the old nesting behavior would not match all observed outputs. These are
canonical-format observations, not evidence of runtime string equivalence.

The resumed native check rejected the original fourth input with
`{(1, 11)}: Field not found "П.А"`. This is retained as a rejection, not a
canonical output. A separately recorded control changes only the outer
projection from `П.А` to the existing `П.Код`, retaining alias `А` and the whole
nested condition. The constructor accepts this control and emits two tabs
before `b`; the frozen pre-JOIN generator emits three and current emits zero.
Thus condition-WHERE also has a pre-existing canonical mismatch. Local outputs
for the adapted control were generated from the same frozen/current probe
bundles; no expected files were rewritten.

All four shapes now have an observed native result (the fourth through an
explicitly adapted control). This does not attest all platform versions or
runtime literal semantics. Queries were parsed/serialized, never executed.

C17 remains OPEN. The next bounded task is to correct JOIN-introduced nesting
behavior with canonical controls and comment-preservation regressions, while
tracking the pre-existing source/condition-WHERE canonical gaps explicitly.
A blanket rollback cannot establish compatibility, and token equality alone
must not override the observed constructor contract. Field-comment
implementation remains deferred until the correction boundary is settled.
No production or test changes accompany this evidence update.

Verification after the resumed check: `npm run docs:check`, `git diff --check`,
and a structural check of the JSON observations/tab counts. Full unit, corpus,
E2E and integration gates were not rerun for this documentation-only update.


## Runtime follow-up: proposed correction direction superseded

[Executed comparisons](c17-literal-runtime-2026-10-02.md) now show that added
literal tabs change values. The current source-SELECT output and the native
constructor output both differ from the original value. The recommendation
above to correct nesting toward native formatting is superseded: preserve
literal values first and reconcile the existing SELECT padding policy with
ADR 0004 before implementation. The canonical observations remain accurate;
they are not proof of runtime equivalence.


## Resolution follow-up

The [bounded SELECT literal fix](c17-literal-preservation-fix-2026-10-02.md)
fixes leaf SELECT padding and records the explicit ADR exception,
regression gates and successful runtime equality check. Earlier stop decisions
remain historical evidence; remaining C17 comment slots are still OPEN.

Review qualification: [two uncovered paths](c17-literal-review-2026-10-02.md)
keep the overall literal prerequisite PARTIAL; do not infer universal literal
preservation from the successful leaf fix.
