# C11 resumed audit — comment-preservation stop, 2026-09-29

Baseline: `e777422` / `v0.1.94`. C12–C15 are closed. C11 remains **OPEN**;
this continuation changes documentation only, not the validator or parser.

## Confirmed coverage gaps

The [original slot inventory](c11-slot-audit-2026-09-29.md) still applies.
The VT condition `Код = = &Код` still passes the shared static and final Apply
gates. A DCS argument `{(Код = &Код) КАК Отбор}` also passes today, so treating
every argument as an ordinary expression would introduce a compatibility change.

Additional raw slots identified during this continuation:

- `TotalGroupField.periodBy`: `ПЕРИОДАМИ(Месяц, &А = = 1, &Б)` opens and reaches
  Apply with `ok: true`. It is not traversed by `findMalformedCustomExpressions`.
- `TabSectionField.castPrefix` and non-custom condition operands remain outside
  the traversal, as already listed in the first inventory.
- Non-custom operands need their operator context; a BETWEEN right-hand side
  is not a standalone expression. DCS aliases/lists, VT ordering modifiers and
  characteristics sections also cannot be validated as ordinary expressions.

These are C11 coverage work, not a reason to introduce another Apply mechanism.

## C16 — comments lost before the gate

The supplied series prompt explicitly requires stopping on **any scenario where
Apply writes text without part of the input query**. Its preservation invariant
also explicitly includes user comments. Step 8 had already identified the broader
raw-slice comment-preservation problem; this audit provides concrete evidence
inside the slots being considered for C11. It does not authorize moving step 8
implementation into the validator task.

Both examples were exercised through the real shared path:

`tryOpenBatch(input, resolver, { preserveComments: true })`
→ `reducer(initialState(), { type: 'LOAD_BATCH', doc })`
→ `computeBatchTextSafe(state, true)`
→ `findStaticApplyBlocker(state)` → `decideApply(...)`.

```sdbl
ВЫБРАТЬ Т.Период
ИЗ РегистрСведений.ЦеныНоменклатуры.СрезПоследних(
    , ИСТИНА // C16-marker
) КАК Т
```

```sdbl
ВЫБРАТЬ 1 КАК Число
ИТОГИ ПО Число ПЕРИОДАМИ(Месяц, 1 // C16-marker
, 2)
```

For both inputs, with and without the committed YAML metadata resolver:

- opening succeeds;
- the parsed document already contains no `C16-marker`;
- generated output contains no comment;
- the static blocker is `null`;
- Apply returns `{ ok: true }`.

Exact executed inputs and outputs are in the adjacent
[evidence file](c11-comment-preservation-2026-09-29.jsonl).
No live-platform validity claim is needed to establish loss of user-authored text
on an accepted load/Apply path.

The relevant readers are `parsePositionalArgs` and `matchPeriodBy`; they use
`sliceSource`, whose range ends at the last expression token and strips line
comments inside the range. Thus a trailing comment may already lie outside that
range. The comment binder currently attaches select-field comments and certain
SELECT/FROM section comments, not these argument comments. Adding a structural
expression check after parsing cannot detect or recover text absent from the
model. No change to those components was attempted.

## Verification and boundary

- `npx vitest run test/unit/semanticValidator.test.ts test/unit/semanticValidatorCorpus.test.ts test/unit/applyGate.test.ts test/unit/applyGeneratedOutput.test.ts` — 132 passed in four files.
- `node /tmp/c11-probe.cjs` — six current-source probes: known VT hole, DCS control, BETWEEN control, valid/invalid period modifier, closed characteristics control.
- `node /tmp/c11-preservation.cjs` — four confirmed comment-loss cases (two inputs × two metadata modes), captured in the evidence file.
- `npm run docs:check` and `git diff --check` — documentation checks.

No production/test code, fixtures, golden outputs or snapshots changed. Full
implementation gates and a HEAD/worktree corpus comparison were not rerun for
this documentation-only stop. No commit, push or release.

Before resuming C11 implementation, decide explicitly whether to authorize a
separate bounded comment-preservation task, or to defer the already-known step 8
loss with a narrow exception to the stop condition for C11. Merely adding VT
checks would not close C16. No exception is assumed by this audit.
