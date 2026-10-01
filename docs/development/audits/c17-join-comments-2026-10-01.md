# C17: JOIN condition comment preservation

Date: 2026-10-01. Baseline: `cd3250c7b55e88a35b84595385acdc84e1742c82`
(version 0.1.96). Current status belongs to the [ledger](../technical-debt.md).
C17 remains OPEN for field, grouping, TOTALS and ORDER raw slots.

## Bounded behavior change

Previously the JOIN reader and conjunct classifier discarded line comments.
The shared designer detected missing occurrences and required consent before
loading. The generator's existing manual-comment path did not provide parser
round-trip preservation.

With `preserveComments`, the [parser](../../../src/core/query/sdblParser.ts)
collects JOIN condition comments through the existing lexer and records their
positions in the existing parser-owned condition-comment set. CommentBinder's
position-based exclusion and nested-position translation are reused unchanged.
No token stream, grammar, recovery, source-map range or lexical fallback changes.

[JoinCondition](../../../src/core/query/queryModel.ts) gains optional
`commentLeading` and `commentTrailing` arrays, following the existing Condition
anchor contract. Edge comments leave structured field comparisons editable;
internal comments retain the original expression slice as an existing custom
conjunct. Token-proven outer parentheses can be removed without dropping comments
in their gaps. Existing saved models without anchors retain their behavior.

The [generator](../../../src/core/query/sdblGenerator.ts) reuses condition
indentation and its comment-safe closing-delimiter helper. Generated `И`, `)`,
dynamic JOIN `}` and comma-source separators cannot become trailing comment text.
Expansion of an AND group transfers leading anchors to its first conjunct and
trailing anchors to its last. Internal commented expressions bypass formatting;
Boolean wrapping retains their conjunct boundary when another conjunct is added.

Nested source/condition rendering must also avoid inserting indentation into
multiline literals. A final strip-mode regression exposed four failures when the
literal protection was conditional on comments still being present. The shared
lexer therefore supplies literal-line positions to existing condition indentation
and subquery renderers regardless of comment mode, including blank literal lines.
This intentionally fixes padding of multiline literals in nested output, including
stripped output; other canonical layout is unchanged. It is necessary for safe
preservation when users toggle comments, not a general formatter redesign.
Comment text/counts and literal spelling survive;
original comment positions and whitespace outside literals are not promised.

The [strip-comments view](../../../src/webview/state/queryStore/snapshots.ts)
removes JOIN conjunct anchors and raw comments recursively without mutating the
preserving model. Parsing without preservation retains the prior behavior.
The shared open warning, explicit consent and malformed Apply guards are unchanged.

## Regression evidence and expected changes

Before production edits, 813 relevant existing tests passed. The initial new
147-test matrix failed 145 tests on the baseline (two structural controls passed).
A later AND-group expansion check exposed 32 additional failures before its fix.

The final [JOIN matrix](../../../test/unit/joinComments.c17.test.ts) has 229 tests:
metadata on/off; leading/internal/trailing comments; AND/OR/NOT/BETWEEN/CASE;
strings including slash text and multiline blank lines; top-level/EOF/source and
condition subqueries; UNION; nested JOINs; dynamic JOINs and comma sources;
three reopens; nonmutating strip mode; duplicate comments across nested slots;
JSON model round-trip plus adding a conjunct; malformed Apply refusal.

Two former known-loss JOIN shapes, each in two metadata modes, leave the C16
known-loss matrix. The nested JOIN open case moves from consent to preservation.
Field/group/TOTALS loss expectations remain. Browser and real-host consent fixtures
now use unsupported field-expression comments, retaining Cancel/Continue, dialog,
supersession and malformed-save assertions. Four new browser cases cover both
Classic and Canvas, an alias edit, top-level/nested JOIN and three Save/reopens.
One new real-host case checks JOIN comments through the production Canvas bridge
and preservation of the surrounding BSL document.

Example: `ПО Т.Код = Б.Код // note` followed by `ИЛИ Т.Код = &Код` previously
lost `// note`. It now retains that comment inside the custom Boolean conjunct;
a following conjunct is still connected outside its parentheses.

Frozen HEAD versus working tree compared all 1976 valid corpus records, both
`input` and `query_text`, metadata on/off and preservation on/off:
**15,808 outputs, zero byte differences, zero parse failures on either side**.
No golden, snapshot or corpus-classification baseline changed. Two hand-written
[closing-parenthesis layout expectations](../../../test/unit/multilineStringCloseParen.test.ts)
previously included an added tab / three tabs inside `"a\nb"` in source/condition
subqueries. They now expect the original literal text; explicit token equality
checks protect its spelling. The original closing-parenthesis assertion remains.
The third virtual-table case is unchanged. These are reviewed expected output
changes, not platform-backed canonical oracle updates. Intentional output
changes are limited to the new comment-preserving cases above.

## Verification

| Command | Result |
|---|---|
| `npx vitest run test/unit/rawSliceComments.c16.test.ts test/unit/conditionComments.c17.test.ts test/unit/commentsRoundTrip.test.ts test/unit/openDesignerBatch.test.ts test/unit/booleanGroupingSemantics.test.ts` | Pre-edit baseline: 813 tests / 5 files passed. |
| `npx vitest run test/unit/joinComments.c17.test.ts` | Initial baseline: 145 failed / 2 passed; expanded JOIN matrix: 229 passed. |
| `npx vitest run test/unit/multilineStringCloseParen.test.ts test/unit/joinComments.c17.test.ts test/unit/conditionComments.c17.test.ts` | Final targeted gate, including strip-mode literal preservation: 517 passed. |
| `npm run typecheck` | Extension, Classic and Canvas passed. |
| `npm run test:unit` | 4348 tests / 167 files passed. |
| `node /tmp/c17-join-corpus-compare.cjs` | HEAD versus worktree: 15,808 outputs, zero changes. |
| `npm run test:e2e` | 172 passed. |
| `npm run test:integration` | 44 passed in the real VS Code host; exit 0. |
| `npm run docs:check` | Passed. |
| `git diff --check` | Passed. |

Optional grammar WASM checks remain unavailable in this checkout; passing unit
results do not mean that independent oracle ran. No live 1C execution or general
input/output semantic-equivalence claim. No release or push in this task.

## Remaining scope

Continue C17 with the remaining raw slots in separate bounded tasks. This slice
does not change field/group/TOTALS/ORDER preservation, introduce a new lexer or
expression grammar, migrate A2/A3, or remove existing compatibility paths.
