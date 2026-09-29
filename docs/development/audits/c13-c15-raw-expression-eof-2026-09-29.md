# C13–C15 — terminate raw-expression readers at EOF, 2026-09-29

Baseline: `eff7bff` (C12). C13, C14 and C15 are **CLOSED · P0**.
The priority reflects extension-host availability: `queryDiagnosticsController`
subscribes to `onDidChangeTextDocument` and calls `computeQueryParseProblems`,
which calls `tryParseBatch` synchronously. Catching exceptions cannot contain
heap exhaustion caused by repeatedly appending the non-advancing EOF token.

## Scope and behavior

Four loops change: `parseGroupFieldRef`, both function/comparison expression
loops in `parseOrder`, and `parseIndexField`. Each checks EOF before depth-based
expression boundaries. Unclosed parentheses throw the existing
`cur.error('ожидался символ «)»', token)` error with line and column. Balanced
expressions still end normally at EOF. Token consumption, raw slicing and other
boundaries are unchanged. No Cursor, recovery, commentBinder, C8, store,
generator, localization or dependency changes. C11 implementation remains pending.

## Pre-edit loop audit

The inventory below uses **baseline line numbers**, before the four changes.
Inspection covered every cursor peek/next loop, including enclosing loops that
advance through helpers. No additional EOF infinite loop of this class was found.
“Terminates” is an EOF resource-safety finding, not a claim of complete grammar
validation for every malformed expression.

| Baseline line(s) / reader | EOF termination argument |
|---|---|
| 1084 characteristics | Unconditional EOF error (C12). |
| 1146 selection modifiers | Finite optional modifiers; EOF matches none, reaches break. |
| 1212 cast-tab-section lookahead | Unconditional EOF return, independent of depth. |
| 1225, 1287 tab-section path lookahead | EOF is neither ident nor keyword; returns undefined. Offset advances by two otherwise. |
| 1240 cast prefix consumption | Bounded by the finite lookahead result. |
| 1243, 1304 tab-section path consumption | Previously validated finite path; even at EOF, mandatory `expectPunct('.')` throws. |
| 1356, 2192, 3894, 4435, 4630 dotted paths | EOF is not a dot; after a consumed dot the name check rejects EOF. |
| 1399 tabular column | Unconditional EOF break; enclosing projection requires `)`. |
| 1434 SELECT expression | Unconditional EOF break; malformed raw expression remains subject to the existing guard. |
| 1992 source subquery | Unconditional EOF error. |
| 2153 JOIN condition | Unconditional EOF break; optional JOIN also requires `}` in its parent. |
| 2345 positional arguments | Unconditional EOF error, independent of depth. |
| 2927 WHERE/HAVING condition | Unconditional EOF break, independent of parenthesis and CASE depth. |
| 3737 GROUP expression | **C13 fixed here**: depth-dependent EOF check appended EOF indefinitely. |
| 3845 ORDER outer loop | Invalid head rejects EOF; iteration continues only after consuming a comma; nested readers audited separately. |
| 3868 ORDER CASE | Unconditional EOF break, independent of parenthesis and CASE depth. |
| 3910, 3951 ORDER function / comparison RHS | **C14 fixed here**: both depth-dependent EOF checks appended EOF indefinitely. |
| 4086 totals aggregate | Unconditional EOF break; enclosing totals requires `ПО`. |
| 4319 period arguments | Unconditional EOF error. |
| 4489 INDEX function | **C15 fixed here**: depth-dependent EOF check appended EOF indefinitely. |
| 4517 lock names | EOF fails the ident/keyword predicate. Dotted-name reader advances or throws. |
| 4572 builder condition | Unconditional EOF break; enclosing builder requires `}`. |

Helper-driven loops also terminate: field/projection/source lists (1177, 1251,
1318, 1949), grouping and grouping sets (3686, 3704, 3707), totals lists
(4057, 4068), index lists/sets (4398, 4401, 4418), and builder fields (4554)
repeat only after consuming commas; EOF cannot match a comma. Required delimiters
reject missing closing syntax. Builder WHERE (917) and JOIN loops (1855, 1903,
1932, 1943) have predicates that reject EOF and consume their opening keywords or
braces on each iteration. Their nested readers are covered above. Remaining
array/string loops have finite bounds or decreasing slices; they do not consume
Cursor EOF tokens.

Previously recorded non-looping incomplete SELECT, WHERE, JOIN and ORDER CASE
slices remain outside this fix; see the [C12 raw-reader audit](c12-characteristics-eof-2026-09-29.md).
Their existing malformed-expression guard and the separate [C11 opaque-slot
ledger item](../technical-debt.md#correctness) remain unchanged. No new independent
finding requiring another ledger ID was identified by this audit.

## Regression evidence

`test/helpers/rawExpressionEofWorker.ts` bundles the real parser, diagnostic and
snapshot entry points into a temporary Node worker. Every potentially hanging
operation runs in a separate process with a 128 MB heap ceiling and 5-second
kill timeout. These test-containment bounds are not runtime restrictions or
performance assertions. Owned temporary bundles are removed after the suite.

For each of the four readers, tests cover minimal unclosed input, a nested closed
pair with its outer pair missing, direct parse and tryParse errors with line and
column, a diagnostic of kind `parse`, a nonthrowing incomplete semantic snapshot,
and a balanced EOF control accepted by all three consumers. Recovery is tested
as-is, without requiring a particular repair strategy.

Before the fix: **16 failed / 4 passed**, with resource failures confined to the
children and Vitest completing normally. After the fix: **20 passed**. Existing
targeted baseline: **325 passed**.

## Verification

- `npx vitest run test/unit/sdblParser.test.ts test/unit/queryDiagnostics.test.ts test/unit/buildSemanticSnapshot.test.ts test/unit/orderHierarchyDirection.test.ts` — baseline 325 passed.
- `npx vitest run test/unit/rawExpressionEof.test.ts` — red 16 failed / 4 passed; green 20 passed.
- `npm run typecheck` — passed.
- `npx vitest run test/unit` — 3573 passed across 152 files.
- `node /tmp/c13-compare.cjs` — 1976 byte-identical core and store outputs in each metadata mode; 0 changes.
- `npm run test:integration` — 38 passed.
- `npm run test:e2e` — 102 passed.
- `npm run docs:check` — passed.
- `git diff --check` — passed.

The temporary corpus command bundles the parser, generator, resolver and store
independently from the managed `eff7bff` worktree and the working tree, processes
all 1976 valid golden inputs with/without committed metadata, then compares the
core and store-generated strings byte-for-byte. It writes evidence under `/tmp`
and never updates fixtures. No golden, snapshot or corpus expectation changes.
One local commit; no push; stop before C11.
