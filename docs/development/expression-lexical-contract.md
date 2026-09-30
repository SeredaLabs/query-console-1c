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

## Regression evidence

[expressionLexicalFailure.test.ts](../../test/unit/expressionLexicalFailure.test.ts)
checks explicit unknown results and verbatim malformed slots;
[raw argument comments](../../test/unit/rawSliceComments.c16.test.ts) cover
comment-safe surrounding delimiters. Broader acceptance/preservation/recovery
boundaries are in the [safety contract](contracts/safety-and-preservation.md).
A1 status lives only in the [ledger](technical-debt.md).

The [archived lexical checkpoint](audits/archive/expression-lexical-e3b36a5.md)
preserves migration decisions, intermediate failures, comparisons and exact
historical commands/counts. Earlier comma/tuple raw-fallback policies are
superseded; they do not authorize reintroducing a scanner after lexer failure.
