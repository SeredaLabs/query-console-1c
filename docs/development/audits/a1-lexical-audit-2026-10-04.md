# A1 lexical ownership audit (2026-10-04)

Status: audit only, at `56045e5` (clean `main`). No code changed. The
[ledger](../technical-debt.md) owns A1/C status; this report is evidence.

## Method

- **Scope:** all 236 `.ts`/`.tsx` files under `src/`.
- **Primary scan:** per function, looking for
  - `tokenize`/`tryTokenize` calls;
  - character indexing;
  - depth counters;
  - quote comparisons;
  - regexes and literals containing Cyrillic keywords;
  - keyword sets.

  This flagged 56 files and 295 function sites.
- **Supplementary sweep:**
  - `for … of` character loops;
  - `indexOf('//')`;
  - `split`/`replace`/`match` with Cyrillic;
  - `new RegExp`;
  - alternative index names.

  This flagged 9 more files: 2 SDBL-related, 7 false positives.
- **Classification:** each site was read in code and classified by kind and
  class (keep / migrate / investigate). Rows derived from agent code reading
  are marked as such; independently re-verified facts are listed under
  *Verified findings*.

## Lexical flow

```text
SDBL text
  └─ sdblLexer.tokenize / tryTokenize (leaf, no imports): Token{type,value,text,pos,line,col}
       ├─ sdblParser (token cursor; also raw-slices sources by token pos)
       │    ├─ commentBinder, argComments          (comments → model)
       │    ├─ qualifyBareFields, wrapTabSectionAggregates, dropRedundantGroupDerefs,
       │    │  dropUserIBConditions, dropUnlimitedStringConditions, canonicalizeFieldCasing
       │    └─ exprFormatter (imported by the parser too)
       │         → QueryModel / BatchDocument
       ├─ sdblGenerator (+ exprFormatter, functionCatalog, sdblKeywordSets) → canonical SDBL
       ├─ validation: validateBatch → semanticValidator, expressionSyntaxCheck, queryLinter
       ├─ recovery: selectListRepair.repairLexicalErrorsForRecovery
       │            → buildSemanticSnapshot, queryParameters
       └─ webview: openDesignerBatch, expressionContext, queryStore snapshots (tokenize)
own scanners outside the lexer: queryHighlight.TOKEN_RE, expressionCompletion,
  extractQueryStrings / extension queryAtCursor (BSL host strings), fieldChain (cursor)
shared vocabulary: sdblKeywordSets (leaf, no imports), functionCatalog
```

Dependency direction is one-way into `sdblLexer` and `sdblKeywordSets`. Neither
imports anything, and `src/core` imports nothing from webview or extension.

## Verified findings (re-run by hand on `56045e5`)

1. **String-literal content is silently rewritten, and Apply allows it** (9
   cases). Each was reproduced through the product path: Designer open,
   `LOAD_BATCH`, `computeBatchTextSafe`, `decideApply`.

   | Input literal | Output | Culprit |
   |---|---|---|
   | `"НЕ(x)"` (WHERE with ИЛИ) | `"НЕ x"` | `exprFormatter.stripNotFieldParens` |
   | `"a  b"` (`(Т.Код) = …`) | `"a b"` | `exprFormatter.stripRedundantLeafParens` post-pass |
   | `"ЕСТЬ НЕ NULL)"` | `"ЕСТЬ НЕ NULL )"` | `exprFormatter.appendIsNotNullToLine` |
   | `"Пользователи.x"` in an IN subquery | `"Справочник.Пользователи.x"` | `sdblGenerator.renderConditionSubquery` alias rewrite |
   | VT `"{&x}"` | `"{(&x)}"` | `sdblGenerator.wrapDcsBraceParam` |
   | VT `"{(a)}"` | `"{(a) КАК Поле2}"` | `sdblGenerator.aliasDcsBraceExprs` |
   | VT `{Ф = "a  b"}` | `"a b"` | `sdblGenerator.mergeDcsBraces` |
   | VT `("a  b", Ф) В (ВЫБРАТЬ …)` | `"a b"` | `sdblGenerator.reflowInlineMembershipSubquery` |
   | VT multi-line `"a⏎  b"` | `"a⏎\t\t\t\t\tb"` | `sdblGenerator.reindentVtCondition` |

   Cause: raw regex/character scanners that do not skip string tokens.
   Proposed new debt item **C25**.
2. **Dead guards.** JavaScript `\b` is ASCII-only even with the `u` flag, so
   `/\bВЫБОР\b/u` and `/\bВЫБРАТЬ\b/u` never match Cyrillic. There are 4
   sites: 3 in `exprFormatter`, 1 in `sdblGenerator`. Migrating them changes
   behavior unless the old false result is preserved deliberately.
3. **`{ХАРАКТЕРИСТИКИ}` with a comment ending in an operator character.**
   The core reflow joins the next clause into the comment. The Designer open
   path refuses the text (comment-loss safety net), so no silent loss occurs
   in the product.
4. **`inferUndefinedTempTables`** (named in the ledger) scans raw statement
   text. The agent-reported phantom columns from comments and literals were
   *not* reproduced here. In resolver mode, a `*` over an undefined temporary
   table produced an empty projection. That mode is used only by advisory and
   CLI paths. Investigate in PR-9.

## Proposed decomposition

The audit proposes these slices. The list is a decomposition proposal, not a
fixed roadmap contract: the remaining A1 work is re-evaluated after every few
slices, and slices are merged or split only when the code confirms it.

| Slice | Scope | Sites |
|---|---|---|
| PR-1 (C25a) | `codeRanges` in `sdblLexer` + `renderConditionSubquery` rewrite | 1 |
| PR-2 (C25b) | formatter literal cases | 4 |
| PR-3 (C25c) | virtual-table / DCS literal cases | 6 |
| PR-4 | one shared word-role predicate; role checks on canonical `value` | 20 |
| PR-5 | keyword vocabularies into `sdblKeywordSets` | 3 |
| PR-6 | token depth helper for token loops | 1 |
| PR-7 | generator raw scanners | 6 |
| PR-8 | formatter raw scanners, in small batches | 19 |
| PR-9 | parser raw scanners incl. `inferUndefinedTempTables` | 8 |
| PR-10 | `dropRedundantGroupDerefs` | 10 |
| PR-11 | shared query-keyword detection for `extractQueryStrings` / `queryAtCursor` | 3 |
| PR-12 | highlighter and completion vocabulary | 3 |

The four dead `\b` guards stay behavior-preserving `investigate` items: fixing
them can activate dead branches and change canonical output.

For C2 the expected model is that English spellings normalize to the canonical
Russian token value and that canonical output stays Russian (RP06). This is an
expected architecture, not a final contract; it is confirmed only by live 1C /
Query Designer evidence.

## Counts

| Metric | Value |
|---|---|
| Sites classified | 321 (keep 228 · migrate 83 · investigate 10) |
| By kind | token-consumer 93 · raw-scanner 55 · contextual-role 43 · false-positive 43 · non-sdbl 31 · slice 28 · vocab 22 · recovery 6 |
| Lexical consumer files | 33 |
| Raw scanners | 55 (migrate 51 · keep 4 · investigate 0) |
| Role / vocabulary duplication sites | 65 (migrate 26 · keep 32 · investigate 7) |
| C2 language-sensitive entries | 113 (parser 35 · formatter 44 · generator 17 · other core 11 · UI 6) |

## Appendix: every classified site

Columns: file, line, function, kind, class, planned PR, lexical evidence. A
`keep` row needs no PR. Evidence text is abridged.

| File | Line | Function | Kind | Class | PR | Evidence |
|---|---|---|---|---|---|---|
| `cli/oracleAccept.ts` | 28 | `firstDiffLine` | non-sdbl | keep | — | `split('\n')` of two outputs; first differing line index |
| `cli/oracleAcceptCli.ts` |  | `cli/oracleAcceptCli.ts` | false-positive | keep | — | supplementary sweep: index variable / UI string / XML / lexer-message parsing; not SDBL lexing |
| `cli/oracleDiff.ts` | 31 | `show` | non-sdbl | keep | — | line-by-line diff printing (`a[i] ?? '<нет>'`) |
| `cli/oracleDiff.ts` | 46 | `run` | non-sdbl | keep | — | argv parsing (`args[i] === '--reason'`) |
| `cli/parseMetadata.ts` | 6 | `getArg` | non-sdbl | keep | — | `process.argv.indexOf('--name')` |
| `cli/probeError.ts` | 1 | `<module>` | non-sdbl | keep | — | argv plus a focus diff of validator vs constructor output lines |
| `cli/reprobeOracle.ts` | 20 | `firstDiff` | non-sdbl | keep | — | first differing line, with `\t`→`»` |
| `core/metadata/parser/documentJournal.ts` |  | `core/metadata/parser/documentJournal.ts` | false-positive | keep | — | supplementary sweep: index variable / UI string / XML / lexer-message parsing; not SDBL lexing |
| `core/metadata/parser/dom.ts` | 18 | `firstElementChild` | non-sdbl | keep | — | DOM childNodes index loop (XML) |
| `core/metadata/parser/dom.ts` | 27 | `childByLocalName` | non-sdbl | keep | — | same, by localName |
| `core/metadata/parser/dom.ts` | 37 | `childrenByLocalName` | non-sdbl | keep | — | same |
| `core/query/argComments.ts` | 24 | `splitArgComments` | token-consumer | keep | — | `tryTokenize({comments})`; splits leading/trailing comment tokens off a raw VT/ПЕРИОДАМИ arg slice by token pos |
| `core/query/canonicalizeFieldCasing.ts` | 54 | `canonExprText` | raw-scanner | migrate | PR-8 | Char scan of a custom condition/join expression: toggles `"` string state, finds `head.seg.seg` chains (`\p{L}_` start, word chars), skips chains followed by `(` |
| `core/query/canonicalizeFieldCasing.ts` | 210 | `canonicalizeSegments` | false-positive | keep | — | segment array indexing (`segs[i]`) |
| `core/query/commentBinder.ts` | 42 | `commentsInKeptArgs` | contextual-role | keep | — | Over comment-bearing tokens: `(` depth stack, marks a call when prev ident is after `.` or ident `ПЕРИОДАМИ` |
| `core/query/commentBinder.ts` | 74 | `rememberNestedConditionComments` | token-consumer | keep | — | tokenize; `(`/`{` depth; keyword `ВЫБРАТЬ` at depth 0 → member index |
| `core/query/commentBinder.ts` | 87 | `extractComments` | contextual-role | keep | — | tokenize({comments}); depth-0 clause boundary keyword list `['ГДЕ','СГРУППИРОВАТЬ','ИМЕЮЩИЕ','УПОРЯДОЧИТЬ','ИТОГИ','ИНДЕКСИРОВАТЬ','ОБЪЕДИНИТЬ','ДЛЯ']`; keyword-as-name predicate (next/prev `.`, prev `КАК`); splits SELEC… |
| `core/query/dropRedundantGroupDerefs.ts` | 9 | `<module> AGG_RE` | vocab | migrate | PR-10 | `/(?:^ |
| `core/query/dropRedundantGroupDerefs.ts` | 35 | `dropRedundantGroupDerefs` | raw-scanner | migrate | PR-10 | AGG_RE + derefInResultPosition over select expression text; path split |
| `core/query/dropRedundantGroupDerefs.ts` | 122 | `moveBeforePrefixGroupDerefToEnd` | raw-scanner | migrate | PR-10 | `aggExprTexts.some(t => t.includes(rendered))` — plain substring |
| `core/query/dropRedundantGroupDerefs.ts` | 202 | `containsFieldRef` | raw-scanner | migrate | PR-10 | indexOf + `[\p{L}\p{N}_.]` boundary check |
| `core/query/dropRedundantGroupDerefs.ts` | 229 | `substituteGroupFieldWithSelectExpr` | raw-scanner | migrate | PR-10 | `/^ВЫБОР(?![\p{L}\p{N}_])/iu` on trimmed expr + AGG_RE |
| `core/query/dropRedundantGroupDerefs.ts` | 314 | `moveLeadingMovementCaseToEnd` | raw-scanner | migrate | PR-10 | — |
| `core/query/dropRedundantGroupDerefs.ts` | 335 | `isMovementCaseExpr` | raw-scanner | migrate | PR-10 | `up.includes('ВЫБОР')` + `/ЗНАЧЕНИЕ\s*\(\s*ВИДДВИЖЕНИЯ(НАКОПЛЕНИЯ |
| `core/query/dropRedundantGroupDerefs.ts` | 388 | `metaFor` | false-positive | keep | — | regex `^(Регистр\p{L}+\.[^.]+)\.\p{L}+$` + `startsWith('Регистр')` on model fullName |
| `core/query/dropRedundantGroupDerefs.ts` | 409 | `MOVEMENT_RE, derefInResultPosition` | contextual-role | migrate | PR-10 | `(ТОГДА |
| `core/query/dropRedundantGroupDerefs.ts` | 418 | `extractFieldRefs` | token-consumer | keep | — | tokenize; `(` depth; skips args of META_FUNCTION_WORDS; ident/keyword `.`-chains not followed by `(` |
| `core/query/dropRedundantGroupDerefs.ts` | 493 | `dropFunctionallyDeterminedMovementCase` | raw-scanner | migrate | PR-10 | MOVEMENT_RE gate + extractFieldRefs |
| `core/query/dropRedundantGroupDerefs.ts` | 553 | `relocateKeptMovementCase` | raw-scanner | migrate | PR-10 | same |
| `core/query/dropUnlimitedStringConditions.ts` | 1 | `<module>` | false-positive | keep | — | `'МЕЖДУ'` in a ConditionOperator set (model enum) |
| `core/query/dropUnlimitedStringConditions.ts` | 43 | `dropUnlimitedStringConditions` | false-positive | keep | — | compares `op === 'ПОДОБНО'` (model enum), metadata types |
| `core/query/dropUserIBConditions.ts` | 1 | `<module>` | false-positive | keep | — | metadata attribute/type names (ИДЕНТИФИКАТОРПОЛЬЗОВАТЕЛЯИБ, СПРАВОЧНИК.ПОЛЬЗОВАТЕЛИ) |
| `core/query/expandTabSectionFields.ts` | 27 | `expandTabSectionFields` | false-positive | keep | — | `path.split('.')` |
| `core/query/exprAutoAlias.ts` | 7 | `BARE_PARAM` | vocab | investigate | PR-5 | `^&([A-Za-zА-Яа-яЁё_][…0-9_]*)$` |
| `core/query/exprAutoAlias.ts` | 30 | `representationAutoAlias` | vocab | investigate | PR-5 | whole-expression regex `^(ПРЕДСТАВЛЕНИЕ |
| `core/query/exprFormatter.ts` | 43 | `FUNCTION_WORDS` | vocab | migrate | PR-5 | IIFE walks `FUNCTION_CATALOG` labels, keeps single-word labels (`/^[A-Za-zА-Яа-яЁё][…0-9]*$/u`), uppercases. Includes operator labels И/ИЛИ/НЕ/В/МЕЖДУ/ПОДОБНО/ССЫЛКА/ВЫБОР/ВЫРАЗИТЬ. Span also defines `CALL_NOSPACE_WORDS`… |
| `core/query/exprFormatter.ts` | 77 | `tokUpper` | token-consumer | keep | — | `(t.text ?? t.value).toUpperCase()` (the `??` is dead: `text` is always set). Span kwlit signals come from `UNARY_MINUS_PREV_WORDS` (103, 16 words) and `COMPARISON_PUNCT` alias (96) |
| `core/query/exprFormatter.ts` | 123 | `leafHasSubquery` | contextual-role | keep | — | `tokenize(raw)`; any keyword/ident with `value.toUpperCase()==='ВЫБРАТЬ'`; lexer failure → `false` |
| `core/query/exprFormatter.ts` | 138 | `leafHasCase` | contextual-role | keep | — | same as above for `ВЫБОР` (ident). Span kwre signals belong to `EST_NE_NULL_*_RE` (161-165) and `appendIsNotNullToLine/appendIsNotNullTrailingSpace` (166/174) — see span-hosted table (confirmed literal bug) |
| `core/query/exprFormatter.ts` | 161 | `EST_NE_NULL_EOL_RE / _KAK_RE / _PAREN_RE, append` | raw-scanner | migrate | PR-2 | regexes `ЕСТЬ\s+НЕ\s+NULL$`, `… (КАК[\s(])`, `…\)` applied per line to whole output |
| `core/query/exprFormatter.ts` | 197 | `wrapBareCastOperand` | token-consumer | keep | — | tokenizes (failure → text), tracks paren depth over `punct` tokens, splits at top-level `CAST_OPERAND_OPS` (unary +/- excluded), detects operand `ВЫРАЗИТЬ ( … )` by token text, re-joins operand slices by `pos` with singl… |
| `core/query/exprFormatter.ts` | 267 | `leafHasTopBoolean` | contextual-role | keep | — | wrapper `leafHasBoolean(raw,false)` |
| `core/query/exprFormatter.ts` | 278 | `leafHasBoolean` | contextual-role | keep | — | token loop: depth over `(`/`)`, `isWord(МЕЖДУ)` counter, `isOr`/`isAnd`; failure → false |
| `core/query/exprFormatter.ts` | 302 | `flattenLeafText` | token-consumer | investigate | PR-8 | rebuilds a leaf from `tokenize(raw)` (no comments) token texts, one space where the original gap was non-empty, none after `(` / before `)` `,` |
| `core/query/exprFormatter.ts` | 347 | `flattenMultilineLeaf` | token-consumer | keep | — | composition: `\n` check + leafFlattenBlocked + leafHasBoolean(anyDepth) + flattenLeafText. Span kwlit = `FLATTEN_STOP_WORDS` (363) / `FLATTEN_STOP_RESERVED` (367) |
| `core/query/exprFormatter.ts` | 368 | `leafFlattenBlocked` | contextual-role | keep | — | tokens: `{`/`}` punct, keyword/ident in FLATTEN_STOP_WORDS unless previous token is `.`; failure → true (safe) |
| `core/query/exprFormatter.ts` | 412 | `flattenInlineValueLists` | raw-scanner | migrate | PR-8 | per line: regex `(^\ |
| `core/query/exprFormatter.ts` | 463 | `reindentLeafSubquery` | raw-scanner | migrate | PR-8 | ~300 lines over `split('\n')`: `(ВЫБРАТЬ` prefix detection, `В(\s+ИЕРАРХИИ)?\s*\($` regex, tuple-head collapse with whitespace regexes and keyword-boundary regex (И/ИЛИ/НЕ/МЕЖДУ/ПОДОБНО/ССЫЛКА/ЕСТЬ), char paren balance w… |
| `core/query/exprFormatter.ts` | 781 | `isSingleTopLevelCaseValue` | raw-scanner | migrate | PR-8 | regex word-boundary count of `ВЫБОР` (must be 1), `ВЫБРАТЬ` exclusion, per-char paren depth/`"` state to check depth 0 before trailing `ВЫБОР` |
| `core/query/exprFormatter.ts` | 825 | `opensWithTopLevelVybor` | raw-scanner | migrate | PR-8 | first non-empty line ends with `ВЫБОР` regex; `ВЫБРАТЬ` exclusion; `onlyParens` (no-op string copier) and `openGroupParensOf` char scanner classifying `(` as call if previous non-space char is a letter; `^КОНЕЦ` line reg… |
| `core/query/exprFormatter.ts` | 893 | `opensWithVyborInCall` | raw-scanner | migrate | PR-8 | same pattern: ВЫБОР count regex, ВЫБРАТЬ exclusion, char depth with `"` until trailing `ВЫБОР` |
| `core/query/exprFormatter.ts` | 965 | `splitInlineLeafCase` | contextual-role | keep | — | raw prefilter (`includes('ВЫБОР')` / regex) then `tokenize` (failure → text); local `isW` role predicate; depthBefore per token; drops a wrapping `(`…`)` by token pos and recurses; inserts `\n` before КОГДА/ТОГДА/ИНАЧЕ/К… |
| `core/query/exprFormatter.ts` | 1159 | `stripRedundantCallWrapParens` | token-consumer | migrate | PR-6 | token paren matching, `isCallOpenContext`, PRED_NEIGHBOR_WORDS / AGGREGATE_WORDS role checks, replaces dropped parens by space at token pos; then **raw post-pass** `.replace(/\( +/g,'(').replace(/ +\)/g,')').replace(/^ +… |
| `core/query/exprFormatter.ts` | 1250 | `stripMultilineWhenWrap` | raw-scanner | migrate | PR-8 | `fw` = first `\p{L}+` of line uppercased (keyword role by line head), `^…КОГДА[\t ]+\((.*)$`, char `parenDelta` with `"`, `И/ИЛИ` boundary regex, `\)\s*$` |
| `core/query/exprFormatter.ts` | 1325 | `stripRedundantThenArithmeticWrap` | raw-scanner | migrate | PR-8 | `fw` first-word role, dynamic `RegExp('^…'+w+'[\t ]+\((.*)$')`, trailing `ВЫБОР` regex, char depth scan for top `*`/`/`, `^КОНЕЦ\)\s*[*/]\s` regexes |
| `core/query/exprFormatter.ts` | 1401 | `reindentLeafCase` | raw-scanner | migrate | PR-8 | hybrid: `tryTokenize` only to mask multi-line string tokens with markers; otherwise line/char scanning: `\bВЫБРАТЬ\b` guard (**dead**, ASCII `\b`), `ВЫБОР\s*$` opener, `^ВЫБОР`/`^КОНЕЦ`, STRUCT first-word set, char paren… |
| `core/query/exprFormatter.ts` | 2006 | `reflowLeafSelectorCase` | slice | keep | — | flattenLeafText then tokenize (failure → null); local `isW`; depthBefore; marks КОГДА/ТОГДА/ИНАЧЕ/КОНЕЦ at case depth; emits slices of `flat` between token positions |
| `core/query/exprFormatter.ts` | 2096 | `reindentLeafBool` | raw-scanner | migrate | PR-8 | guard `/\bВЫБРАТЬ\b\ |
| `core/query/exprFormatter.ts` | 2154 | `renderOperatorRhs` | contextual-role | keep | — | `op === 'В'` (op from parser model `COND_OPERATORS`), `param.startsWith('(')`, `/^ИЕРАРХИИ ?\(/` on param, delegates to isPureBalancedList/leafHasSubquery/flattenLeafText/valueListIsMulti |
| `core/query/exprFormatter.ts` | 2184 | `isPureBalancedList` | raw-scanner | migrate | PR-8 | char paren depth, no string awareness; true iff first `(` closes at last char |
| `core/query/exprFormatter.ts` | 2203 | `valueListIsMulti` | raw-scanner | migrate | PR-8 | `ВЫБРАТЬ` regex; counts top-level `,` by char depth without string awareness |
| `core/query/exprFormatter.ts` | 2225 | `tightenLeafInOperator` | raw-scanner | migrate | PR-8 | anchored regex `^path\s+(В(\s+ИЕРАРХИИ)?)\s+(\(.*\))$`, then isPureBalancedList/valueListIsMulti, param regex `^\(\s*&ident\s*\)$`. Span also has `stripLeadingZeros` (2244, non-sdbl, works on number token value) |
| `core/query/exprFormatter.ts` | 2259 | `isUnaryMinusAt` | contextual-role | keep | — | inspects previous token type; for words checks `UNARY_MINUS_PREV_WORDS` |
| `core/query/exprFormatter.ts` | 2282 | `isTupleGroupAt` | token-consumer | keep | — | token depth from `(`; `,` before comparison punct at depth 1 → tuple |
| `core/query/exprFormatter.ts` | 2295 | `normalizeLeafWhitespace` | token-consumer | keep | — | gap edits between consecutive tokens (skips gaps containing `\n` or `\t`), number-token leading zeros, spacing around comparison punct / comma / `(` `)` / unary minus; roles: `В`/`ИЕРАРХИИ`, `NULL` after НЕ/ЕСТЬ, AGGREGA… |
| `core/query/exprFormatter.ts` | 2455 | `enclosingFunctionIs` | token-consumer | keep | — | walks tokens backward with depth to enclosing `(`, compares preceding word via tokUpper to a name set |
| `core/query/exprFormatter.ts` | 2483 | `canonicalizeLeafLexemes` | contextual-role | keep | — | tokens: `ISNULL(` → `ЕСТЬNULL`, `IS NULL` → `ЕСТЬ` by pos; second tokenize: `НЕ` followed by lexer-`keyword` `В`/`ПОДОБНО` moves `НЕ ` to leaf start |
| `core/query/exprFormatter.ts` | 2583 | `canonicalizeComparisonOperands` | slice | investigate | PR-8 | tokens: lhs param/literal, cmp punct, rhs ident(.ident)*; LITERAL_WORDS exclusion; output `raw.slice(sig[2].pos)` + mirrored op + lhs. Span hosts ArithReprinter (2654), ARITH_STOP_PUNCT/ARITH_STOP_WORDS (2646-2650), PRED… |
| `core/query/exprFormatter.ts` | 2654 | `class ArithReprinter` | token-consumer | keep | — | recursive-descent printer over tokens; ARITH_STOP_WORDS/ARITH_STOP_PUNCT, `ВЫРАЗИТЬ`, `КАК` |
| `core/query/exprFormatter.ts` | 2828 | `isCallOpenContext` | contextual-role | keep | — | prev token type + PRED_NEIGHBOR_WORDS + FUNCTION_WORDS |
| `core/query/exprFormatter.ts` | 2860 | `stripRedundantLeafParens` | token-consumer | migrate | PR-2 | token paren matching, neighbour role checks (PRED_NEIGHBOR_WORDS, `В`, `КАК`, inline `['ЕСТЬ','МЕЖДУ','ПОДОБНО','ССЫЛКА']` ×2), boolean precedence by isAnd/isOr/isNot; replaces parens by pos; then **raw post-pass** `\s{2… |
| `core/query/exprFormatter.ts` | 3058 | `stripRedundantCaseClauseParens` | raw-scanner | migrate | PR-8 | char paren scan with `"` to check full enclosure; regex `ВЫРАЗИТЬ\ |
| `core/query/exprFormatter.ts` | 3088 | `reprintLeafArithmetic` | token-consumer | keep | — | tokenize; requires arithmetic punct; ArithReprinter rebuilds text from token texts (stop words → bail) |
| `core/query/exprFormatter.ts` | 3120 | `reprintLeafComparison` | token-consumer | keep | — | tokens: one top-level comparison, inline Set of 10 predicate words (И/ИЛИ/НЕ/ЕСТЬ/МЕЖДУ/ПОДОБНО/ССЫЛКА/В/КАК/ВЫБОР) → bail; ArithReprinter both sides |
| `core/query/exprFormatter.ts` | 3157 | `normalizeLeafCase` | contextual-role | keep | — | canonicalizeLeafLexemes, tokenize; uppercases words by role: FUNCTION_WORDS before `(`, LITERAL_WORDS, PRIMITIVE after `КАК`/inside `ТИП(`, PERIOD_WORDS inside PERIOD_FUNCTIONS, НЕ/ИЛИ/ЕСТЬ always, keyword КАК, infix ССЫ… |
| `core/query/exprFormatter.ts` | 3279 | `up, isWord, isAnd` | contextual-role | migrate | PR-4 | `isWord` = ident/keyword + upper compare; `isAnd` = `type==='keyword' && value==='И'` (correct use of lexer keyword) |
| `core/query/exprFormatter.ts` | 3285 | `isOr` | contextual-role | migrate | PR-4 | `isWord(t,'ИЛИ')` (ident/keyword + `value.toUpperCase()`) |
| `core/query/exprFormatter.ts` | 3291 | `isNot` | contextual-role | migrate | PR-4 | `isWord(t,'НЕ')` |
| `core/query/exprFormatter.ts` | 3294 | `isCase` | contextual-role | migrate | PR-4 | `isWord(t,'ВЫБОР')` |
| `core/query/exprFormatter.ts` | 3297 | `isWhen` | contextual-role | migrate | PR-4 | `isWord(t,'КОГДА')` |
| `core/query/exprFormatter.ts` | 3300 | `isThen` | contextual-role | migrate | PR-4 | `isWord(t,'ТОГДА')` |
| `core/query/exprFormatter.ts` | 3303 | `isElse` | contextual-role | migrate | PR-4 | `isWord(t,'ИНАЧЕ')` |
| `core/query/exprFormatter.ts` | 3306 | `isEnd` | contextual-role | migrate | PR-4 | `isWord(t,'КОНЕЦ')` |
| `core/query/exprFormatter.ts` | 3326 | `pushOrOperand` | non-sdbl | keep | — | AST node flattening only. Span signals (tok/dep/kwlit) belong to `class Parser` (3349-3965), `treeHasStructure`, `needsFormatting` (3992) — see span-hosted table |
| `core/query/exprFormatter.ts` | 3349 | `class Parser` | token-consumer | keep | — | `tokenize(raw)` in constructor (throws; callers guard), all roles via isX predicates, leaf slicing `raw.slice(from,to)` by token pos, `tail()` verbatim |
| `core/query/exprFormatter.ts` | 3992 | `needsFormatting / isRootNotGroup` | token-consumer | keep | — | Parser in try/catch → false |
| `core/query/exprFormatter.ts` | 4015 | `selectColumnNeedsBoolWrap` | token-consumer | keep | — | `new Parser(trimmed,true).parse()`; tokenizer error → false; checks root and/or |
| `core/query/exprFormatter.ts` | 4057 | `tabs` | false-positive | keep | — | `'\t'.repeat(n)`; kwre signal is `NEGATED_FIELD_RE` constant at 4074 (used by stripNegatedFieldParens) |
| `core/query/exprFormatter.ts` | 4075 | `stripNegatedFieldParens` | raw-scanner | migrate | PR-2 | anchored regex `^\(\s*НЕ\s+path\s*\)(\s[\s\S]*)?$` → `НЕ path…`. Span also hosts `stripNotFieldParens` (4091) with **global** regex `(^\ |
| `core/query/exprFormatter.ts` | 4091 | `stripNotFieldParens` | raw-scanner | migrate | PR-2 | global regex `(^\ |
| `core/query/exprFormatter.ts` | 4095 | `renderBool` | raw-scanner | migrate | PR-8 | AST printer; lexical parts are regex gates over leaf text: `ВЫБОР` word regex (4151) and inline-subquery regex `В(\s+ИЕРАРХИИ)?\s*\(\s*ВЫБРАТЬ` (4271). Span hosts renderWhenCondition (4297), renderCase (4380), valueText |
| `core/query/exprFormatter.ts` | 4418 | `stripEnclosingParens` | raw-scanner | migrate | PR-8 | char paren scan with `"`; strips one enclosing pair |
| `core/query/exprFormatter.ts` | 4437 | `renderOrValueLines` | token-consumer | keep | — | `new Parser(value.trim())` (failure → null), checks root kind, prints |
| `core/query/exprFormatter.ts` | 4496 | `renderBranchValueLines` | raw-scanner | migrate | PR-8 | composition + inline-subquery regex gate (4552) on value text |
| `core/query/exprFormatter.ts` | 4563 | `renderCaseE` | false-positive | keep | — | AST printer emitting canonical `ВЫБОР`, `КОГДА `, `ТОГДА `, `ИНАЧЕ `, `КОНЕЦ` |
| `core/query/exprFormatter.ts` | 4627 | `caseHasNestedVyborInWhen` | raw-scanner | migrate | PR-8 | per line regex `(^\ |
| `core/query/exprFormatter.ts` | 4658 | `formatExpression` | token-consumer | keep | — | entry guard `if (!tryTokenize(raw)) return raw` (contract-compliant), Parser, slot rendering; raw regexes on verbatim `tail` (`В\s*\(\s*\n`, ВЫБРАТЬ) then flattenInlineValueLists on the whole result. Span hosts renderNot… |
| `core/query/exprFormatter.ts` | 5013 | `renderJoinConjunct` | raw-scanner | migrate | PR-8 | inline-subquery regex gate (5026) + composition (flattenMultilineLeaf, reindentLeafSubquery, reindentLeafCase) |
| `core/query/expressionSyntaxCheck.ts` | 72 | `skipBalancedGroup` | token-consumer | keep | — | token paren depth |
| `core/query/expressionSyntaxCheck.ts` | 87 | `looksLikeSubquery` | token-consumer | keep | — | isWord ВЫБРАТЬ/SELECT |
| `core/query/expressionSyntaxCheck.ts` | 95 | `acceptGroupContent` | token-consumer | keep | — | `РАЗЛИЧНЫЕ/DISTINCT`, `(*)` |
| `core/query/expressionSyntaxCheck.ts` | 116 | `acceptCaseExpression` | token-consumer | keep | — | КОГДА/WHEN, ТОГДА/THEN, ИНАЧЕ/ELSE, КОНЕЦ/END |
| `core/query/expressionSyntaxCheck.ts` | 148 | `acceptCastFunction` | token-consumer | keep | — | КАК/AS + type + `(n[,m])` |
| `core/query/expressionSyntaxCheck.ts` | 178 | `acceptAtom` | token-consumer | keep | — | literal words NULL/НЕОПРЕДЕЛЕНО/UNDEFINED/ИСТИНА/TRUE/ЛОЖЬ/FALSE; ВЫРАЗИТЬ/CAST; ident+`(` |
| `core/query/expressionSyntaxCheck.ts` | 256 | `acceptArithmeticValue` | token-consumer | keep | — | НЕ/NOT + arithmetic |
| `core/query/expressionSyntaxCheck.ts` | 277 | `acceptValue` | token-consumer | keep | — | operator words И/ИЛИ/ПОДОБНО/СПЕЦСИМВОЛ/ЕСТЬ/МЕЖДУ/В/ИЕРАРХИИ/ССЫЛКА (+English) |
| `core/query/expressionSyntaxCheck.ts` | 354 | `isAsteriskField` | token-consumer | keep | — | `(ident .)* *` token shape |
| `core/query/expressionSyntaxCheck.ts` | 389 | `parseEmptyTableColumns` | token-consumer | keep | — | head ident `ПУСТАЯТАБЛИЦА` (via `.text`) + `.(names)` |
| `core/query/expressionSyntaxCheck.ts` | 422 | `isStructurallyValidExpression` | token-consumer | investigate | PR-4 | `TEMPLATE_MARKER_CHARS /[%#@[\]]/` tested on the **raw** trimmed text, then tokenize + accept |
| `core/query/expressionSyntaxCheck.ts` | 548 | `isWord / isWordToken` | contextual-role | migrate | PR-4 | `(ident |
| `core/query/extractQueryStrings.ts` | 26 | `unescapeXmlEntities` | non-sdbl | keep | — | XML entity regex |
| `core/query/extractQueryStrings.ts` | 47 | `startsWithQueryKeyword` | vocab | investigate | PR-11 | raw head = `ВЫБРАТЬ`/`УНИЧТОЖИТЬ` + `\p{L}` boundary |
| `core/query/extractQueryStrings.ts` | 79 | `extractQueryStrings` | non-sdbl | keep | — | BSL scanner: `//` comments, `'…'`, `"…"` with `""`, ` |
| `core/query/extractQueryStrings.ts` | 150 | `extractQueriesFromXml` | non-sdbl | keep | — | `<query>…</query>` regex + entity decode |
| `core/query/fieldChain.ts` | 31 | `core/query/fieldChain.ts:31` | raw-scanner | keep | — | findChainAt: lexer-free word/dot scan at cursor for hover/completion on partial text; advisory only |
| `core/query/fieldPathResolver.ts` | 128 | `resolveFieldPath` | false-positive | keep | — | `segs[i]` |
| `core/query/functionCatalog.ts` | 17 | `op (+FUNCTION_CATALOG)` | vocab | keep | — | operator/function label literals |
| `core/query/qualifyBareFields.ts` | 1 | `<module> STRUCTURAL / PRIMITIVE_TYPES / TYPE_PRE` | vocab | migrate | PR-5 | STRUCTURAL (40 words, partly English: IS/NULL/AND/OR/NOT/AS/BETWEEN/LIKE/TRUE/FALSE); PRIMITIVE_TYPES; TYPE_PREFIXES (18) |
| `core/query/qualifyBareFields.ts` | 277 | `matchCloseIndex` | token-consumer | keep | — | paren matching on tokens |
| `core/query/qualifyBareFields.ts` | 323 | `qualifyExpression` | contextual-role | keep | — | tokenize; meta-call depth for ЗНАЧЕНИЕ/ТИП; embedded `(ВЫБРАТЬ` subquery span; `ПУСТАЯТАБЛИЦА.(`; role filters: after `.`, after КАК, after ИЗ/СОЕДИНЕНИЕ/ПОМЕСТИТЬ, before `(`, `ССЫЛКА <TypePrefix>`, TYPE_PREFIXES heads;… |
| `core/query/queryAnalysisService.ts` | 1 | `<module> (+parseSyntaxErrorPosition :110)` | false-positive | keep | — | join-keyword type union; regex over the parser's own `Ошибка разбора L:C` message; `Запрос N` display names |
| `core/query/queryLinter.ts` | 34 | `checkLikeLeadingWildcard` | token-consumer | keep | — | keyword `ПОДОБНО` + next string token; checks a leading `%`, treats `~%` as escaped |
| `core/query/queryLinter.ts` | 67 | `lintModel` | false-positive | keep | — | message text; `searchText: 'ПЕРВЫЕ'` |
| `core/query/queryModel.ts` | 52 | `accountingPositionKeys` | slice | keep | — | VT slice-name switch (Остатки/Обороты/…) |
| `core/query/queryModelUtils.ts` | 56 | `qualifiedAutoAlias` | false-positive | keep | — | standard attribute `ССЫЛКА` in a path |
| `core/query/queryModelUtils.ts` | 91 | `joinKeyword` | false-positive | keep | — | output words for the generator |
| `core/query/queryParameters.ts` | 39 | `collectQueryParameterOccurrences` | token-consumer | keep | — | `param` tokens from repairLexicalErrorsForRecovery |
| `core/query/queryParameters.ts` | 56 | `collectQueryParameters / findQueryParameterAt` | false-positive | keep | — | upper-case grouping / range lookup |
| `core/query/queryTextFormatter.ts` | 1 | `<module> CLAUSE_KEYWORDS etc.` | vocab | keep | — | CLAUSE/TWO_WORD/LIST clause sets |
| `core/query/queryTextFormatter.ts` | 45 | `formatQueryText (formatter)` | token-consumer | keep | — | tokenize({comments}); depth; newline before depth-0 clause keywords; copies original gaps by token pos |
| `core/query/resolveBuilderStar.ts` | 139 | `core/query/resolveBuilderStar.ts:139` | non-sdbl | keep | — | metadata fullName regex Регистр\p{L}+; C2 note: relies on Russian type names after normalization |
| `core/query/sdblGenerator.ts` | 73 | `renderConditionSubquery` | slice | migrate | PR-1 | Generator-produced text (`generateDocument(subquery)`): regex `(^ |
| `core/query/sdblGenerator.ts` | 139 | `closeAfterLastLine` | token-consumer | keep | — | `tryTokenize(text)` whole-prefix check; `tokenize(lastLine,{comments:true})`, last non-eof token `type==='comment'`; catch → `lastLine.includes('//')` |
| `core/query/sdblGenerator.ts` | 181 | `renderSource` | slice | keep | — | dispatch on VT kind; `tryTokenize` gates per position (206/216), `hasLineComment` gates; `/\(ВЫБРАТЬ/u.test(p)` + `p.includes('\n')` to choose multiline accounting layout (228); subquery source body re-indented by lines … |
| `core/query/sdblGenerator.ts` | 293 | `wrapDcsBraceParam` | raw-scanner | migrate | PR-3 | regex `\{([^{}]*)\}` finds innermost braces; inner must start `&`; `hasTopLevelComma(c) !== false` (token API) or regex `(^ |
| `core/query/sdblGenerator.ts` | 313 | `aliasDcsBraceExprs` | raw-scanner | migrate | PR-3 | same `\{([^{}]*)\}` regex; `КАК` regex; `^&[\p{L}\p{N}_]+$` bare-param regex; `hasTopLevelComma` (token); appends ` КАК Поле<2k>` |
| `core/query/sdblGenerator.ts` | 341 | `mergeDcsBraces` | raw-scanner | migrate | PR-3 | char loop: `{` … depth … `}` balance (no string tracking), only whitespace allowed between groups; flattens `\s+`→` ` inside each group; joins `{a, b}` |
| `core/query/sdblGenerator.ts` | 368 | `renderVirtualParams` | slice | migrate | PR-7 | tryTokenize/hasLineComment gates (370/373) then mergeDcs/wrapDcs/aliasDcs/flatten/stripRedundantLeafParens; `hasTopLevelBooleanOp(...) === true`; regex `(^ |
| `core/query/sdblGenerator.ts` | 519 | `renderAccountingParams` | slice | keep | — | per position: `hasTopLevelBooleanOp(p)===true` → reindentVtCondition; else `p.includes('\n') && /\(ВЫБРАТЬ/u` → reindentLeafSubquery; `^\t+` strip |
| `core/query/sdblGenerator.ts` | 556 | `splitTopLevelBoolConjuncts` | raw-scanner | migrate | PR-7 | char loop with `"` toggle, `(`/`)` depth; at depth 0 and `!blocksKeywordStart(prev)` (`[\p{L}\p{N}_&]`): `slice(i,i+6).toUpperCase()` startsWith ВЫБОР/КОНЕЦ (caseDepth), МЕЖДУ (between), ИЛИ, char `И`; splits keeping op … |
| `core/query/sdblGenerator.ts` | 616 | `bodyHasUnwrappedBoolOr` | raw-scanner | migrate | PR-7 | section regex `(ГДЕ |
| `core/query/sdblGenerator.ts` | 653 | `reflowInlineMembershipSubquery` | raw-scanner | migrate | PR-3 | leading `^((?:НЕ\s+)+)` regex + `НЕ` count; char loop `"`/depth to find top-level `В` (char compare `В`/`в` + word-char neighbours), `ИЕРАРХИИ` via toUpperCase/regex, skip ws to `(`, `^ВЫБРАТЬ` regex, second char loop fo… |
| `core/query/sdblGenerator.ts` | 775 | `breakInlineParenGroup` | raw-scanner | migrate | PR-7 | regex gate (no ВЫБРАТЬ/ВЫБОР); char loop `"` toggle + depth; `МЕЖДУ` regex (betweenPending), at depth 1 `^(И |
| `core/query/sdblGenerator.ts` | 832 | `reindentVtCondition` | raw-scanner | migrate | PR-3 | uses splitTopLevelBoolConjuncts; per conjunct: flattenMultilineLeaf, breakInlineParenGroup, `В (ВЫБРАТЬ` regex → reflow; `^ВЫБОР` regex; `\(\s*\n\s*ВЫБРАТЬ |
| `core/query/sdblGenerator.ts` | 1005 | `hasTopLevelBooleanOp` | vocab | keep | — | `tryTokenize`; depth over `(`/`)` punct; at depth 0 ident/keyword `value.toUpperCase()` МЕЖДУ (pending), ИЛИ → true, И → true unless pending. Span kwlit = `isPlainFieldComparison` (1035: regex `<dotted> op <dotted>` + `L… |
| `core/query/sdblGenerator.ts` | 1056 | `renderArbitraryConjunct` | slice | keep | — | user JOIN conjunct (gated valid + comment-free by renderJoinConjuncts). flattenMultilineLeaf; `В (ВЫБРАТЬ` regex → reflow; reindentLeafSubquery; `КОНЕЦ` count regex (`oneCase`), `ВЫБОР\s*$` / `[=<>]\s*$` + `^ВЫБОР` next-… |
| `core/query/sdblGenerator.ts` | 1131 | `moveNotBeforeTuple` | token-consumer | keep | — | `tryTokenize`; matching `)` by punct depth (`t.pos`); `hasTopLevelComma` on inner; then regex `^\s+НЕ\s+(В)(\s+ИЕРАРХИИ)?(?![\p{L}\p{N}_])` on the rest (case-sensitive); emits `НЕ (…) В[ ИЕРАРХИИ]` |
| `core/query/sdblGenerator.ts` | 1159 | `hasTopLevelComma` | token-consumer | keep | — | `tryTokenize`; depth over `(`/`)`; `,` at depth 0 → true; undefined on lexer error |
| `core/query/sdblGenerator.ts` | 1178 | `stripLeadingNotOperandParens` | raw-scanner | migrate | PR-7 | regex `^НЕ\s*\(` (iu); char loop from `(` with `"` toggle + depth to find the matching `)`; must be last char; inner checked with hasTopLevelComma/BooleanOp `!== false` (unknown-safe) |
| `core/query/sdblGenerator.ts` | 1214 | `renderJoinConjuncts` | slice | keep | — | per conjunct: `tryTokenize` → verbatim; `hasLineComment` → `indentCommentedCondition(wrapJoinConjunctCommentSafe)`; `conjunctNeedsComplexFormat` (token + needsFormatting); emits `И ` prefix, comment lines; span chr = `'\… |
| `core/query/sdblGenerator.ts` | 1281 | `splitTopLevelAnd` | token-consumer | keep | — | `tryTokenize` (→ `[expr]`); depth; МЕЖДУ pending; keyword `И` at depth 0 → slice by `t.pos`/`t.text.length` |
| `core/query/sdblGenerator.ts` | 1308 | `stripOneEnclosingParen` | raw-scanner | migrate | PR-7 | char depth over `(`/`)`, **no string tracking**; strips outer pair if depth hits 0 only at the end |
| `core/query/sdblGenerator.ts` | 1326 | `hasTopLevelOr` | token-consumer | keep | — | `tryTokenize`; depth; ident/keyword `ИЛИ` at depth 0; undefined on error |
| `core/query/sdblGenerator.ts` | 1341 | `expandAndChainConjuncts` | slice | keep | — | gates: `hasLineComment`, `hasTopLevelBooleanOp===true`, `hasTopLevelOr===false`, regex `(^ |
| `core/query/sdblGenerator.ts` | 1384 | `hasLineComment` | token-consumer | keep | — | `tokenize(expr,{comments:true}).some(type==='comment')`; catch → `includes('//')` |
| `core/query/sdblGenerator.ts` | 1398 | `wrapJoinConjunctCommentSafe` | token-consumer | keep | — | `tokenize(...,{comments:true})`; last non-eof token comment → `(code) // c` using `last.pos`/`last.text`; catch → unwrapped |
| `core/query/sdblGenerator.ts` | 1411 | `renderJoinCondition` | slice | keep | — | legacy custom JOIN: `tryTokenize` → verbatim; `hasLineComment` → wrapJoinConjunctCommentSafe; hasTopLevelBooleanOp/needsFormatting → formatExpression; else normalizeLeafCase + `isPlainFieldComparison` wrap decision |
| `core/query/sdblGenerator.ts` | 1463 | `renderFrom` | vocab | keep | — | assembles FROM lines; emits `КАК`, `<вид> СОЕДИНЕНИЕ`, `ПО`, `{`/`}`; uses closeAfterLastLine for `,`/`}` delimiters; chr = `'\t'.repeat` |
| `core/query/sdblGenerator.ts` | 1612 | `builderBlock` | contextual-role | investigate | PR-7 | user `{…}` builder refs: `isMultilineCase` regex `ВЫБОР` boundary; `isMultilineBool` = hasTopLevelBooleanOp===true + regex no ВЫБОР/ВЫБРАТЬ + regex no `НЕ\s*\(`; `tryTokenize` → verbatim and `}`/`,` on next line; emits `… |
| `core/query/sdblGenerator.ts` | 1680 | `reflowCharacteristics` | raw-scanner | migrate | PR-3 | verbatim `{ХАРАКТЕРИСТИКИ …}` (user text, **comments kept verbatim** by parser:1131): per line `endsWithBinaryOp` = regex `[+\-*/]$`, `\.\*$` exclusion, per-line `"` parity; joins the next line onto it; `([^\s{])\}$` → `… |
| `core/query/sdblGenerator.ts` | 1720 | `buildQueryBlock` | vocab | keep | — | assembles block; emits `ВЫБРАТЬ`, `ИЗ`, `ПОМЕСТИТЬ`/`ДОБАВИТЬ`, `ДЛЯ ИЗМЕНЕНИЯ`, builder headers (`ВЫБРАТЬ`/`ГДЕ`/`УПОРЯДОЧИТЬ ПО`/`ИТОГИ ПО`); chr = `l + ','`, `.split('\n')` of characteristics |
| `core/query/sdblGenerator.ts` | 1823 | `isBareParamExpr` | vocab | migrate | PR-5 | `BARE_PARAM` regex `^&([A-Za-zА-Яа-яЁё_][…0-9_]*)$` (exprAutoAlias.ts:7). Span: `CONST_GROUP_RE` (1831) = `"(?:[^"] |
| `core/query/sdblGenerator.ts` | 1848 | `renderTabProjection` | slice | keep | — | `formatSelectExpression` per column; `literalContinuationLines`; `tryTokenize(expression)` → no continuation indent; emits `КАК`, `Поле{n}`; `fieldName.replace(/\./g,'')` |
| `core/query/sdblGenerator.ts` | 2071 | `formatSelectExpression` | slice | keep | — | `tryTokenize` → verbatim; `parseEmptyTableColumns`; membership regex `В (ВЫБРАТЬ` (6th copy) → inlineSelectMembershipReflow; then needsFormatting/selectColumnNeedsBoolWrap → formatExpression or leaf pipeline |
| `core/query/sdblGenerator.ts` | 2192 | `renderOrder` | vocab | keep | — | emits `УПОРЯДОЧИТЬ ПО`, ` ИЕРАРХИЯ`, ` УБЫВ`, `АВТОУПОРЯДОЧИВАНИЕ`; `f.expression.trim().startsWith('&')` → verbatim |
| `core/query/sdblGenerator.ts` | 2276 | `renderTotals` | slice | keep | — | emits `ИТОГИ`/`ПО`/`ОБЩИЕ`/`ИЕРАРХИЯ`/`ТОЛЬКО ИЕРАРХИЯ`/`КАК`/`СУММА(`; aggregate expr: `tryTokenize` → verbatim; regex `ВЫБОР` boundary + `\n` → reindentLeafCase; `^\t+` strip |
| `core/query/sdblGenerator.ts` | 2466 | `renderAutoOrder` | vocab | keep | — | emits `АВТОУПОРЯДОЧИВАНИЕ` + section comments |
| `core/query/sdblGenerator.ts` | 2482 | `buildUnionBlocksScalar` | non-sdbl | keep | — | alias-name regex `^Поле\d+$` (synthesized alias detection on model data, not query text); emits `КАК`, `NULL` |
| `core/query/sdblGenerator.ts` | 2510 | `buildUnionBlocksWithTabSection` | non-sdbl | keep | — | same `^Поле\d+$` alias regex; emits `NULL`/`КАК` |
| `core/query/sdblGenerator.ts` | 2545 | `generateDocument` | vocab | keep | — | joins member blocks with `ОБЪЕДИНИТЬ` / `ОБЪЕДИНИТЬ ВСЕ`; appends order/totals/index |
| `core/query/sdblGenerator.ts` | 2646 | `analyzeGroupExpr` | token-consumer | keep | — | `tokenize` (catch → undefined); head token before `(` in `AGGREGATE_WORDS` / `META_FUNCTION_WORDS` (shared sets, via aliases `AGG_WORDS_GROUP`/`DISPLAY_META_WORDS` at 2630); skip ident after `.`, after `КАК`/`ССЫЛКА` (by… |
| `core/query/sdblGenerator.ts` | 2787 | `clusterGroupDuplicates` | non-sdbl | keep | — | ordering of model FieldRefs by rendered-text keys (`fieldRefExpr`); chr signals = key strings / span `selectFieldMultiplicity` (2883, `${tableId} ${path}` keys) |
| `core/query/sdblGenerator.ts` | 2924 | `capGroupDuplicatesToSelect` | non-sdbl | keep | — | multiplicity capping on rendered keys + analyzeGroupExpr (token). Span: `renderGrouping` (2969) emits `СГРУППИРОВАТЬ ПО`, `ГРУППИРУЮЩИМ НАБОРАМ`, `(`/`)` set lines; uses `isConstGroupExpr` |
| `core/query/sdblGenerator.ts` | 3064 | `unwrapHavingMaxMin` | token-consumer | keep | — | regex pre-filter `^(МАКСИМУМ |
| `core/query/sdblGenerator.ts` | 3094 | `literalContinuationLines` | token-consumer | keep | — | `tryTokenize(text,{comments:true})`; string/date tokens spanning a line start → protected line indexes |
| `core/query/sdblGenerator.ts` | 3109 | `indentCommentedCondition` | token-consumer | keep | — | `tryTokenize(…,{comments:true})` has comment?; `\n[ \t]*` continuation regex rebased to `pad`, skipping literalContinuationLines |
| `core/query/sdblGenerator.ts` | 3122 | `buildConditionStrings` | slice | keep | — | custom WHERE/HAVING: `tryTokenize(…,{comments:true})` → verbatim / commented path (`closeAfterLastLine('(' + expr)` when hasTopLevelBooleanOp===true); moveNotBeforeTuple, unwrapHavingMaxMin; regex `^НЕ(?![\p{L}\p{N}_])` … |
| `core/query/sdblGenerator.ts` | 3223 | `renderConditions` | slice | keep | — | emits `ГДЕ`, `И `; per condition: leading lines matching `^\s*\/\/` are treated as comment lines (they come from `commentLeading`) and `И` is placed after them |
| `core/query/sdblGenerator.ts` | 3249 | `renderHaving` | slice | keep | — | emits `ИМЕЮЩИЕ`, trailing ` И`; separator `\n\tИ` when `tryTokenize(c,{comments:true})` has a comment |
| `core/query/sdblKeywordSets.ts` | 1 | `<module>` | vocab | keep | — | LITERAL/AGGREGATE/COMPARISON/PERIOD/META_FUNCTION sets |
| `core/query/sdblLexer.ts` | 1 | `<module> KEYWORDS` | vocab | keep | — | partial Russian keyword set |
| `core/query/sdblLexer.ts` | 126 | `tokenize` | raw-scanner | keep | — | the lexer |
| `core/query/sdblLexer.ts` | 327 | `tryTokenize` | raw-scanner | keep | — | strict wrapper |
| `core/query/sdblParser.ts` | 150 | `withSubqueryRecursionGuard` | false-positive | keep | — | none (depth counter for recursion, no text) |
| `core/query/sdblParser.ts` | 371 | `parseQuery` | token-consumer | keep | — | `tokenize(text)`, rejects `date` tokens, runs Cursor |
| `core/query/sdblParser.ts` | 403 | `isImplicitSourceHead` | contextual-role | migrate | PR-4 | token window: name token whose `text.toUpperCase()` ∈ METADATA_KINDS, prev not `.`, prev ident/keyword text ≠ КАК/ССЫЛКА, then `. name . (name or *)` |
| `core/query/sdblParser.ts` | 444 | `synthesizeImplicitFrom` | contextual-role | keep | — | token walk with paren/brace depth; detects top-level ИЗ keyword, SECTION_AFTER_FIELDS insert point; skips `ЗНАЧЕНИЕ(`/`ТИП(` zones by ident text; edits raw source by token pos and re-`tokenize`s synthesized text |
| `core/query/sdblParser.ts` | 588 | `synthesizeTempTableFrom` | contextual-role | investigate | PR-4 | same token walk as 444; heads = name tokens followed by `.`; skips КАК/ССЫЛКА `if (t.type === 'keyword' && (up === 'КАК' or 'ССЫЛКА'))` |
| `core/query/sdblParser.ts` | 698 | `parseSingleQueryBody` | token-consumer | keep | — | Cursor keyword checks for sections; re-`tokenize(slice,{comments:true})` for comment capture; `{` + ident `ХАРАКТЕРИСТИКИ` (value.toUpperCase); regex `/^&[\p{L}\p{N}_]+$/u` on builder `ref` text; `/^\/+$/` on comment tex… |
| `core/query/sdblParser.ts` | 1185 | `parseSelectionModifiers` | token-consumer | keep | — | matchKeyword РАЗРЕШЕННЫЕ/РАЗЛИЧНЫЕ/ПЕРВЫЕ + number token |
| `core/query/sdblParser.ts` | 1217 | `parseFieldList` | token-consumer | keep | — | stops on `{`/ПОМЕСТИТЬ/ДОБАВИТЬ/ИЗ keywords |
| `core/query/sdblParser.ts` | 1245 | `tryParseCastTabSection` | contextual-role | keep | — | head ident `text.toUpperCase() === 'ВЫРАЗИТЬ'`, token paren balance, slices cast text by pos |
| `core/query/sdblParser.ts` | 1317 | `tryParseTabSection` | token-consumer | keep | — | lookahead `name . name … . (` on tokens |
| `core/query/sdblParser.ts` | 1386 | `parseTabColumn` | token-consumer | keep | — | token path vs expression, token depth, stops on isSectionKeyword/КАК |
| `core/query/sdblParser.ts` | 1471 | `parseOneField` | contextual-role | migrate | PR-4 | token depth; inline section list ГДЕ…ДЛЯ (1494); implicit alias + "two idents" validation decided by `EXPR_STOP_WORDS.has(ident.value.toUpperCase())` / EXPR_TERMINATOR_WORDS; `startsWith('#')` |
| `core/query/sdblParser.ts` | 1663 | `requalifyTabSectionExpr` | contextual-role | migrate | PR-4 | re-`tokenize(rawBody)`; depth + `(ВЫБРАТЬ` skip; ЗНАЧЕНИЕ/ТИП zone skip; prev КАК/ССЫЛКА; EXPR_STOP_WORDS; edits by Token.pos |
| `core/query/sdblParser.ts` | 1748 | `stripLineComments` | raw-scanner | migrate | PR-9 | scans `text[i]`, tracks `"` strings with `""` escape and `'` date literals, removes `//` to EOL, trims trailing ws |
| `core/query/sdblParser.ts` | 1828 | `argTextsKeepingComments` | slice | keep | — | `tryTokenize(slice,{comments:true})`, assigns comment tokens by pos; slices source |
| `core/query/sdblParser.ts` | 1902 | `parseFrom` | token-consumer | keep | — | join chain via isJoinKeyword/consumeJoinKind/expectKeyword('ПО') |
| `core/query/sdblParser.ts` | 2064 | `parseTableSource` | token-consumer | keep | — | token paren depth for `(subquery)`, slices inner text by pos, КАК alias |
| `core/query/sdblParser.ts` | 2185 | `canBeBareAlias` | token-consumer | keep | — | `peek().type === 'ident'` |
| `core/query/sdblParser.ts` | 2190 | `isJoinKeyword` | token-consumer | keep | — | keyword ∈ JOIN_KEYWORDS or СОЕДИНЕНИЕ |
| `core/query/sdblParser.ts` | 2203 | `consumeJoinKind` | contextual-role | keep | — | ident `value.toUpperCase() === 'ВНЕШНЕЕ'` |
| `core/query/sdblParser.ts` | 2245 | `readJoinCondition` | token-consumer | keep | — | token depth; stops on `,`/`;`/`}`/join kw/JOIN_COND_STOP; re-tokenizes slice for comments |
| `core/query/sdblParser.ts` | 2314 | `parseVirtualParams` | slice | keep | — | splits `fullName` on `.`, dispatches on metadata kind/slice names (case-sensitive) |
| `core/query/sdblParser.ts` | 2428 | `parsePositionalArgs` | slice | keep | — | token depth over `( { `, top-level comma split, slice by pos |
| `core/query/sdblParser.ts` | 2572 | `tryAggregate` | token-consumer | keep | — | head keyword → AGG_KEYWORD_TO_FUNC; КОЛИЧЕСТВО + РАЗЛИЧНЫЕ |
| `core/query/sdblParser.ts` | 2626 | `parseFieldRef` | token-consumer | keep | — | alternating name / `.` tokens |
| `core/query/sdblParser.ts` | 2686 | `buildFieldOwnerScan` | token-consumer | keep | — | token paren depth, skips `(ВЫБРАТЬ` keyword zones, `alias . field` |
| `core/query/sdblParser.ts` | 2756 | `tryBareField` | token-consumer | keep | — | dotted name tokens; single segment rejected if in LITERAL_VALUES (= LITERAL_WORDS) |
| `core/query/sdblParser.ts` | 2801 | `bareLhsRef` | false-positive | keep | — | none (delegates to tryBareField) |
| `core/query/sdblParser.ts` | 2851 | `qualifyBareFieldsInExpression` | contextual-role | migrate | PR-4 | token walk with paren/brace depth, `(ВЫБРАТЬ` skip, ЗНАЧЕНИЕ/ТИП zone skip, prev КАК/ССЫЛКА, EXPR_STOP_WORDS, edits by pos |
| `core/query/sdblParser.ts` | 2942 | `parseWhere` | token-consumer | keep | — | expectKeyword ГДЕ → parseConditionList |
| `core/query/sdblParser.ts` | 2997 | `parseHaving` | token-consumer | keep | — | expectKeyword ИМЕЮЩИЕ |
| `core/query/sdblParser.ts` | 3005 | `parseConditionList` | slice | keep | — | re-tokenizes section with comments, maps comment pos to segment token ranges; stripLineComments on expressions |
| `core/query/sdblParser.ts` | 3082 | `collectConditionTokens` | contextual-role | migrate | PR-4 | token depth + caseDepth via local `isIdentWord(t,'ВЫБОР'/'КОНЕЦ')`; stop set |
| `core/query/sdblParser.ts` | 3107 | `hasTopLevelOr` | contextual-role | migrate | PR-4 | token depth/caseDepth; ident `ИЛИ` at depth 0 |
| `core/query/sdblParser.ts` | 3235 | `trySimpleCondition` | raw-scanner | keep | — | token depth to find operator; ident ИЕРАРХИИ check; re-tokenizes inner subquery for comments; calls raw-scanners 3472/3488 |
| `core/query/sdblParser.ts` | 3390 | `isParamRhs` | contextual-role | keep | — | finds `И` by `text.toUpperCase()`, strips leading ident ИЕРАРХИИ, param chain |
| `core/query/sdblParser.ts` | 3415 | `isParamChain` | token-consumer | keep | — | `param (. name)*` |
| `core/query/sdblParser.ts` | 3428 | `isNotToken` | contextual-role | migrate | PR-4 | ident/keyword `text.toUpperCase() === 'НЕ'` |
| `core/query/sdblParser.ts` | 3451 | `subqueryInnerText` | slice | keep | — | token paren depth, ВЫБРАТЬ keyword, slice by pos |
| `core/query/sdblParser.ts` | 3472 | `isCompactSubquerySource` | raw-scanner | migrate | PR-9 | regex per line: word-boundary `ВЫБРАТЬ` … `ИЗ` on the same line |
| `core/query/sdblParser.ts` | 3488 | `hasRedundantHavingOrParens` | raw-scanner | migrate | PR-9 | regex finds `ИМЕЮЩИЕ` then tail section via regex; char scan `rest[i]` with `"` string toggle and paren depth for word `ИЛИ` |
| `core/query/sdblParser.ts` | 3509 | `trySubqueryParam` | slice | keep | — | token paren depth, ВЫБРАТЬ keyword, slice inner by pos, recursive parseDocument |
| `core/query/sdblParser.ts` | 3554 | `joinFlags` | token-consumer | keep | — | switch on canonical join kind value |
| `core/query/sdblParser.ts` | 3576 | `splitJoinConjuncts` | contextual-role | migrate | PR-4 | token depth/caseDepth; keyword И split unless МЕЖДУ pending |
| `core/query/sdblParser.ts` | 3625 | `classifyJoinConjunct` | token-consumer | keep | — | token operator search; uses stripOuterParens on slice |
| `core/query/sdblParser.ts` | 3679 | `resolveJoin` | token-consumer | keep | — | token segments, comment-token positions, stripOuterParens(condText) |
| `core/query/sdblParser.ts` | 3791 | `hasBalancedOuterParens` | token-consumer | keep | — | token paren matching |
| `core/query/sdblParser.ts` | 3817 | `trySimpleJoinCondition` | token-consumer | keep | — | token operator search |
| `core/query/sdblParser.ts` | 3851 | `stripOuterParens` | raw-scanner | migrate | PR-9 | char scan `s[i]` counting `(`/`)` to strip one outer pair |
| `core/query/sdblParser.ts` | 3873 | `parseGroupBy` | token-consumer | keep | — | keywords СГРУППИРОВАТЬ ПО / ГРУППИРУЮЩИМ НАБОРАМ |
| `core/query/sdblParser.ts` | 3933 | `parseGroupFieldRef` | token-consumer | keep | — | token depth, isSectionKeyword stop |
| `core/query/sdblParser.ts` | 3988 | `parseOrderModifiers` | contextual-role | keep | — | matchKeyword ИЕРАРХИЯ/УБЫВ; ident `ВОЗР` |
| `core/query/sdblParser.ts` | 4045 | `parseOrder` | contextual-role | migrate | PR-4 | token cursor; ВЫБОР/КОНЕЦ caseDepth; ВОЗР/ЕСТЬ/НЕ/NULL ident checks; emits canonical `ЕСТЬ [НЕ ]NULL` |
| `core/query/sdblParser.ts` | 4268 | `parseTotals` | token-consumer | keep | — | keywords ИТОГИ/ПО/ОБЩИЕ |
| `core/query/sdblParser.ts` | 4299 | `parseTotalAggregate` | token-consumer | keep | — | token depth; inline stop ПОМЕСТИТЬ/ДОБАВИТЬ/ИЗ; tail КАК |
| `core/query/sdblParser.ts` | 4373 | `matchSimpleAggregate` | token-consumer | keep | — | AGG_KEYWORD_TO_FUNC on keyword head, token paren match |
| `core/query/sdblParser.ts` | 4469 | `matchSumAlias` | token-consumer | keep | — | `СУММА ( name )` on tokens |
| `core/query/sdblParser.ts` | 4527 | `matchPeriodBy` | contextual-role | keep | — | ident `ПЕРИОДАМИ`, token args, re-tokenizes for comments; emits canonical `ПЕРИОДАМИ(` |
| `core/query/sdblParser.ts` | 4587 | `parseTotalGroupField` | token-consumer | keep | — | ТОЛЬКО ИЕРАРХИЯ / ИЕРАРХИЯ / КАК keywords |
| `core/query/sdblParser.ts` | 4638 | `parseIndex` | token-consumer | keep | — | ИНДЕКСИРОВАТЬ ПО [НАБОРАМ], УНИКАЛЬНО |
| `core/query/sdblParser.ts` | 4720 | `parseIndexField` | token-consumer | keep | — | token depth, isSectionKeyword stop |
| `core/query/sdblParser.ts` | 4763 | `parseLockForUpdate` | token-consumer | keep | — | ДЛЯ ИЗМЕНЕНИЯ + dotted names until section keyword |
| `core/query/sdblParser.ts` | 4795 | `parseBuilderBlock` | token-consumer | keep | — | `{` + keyword (+ПО) |
| `core/query/sdblParser.ts` | 4819 | `parseBuilderCondition` | token-consumer | keep | — | token depth to `,`/`}`/КАК; `. *` tail; stripOuterParens(slice) |
| `core/query/sdblParser.ts` | 4861 | `parseBuilderField` | contextual-role | investigate | PR-4 | `first.value === 'НЕ'` on ident (value = original spelling, so case-sensitive) |
| `core/query/sdblParser.ts` | 4934 | `splitUnionMembers` | token-consumer | keep | — | paren/brace depth, ОБЪЕДИНИТЬ/ВСЕ keywords, synthetic eof |
| `core/query/sdblParser.ts` | 5032 | `splitUnionMemberTexts` | slice | keep | — | `tokenize(text)` then slices raw text between ОБЪЕДИНИТЬ tokens |
| `core/query/sdblParser.ts` | 5071 | `extractDocComments` | false-positive | keep | — | none (delegates); kwre = SECTION_LINE (5093), used by nestingPad (see extra row) |
| `core/query/sdblParser.ts` | 5108 | `dedentContinuations` | slice | keep | — | `tryTokenize({comments})` to get string/date ranges, then regex `\n\t+` outside them |
| `core/query/sdblParser.ts` | 5125 | `dedentNestedRawText` | non-sdbl | keep | — | object walker over model strings |
| `core/query/sdblParser.ts` | 5168 | `parseDocumentInner` | token-consumer | keep | — | tokenize, reject dates, splitUnionMembers, eof check |
| `core/query/sdblParser.ts` | 5384 | `applyAccountingMeta` | non-sdbl | keep | — | `fullName.split('.')`, metadata kind compare |
| `core/query/sdblParser.ts` | 5429 | `rewriteMemberAliases` | non-sdbl | keep | — | model rewrite; isNullCell does `expression.trim().toUpperCase() === 'NULL'` |
| `core/query/sdblParser.ts` | 5478 | `stringLiteralRanges` | raw-scanner | migrate | PR-9 | scans `text[i]`: `"` strings with `""` escape, `//` comments to EOL; ignores `'…'` date literals |
| `core/query/sdblParser.ts` | 5572 | `isCodelessFragment` | token-consumer | keep | — | `tryTokenize(fragment)` all eof |
| `core/query/sdblParser.ts` | 5600 | `attachBatchComments` | non-sdbl | keep | — | length check + delegate |
| `core/query/sdblParser.ts` | 5753 | `inferUndefinedTempTables` | raw-scanner | migrate | PR-9 | regexes over raw chunk text: `ident.ident(.)?` (5800), `ident.*` (5826), bare `*` with boundary heuristic (5827) |
| `core/query/sdblParser.ts` | 5873 | `isScalarLiteralExpr` | raw-scanner | migrate | PR-9 | regexes classify trimmed text as string/number/boolean literal |
| `core/query/sdblParser.ts` | 5883 | `registerTempTables` | non-sdbl | keep | — | model-level registry (kwre signal has no regex in body) |
| `core/query/selectListRepair.ts` | 35 | `repairSelectListsForRecovery` | recovery | keep | — | tokenize; depth; blanks depth-0 `ВЫБРАТЬ…ИЗ` |
| `core/query/selectListRepair.ts` | 94 | `blankSelectList` | recovery | keep | — | same-length blanking |
| `core/query/selectListRepair.ts` | 129 | `repairTrailingSectionsForRecovery` | recovery | keep | — | TRAILING_SECTIONS/MEMBER_BOUNDARIES frames; placeholders `ГДЕ 1`/`И 1`/`ДЛЯ ИЗМЕНЕНИЯ` |
| `core/query/selectListRepair.ts` | 198 | `repairUnbalancedParensForRecovery` | recovery | keep | — | paren/`;` token walk |
| `core/query/selectListRepair.ts` | 270 | `repairLexicalErrorsForRecovery` | recovery | keep | — | blanks SdblLexError extents |
| `core/query/semanticValidator.ts` | 1 | `<module> PSEUDO_FIELDS / TYPE_PREFIXES / SUBTABL` | vocab | investigate | PR-5 | metadata-kind and pseudo-field word sets |
| `core/query/semanticValidator.ts` | 134 | `validateBatchSemantics (validation)` | token-consumer | keep | — | tokenize(text) for findPosition; `ИЗМЕНЕНИЯ` subtable name |
| `core/query/semanticValidator.ts` | 552 | `isOrdinaryExpressionSlot (validation)` | token-consumer | keep | — | `{` or depth-0 `КАК` → not ordinary |
| `core/query/semanticValidator.ts` | 570 | `periodByDateExpressions (validation)` | token-consumer | keep | — | ident `ПЕРИОДАМИ(`; depth-0 `,` split; slices by token pos |
| `core/query/semanticValidator.ts` | 607 | `findMalformedCustomExpressions (validation)` | false-positive | keep | — | operator enum `'МЕЖДУ'`/`'В'` |
| `core/query/semanticValidator.ts` | 711 | `findPosition` | token-consumer | keep | — | dotted token-sequence match of fullName (`.text` upper) |
| `core/query/tempTableSemantics.ts` | 146 | `newestLifetimeAt` | false-positive | keep | — | list index |
| `core/query/unionModel.ts` | 125 | `deriveUnionColumns` | false-positive | keep | — | `Поле{n}` naming |
| `core/query/wrapTabSectionAggregates.ts` | 28 | `wrapTabSectionAggregates` | token-consumer | keep | — | tokenize; AGGREGATE_WORDS + `(` + `ident . ident .` |
| `core/semantic/buildSemanticSnapshot.ts` | 69 | `buildSemanticSnapshotFromText` | recovery | keep | — | chains the selectListRepair repairs |
| `core/semantic/collectSymbols.ts` | 78 | `resolveSymbolTable` | false-positive | keep | — | path index |
| `core/semantic/describeVirtualTableArg.ts` | 41 | `describeVirtualTableArgAt` | false-positive | keep | — | `fullName.split('.')`, `parts[0] as TableKind` |
| `core/semantic/resolveAliasAt.ts` | 136 | `localSymbolsFor` | false-positive | keep | — | path index |
| `core/semantic/semanticSnapshot.ts` | 134 | `hashSource` | false-positive | keep | — | charCode hash |
| `extension/queryAtCursor.ts` | 23 | `<module> (QUERY_KEYWORDS)` | vocab | migrate | PR-11 | `['ВЫБРАТЬ','УНИЧТОЖИТЬ']`: words that mark a BSL string literal as a query |
| `extension/queryAtCursor.ts` | 45 | `startsWithQueryKeyword` | raw-scanner | migrate | PR-11 | `stripLeadingTrivia` (whitespace+BOM, then whole `//` lines), then `toUpperCase().startsWith(kw)`, then the next char must not be `[\p{L}\p{N}_]` |
| `extension/queryAtCursor.ts` | 74 | `findAllQueryLiterals` | non-sdbl | keep | — | **BSL lexer**: skips `//` comments and `'…'` dates, reads `"…"` with `""` escapes, records quote offsets, `unpipe` |
| `extension/queryAtCursor.ts` | 152 | `findQueryKeywordRange` | raw-scanner | migrate | PR-11 | Third copy of the trivia skip (regex `^[\s﻿]+` plus `//` line cut) and the keyword+boundary match on `hit.text`, then a BSL raw-offset mapping (line count, `[ \t]*\ |
| `extension/queryAtCursor.ts` | 226 | `rawOffsetToQueryTextOffset` | non-sdbl | keep | — | **BSL** coordinate map: `""`→`"` and continuation-line `[ \t]*\ |
| `webview-canvas/components/PackageNav.tsx` | 387 | `PackageNav` | false-positive | keep | — | kwlit hits are upper-case words in comments (`ЛИШЕ`, `ВТ` badge comment); the badge text comes from i18n |
| `webview-canvas/fields/FieldsWorkspace.tsx` |  | `webview-canvas/fields/FieldsWorkspace.tsx` | false-positive | keep | — | supplementary sweep: index variable / UI string / XML / lexer-message parsing; not SDBL lexing |
| `webview-canvas/grouping/GroupingWorkspace.tsx` |  | `webview-canvas/grouping/GroupingWorkspace.tsx` | false-positive | keep | — | supplementary sweep: index variable / UI string / XML / lexer-message parsing; not SDBL lexing |
| `webview-canvas/i18n.ts` | 1 | `<module>` | non-sdbl | keep | — | Display strings naming keywords: ДОБАВИТЬ/УНИЧТОЖИТЬ in tooltips (en/uk/ru); `packageUnionKeywordDistinct/All` = `UNION`/`UNION ALL` (en), `ОБ'ЄДНАТИ` (uk), `ОБЪЕДИНИТЬ [ВСЕ]` (ru) |
| `webview-canvas/structure/edgeRouter.ts` | 215 | `findOrthogonalPath` | non-sdbl | keep | — | grid geometry indexing |
| `webview-canvas/structure/edgeRouter.ts` | 324 | `orthogonalPath` | non-sdbl | keep | — | point array indexing |
| `webview-canvas/structure/edgeRouter.ts` | 355 | `chooseLabel` | non-sdbl | keep | — | segment indexing |
| `webview-canvas/structure/edgeRouter.ts` | 391 | `routeEdges` | non-sdbl | keep | — | edge/node arrays |
| `webview/components/ConstructorView.tsx` |  | `webview/components/ConstructorView.tsx` | false-positive | keep | — | supplementary sweep: index variable / UI string / XML / lexer-message parsing; not SDBL lexing |
| `webview/components/QueryTextDialog.tsx` | 46 | `lineColToOffset` | slice | keep | — | Diagnostic (line, col) to CodeMirror offset via `split('\n')` |
| `webview/components/SideTabsRail.tsx` |  | `webview/components/SideTabsRail.tsx` | false-positive | keep | — | supplementary sweep: index variable / UI string / XML / lexer-message parsing; not SDBL lexing |
| `webview/components/TempTableDialog.tsx` | 28 | `TempTableDialog` | false-positive | keep | — | kwlit = default temp-table name `'ВТ'` |
| `webview/conditionOperators.ts` | 1 | `<module> (CONDITION_OPERATORS)` | vocab | keep | — | UI list `['=','<>','>','>=','<','<=','В','МЕЖДУ','ПОДОБНО']` |
| `webview/expressionEditor/TreeList.tsx` | 1 | `<module>` | false-positive | keep | — | `rows[i]` array indexing |
| `webview/expressionEditor/expressionCompletion.ts` | 24 | `positionCompletionInfo` | false-positive | keep | — | geometry of the completion info card. The kwlit signal really belongs to module const `EXPRESSION_KEYWORDS` (:61), see row X5 |
| `webview/expressionEditor/expressionCompletion.ts` | 66 | `inStringOrComment` | raw-scanner | migrate | PR-12 | Scans text before the cursor: `"` toggles inString (implicitly fine for `""`); `//` counts only if on the cursor's line. Ignores `'…'` dates. A `"` inside a `//` comment on an earlier line flips the state (wrong answer) |
| `webview/expressionEditor/expressionContext.ts` | 112 | `collectChains` | token-consumer | keep | — | `ident\ |
| `webview/expressionEditor/expressionContext.ts` | 129 | `lexicalIssue` | slice | migrate | PR-4 | Parses the error **message** `^Лексическая ошибка (\d+):(\d+)` back into line/col, then converts to an offset; `to = from+1` |
| `webview/expressionEditor/expressionContext.ts` | 153 | `analyzeExpression` | token-consumer | keep | — | `tokenize` (a throw becomes a lexical issue); `hasSubquery` = any keyword token with value `'ВЫБРАТЬ'` |
| `webview/expressionEditor/functionCatalogView.ts` | 1 | `<module>` | vocab | keep | — | `GROUP_CATEGORY` (catalog group titles), `LEAF_CATEGORY`, `FREQUENT_LABELS`, `TEMPLATE_LABELS`: references to `FUNCTION_CATALOG` leaf labels; `completionWord` (:120) = label head that must match `^[A-Za-zА-Яа-яЁё_][A-Za-… |
| `webview/i18n/index.ts` | 18 | `webview/i18n/index.ts` | non-sdbl | keep | — | supplementary sweep: index variable / UI string / XML / lexer-message parsing; not SDBL lexing |
| `webview/openDesignerBatch.ts` | 9 | `userComments` | token-consumer | migrate | PR-4 | `tokenize(text,{comments:true})`, keeps comment tokens, drops `/^\/+$/` (auto-separators) |
| `webview/queryHighlight.ts` | 17 | `<module> (KEYWORDS)` | vocab | migrate | PR-12 | 47 highlight words. **= lexer KEYWORDS − 5 aggregates + {ИЛИ, НЕ, ИЕРАРХИИ, ЕСТЬ, NULL, ВОЗР, ПЕРИОДАМИ, ССЫЛКА, ВЫБОР, КОГДА, ТОГДА, ИНАЧЕ, КОНЕЦ}**. Missing: ВНЕШНЕЕ, СПЕЦСИМВОЛ, ИСТИНА/ЛОЖЬ/НЕОПРЕДЕЛЕНО (LITERAL_WORDS… |
| `webview/queryHighlight.ts` | 68 | `classify` | contextual-role | migrate | PR-12 | Dispatch on first char (`/` comment, `"` string, `'` date, `&` param, digit number), then KEYWORDS, then FUNCTION_NAMES, then "ident followed by spaces and `(`" = function |
| `webview/state/queryStore.ts` | 512 | `applyColumnAlias` | false-positive | keep | — | `current[i]` array index |
| `webview/state/queryStore.ts` | 592 | `reducer` | slice | keep | — | array `.slice()`, `path.split('.')` on **model** field paths, builds `&${name}` param text |
| `webview/state/queryStore/snapshots.ts` | 104 | `assembleMembers` | false-positive | keep | — | array index |
| `webview/state/queryStore/snapshots.ts` | 113 | `snapshotActiveBatch` | false-positive | keep | — | array index |
| `webview/state/queryStore/snapshots.ts` | 144 | `batchMemberInfo` | false-positive | keep | — | array index; default name text `Запрос пакета N` |
| `webview/state/queryStore/snapshots.ts` | 235 | `deriveTempTableLifetimes` | false-positive | keep | — | `toUpperCase()` name keys, array index |
| `webview/state/queryStore/snapshots.ts` | 296 | `availableTempTables` | false-positive | keep | — | array index |
| `webview/state/queryStore/snapshots.ts` | 320 | `availableTempTablesWithOrigin` | false-positive | keep | — | array index |
| `webview/state/queryStore/snapshots.ts` | 408 | `derivePackageTempTableContinuity` | false-positive | keep | — | array index, upper-cased names |
| `webview/state/queryStore/snapshots.ts` | 483 | `assembleBatch` | false-positive | keep | — | array index |
| `webview/state/queryStore/snapshots.ts` | 518 | `stripConditionComments` | token-consumer | keep | — | `tryTokenize(expr,{comments:true})`; deletes comment tokens by `t.pos`/`t.text.length` in reverse; undefined keeps the text |
