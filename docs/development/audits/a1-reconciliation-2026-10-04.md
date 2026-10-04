# A1 reconciliation and re-plan (2026-10-04)

Status: audit/plan only, at `main` `5d9cf38` (after C25, PRs #13–#20). No code
changed. Baseline: the [A1 audit](a1-lexical-audit-2026-10-04.md) at `56045e5`.
The [ledger](../technical-debt.md) owns A1 status.

## Method

- Every one of the 321 appendix rows was mapped to `main`. Only
  `exprFormatter.ts`, `sdblGenerator.ts` and `sdblLexer.ts` changed in `src`
  since `56045e5` (+159/−29). 279 site bodies are byte-identical, and every
  `<module>`/compound row lies outside the changed hunks.
- The 228 `keep` rows sit in unchanged code and keep their classification.
- The 93 `migrate`/`investigate` rows were re-read in current code, in four
  groups. Each verdict records:
  - current location;
  - what the site determines;
  - literal/comment safety and its reachability;
  - the primitive a migration would use;
  - the expected behaviour change.
- Correctness claims were probed. The ones listed under *Separate findings* as
  verified were re-run here through the Designer product path (open →
  `computeBatchTextSafe` → `decideApply`).

## Reconciliation

| Category | Original | Done via C25 | Remaining for A1 | Notes |
|---|---|---|---|---|
| Classified sites | 321 | 5 | 30 | see verdicts below |
| Raw scanners | 55 (51 migrate · 4 keep) | 3 | 16 | 20 obsolete, 11 separate correctness, 1 investigate |
| Role / vocabulary sites | 65 | 0 | 12 | 32 keep, 16 obsolete, 3 separate, 2 investigate |
| Planned migrations | 83 | 5 | 28 | 36 obsolete, 13 separate correctness, 1 investigate |
| Investigate | 10 | — | 2 | 3 obsolete, 3 separate correctness, 2 still needed |
| C2 language-sensitive | 113 | — | — | not tagged per row in the appendix; owned by C2, not re-counted here |

The appendix did not record the 113 C2 entries row by row, so they cannot be
reconciled per site. C2 keeps its own inventory.

| Verdict | Sites |
|---|---|
| KEEP (no A1 work; unchanged code) | 228 |
| DONE | 5 |
| STILL NEEDED | 30 |
| OBSOLETE | 39 |
| C2-BLOCKED | 0 |
| SEPARATE CORRECTNESS | 16 |
| INVESTIGATE | 3 |
| **Total** | **321** |

**DONE (C25):**
- `appendIsNotNullTrailingSpace` (C25b-3);
- `stripRedundantLeafParens` post-pass (C25b-2);
- `stripNotFieldParens` (C25b-1);
- `renderConditionSubquery` (C25a);
- `reindentLeafBool` (C25d).

C25 fixed rewrite and insertion points. It did not centralize word roles, and
the scanners that decide where to rewrite still scan raw text.

**OBSOLETE (39), main reasons:**
- **Wrappers that follow one predicate:** the seven `isOr`…`isEnd`.
- **Inherently safe anchored patterns:** `stripNegatedFieldParens`,
  `tightenLeafInOperator`, `isScalarLiteralExpr`, `isBareParamExpr`.
- **Gates already re-validated by a token- or parse-based consumer:** e.g.
  `renderBool`, `caseHasNestedVyborInWhen`.
- **Already token-based:** e.g. `flattenLeafText`,
  `canonicalizeComparisonOperands`, `userComments`, `parseOneField`.
- **Model-path string processing:** the `dropRedundantGroupDerefs` drivers.
- **No longer present:** the `semanticValidator` sets.
- **Out of A1:**
  - BSL host-string query detection (`queryAtCursor`): BSL strings are often
    unlexable while typing, and it maps BSL offsets;
  - the highlighter vocabulary and `classify`: cosmetic, and must tolerate
    incomplete text.

**INVESTIGATE (3):**
- The identifier charset `[A-Za-zА-Яа-яЁё_]` in `exprAutoAlias.BARE_PARAM` /
  `representationAutoAlias` and the parser's `BARE_PARAM_ALIAS` differs from
  the lexer's `\p{L}`: `&Ціна` gets the alias `Поле1`, `&Цена` gets `Цена`.
  This needs platform evidence.
- `moveBeforePrefixGroupDerefToEnd` uses plain substring matching.

## Current lexical inventory

**Remaining raw-text scanning (20 still-needed sites):** the 16 rows of kind raw-scanner plus four regex gates classified as slice/role/vocabulary (`renderVirtualParams`, `builderBlock`, `AGG_RE`, `MOVEMENT_RE`).

| Site | Determines | Action |
|---|---|---|
| `sdblParser.stripLineComments`, `stringLiteralRanges` | private copies of the lexer string/date/comment rules | migrate to `codeRanges`/comment tokens. The current behaviour on unlexable text must be decided first: both have callers where text may not lex |
| `sdblGenerator.renderVirtualParams`, `bodyHasUnwrappedBoolOr`, `reflowInlineMembershipSubquery` (scans), `breakInlineParenGroup`, `builderBlock` | keyword regex gates (`ВЫБОР`, `ВЫБРАТЬ`, `ИЛИ`, `НЕ (`) over user text | migrate to tokens + `isWordToken`; layout-only, literal-blind |
| `sdblGenerator.splitTopLevelBoolConjuncts`, `stripOneEnclosingParen`; `exprFormatter.isPureBalancedList`, `valueListIsMulti`; `sdblParser.stripOuterParens` | raw paren/comma depth; three ignore strings (latent) | migrate to `tryTokenize` + existing `hasTopLevelComma`/`hasTopLevelBooleanOp` or a local token-depth loop |
| `exprFormatter.isSingleTopLevelCaseValue`, `opensWithTopLevelVybor`; `sdblParser.isCompactSubquerySource`, `hasRedundantHavingOrParens` | keyword counts/regexes over whole text, incl. literals/comments | migrate to token word checks |

`dropRedundantGroupDerefs` (`AGG_RE`, `containsFieldRef`, `isMovementCaseExpr`,
`MOVEMENT_RE`/`derefInResultPosition`) also counts as still needed. It is
oracle-fidelity GROUP BY gating and needs metadata plus contrived literal text.
The in-file token-based `extractFieldRefs` is the natural reuse. `AGG_RE` holds
English aggregate names that the lexer treats as `ident`, so its English
behaviour must stay unchanged (C2).

**Helpers added by C25 (not in the 321):**
- `replaceInCodeRanges` exists twice: in `exprFormatter` (replacer function)
  and in `sdblGenerator` (replacement string);
- `isCodeAt` in `sdblGenerator`, plus two inline `inCode` lambdas in
  `exprFormatter`;
- `trimCodeEdges`;
- `literalContinuationLines`.

They are small near-duplicates around `codeRanges`. Consolidating them is
low-value and optional.

**Word-role duplication:**
- 7 named predicates:
  - `exprFormatter`: `isWord`/`isAnd`, plus 7 wrappers;
  - `expressionSyntaxCheck`: variadic `isWord` (RU+EN);
  - `queryTextFormatter`: `isKw`;
  - `sdblParser`: three identical `isIdentWord` closures, and `isNotToken` (on `.text`).
- About 60 inline `(ident|keyword) && toUpperCase() === W` checks.
- For ident/keyword tokens, `value` and `text` uppercase to the same string. One
  predicate on the canonical value therefore preserves behaviour at every
  reviewed site. The benefit is removing the keyword-vs-ident trap (lexer
  keywords are Russian-only; `НЕ`/`ИЛИ`/`ВЫБОР`/`ССЫЛКА`/`ВОЗР` are `ident`),
  not removing lines.
- Dead keyword-only checks (`ВОЗР`, `ССЫЛКА`) are behaviour changes when made
  live: `ССЫЛКА` is a separate finding, and `ВОЗР` is masked.
- Dead ASCII `\b` Cyrillic guards stay untouched in A1.

**Keyword dictionaries:**
- True duplicates:
  - `qualifyBareFields.PRIMITIVE_TYPES` equals `exprFormatter.PRIMITIVE_TYPE_WORDS`;
  - the period sub-list inside `EXPR_STOP_WORDS` copies `PERIOD_WORDS`, and has
    already drifted (separate finding).
- Contextual sets stay local, composed from shared parts where they copy one:
  `EXPR_STOP_WORDS`, `STRUCTURAL`, `PRED_NEIGHBOR_WORDS`,
  `UNARY_MINUS_PREV_WORDS`, `CALL_NOSPACE_WORDS`.
- Metadata vocabularies are not lexical: `METADATA_KINDS`, `TYPE_PREFIXES`.
- `FUNCTION_WORDS` is already single-source.
- The English words in `STRUCTURAL` and `expressionSyntaxCheck` belong to C2.

**Primitives:**

| Primitive | Consumers | Verdict |
|---|---|---|
| `isWordToken(token, ...words)` on canonical `value` | ≈10 named predicates + ≈60 inline checks; 9 still-needed rows; also the token-based replacement for the keyword-regex gates | **KEEP**, behaviour-preserving where it replaces an equivalent check |
| Shared keyword dictionaries | only `PRIMITIVE_TYPES` is a behaviour-preserving dedupe | **DROP FROM A1** as a project; fold the one dedupe into slice A1-1 |
| `tokenDepths` | already-token loops: 2 array-shaped consumers of ~5 lines each; the raw depth scanners can use existing `hasTopLevel*` operations or a local loop over `tryTokenize` | **DROP FROM A1** |
| `codeRanges` | 10 call sites | exists; reuse, do not redesign |
| unknown → preserve | lexical contract | stays the policy for every slice |

## Proposed A1 slices

All slices follow the [lexical contract](../expression-lexical-contract.md).
None of them intends to change SDBL output on any input whose literals and
comments contain no keyword- or paren-looking text.

Required gates for each slice: typecheck, targeted and full unit tests,
G2/G3/G5, corpus (4 modes) byte-identical, e2e, integration.

| Slice | Purpose | Sites | Primitive | Behaviour change | Tests | Out of scope |
|---|---|---|---|---|---|---|
| **A1-1** word roles | `isWordToken` exported from the lexer. Migrate `exprFormatter` `isWord`/`isAnd`, `expressionSyntaxCheck.isWord`, `sdblParser` `isIdentWord`×3, `isNotToken`, `collectConditionTokens`, `hasTopLevelOr`, `splitJoinConjuncts`, the `parseOrder`/`parseBuilderField` inline checks. Dedupe `PRIMITIVE_TYPES` | 9 rows (+ inline checks in those functions) | `isWordToken` | none; dead/masked keyword-only checks keep their current result | unit tests for `isWordToken` (ident/keyword/case/EN-as-ident); existing parser/formatter suites | `ССЫЛКА` fix, `ПОЛУГОДИЕ` drift, C2 English words, `\b` guards |
| **A1-2** parser lexical-rule copies | `stripLineComments`, `stringLiteralRanges` from lexer facts; `lexicalIssue` from `SdblLexError.pos` instead of parsing the message | 3 | comment tokens / `codeRanges`, `SdblLexError` | none on lexable text. Step 1 decides unlexable-text behaviour per caller (keep the current result) | batch-split and comment-strip parity on corpus + unlexable inputs | completion `inStringOrComment` (separate finding) |
| **A1-3** generator VT/builder scanners | keyword gates and raw depth in `renderVirtualParams`, `splitTopLevelBoolConjuncts`, `bodyHasUnwrappedBoolOr`, `reflowInlineMembershipSubquery` (scans), `breakInlineParenGroup`, `stripOneEnclosingParen`, `builderBlock` | 7 | tokens + `isWordToken` + existing `hasTopLevel*` | none intended; differs only where a literal or comment contains a keyword or paren, which is the defect class itself, so each site gets a regression | per-site literal/comment isolation regressions + current-output pins | N1 (`КАК` in DCS literal), N3, `mergeDcsBraces`, C26 |
| **A1-4** formatter/parser scanners + group derefs | `isSingleTopLevelCaseValue`, `opensWithTopLevelVybor`, `isPureBalancedList`, `valueListIsMulti`, `isCompactSubquerySource`, `hasRedundantHavingOrParens`, `stripOuterParens`, `dropRedundantGroupDerefs` gates | 11 | same as A1-3; `extractFieldRefs`, `AGGREGATE_WORDS` | as A1-3; English `AGG_RE` behaviour kept | as A1-3, with resolver fixtures for group derefs | `reindentLeafSubquery`, `opensWithVyborInCall`, `reindentLeafCase` literal-gate findings |

Dependencies:
- A1-1 first: A1-3 and A1-4 use `isWordToken`.
- A1-2 is independent.
- A1-3 and A1-4 are independent of each other.
- The *Separate findings* do not block A1, but fixes to the same functions
  should land before the A1 slice that touches them.

## A1 exit criteria

A1 can be CLOSED without another broad audit when:

1. Every STILL NEEDED row above is migrated or explicitly reclassified, with a
   reason, in the ledger or a slice report.
2. Word roles have one owner (`isWordToken` on the canonical value). No local
   ident-vs-keyword word predicate remains in parser, formatter, generator or
   syntax check. Inline vocabulary tests may remain where they use that owner.
3. No private copy of the lexer's string/date/comment rules remains in query
   core, except documented consumers of unlexable text (UI tolerance, BSL host
   strings).
4. Every lexical-sensitive transformation in query core acts only on code
   (`codeRanges`, tokens or `literalContinuationLines`). Unknown lexical facts
   preserve the text.
5. Keyword vocabularies that copy a shared set are composed from
   `sdblKeywordSets`. Contextual sets stay local by design.
6. C2 language work, the dead `\b` guards and the separate findings are
   recorded outside A1 with owners.
7. The remaining exceptions are listed by name with their class:
   - UI highlighter and completion;
   - BSL query detection;
   - anchored patterns that are safe by construction;
   - model-path string processing.

Not a criterion: "no regex in query core".

## Separate findings (not A1; classification only)

**Verified through the Designer product path** (open → `computeBatchTextSafe` →
`decideApply` returns `{ok:true}`). All are on current `main`:

| # | Site | Repro → output | Class |
|---|---|---|---|
| R1 | `sdblGenerator.mergeDcsBraces` brace scan | VT `{Ф = "a} {b"} {Г = 1}` → `{Ф = "a, b", Г = 1}`; `"} {"` → `", "` | literal content rewritten (C25 class; same root as N2) |
| R2 | `exprFormatter.stripRedundantCallWrapParens` post-pass | `ВЫБОР КОГДА Т.Б = "( x )" … КОНЕЦ + (СУММА(Т.А))` → `"(x)"` | literal content rewritten (C25 class) |
| R3 | `exprFormatter.reindentLeafSubquery` | multi-line literal inside a JOIN `ПО` / VT-condition / CASE-branch subquery: `"а   ⏎⏎ПО б   ⏎И⏎\t\tв"` → `"а   ⏎ПО⏎\tб⏎И в"` | literal content rewritten (C25 class) |
| R4 | `canonicalizeFieldCasing.canonExprText` | with metadata and preserved comments: `// Т.наименование` → `// Т.Наименование` | comment text rewritten |
| R5 | `sdblParser.inferUndefinedTempTables` | with a resolver (Designer opens with one): `ВЫБРАТЬ Т.А // см. Т.Фантом … ; ВЫБРАТЬ Т.* ИЗ ВТ КАК Т` adds `Т.Фантом КАК Фантом`; `"Т.Строка"` adds `Т.Строка`. Supersedes A1 audit finding 4 ("not reproduced") | comment/literal content becomes structure |
| R6 | `sdblParser` `EXPR_STOP_WORDS` period list | `ГДЕ НАЧАЛОПЕРИОДА(Т.Дата, ПОЛУГОДИЕ)` → `Т.ПОЛУГОДИЕ` (`КВАРТАЛ` control is fine) | vocabulary drift from `PERIOD_WORDS` |
| R7 | `expressionSyntaxCheck.isStructurallyValidExpression` | `Т.А + "50%" +` → valid; `Т.А + "x" +` → invalid | literal content bypasses the check |

R1–R3 are the same defect class C25 closed. They escaped both the C25
regression suites and the closure check, whose payloads contained neither
`} {` nor `( x )` in a call-wrapper context, nor multi-line literals inside a
leaf subquery.

**Reported by the review with a probe, not re-run here:**
- `opensWithVyborInCall` and `reindentLeafCase`: a literal containing
  `ВЫБОР`/`ВЫБРАТЬ` changes the layout.
- `synthesizeTempTableFrom`: checks `ССЫЛКА` as a keyword (dead), so the
  implicit `ИЗ ВТ` is not synthesized.
- `extractQueryStrings` (CLI): misses query strings that start with `//`.
- `expressionCompletion.inStringOrComment`: a `"` in an earlier comment
  suppresses completion.
- `reflowCharacteristics`: the comment/operator join is A1 audit finding 3; the
  Designer refuses the text.
- Unverified lead: a `//` comment inside an inline `В (ВЫБРАТЬ … // c ГДЕ …)`
  subquery may be dropped.

**Known items, unchanged:**
- C26 (paren drift);
- N1 (`КАК` in a DCS-brace literal suppresses `Поле2`; confirmed);
- N2 (root of R1);
- N3 (`parenDelta` line-local in `reindentVtCondition`);
- N4 (accounting path lacks `mergeDcsBraces`).

## Later verification (for a Test Architecture Audit)

The C25 closure check (4515 → 980 → 0 hits) caught real defects, but missed
R1–R3 because the payload set was finite. Recommended future work, not part of
A1:
- preservation fuzz;
- structural-isolation fuzz;
- metamorphic round trip (fixed point);
- automatic shrinking;
- an optional differential oracle;
- selected live 1C probes.

Minimum invariants:
1. Literal bytes are preserved.
2. Comment bytes are preserved.
3. A literal payload cannot change the surrounding structure (N1, R5, C26).
4. A comment payload cannot change the surrounding structure.
5. Keyword- or syntax-looking literal content stays data.
6. A round trip reaches a fixed point (C26).
7. The relevant QueryModel structure is preserved.
8. Apply never silently accepts a destructive transformation.

The payload set should be generated from the lexer's own delimiters and the
keyword sets, not hand-picked.
