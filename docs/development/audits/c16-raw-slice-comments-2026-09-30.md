# C16 — comments in virtual-table and `ПЕРИОДАМИ` arguments (2026-09-30)

Baseline: `10099a9` after the invalid-text lexical contract.

## Defect

The virtual-table argument reader (`parsePositionalArgs`) and the `ПЕРИОДАМИ(…)`
reader (`matchPeriodBy`) take raw slices through `sliceSource`, which ends at the
last code token (the lexer skips `//`) and strips line comments. Even with
`preserveComments: true` — the production open path — user comments there were
lost before Apply, with and without metadata:

- `СрезПоследних(, ИСТИНА // C16-marker\n)`
- `ПЕРИОДАМИ(Месяц, 1 // C16-marker\n, 2)`

Earlier reproductions: [C11 resumed audit](c11-resumed-audit-2026-09-29.md).

## Rejected first attempt

Keeping comments in *every* `sliceSource` slice broke a valid Apply: in
`ИМЕЮЩИЕ КОЛИЧЕСТВО(*) > 1 // c1\nИ СУММА(1) > 0` the conjunct renderer wrote
`КОЛИЧЕСТВО(*) > 1 // c1 И`, the comment swallowed `И` and the C8 guard
blocked Apply (on the baseline Apply succeeded, only dropping the comment). The
Boolean/expression renderers are not comment-safe, so those slots stay C17.
The attempt was also reached only through the corpus gate without
`preserveComments`, which does not exercise the production path.

## Change

- Parser: a stack-saved flag `keepArgComments` follows `parseBatch` /
  `parseDocument({ preserveComments })`, inherited by nested parses. Only the
  two readers above consult it; every other raw slice is unchanged.
- `argTextsKeepingComments` assigns each comment in the call to an argument
  with code: on the argument's code line or on the line of the comma after it →
  trailing; on its own line → leading comment of the next argument, or own-line
  trailing comment of the last argument before `)`. Comments inside an
  argument's code stay in its raw text; omitted arguments stay `''`. A call
  without comments keeps the former slicing byte for byte.
- `argComments.splitArgComments` (lexer-based) splits a stored argument back.
  `emitRawCall` (VT/accounting/criterion) and the parser's `ПЕРИОДАМИ` text
  write the comma *before* a trailing comment and end every comment's line, so
  no comment swallows a `,` or `)`. The assignment rule makes reopening the
  written text stable.
- `commentBinder`: own-line comments inside such calls are no longer also
  relocated to `afterFrom` (they would have been duplicated).

Limitations: continuation lines of an argument after an inner comment keep their
source indentation (verbatim rule of the expression lexical contract). A call
whose arguments are all omitted keeps no comment.

## Verification

- `rawSliceComments.c16.test.ts`, 44 cases: 13 kept-comment cells (VT
  first/last/inner/own-line/comma-line/omitted argument, VT in source and
  condition subqueries, accounting register, `ПЕРИОДАМИ` middle/last/unit) ×
  both metadata modes pin the layout, exactly-once comments, `decideApply` ok and
  stable reopen; 8 known-loss cells (C17) pin that the comment is still dropped
  and Apply is not newly blocked, including the ИМЕЮЩИЕ regression above;
  without `preserveComments` comments are stripped as before. On the baseline
  the 26 kept-comment checks fail and the others pass.
- Corpus generation, baseline vs working tree, 1976 queries × both metadata
  modes, both with and without `preserveComments`: byte-identical.
- `npm run typecheck`; `npx vitest run test/unit` 3739 passed;
  `npm run test:e2e` 106 passed; `npm run test:integration` 38 passing;
  `npm run docs:check`.

No golden, snapshot or classification updates. No browser test was added; the
change is below the store and the shared open/preview/Apply path is exercised
in the unit tests.
