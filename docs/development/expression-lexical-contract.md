# Expression lexical contract (A1)

The existing `sdblLexer.Token` is the lexical representation. Do not add a second
character scanner to recover lexical facts when that lexer rejects an expression.
This contract first covers the four A1 generator consumers; it is not a claim
that every legacy scanner in the generator/formatter has been migrated.

## Strict facts and recovery have different consumers

`tokenize` retains its strict parser contract. `tryTokenize` calls the same lexer
and returns `Token[] | undefined`, catching only `SdblLexError`. A defined result
includes original spelling, positions and EOF (also for empty input). Undefined
means the complete text cannot be lexed; it is neither an empty token stream nor
proof that an operator, comma or delimiter is absent. Unexpected errors propagate
to the existing controlled error boundary.

Optional generation transformations preserve the original expression when lexical
facts are unavailable. They do not split, trim, repair, remove parentheses or
canonicalize it based on guesses. Surrounding query syntax/layout is still rendered.
This is lexical completeness only: balanced delimiters, precedence and expression
validity remain separate concerns with their existing checks.

IDE assistance already uses `repairLexicalErrorsForRecovery` for parameters and
semantic snapshots. It masks bad spans and preserves offsets for advisory facts.
Its repaired text must not replace user-authored text during generation. It remains
unchanged here. Several `exprFormatter` transformations already preserve raw input
on lexer failure; their broader migration is separate work.

## Migrated operations and audited consumers

| Operation | Lexer failure | Consumer policy |
|---|---|---|
| `hasTopLevelBooleanOp` | `undefined` | Only `=== true` authorizes Boolean splitting/layout; absence-dependent rewrites require `=== false`. |
| `hasTopLevelComma` | `undefined` | Only `=== true` proves a tuple; only `=== false` permits scalar wrapping/parenthesis removal. |
| `splitTopLevelAnd` | `[originalText]`, without trim | Unknown expressions cannot be expanded into conjuncts. |
| `moveNotBeforeTuple` | `originalText` | No guessed closing delimiter or movement of NOT. |

The old `hasTopLevelBooleanOpRaw`, `splitTopLevelAndRaw`, `hasTopLevelCommaRaw`
and `findTupleCloseRaw` are removed, not relocated.

Boundary guards precede formatting of custom JOIN conjuncts and legacy JOIN text,
custom WHERE/HAVING conditions, generic/accounting virtual-table arguments,
builder field references, and `formatSelectExpression` / `formatExpression`.
These are necessary because merely returning false from a detector could route
unknown text into another formatter. DCS wrappers and the NOT-operand parenthesis
remover also require known negative facts. Valid expressions keep existing
formatting, including current BETWEEN, case and depth rules.

## Invalid text: one rule for every slot

When `tryTokenize` is undefined, generator and formatter emit the stored text
verbatim in the slot's normal position. They do not wrap, trim, split, reindent
continuations, canonicalize case, or invent in-expression layout.

Surrounding query syntax still uses the slot's indent and line breaks (the
leading tab of a SELECT field, `ПО` before a JOIN conjunct, each virtual-table
argument on its own indented line). When the *complete* slot/prefix text fails
`tryTokenize`, a slot delimiter such as `)` is placed on the following line so
a trailing `//` cannot swallow it. An unclosed string literal is multiline and
still absorbs the rest of the query; that is acceptable because Apply refuses
the text and the preview shows it verbatim. The extra line is not claimed to
protect against strings, and a valid multiline `"a` / `b"` must not be treated
as lexer-failure of its last line alone.

That is not a second wrapper around the expression: JOIN no longer adds
`(invalid\n)` for lexer-rejected text; builder `{ГДЕ}` does not wrap an invalid
condition in extra parentheses.

The shared Classic/Canvas Apply checks are unchanged. Tests verify lexically broken
expressions stay in the model and preview while Apply refuses them, for every
expression slot the generator prints. This does not certify platform validity or
repair unrelated store/persistence gaps.

## Evidence and limits

Baseline: working tree after A1.4 (including uncommitted A1.3/A1.4).
The earlier [A1.3](audits/a1-comma-2026-09-29.md) and
[A1.4](audits/a1-tuple-2026-09-29.md) reports describe historical migration steps;
their raw-fallback contracts are superseded by this document.

- Existing targeted baseline: 142 tests passed.
- 25 existing lexer-failure test cases now assert unknown/no-op instead of the
  former scanner result. This intentionally changes incomplete-input behavior;
  valid-input expectations are unchanged. For example, `А = & И Б` now remains
  one original fragment; NOT is no longer moved in `(А, &) НЕ В (&П)`.
- Eight new `tryTokenize` cases cover spelling/positions/comments, empty input,
  no partial facts, and propagation of unexpected failures.
- 49 new preservation cases originally covered seven input shapes in seven
  placements. The same seven shapes now run in every generator expression slot
  (JOIN, WHERE/HAVING, virtual tables, builder, SELECT/trailing, GROUP, ORDER,
  INDEX, totals, periodBy, tabular-section expressions, castPrefix, selection
  criterion), plus layout checks that a trailing `//` cannot swallow a slot
  delimiter. Generator/model preservation, preview availability and Apply
  refusal remain the gate. Valid multiline string literals keep HEAD layout
  (closing `)` stays on the last line of the literal).
- Before/after generation of 1976 committed queries, with and without metadata:
  zero output differences. No golden, snapshot, fixture or classification changes.
- A browser regression enters three lexical errors, navigates away and back,
  checks retained text and disabled Save, then corrects the input and saves.

An existing store gap was exposed by these tests: `modelToFlat` and
`buildModelFromFlat` omit top-level `QueryModel.having`, even with GROUP BY.
Direct generation preserves it; `LOAD_BATCH → assembleBatch` does not. Reproduced
with `ВЫБРАТЬ В.Код ИЗ Справочник.Валюты КАК В СГРУППИРОВАТЬ ПО В.Код ИМЕЮЩИЕ В.Код > 0`.
This was subsequently fixed separately as [C9](audits/c9-having-2026-09-29.md).
The initial A1 tests used a retained source-subquery model for HAVING preview/Apply;
after C9 they exercise the top-level HAVING path directly.

No live 1C execution was performed. The independent tree-sitter WASM oracle remains
unavailable. No parser replacement, AST, new recovery grammar, IDE behavior change,
or migration of additional scanners is included.

## Executed checks

Final results: all three typechecks and **3504 tests in 146 unit-test files
passed**; the complete browser suite passed **92 tests**, including the new
typing/correction scenario. Documentation validation and diff whitespace checks
passed.

```sh
# Existing baseline
npx vitest run test/unit/hasTopLevelBooleanOp.test.ts test/unit/splitTopLevelAnd.test.ts test/unit/hasTopLevelComma.test.ts test/unit/moveNotBeforeTuple.test.ts test/unit/applyGeneratedOutput.test.ts test/unit/joinLineComments.test.ts test/unit/corpusRegression.test.ts
# Test-first contract check
npx vitest run test/unit/expressionLexicalFailure.test.ts test/unit/hasTopLevelBooleanOp.test.ts test/unit/splitTopLevelAnd.test.ts test/unit/hasTopLevelComma.test.ts test/unit/moveNotBeforeTuple.test.ts
# Preservation checks during implementation
npx vitest run test/unit/expressionLexicalFailure.test.ts
# Expanded targeted check
npx vitest run test/unit/tryTokenize.test.ts test/unit/expressionLexicalFailure.test.ts test/unit/hasTopLevelBooleanOp.test.ts test/unit/splitTopLevelAnd.test.ts test/unit/hasTopLevelComma.test.ts test/unit/moveNotBeforeTuple.test.ts test/unit/applyGeneratedOutput.test.ts test/unit/joinLineComments.test.ts test/unit/corpusRegression.test.ts
npm run typecheck
npm test
npm run test:e2e
npm run docs:check
git diff --check
```

The test-first run failed as expected. An initially incorrect builder fixture was
corrected to the existing model shape; HAVING preview checks were narrowed after
identifying C9. No production store changes were made to satisfy these tests.
