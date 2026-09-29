# C12 — reject unterminated characteristics, 2026-09-29

Follow-up: C13–C15 were subsequently closed as P0 in the [EOF loop fix](c13-c15-raw-expression-eof-2026-09-29.md). The findings below describe the C12 baseline.

Baseline: `9843b3b` / `v0.1.93`. This is the explicitly authorized parser exception
following the [C11 audit stop](c11-slot-audit-2026-09-29.md). C11 implementation
remains outside this task.

## Fix and compatibility

Only the characteristics reader in `sdblParser.ts` changes: reaching EOF before
the matching outer `}` now throws `cur.error('ожидался символ «}»', t)` rather
than breaking and slicing an empty string. No recovery, commentBinder, C8, store,
generator or localization code changes are needed. Existing localization patterns
translate the expected-symbol detail in English and Ukrainian and retain Russian.

The error uses the existing cursor line/column format, including its existing
synthetic EOF position convention. No source-position subsystem was changed.
Closed blocks, nested braces, braces inside strings, and braces inside comments
retain the original raw block. The invalid input is rejected on open, before the
shared designer session dispatches LOAD_BATCH or a user can apply replacement text.

Older versions accepted the same input, set `characteristics` to an empty string
and allowed Apply without the block. Previously lost text cannot be reconstructed
by this fix; a still-present unterminated block is now reported instead of lost.

## Tests first

The existing targeted baseline had **82 passing tests**. The new
`characteristicsEof.test.ts` initially had **11 failures and 6 passing closed-block
controls**. Four new Classic/Canvas browser cases also failed on old code. After
the one-line fix, all **17 unit cases and 4 browser cases pass** without changing
expectations.

Coverage includes missing outer braces with/without a nested closed block,
opening with/without committed metadata, line/column errors, localization in all
three languages, exact raw preservation of closed blocks, Apply acceptance of
closed controls, no LOAD_BATCH from the real shared session's load branch,
no insertText from either browser surface, IDE diagnostics and nonthrowing
semantic snapshots. The hook unit test mocks only React hook scheduling and the
bridge, leaving the actual session callback and parser in use. Browser tests use
the production UI and existing blocking overlay.

The IDE may return an unavailable semantic snapshot for this malformed text; the
test does not require new recovery. It must report a parse diagnostic and must not
claim a complete model after silently losing the block.

## Read-only audit of other raw readers

Source inspection covered EOF exits and raw-slice construction in the parser.
Eighteen focused probes ran in separate bounded Node processes against baseline
code; no other reader was edited. This is a bounded audit, not proof over every
possible malformed input.

| Reader / probe | Observed outcome |
|---|---|
| Builder SELECT, WHERE, nested WHERE, ORDER, TOTALS, JOIN without `}` | All six reject: their enclosing reader requires `expectPunct('}')`. The EOF break in `parseBuilderCondition` cannot by itself accept an unfinished outer block. |
| Source subquery, VT positional arguments, tabular-section projection without `)` | All three reject through their existing closing-delimiter checks. |
| Totals aggregate without its closing syntax | Rejects at the required `ПО`; no partial model escapes. |
| SELECT, WHERE and JOIN raw expressions ending with unclosed parentheses | Preserve incomplete raw text and are blocked by the existing malformed-expression gate. |
| ORDER CASE ending before `КОНЕЦ` | Raw model remains malformed and Apply is blocked, although the existing generator adds a closing CASE keyword. No generator changes were made. |
| GROUP BY expression (`parseGroupFieldRef`) | C13: EOF is checked only when depth is zero; an unclosed call loops at EOF. |
| ORDER BY function and comparison operands (`parseOrder`) | C14: both loops have the same depth-dependent EOF check. |
| INDEX BY function (`parseIndexField`) | C15: same nonterminating EOF behavior. |

No second empty-characteristics-style raw slice was reproduced among these probes.
Instead, four raw-expression loops keep appending the EOF token, since
`Cursor.next()` no longer advances at EOF. All four isolated probes terminated
with heap exhaustion (`SIGABRT`) under a 256 MB heap limit and 1.5-second timeout.
The limits constrained the audit processes; they are not proposed runtime limits.
These are separate OPEN ledger findings, not C12 regressions or fixes.

Minimal C13/C14/C15 inputs:

```sdbl
ВЫБРАТЬ Т.Код ИЗ Справочник.Валюты КАК Т СГРУППИРОВАТЬ ПО ЕСТЬNULL(Т.Код
ВЫБРАТЬ Т.Код ИЗ Справочник.Валюты КАК Т УПОРЯДОЧИТЬ ПО ЕСТЬNULL(Т.Код
ВЫБРАТЬ Т.Код ИЗ Справочник.Валюты КАК Т УПОРЯДОЧИТЬ ПО Т.Код = (1
ВЫБРАТЬ 1 КАК Код ПОМЕСТИТЬ ВТ ИНДЕКСИРОВАТЬ ПО ЕСТЬNULL(Код
```

## Verification

- `npx vitest run test/unit/validateBatch.test.ts test/unit/localization.test.ts test/unit/queryDiagnostics.test.ts test/unit/buildSemanticSnapshot.test.ts test/unit/canvasLoadFailure.test.ts` — baseline 82 passed.
- `npx vitest run test/unit/characteristicsEof.test.ts` — old code: 11 failed / 6 passed; fixed: 17 passed.
- `npm run test:e2e -- --grep C12` — old code: 4 failed; fixed: 4 passed.
- `node /tmp/c12-reader-audit.cjs` — temporary read-only audit: 10 controlled open refusals, 4 Apply blockers, 4 resource failures documented above.
- `npm run typecheck` — passed.
- `npx vitest run test/unit` — 3553 passed across 151 files.
- `npm run test:e2e` — 102 passed.
- `npm run test:integration` — 38 passed.
- `npm run docs:check` — passed.
- `git diff --check` — passed.
- `node /tmp/c12-compare.cjs` — independent managed HEAD worktree vs working tree: 1976/1976 byte-identical core and store outputs in each metadata mode; 0 changes.

No golden, snapshot, corpus, dependency or i18n-key changes. The C11 audit and
ledger documentation are included with C12. No push or release is authorized in
this step; C11 must not resume automatically.
