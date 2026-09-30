# C21: arithmetic ORDER expression keys

Date: 2026-09-30. Implementation baseline: `main 7ea771a` (0.1.95).
Historical discovery baseline: `main 3c2e66e`; see the
[ledger evidence](../technical-debt.md#c21-order-expression-evidence).
Current status belongs to the [ledger](../technical-debt.md).

## Change and preservation boundary

The shared parser previously stopped after a field/path in an ORDER key,
leaving `+`, `-`, `*` or `/` unread. It also rejected keys starting with `(` or
unary `-`. Function-headed expressions already worked. Classic and Canvas
could not open the affected queries, despite the existing `OrderField.expression`
and generator supporting expression keys.

[parseOrder](../../../src/core/query/sdblParser.ts) now routes these heads and
arithmetic tails through its existing function-expression token reader. The
already consumed opening parenthesis contributes to the initial depth. No new
lexer, character scanner, expression grammar, model property or UI editor was
introduced. Bare fields, aliases, parameter keys, CASE/comparison/IS NULL branches,
direction/modifier order and existing hierarchy rendering remain unchanged.

The reader retains the complete key and stops at top-level commas, modifiers,
section boundaries, package separators, DCS braces and the surrounding subquery's
closing parenthesis. Unclosed parentheses report a controlled EOF error.
Existing DCS placement rules remain: a trailing unsupported block is rejected,
not swallowed into the key. C17 comment-loss confirmation remains active.

The existing formatter removes redundant outer parentheses from
`(Т.Количество + 1)`, producing `Т.Количество + 1`. Parentheses that determine
precedence in `Т.Количество * (Т.Сумма + 1)` and
`(Т.Количество + 1) * Т.Сумма` are retained. This is existing formatting behavior,
not a new corpus canonicalization.

## Regression evidence

- [ORDER expression tests](../../../test/unit/orderExpressions.c21.test.ts):
  arithmetic operators, parentheses, unary minus, function/CASE operands,
  mixed keys and directions, aliases, TOTALS/AUTOORDER, DCS/package/subquery
  boundaries, UNION store edit/reopen, dangling-operator Apply blockers and
  comment-loss consent.
- Numeric cases run without metadata and with an explicit test resolver declaring
  numeric `Продажи.Количество`/`Сумма`. The corpus has no `Продажи` table;
  these declarations are test data, not harvested platform metadata.
  The original `Валюты.Код + 1` report also opens with actual corpus metadata.
- [EOF child-process tests](../../../test/unit/rawExpressionEof.test.ts):
  arithmetic, leading-parenthesis and unary-minus keys through parser, opening,
  diagnostics and semantic-snapshot paths; 15 new cases.
- [Browser parity tests](../../../test/e2e/canvas.spec.ts): both Classic and
  Canvas open all four originally failing forms, edit an unrelated selected-field
  alias, Save and reopen with the same canonical ORDER keys and directions.

Before editing, 323 existing tests passed. The new regressions reproduced the
parser refusals before the implementation. A temporary comparison captured
all 1976 valid corpus records, both `input` and `query_text`, with and without
metadata: **7904 generated outputs compared, zero changes**. No golden,
snapshot, fixture or classification baselines were updated.

## Verification

Final gates:

| Command | Result |
|---|---|
| `npm run typecheck` | Extension, Classic webview and Canvas projects passed. |
| `npx vitest run test/unit` | 3840 tests / 164 files passed; 49 new unit cases. |
| `npm run test:e2e` | 153 passed; 2 new Classic/Canvas cases. |
| `npm run test:integration` | 41 passed in the real VS Code host, exit 0. No concurrent integration test session was detected. |
| `npm run docs:check` | Documentation/link/history validation passed. |
| `git diff --check` | Passed. |

Baseline command:
`npx vitest run test/unit/sdblParser.test.ts test/unit/orderHierarchyDirection.test.ts test/unit/rawExpressionEof.test.ts`
— 323 passed. Targeted commands also exercised the new ORDER and EOF regressions.
The temporary corpus comparison commands were
`node /tmp/c21-corpus-parity.cjs before` and
`node /tmp/c21-corpus-parity.cjs after`; the script bundled the parser/generator
before and after the change and compared every generated output directly.

The initial full browser run had two new-test expectation failures and five
existing-test timeouts during an anomalous approximately 50-minute run.
The new assertions incorrectly expected redundant outer parentheses to survive
the existing formatter; they now explicitly assert canonical expression keys.
The seven affected browser cases subsequently passed in 8.4 seconds without
production changes or timeout increases.

## Limits and deliberately excluded work

No live 1C execution or wizard canonical-output attestation was performed.
This closes the bounded syntactic parser gap, not type validity (for example,
arithmetic on string `Валюты.Код`), DISTINCT restrictions or full platform grammar.
The structural acceptor remains limited under V3: even before this change,
`ЕСТЬNULL(Т.Количество, 0) + ()` parsed and had no malformed-expression finding.
A draft test expecting the acceptor to reject every empty operand was withdrawn
after confirming that pre-existing limit; dangling-operator blockers are tested.

C17 rendering, C18 alias disambiguation, broad A1/A2 work, English SDBL,
ORDER expression-editing UX and release/version changes are outside this task.
