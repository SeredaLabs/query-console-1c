# C17 literal follow-up: function CASE and tabular SELECT

Date: 2026-10-02. Uncommitted follow-up to the leaf SELECT fix over `25ac0e3`.
Scope: the two P1 findings in the [review](c17-literal-review-2026-10-02.md).

## Implementation

`reindentLeafCase` uses lexer positions to replace multiline string tokens with
collision-free quoted markers during its existing physical-line formatting,
then restores original lexemes. Markers cannot occur in the authored text;
restoration changes no other strings. Recursive formatting is bounded to one
protected pass because substituted tokens contain no line breaks. Existing
CASE layout still applies outside literals, including CASE inside functions.

`tsExprLines` now uses the existing `literalContinuationLines` helper on the
formatted expression. It adds tabular projection indentation only to code
lines, retaining the literal continuation text verbatim. Malformed-expression
handling stays unchanged. No new parser, recovery, store or schema mechanism.

The minimal CASE example now emits `"a\nb"` instead of `"a b"`. The tabular
projection emits `"a\nb"` instead of `"a\n\tb"`, and reopening no longer adds
tabs. Existing user-authored whitespace is retained.

## Tests and boundaries

The SELECT literal suite gains 85 tests (198 total): both comment modes;
scalar, tabular and nested-tabular paths; CASE inside a function; LF/CRLF,
blank lines, existing tabs, escaped quotes and CASE-looking literal text;
three reopen passes; and collision with marker-looking user strings.
Before the follow-up, 68 tests failed out of the first 197-test suite; the
marker-collision control was added with the implementation.

Tabular examples are local metadata-free parser/generator tests, not live
attestation that the synthetic source exists in the connected database.
No additional native execution is claimed for these two fixes. Earlier live
evidence establishes why literal bytes matter, and the earlier leaf fix's
runtime comparison remains a separate result.

The two reviewed paths are resolved by these bounded changes. This is not a
claim of exhaustive testing of every expression/platform combination. C17
remains OPEN for SELECT-field/group/TOTALS/ORDER comment preservation.
No golden/snapshot/classification updates, commit or push.

## Executed gates

| Command | Result |
|---|---|
| `npx vitest run test/unit/selectLiteralPreservation.test.ts` | Pre-fix: 68 failed / 129 passed; first post-fix run: 197 passed |
| `npm run typecheck` | All three targets passed |
| `npm run test:unit` | 4546 passed / 168 files, including all 198 literal tests |
| `node /tmp/c17-followup-corpus-compare.cjs` | 15,808 comparisons, 0 changes, 0 errors |
| `npm run test:e2e` | 172 passed |
| `npm run test:integration` | 44 passed, exit 0 |
| `npm run docs:check` | Passed |
| `git diff --check` | Passed |

[Corpus summary](c17-literal-followup-corpus-2026-10-02.json) compares frozen
HEAD `25ac0e3` against the complete worktree (leaf fix plus this follow-up),
using both metadata/comment modes and both input/query_text columns of all
1976 valid committed corpus rows. Existing corpus outputs are byte-identical.
The literal regression suite, rather than the existing corpus, covers these
newly reproduced cases. No expected-output baseline was regenerated.
