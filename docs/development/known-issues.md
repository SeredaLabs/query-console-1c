# Known issues

Current product boundaries, updated 2026-09-28. Engineering status and evidence live
in the [technical-debt ledger](technical-debt.md); historical verdicts remain in
[Stage 0](audits/stage-0.md).

## Active product limitations

- English SDBL is rejected even though the recorded live platform accepts it
  and canonicalizes it to Russian. Editor query detection recognizes only
  `ВЫБРАТЬ`/`УНИЧТОЖИТЬ` (ledger C2).
- Completion inside valid condition subqueries does not resolve their inner
  aliases (C21/S1). Unclosed SELECT parentheses can hide all sources;
  malformed ORDER/GROUP sections can disable assistance for the whole package
  (C06/C13/C18/C19, S2). Parameter suggestions after a bare `&` can fail
  because their lexer scan rejects the unfinished name. Source-subquery and ordinary batch alias scoping already
  use the position-aware resolver; the old flat resolver is tooling-only.
- A temporary-table producer with a tabular-section projection/trailing fields
  yields different column sets in star expansion, designer and semantic schema
  (A2). The platform-correct schema for this shape still needs confirmation.
- Apply checks supported syntax/structure, selected metadata semantics and
  recorded unsafe markers; it does not establish semantic equivalence to the
  source query (V3). Some platform-invalid inputs are silently normalized,
  including extra turnover arguments and INDEX BY without INTO (C5).
- The Query Text parameter list and result-processing boilerplate use a raw
  regex and can include `&name` from a string/comment or duplicate case variants;
  editor parameter hover/completion use lexer tokens instead (C7).

- Cursor detection cannot evaluate dynamically composed BSL query strings.
- Validation is intentionally incomplete for arbitrary custom expressions and
  platform-specific SDBL. Partially mitigated: `findMalformedCustomExpressions`
  (`semanticValidator.ts`) blocks Apply when a stored custom/raw expression
  fails a structural acceptor for the SDBL expression/condition grammar
  (`expressionSyntaxCheck.ts`) -- unbalanced parentheses/braces, double or
  dangling operators, an unclosed `ВЫБОР…КОНЕЦ`, a malformed `ВЫРАЗИТЬ(… КАК …)`
  cast, and similar. This is a syntax-SHAPE check, not full grammar coverage --
  it deliberately does not validate exact argument counts for specific
  built-in functions (semantics, not syntax) and treats any text containing
  1C's own template-substitution marker characters (`%`, `#`, `@`, `[`, `]`)
  as unjudgeable rather than invalid (found on real production code: query
  templates built via string substitution use these). Verified against the
  committed 1976-query golden corpus and two independent real production 1C
  configurations before shipping -- zero false positives on complete queries;
  the only hits on real code were already-incomplete fragments from runtime
  string concatenation (not something the constructor itself ever produces,
  since it always edits one complete query string).
- `Последовательность.*.Границы` still falls back to a generic, unverified
  `[period, condition]` layout -- a third positional argument cannot be
  losslessly reconstructed; marked models are blocked from apply.
  `РегистрРасчета.*.ДанныеГрафика`/`ФактическийПериодДействия` (arity 1:
  `Условие`) and `<ОсновнойРегистр>.База<БазовыйРегистр>` (arity 4) are no
  longer part of this gap -- their real layout was confirmed (Хрусталёва,
  «Язык запросов "1С:Предприятия 8"», 2nd ed., pp. 327-334) and modeled
  directly in `parseVirtualParams`/the generator; an argument beyond their
  own confirmed arity is still correctly blocked, just at the right
  threshold now.
- Auto-discovery is bounded and may require an explicit metadata path.
- Query-parse diagnostics (`queryConsole.queryDiagnosticsEnabled`) scan one
  string literal at a time and can flag a query assembled by string
  concatenation, where an individual fragment is not meant to parse on its
  own -- there is no full BSL AST to distinguish that from a genuinely broken
  query. Mitigated by `Warning` severity, non-committal wording, and the
  setting to disable it entirely; not something a corpus/production sweep can
  fully rule out the way `findMalformedCustomExpressions` above was, since it
  depends on how a given codebase happens to build query text at runtime.
- Field existence (`checkFieldPaths` in `semanticValidator.ts`) is checked
  only when a query is opened in, or applied from, a designer (Classic OK and
  Canvas Save share `src/webview/applyGate.ts`), and only for qualified
  references in the select list, grouping, ordering, indexing, standard join
  conditions (any level) and standard `ГДЕ`/`ИМЕЮЩИЕ` conditions of the
  top-level query. Not checked: custom expressions, `ИТОГИ` aggregates,
  virtual-table parameters, unknown/ad-hoc temporary tables, package temporary
  tables whose producer still contains an unresolved `*`, and conditions
  inside subqueries -- see the next item. Package temporary tables with a
  complete inferred output schema are position-aware in field validation,
  hover, and completion (including drop/recreate lifetimes). Their inferred
  columns intentionally carry no reference types, so deeper dot navigation
  remains fail-open. Editor diagnostics run the parser plus the structural
  expression check that gates Apply (`findMalformedCustomExpressions`); they
  do not check metadata (unknown fields or tables).
- A bare field in a standard condition of a sole-source subquery is bound by
  the parser to that source even when the source lacks the field and the
  field really belongs to an enclosing query (a valid correlated reference):
  `ГДЕ Цена > 0` inside `(ВЫБРАТЬ … ИЗ Справочник.В КАК В)` is generated as
  `В.Цена`. The select-list counterpart is rebound to the outer owner
  (`qualifyBareFields`, oracle-verified); for conditions the real
  constructor's output has not been verified, so the binding is left as is and
  the validator skips conditions inside subqueries instead of reporting a
  false "field not found".

These are documented user boundaries, not permission to weaken tests. Add a
regression test when fixing one and update all three limitations pages.

## Active verification limitation

- The independent tree-sitter SDBL grammar oracle is not a standard CI gate.
  `assertValidSdbl.ts` uses it only when
  `test/fixtures/tree-sitter-sdbl.wasm` exists; that fixture is not committed
  and `.github/workflows/release.yml` does not build it. Ordinary local/CI
  runs emit a skip warning and rely on the repository parser, structural
  checks, and committed corpus. `tooling/scripts/build-wasm.sh` is the current
  opt-in local path, not evidence that the oracle ran in CI.

## Intentional metadata fallback behavior

- A direct/YAML metadata scan that completes successfully with zero tables
  returns that empty model for the current call. It does not substitute the
  last-known-good model, because a successful but unknown result is not
  classified as an invalid one. The empty model cannot overwrite the saved
  last-known-good snapshot, and the next call rescans normally, so this is not
  the former persistent warm-cache failure. Last-known-good is used only when
  the normal metadata paths actually fail.

## Permanent scope boundary: virtual-table `Субконто`/`Разрезы`/`Измерения*` hover and completion

Hover and completion for virtual-table positional arguments (semantic-core
roadmap Phase 2x-2) cover the `Период`/`Условие`/`УсловиеСчета`-family
condition arguments (hover resolves bare fields against the real register,
including reference dereferencing) and the `Периодичность`/`МетодДополнения`
keyword arguments (completion suggests the closed enum). Two argument
families were investigated and are **deliberately, permanently out of
scope**, not simply deferred:

- **`Субконто`/`СубконтоДт`/`СубконтоКт`/`КорСубконто`** (accounting
  registers): these name specific VALUES of a
  `ПланВидовХарактеристикСсылка.<name>` (e.g.
  `ПланВидовХарактеристик.ВидыСубконто.Контрагенты`). The metadata parser
  (`chartOfCharacteristicTypes.ts`) only reads a ПВХ's own STRUCTURE
  (`Ссылка`/`Наименование`/`Предопределенный`, etc.), never its items — and
  it structurally cannot, since a ПВХ's items are DATA rows in the real 1C
  database, not something a `Configuration.xml` export (the only thing this
  extension ever reads) describes. There is no metadata-only path to
  enumerate real Субконто values.
- **`ИзмеренияОсновногоРегистра`/`ИзмеренияБазовогоРегистра`/`Разрезы`**
  (calculation register `База<Имя>` form): these are field-NAME STRINGS from
  the register's own BASE register (the one named by the `<Имя>` slice
  suffix). `calculationRegister.ts` does not parse the "base registers"
  association from `Configuration.xml` at all (regs расчета virtual tables
  aren't modeled as `MetaTable.virtual` entries beyond their bare slice
  name), and `virtualTableSignatures.ts` only prefix-matches the literal
  `'База'` — it has no way to know WHICH register a given `<Имя>` suffix
  names. Supporting this would need a new, disproportionately large
  metadata-extraction feature (register→base-register linkage) as a
  prerequisite, for a comparatively low-value completion feature.

If this extension ever gains real database access (a much bigger,
separate architectural change), or a future contributor adds explicit
calc-register base-register parsing for an unrelated reason, revisit this
boundary — but do not attempt a partial/best-guess implementation of
either in the meantime.

Internal task details formerly duplicated here are maintained only in the
[ledger](technical-debt.md). Historical resolved alias-scoping work remains
covered by the semantic resolver and shadow-baseline tests.
