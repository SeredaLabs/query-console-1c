# Phase 2x-2: Virtual-table parameter resolution — reference catalog + design

Status: §1 (catalog) verified. §2.4's open question RESOLVED and its fix
SHIPPED as v0.1.51. Increment 1 (hover shows the parameter role) shipped as
v0.1.52. Increment 2 (bare-field resolution inside `Условие`/`УсловиеСчета`/
etc.) shipped as v0.1.53. Increment 3 (keyword-value completion for
`Периодичность`/`МетодДополнения` — NOT `Порядок`, see the FOURTH "STATUS
UPDATE" for why that was corrected out of scope) shipped as v0.1.54.
Increment 4 was INVESTIGATED and the user explicitly decided to SKIP it
(not just defer) — see the FIFTH "STATUS UPDATE" for the two real,
independent blockers found. **Phase 2x-2 is now considered COMPLETE** —
Increments 1-3 shipped, Increment 4 permanently out of scope as designed.
Companion to the semantic-core roadmap memory (`project-semantic-core-roadmap`).
Source of the catalog below: Хрусталёва, «Язык запросов "1С:Предприятия 8"»,
2nd ed. — pages cited per entry, verified directly (not guessed, not
machine-translated summaries).

## 1. Complete reference catalog (verified against the book)

Every virtual table is called as `<РегистрKind>.<ИмяРегистра>.<Slice>(<params>)`.
Parameters are always POSITIONAL (never named `Параметр := значение`); a
parameter can be *skipped* by leaving its comma-slot empty, e.g.
`Остатки(, Цена >= 300)` (skips Период, passes Условие) or
`Обороты(&Нач, &Кон, , , , , , )` (skips everything after КонецПериода).

### 1.1 РегистрСведений (p. 213-214)

| Slice | Params (in order) |
|---|---|
| `СрезПоследних` | `Период, Условие` |
| `СрезПервых` | `Период, Условие` |

- **Период**: type Дата \| МоментВремени \| Граница. The point in time to get
  the slice AT. Unset → most recent/earliest records, no time restriction.
- **Условие**: an SDBL condition expression built over the register's OWN
  fields (dimensions/resources/attributes) — bare, no alias prefix (e.g.
  `Цена >= 300`, confirmed p. 218 listing 3.10). Restricts the SOURCE records
  BEFORE the slice is computed, not the already-sliced result. Unset → all
  active records.

### 1.2 РегистрНакопления (p. 234-264)

| Slice | Params (in order) |
|---|---|
| `Остатки` | `Период, Условие` |
| `Обороты` | `НачалоПериода, КонецПериода, Периодичность, Условие` |
| `ОстаткиИОбороты` | `НачалоПериода, КонецПериода, Периодичность, МетодДополнения, Условие` |

- **НачалоПериода/КонецПериода**: Дата \| МоментВремени \| Граница.
- **Периодичность**: one of `Период \| Год \| Полугодие \| Квартал \| Месяц \|
  Декада \| Неделя \| День \| Час \| Минута \| Секунда \| Регистратор \|
  Запись \| Авто`. Default `Период` (no extra breakdown).
- **МетодДополнения**: `Движения \| ДвиженияИГраницыПериода`. Default
  `ДвиженияИГраницыПериода`.
- **Условие**: same shape as 1.1, over this register's own fields.

### 1.3 РегистрБухгалтерии (p. 278-315) — DIFFERENT arity from 1.2 even for same-named slices

| Slice | Params (in order) |
|---|---|
| `Остатки` | `Период, УсловиеСчета, Субконто, Условие` |
| `Обороты` | `НачалоПериода, КонецПериода, Периодичность, УсловиеСчета, Субконто, Условие, УсловиеКорСчета, КорСубконто` |
| `ОборотыДтКт` | `НачалоПериода, КонецПериода, Периодичность, УсловиеСчетаДт, СубконтоДт, УсловиеСчетаКт, СубконтоКт, Условие` |
| `ОстаткиИОбороты` | `НачалоПериода, КонецПериода, Периодичность, МетодДополнения, УсловиеСчета, Субконто, Условие` |
| `ДвиженияССубконто` | `НачалоПериода, КонецПериода, Условие, Порядок, Первые` |

- **УсловиеСчета / УсловиеСчетаДт / УсловиеСчетаКт**: condition on the
  account, typically `Счет = (В ИЕРАРХИИ, В) &Счет`.
- **Субконто / СубконтоДт / СубконтоКт**: type `ПланВидовХарактеристикСсылка.<имя>`
  or an array/`СписокЗначений` of such — sets which subconto VIEWS to break
  out (position = subconto slot number, starting at 1).
- **УсловиеКорСчета**: like УсловиеСчета but for the corresponding account.
- **КорСубконто**: like Субконто but for the corresponding account's subconto.
- **Условие**: general condition over other register fields/measurements.
- **Порядок** (ДвиженияССубконто only): SDBL construct to order postings —
  cannot use inequality comparisons on Субконто/СубконтоДт/СубконтоКт fields.
- **Первые** (ДвиженияССубконто only): type Число, caps row count.

### 1.4 РегистрРасчета (p. 327-334)

| Slice | Params (in order) |
|---|---|
| `ФактическийПериодДействия` | `Условие` |
| `ДанныеГрафика` | `Условие` |
| `База<ИмяБазовогоРегистра>` (one per configured base register) | `ИзмеренияОсновногоРегистра, ИзмеренияБазовогоРегистра, Разрезы, Условие` |

- **Условие** (single-param forms): condition over the calculation register's
  own fields (typically filters by Регистратор).
- **ИзмеренияОсновногоРегистра / ИзмеренияБазовогоРегистра**: type
  Массив \| СписокЗначений of dimension NAME STRINGS (not refs) — must have
  matching count/order between the two arrays (values are compared
  positionally between own-register and base-register dimensions).
- **Разрезы**: Массив \| СписокЗначений of field-name strings from the BASE
  register to additionally break the result out by (any of its own
  measurement/attribute names, plus the always-available
  `НомерСтроки/Регистратор/ВидРасчета/ПериодРегистрации/ПериодДействия`).
- **Условие** (4-param form): condition over the MAIN register's own records.

## 2. Design

### 2.1 Data model — new file `src/core/metadata/virtualTableSignatures.ts`

```ts
export type VirtualParamRole =
  | 'period' | 'periodStart' | 'periodEnd'
  | 'periodicity' | 'completionMethod'
  | 'condition' | 'accountCondition' | 'accountConditionDt' | 'accountConditionKt'
  | 'subconto' | 'subcontoDt' | 'subcontoKt'
  | 'order' | 'limit'
  | 'mainDimensions' | 'baseDimensions' | 'sections';

export interface VirtualTableParamSpec {
  /** Exact name as printed in the book/1C docs, e.g. "Период", "УсловиеСчетаДт". */
  name: string;
  role: VirtualParamRole;
}

/** Keyed by (register kind, slice) since e.g. Остатки/Обороты/ОстаткиИОбороты
 *  differ in arity between РегистрНакопления and РегистрБухгалтерии. */
export interface VirtualTableSignature {
  registerKind: 'РегистрСведений' | 'РегистрНакопления' | 'РегистрБухгалтерии' | 'РегистрРасчета';
  slice: string; // 'СрезПоследних' | 'Остатки' | ... | a dynamic 'База<Имя>' prefix match
  params: readonly VirtualTableParamSpec[];
}

export const VIRTUAL_TABLE_SIGNATURES: readonly VirtualTableSignature[] = [ /* catalog from §1, literally */ ];

export function lookupVirtualTableSignature(
  registerKind: VirtualTableSignature['registerKind'],
  slice: string,
): VirtualTableSignature | undefined { /* 'База*' needs a prefix match, not exact */ }
```

Reuses `MetaTable.kind` (already gives the register kind) + `VirtualParams.slice`
(already parsed, see `sdblParser.ts`'s `parseVirtualParams`) as the lookup key —
no new parsing needed to know WHICH signature applies, only to know WHAT each
positional slot MEANS.

`VirtualTableInfo.slice`'s existing union (`types.ts`) is missing
`ФактическийПериодДействия`/`ДанныеГрафика`/`База<Имя>` — regs расчета virtual
tables aren't modeled AT ALL today (confirmed: `grep -n "ФактическийПериодДействия\|ДанныеГрафика" src/` → zero hits anywhere in `src/`). Extending
`VirtualTableInfo`/the parser's virtual-table recognition to cover regs
расчета is itself new, not-yet-scoped work — regs расчета parsing may not
even be wired into `parseVirtualParams` today. **Verify this before assuming
regs расчета are in scope for the first increment.**

### 2.2 Position tracking — extend `SourceMapEvent`/`AbsoluteSourceMapEvent`

`VirtualParams` (`queryModel.ts`) currently stores each parameter as a raw
unparsed text slice with NO offset metadata (`sliceSource` in
`parsePositionalArgs`, `sdblParser.ts`). To let hover/completion know "cursor
is inside virtual-table argument N of table N", need a new source-map event
kind, e.g. `'virtualTableArg'`.

Problem: existing `SourceMapEvent { kind, index, range }` only has ONE `index`
slot. `joinCondition` uses it for "which join in `model.joins`";
`outputAliasSection` uses a fixed 0/1. For `virtualTableArg` we need to know
BOTH which table (`model.tables[i]`, matching the existing `'table'` event's
own indexing) AND which positional argument within that table's call.

Proposed: add an optional field to the shared event shape (backward
compatible, unused by every other kind):

```ts
export interface SourceMapEvent {
  kind: SourceMapNodeKind;
  index: number;       // table index, reusing 'table' kind's own numbering
  argIndex?: number;   // ONLY for 'virtualTableArg': positional arg number (0-based)
  range: TextRange;
}
```

Recorded at the same site `parsePositionalArgs`/`parseVirtualParams` builds
each `VirtualParams` field, bracketing each argument's own token range
(skipping empty/omitted slots — no event for those, matching `joinCondition`'s
"only if condTokens.length > 0" precedent).

### 2.3 Consumer design — staged, NOT all at once

Four distinct things a cursor could be on, ranked by cost/value:

1. **Hover shows "this is the `<role>` parameter of `<Table>.<Slice>`"** for
   ANY recognized argument position (Период, Периодичность, etc.) — pure
   lookup into the static catalog (§2.1) + the new position events (§2.2).
   No field-resolution needed. **Cheapest, safest, do this FIRST.**
2. **Bare-field resolution inside `Условие`/`УсловиеСчета`/etc.** — a bare
   identifier here refers to the underlying table's OWN field (dimension/
   resource/attribute), never an alias. This is architecturally similar to
   Phase 2x-1's output-alias check (a new, narrow resolution domain
   `resolveHeadTable` must consult), but keyed off "position is inside THIS
   table's condition argument" instead of "position is inside УПОРЯДОЧИТЬ".
   Needs `resolver.tableByFullName`/`virtualTableByFullName` to list the
   register's real fields — already available. **Second increment.**
3. **Периодичность/МетодДополнения/Порядок keyword-value completion** (suggest
   `Год`/`Месяц`/`Движения`/etc. when cursor is on that specific argument) —
   a small, self-contained completion-only feature once (1) exists to
   identify which argument the cursor is in. **Third increment, optional.**
4. **Субконто/Разрезы/Измерения\* array-literal contents** (suggesting valid
   field-name strings or ПланВидовХарактеристик refs inside a `Массив(...)`
   literal) — genuinely more complex parsing (arrays, not scalar
   expressions), niche, lowest value. **Defer indefinitely unless asked.**

### 2.4 Open question before ANY code

Is регистр расчета in scope at all for increment 1? `VirtualTableInfo` doesn't
model it today, and it's unclear whether `sdblParser.ts` even RECOGNIZES
`ФактическийПериодДействия`/`ДанныеГрафика`/`База<Имя>` as virtual-table calls
yet (needs a direct grep/read of `parseVirtualParams`'s recognized slice
names before assuming yes or no — not yet checked as of this write-up).
If not recognized at all, регистр расчета support would need PARSER changes
first (recognizing new slice keywords), a materially bigger and riskier
addition than "just" cataloging existing behavior — likely worth its own
separate scoping pass, not bundled into increment 1.

## 3. Recommended next action

Increment 1 (hover-only, catalog + position tracking + static lookup, no
field resolution) is the right first step — bounded, safe, mirrors the
already-proven `joinCondition`/`outputAliasSection` pattern exactly. Before
writing it: confirm which register kinds' virtual tables the CURRENT parser
already recognizes (§2.4) so increment 1's scope is accurate, not assumed.

## STATUS UPDATE: §2.4 resolved, correctness fix SHIPPED (uncommitted)

§2.4's open question was checked directly in code (`sdblParser.ts`'s
`parseVirtualParams`) and the answer was worse than assumed: only 3 of the ~9
catalogued forms had real per-position field mapping (`РегистрБухгалтерии.*`
via `fillAccounting`, and накопления-only `Обороты`/`ОстаткиИОбороты`).
EVERYTHING else — including ALL of регистр расчета's forms — fell through to
a generic `[period, condition]` 2-slot guess, with any non-empty 3rd+ arg
just flagged `unsafeExtraArgs` (blocks Apply) rather than positioned
correctly. Concretely, `ФактическийПериодДействия(Условие)`/`ДанныеГрафика(Условие)`
(confirmed arity 1, single param IS the condition) were landing that string
in `v.period` instead of `v.condition` — a real, pre-existing internal
mislabeling, not something this session introduced.

**Fixed** (matches the confirmed §1.4 catalog exactly, cites the book by
page): `parseVirtualParams`/`sdblGenerator.ts` now give
`ФактическийПериодДействия`/`ДанныеГрафика` their own arity-1 (`condition`
only) dispatch, and `<ОсновнойРегистр>.База<БазовыйРегистр>` its own arity-4
dispatch (`mainDimensions`, `baseDimensions`, `sections`, `condition` — 3 new
`VirtualParams` fields). `Последовательность.*.Границы` deliberately left
untouched — no book evidence gathered for its layout, still correctly
blocked at the generic 2-slot threshold.

**This was a real behavior change, not just internal relabeling**: the
`unsafeExtraArgs`-triggering THRESHOLD moved from "3rd argument" to "2nd
argument" for `ФактическийПериодДействия`/`ДанныеГрафика` (since their real
arity is 1, not the assumed 2) — existing tests in
`test/unit/virtualTableRoundTrip.test.ts` that asserted the OLD (wrong)
threshold were updated to match the newly-confirmed one, not just patched to
pass. Golden corpus (1976 queries) + all 181 oracle fixtures stayed
byte-identical (these forms are rare/absent in real corpus data, as
expected). `docs/development/known-issues.md` and
`docs/en(ru,uk)/limitations.md` updated: the "3+ args" limitation now only
applies to `Последовательность.*.Границы`.

Full suite: 107 files / 1893 tests green, typecheck (all 3 configs) +
build clean, `docs:check` clean except the pre-existing, unrelated New
Builder orphan. NOT committed yet — awaiting the usual "бампни й опублікуй".

**What this does NOT do yet**: the actual hover/completion feature (§2.2/2.3
— position tracking via source-map, bare-field resolution inside `Условие`)
is still fully undesigned-in-code. This fix only corrects the FOUNDATION
(the query model itself now labels these forms' parameters correctly) that
any future hover work would need anyway — it was a necessary prerequisite
surfaced by trying to design the hover feature, not a detour from it.

Shipped as v0.1.51 (this doc's "NOT committed yet" note above is now stale).

## STATUS UPDATE 2: Increment 1 (hover) implemented and tested

§2.2 (position tracking) and the "hover shows the parameter role" half of
§2.3 are now real code, matching the design almost exactly:

- `SourceMapEvent`/`AbsoluteSourceMapEvent` (`sourceMap.ts`) gained the
  `'virtualTableArg'` kind + optional `argIndex` field, exactly as designed.
- `parseVirtualParams`/`parsePositionalArgs` (`sdblParser.ts`) now track each
  argument's own text range (`parsePositionalArgs` returns
  `Array<{text, range}>` instead of bare `string[]`) and record one event per
  non-empty slot. Purely additive — golden corpus (1976 queries) and all 181
  oracle fixtures stayed byte-identical.
- New `src/core/metadata/virtualTableSignatures.ts`: the static catalog from
  §1, literally, plus `lookupVirtualTableSignature(registerKind, slice)`
  (prefix-matches `База<Имя>`).
- New `src/core/semantic/describeVirtualTableArg.ts`:
  `describeVirtualTableArgAt(snapshot, position)` combines the source-map
  event + `findModelAt` (reused from `resolveAliasAt.ts`, Phase 3b/3d) +
  the static catalog into a `Resolution<{tableFullName, param}>` — fail-open,
  same convention as the rest of the roadmap.
- Wired into hover as a NEW, separate entry point in `queryHoverProvider.ts`
  (via `hoverFieldInfo.ts`'s `describeVirtualTableArg` helper) — deliberately
  NOT reusing `findChainAt`, because a virtual-table argument can be
  `&Параметр` (a distinct `'param'` token, never an identifier chain) or a
  whole condition expression. Runs after the existing chain-based hover
  falls through, before the generic "open in Query Designer" fallback.
- l10n: new hover string `"**{param}** — parameter of `{table}`"` added to
  all three bundles (en/ru/uk).

Tests: `test/unit/sourceMapOracle.test.ts` (+8, position/range correctness
per register kind, non-overlap, empty-slot skipping, `findContaining`),
`test/unit/describeVirtualTableArg.test.ts` (new file, 9 tests — one per
register kind + subquery nesting + fail-open cases), and a new Extension Host
integration test in `test/vscode-integration/queryHover.test.ts` proving the
real `provideHover` wiring end-to-end (no register metadata needed — the
feature works from the parsed model alone). Full suite: 108 files/1910 unit
tests green, 28/28 vscode-test integration tests green, typecheck (all 3
configs) clean, `docs:check` clean except the pre-existing unrelated New
Builder orphan. NOT committed yet — awaiting the usual "бампни й опублікуй".

**What Increment 1 deliberately does NOT do**: no bare-field resolution
inside `Условие`/`УсловиеСчета`/etc. against the register's real schema
(Increment 2), no `Периодичность`/`МетодДополнения` keyword-value completion
(Increment 3), no `Субконто`/`Разрезы` array-literal content suggestions
(Increment 4) — all still deferred exactly as ranked in §2.3.

Shipped as v0.1.52.

## STATUS UPDATE 3: Increment 2 (bare-field resolution in Условие) implemented and tested

User asked to continue with Increment 2 right after v0.1.52 shipped. Scope,
confirmed against the catalog before writing code: ONLY the condition-shaped
roles — `condition`, `accountCondition`, `accountConditionDt`,
`accountConditionKt`, `corrAccountCondition` — are in scope here. The other
non-condition roles (`subconto*`, `order`/`limit`,
`mainDimensions`/`baseDimensions`/`sections`) are a genuinely different
shape (value lists / keywords / array literals, not a scalar field
reference) and correctly stay bucketed under increments 3/4.

**Key design decision, verified before coding, not assumed**: `Условие`
filters the register's SOURCE rows BEFORE the slice/output columns are
computed (confirmed in §1's book citations), so a bare identifier there
names the REGISTER's raw field (e.g. `Товар`, `Количество`) — NOT the
slice's own expanded/suffixed output column (e.g. `КоличествоОстаток`).
Checked directly in code (`yamlLoader.ts`'s `buildAccumRegSlices`): the
slice's OWN `MetaTable.fields` already carries the expanded/suffixed shape,
so resolving against it would be WRONG. The base register's real
`fullName` is recoverable with zero ambiguity by dropping the virtual
table's last dotted segment (`<Kind>.<Name>.<Slice>` → `<Kind>.<Name>` — 1C
metadata names never contain a dot) — no extra metadata lookup needed.

**What shipped**:
- `src/extension/hoverFieldInfo.ts`: new `describeVirtualTableConditionFieldChain(queryText, resolver, chain, headPosition)` —
  reuses Increment 1's `describeVirtualTableArgAt` to confirm `headPosition`
  falls inside a condition-shaped role, then resolves the FULL `chain`
  (unlike `describeChain`, there is no alias segment to skip — the
  identifier names a register field directly) via the existing
  `resolveFieldPath` core against the base register's real `MetaTable`.
- `src/extension/queryHoverProvider.ts`: refactored the field-segment
  rendering (resolved / reference / "field not found") out of
  `buildHoverMessage` into a shared `describeFieldPathSegment` helper, reused
  by a new `buildVirtualTableFieldHoverMessage` for the headless
  (no-alias) case. Wired to run BEFORE the existing alias-based
  `describeChain` check inside the same chain-detection branch (a bare
  condition field would otherwise just fail alias resolution and fall
  through to nothing).
- Deliberately HOVER-ONLY, matching Increment 1's own precedent: completion
  was considered and explicitly scoped OUT — dot-completion for a reference
  field's own sub-fields (`Товар.|`) would reuse the same mechanism cheaply,
  but BARE (non-dotted) field-name completion inside a condition has no
  precedent ANYWHERE in this codebase yet (not even for regular WHERE
  clauses) and would need its own trigger-character/scope design — real,
  separate follow-up work, not bundled in here.

**Tests**: `test/unit/hoverFieldInfo.test.ts` (+9: bare dimension field,
reference dereferencing, bare resource field using the RAW name not the
slice's suffixed one, non-condition-role position ⇒ unknown,
non-virtual-table position ⇒ unknown, fieldNotFound reporting, missing base
register metadata ⇒ unknown, undefined headPosition ⇒ unknown, and
`УсловиеСчета` for регистр бухгалтерии also recognized as a condition role)
— all passed first run. New Extension Host integration describe block in
`test/vscode-integration/queryHover.test.ts` (+2 tests) using
`setMetadataResolver` to seed a real `РегистрНакопления.Продажи`/`.Остатки`
pair directly (no XML fixture change needed — `test/fixtures/cf` has no
register at all and extending it just for this would be disproportionate)
— both passed first run, proving the real `provideHover` wiring end-to-end.

Full suite: 108 files / 1919 unit tests green, 30/30 vscode-test integration
tests green (full suite re-run, not just the new tests), typecheck (all 3
configs) clean, `docs:check` clean except the pre-existing unrelated New
Builder orphan. NOT committed yet — awaiting the usual "бампни й опублікуй".

**What Increment 2 deliberately does NOT do**: no completion (see above);
Increments 3 (`Периодичность`/`МетодДополнения` keyword-value completion)
and 4 (`Субконто`/`Разрезы`/`Измерения*` array-literal contents) remain
untouched, design-only, exactly as ranked in §2.3.

Shipped as v0.1.53.

## STATUS UPDATE 4: Increment 3 (keyword-value completion) implemented and tested, with one scope correction

User asked to continue with Increment 3 right after v0.1.53 shipped
("продовжуй з Increment 3").

**Scope correction found BEFORE writing code, not after**: this feature's
own §2.3 originally grouped `Периодичность`/`МетодДополнения`/`Порядок`
together under "keyword-value completion". Re-checking the catalog (§1.3)
before implementing showed `Порядок` (`ДвиженияССубконто` only) is NOT a
closed keyword enum at all — it's an order-by-style expression over real
register/subconto FIELDS (the book explicitly says it forbids inequality
comparisons on some of those fields, which only makes sense for a field
reference, not a fixed keyword). Grouping it here was an oversight in the
original design note. Corrected the scope down to just `Периодичность`
(`Год`/`Месяц`/`Регистратор`/etc., 14 values, both РегистрНакопления and
РегистрБухгалтерии forms — same enum, confirmed shared) and
`МетодДополнения` (`Движения`/`ДвиженияИГраницыПериода`, 2 values) —
`Порядок` is left unhandled by any increment, matching Increment 2's own
"don't code past what's verified" discipline.

**What shipped**:
- `src/core/metadata/virtualTableSignatures.ts`: `PERIODICITY_VALUES`/
  `COMPLETION_METHOD_VALUES` constants (book-verified, §1.2) + a
  `keywordValuesForRole(role)` lookup — role→values, not per-signature,
  since the SAME enum applies everywhere either role appears.
- `src/extension/hoverFieldInfo.ts`: new `virtualTableArgKeywordValues(queryText,
  resolver, position)` — reuses `describeVirtualTableArgAt` (Increment 1) to
  confirm the position's role, then looks up its keyword values (or
  `undefined` for every other role, including `order`).
- `src/extension/queryCompletionProvider.ts`: wired as a check that runs
  BEFORE `findChainForCompletion`'s dot-triggered field completion — this
  path has NO leading `.` at all (a bare keyword slot, e.g. typing `Мес`
  directly inside `Обороты(&Нач, &Кон, Мес, Условие)`), so it can't reuse
  that entry point. Required moving the `getMetadataResolver` fetch earlier
  (now unconditional once `hit` exists, not gated behind `findChainForCompletion`
  returning non-null) — a minor, deliberate widening consistent with how
  hover's `virtualTableArg` check already fetches the resolver unconditionally.

**Tests**: `test/unit/hoverFieldInfo.test.ts` (+6: Периодичность for накопления
and бухгалтерии forms, МетодДополнения, a condition-shaped argument ⇒
undefined, `Порядок` ⇒ undefined — explicitly proving the scope correction
holds in code, not just in this doc — and outside any virtual-table argument
⇒ undefined). New Extension Host integration test in `test/vscode-
integration/queryCompletion.test.ts` (+1) proving the real
`provideCompletionItems` wiring end-to-end with NO register metadata at all
(keyword completion is purely syntactic, like Increment 1) — passed first run.

Full suite: 108 files / 1925 unit tests green, 31/31 vscode-test integration
tests green (full suite re-run), typecheck (all 3 configs) clean,
`docs:check` clean except the pre-existing unrelated New Builder orphan.
NOT committed yet — awaiting the usual "бампни й опублікуй".

**What Increment 3 deliberately does NOT do**: no `Порядок` support (see
scope correction above — genuinely different shape, not simply deferred);
Increment 4 (`Субконто`/`Разрезы`/`Измерения*` array-literal contents)
remains untouched, design-only.

Shipped as v0.1.54.

## STATUS UPDATE 5: Increment 4 investigated, user decided to SKIP it — two independent, real blockers, no code written

User asked to continue with Increment 4. Investigated the actual metadata
model directly (not assumed) before writing anything, and found this
"increment" isn't one feature with two arg-types — it's TWO structurally
different, unrelated blockers, each requiring capability the codebase does
not have today:

**Blocker 1 — `Субконто`/`СубконтоДт`/`СубконтоКт`/`КорСубконто`**: these
name specific VALUES of `ПланВидовХарактеристикСсылка.<имя>` (e.g.
`ПланВидовХарактеристик.ВидыСубконто.Контрагенты`). Checked
`chartOfCharacteristicTypes.ts` directly: the ПВХ parser only reads
STRUCTURE (`Ссылка`, `Наименование`, `Предопределенный` flag, etc.) — it
never enumerates the ПВХ's own items. This is fundamental, not a parser
gap: a ПВХ/catalog's items are DATA (rows in the real 1C database), not
metadata (structure) — `Configuration.xml` (everything this extension ever
reads) describes structure only. Even parsing XML-declared "predefined"
items (some configs have them) would still miss most real ВидыСубконто
values, which are ordinary user-entered catalog rows. Concluded: not
implementable at all within this extension's architecture, not just
deferred for cost reasons.

**Blocker 2 — `ИзмеренияОсновногоРегистра`/`ИзмеренияБазовогоРегистра`/
`Разрезы`** (regs расчета `База<Имя>` form): these are field-NAME STRINGS
from the calculation register's BASE register (the one named by the
`<Имя>` slice suffix). Checked `calculationRegister.ts` directly: it parses
`НомерСтроки`/`Период`/`Регистратор`/`ВидРасчета` + dimensions/resources/
attributes, but NEVER reads the "base registers" association
(`ОсновныеРегистры`/`BaseRegister` in real Configuration.xml) — confirms
what Increment 1 already flagged ("регистр расчета virtual tables aren't
modeled at all"). This one IS theoretically buildable, but needs a whole
NEW metadata-parsing feature (register-to-base-register linkage) built
first, plus resolving the ambiguous slice-suffix→register-name mapping
(`virtualTableSignatures.ts` currently only prefix-matches `'База'`, with
no idea WHICH base register a given suffix names) — a disproportionately
large prerequisite for a low-value completion feature.

Presented both findings to the user in plain language (asked first via
`AskUserQuestion` whether to skip entirely or scope down to just the
Измерения*/Разрезы half; asked again with the technical detail spelled out
when they wanted more before deciding). **User's decision: skip Increment 4
entirely, matching the original design doc's own "niche, lowest value,
defer indefinitely" recommendation** — now elevated from "deferred" to "a
deliberate, informed stop," not a default.

**No code, no tests, no commits for this session's Increment 4 work** — the
correct outcome here was investigation + a clear no, not a forced
implementation. Phase 2x-2 (virtual-table parameter resolution, as
originally scoped) is COMPLETE: Increments 1-3 shipped (v0.1.52-v0.1.54),
Increment 4 permanently out of scope as originally designed.

## STATUS UPDATE 6: VT output-field hover — a real gap found by manual
end-to-end verification, fixed as a Phase 2x-2 FOLLOW-UP (not a new
increment of the original design)

A separate AI reviewed the roadmap and recommended a big "Unified Symbol
Model" (Phase 4a-4f: `resolveSymbolAt`/`getVisibleSymbolsAt`/`getDefinition`/
`getReferences`) as a prerequisite before touching VT output fields. Pushed
back on this directly, citing this roadmap's OWN repeated precedent
(Phase 2b/3a/3d all explicitly deferred generalizing infrastructure until a
real second consumer needed it) — building a whole symbol/reference API now,
with zero features actually requesting rename/go-to-definition/find-
references, would be exactly the premature-abstraction mistake this roadmap
has caught and reversed before. The other model agreed after seeing the
project's own history cited, and refined the incremental plan instead
(exact-match reverse mapping, no suffix-stripping heuristics, structured
result type, fail-open, test the full register-kind/slice matrix) — that
refined plan is what got built.

**The gap**: hovering a field on a virtual-table alias (`Остатки.
КоличествоОстаток`) showed ONLY `Source: <table>`, never the field itself.
Root cause, verified directly in code: `resolveHeadTable`
(`hoverFieldInfo.ts`) only ever called `resolver.tableByFullName(...)`;
`buildResolverFromTables` deliberately keeps virtual tables in a SEPARATE
map (`virtualTableByFullName`). Confirmed this predates Phase 2x-2 entirely
— the identical omission already existed in the OLD `findAliasTable.ts` flat
lookup — so this is a long-standing gap, not a regression from any specific
phase. Left `findAliasTable.ts` untouched (its own doc comment requires it
stay an unmodified shadow-mode baseline) — only fixed the 'complete'-
snapshot path.

**Stage A (the actual bug fix)**: `resolveHeadTable` now falls back to
`virtualTableByFullName` when `tableByFullName` returns nothing. This ALONE
makes hover correct for every VT output field across every register kind —
dimensions/attributes already carry their real name/type unchanged on the
slice's own metadata, and even регистр бухгалтерии's synthesized fields
(`Счет`, `СубконтоN`, etc., built fresh from the chart of accounts, no base-
register equivalent at all) already carry correct type/reference info
directly, since the metadata builders set it that way. Verified this by
reading `accountingVirtualTables.ts`/`yamlLoader.ts` directly before
assuming enrichment was needed everywhere — it wasn't.

**Stage B (enrichment, накопления/бухгалтерии resource fields only)**:
reverse-maps an expanded output name (`КоличествоОстаток`) back to the real
base resource (`Количество`) + suffix (`Остаток`), via EXACT candidate
reconstruction (try each known suffix, verify `<candidate><suffix> ===
outputName` AND `<candidate>` is a REAL resource field on the base register
— never a blind string-strip) against a NEW shared module,
`virtualTableResourceSuffixes.ts`, which `yamlLoader.ts` and
`accountingVirtualTables.ts` now import their own suffix tables FROM
(refactored out of their previous inline/local copies) — so the reverse
lookup can never independently drift from what the forward builders
actually generate. Накопления and регистр бухгалтерии have DIFFERENT suffix
sets (confirmed by reading both files) — modeled as two separate constants,
not shared.

Tests: 9 new pure unit tests (`virtualTableOutputField.test.ts` — both
register kinds' real suffix sets, a dimension/no-suffix case, a name that
textually resembles a suffix match but has no real base field), 11 new
`describeChain`-level tests in `hoverFieldInfo.test.ts` (накопления/
бухгалтерии/regs сведений families, dimension passthrough with further
dereference, регистр бухгалтерии synthesized field with no base
equivalent), and a new Extension Host integration test. Full suite: 109
files / 1949 unit tests green, 32/32 vscode-test integration tests green,
typecheck (all 3 configs) clean, `docs:check` clean except the pre-existing
unrelated New Builder orphan. Golden corpus/shadow-mode numbers unchanged
(pure metadata-builder refactor + hover-only addition, no parser/generator
behavior change).

**Committed** (`b00462f`) as its own isolated commit — NOT bumped/published
yet, awaiting the usual "бампни й опублікуй".

**What this does NOT do**: no enrichment for регистр бухгалтерии's
synthesized fields (Счет/Субконто*/etc. — correctly have no base-field
equivalent to map to); no enrichment for РегистрСведений slices (no suffix
concept at all, fields pass through unchanged, already correct via Stage A
alone); no completion-side equivalent (this was scoped as hover-only, matching
every prior increment's own precedent).

**Next up**: nothing decided. Remaining Phase 2x work is Phase 2x-3
(`&Параметр` binding as its own resolution domain, scoped down per review to
just query-local parameter symbols — NOT the much bigger BSL
`УстановитьПараметр` binding) — not started, needs its own scoping pass. Or
the user may want to move to something else entirely (Visual Query Builder,
Phase 4+) — ask before starting any of it. The "Unified Symbol Model"
proposal remains explicitly NOT adopted as a precondition for anything —
revisit only if a real second consumer (an actual rename/find-references/
go-to-definition feature request) shows specialized resolvers are starting
to genuinely duplicate effort.
