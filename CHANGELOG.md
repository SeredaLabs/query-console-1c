# Changelog

All notable changes are recorded here. The project uses
[Semantic Versioning](https://semver.org/).

## Unreleased

### Changed

- Query Designer windows now enter VS Code's compact auxiliary-window mode
  immediately after opening when the host supports it. The main VS Code
  window is not affected.
- Canvas Package and UNION member numbers now stay expanded whenever they fit
  the actual navigation-bar width; their `current/total` pagers appear only
  when space is genuinely constrained.

## 0.1.87 - 2026-09-24

### Fixed

- Formatting generated query text as a BSL string now doubles embedded double
  quotes, so query string literals remain valid and round-trip back to the same
  query text.
- Canvas preview JOIN paths now route around other table cards, separate
  parallel connections and distribute several connections across distinct
  table-side ports. JOIN labels and the minimap use the same routed geometry.

## 0.1.86 - 2026-09-23

### Fixed

- Hover and completion inside a query with a broken select list (for example
  a missing comma, or an empty list) now resolve the alias at the cursor's
  own position: with the same alias used in two `ОБЪЕДИНИТЬ` branches, the
  second branch no longer shows the first branch's table.
- The Canvas preview's Save now applies the same check as the Classic
  designer's OK: a query Classic refuses (for example two fields with the same
  alias, or a missing field) is no longer written back, and the reason is
  shown next to Save.
- "Field not found" is now also reported for standard `СОЕДИНЕНИЕ … ПО`
  conditions and for standard `ГДЕ`/`ИМЕЮЩИЕ` conditions of the top-level
  query. A tabular section accessed through a dot (`Т.Товары.Номенклатура`)
  is checked against the tabular section's own fields.
- The "field not found" message is now translated in the English and
  Ukrainian UI instead of showing a generic "unsupported diagnostic" text.

### Changed

- Canvas preview: a loading screen is shown until the query under the cursor
  is opened, and metadata group names match the Classic designer.

## 0.1.85 - 2026-09-22

### Fixed

- A nonexistent field referenced inside `ГРУППИРУЮЩИМ НАБОРАМ` (multiple
  grouping sets) is now caught as "field not found", and a malformed
  expression there now blocks Apply the same way it already did for a plain
  `GROUP BY` list.
- A field referenced in both the SELECT list and an auto-derived GROUP BY no
  longer produces two identical "field not found" diagnostics for the same
  problem.

## 0.1.84 - 2026-09-22

### Fixed

- A nonexistent field referenced in GROUP BY, ORDER BY, TOTALS BY, or INDEX BY
  is now caught as "field not found", instead of silently passing validation.
  This also covers an aggregate over a qualified field (e.g. `СУММА(Т.NoSuchField)`)
  that was previously missed even in the regular SELECT-list check.

### Verified

- Confirmed (via a full read-only audit with real reproduction scripts) that
  Hover and Completion already resolve a reused table alias correctly per
  scope — separate `;`-statements, UNION branches, and nested/correlated
  subqueries never cross-contaminate. Added permanent regression tests
  pinning this for reused aliases across batch statements and UNION
  branches; no behavior changed.

## 0.1.83 - 2026-09-22

### Fixed

- A nonexistent field referenced right after an expanded star selection
  (`SELECT T.*, T.NoSuchField FROM ...`) is now caught as "field not found",
  instead of silently passing validation.
- Report Builder condition blocks (`{WHERE}`/`{SELECT}`/`{ORDER BY}`/
  `{TOTALS}`) are now covered by the same structural-expression check as
  regular query conditions — a malformed condition inside one of these blocks
  can no longer be saved without being caught.

## 0.1.82 - 2026-09-22

### Fixed

- A metadata snapshot committed before deletion-detection existed (0.1.81 and
  earlier) is no longer silently trusted as fully up to date — the next open
  forces a one-time rebuild that brings it fully up to date, instead of
  staying blind to deleted metadata objects indefinitely.
- A structurally malformed metadata snapshot (missing or invalid model data)
  is no longer returned as a successful cache hit — it's now treated as
  corrupt, the same as any other broken snapshot, and triggers a safe
  rebuild.

## 0.1.81 - 2026-09-22

### Fixed

- New Builder (Canvas): Save no longer bypasses the capability/preservation
  gate Classic already had — a virtual table with uncovered positions 3+, or
  a structurally broken custom expression, is now blocked from being saved
  instead of silently losing data on a Canvas round-trip.
- New Builder (Canvas): a query that fails to parse when opened is now shown
  as a full-panel error with a Close action, instead of silently presenting
  as an empty, editable canvas that could overwrite the original query text
  on Save.
- The Apply-gate's structural-expression check now also covers trailing
  fields after an expanded star selection, GROUP BY/ORDER BY/index fields,
  ИТОГИ aggregate expressions, and expressions inside tabular-section
  projections — a malformed custom expression in any of these could
  previously be saved without being caught.
- Two sources sharing the same alias (explicit `КАК А` twice, or two bare
  references to the same table) are now rejected when opening a query,
  instead of silently misattributing fields to the wrong source.
- Deleting a metadata XML object no longer leaves it lingering in an
  already-cached metadata snapshot — deletions are now detected the same way
  additions/changes already were.
- A metadata snapshot from an incompatible or corrupted format version is no
  longer silently trusted as a valid cache.
- The last-known-good metadata cache is now written atomically, so an
  interrupted write can no longer corrupt the one fallback used when every
  other metadata load path has failed.

### Security

- Updated `@xmldom/xmldom` to 0.9.12, resolving a high-severity advisory in
  the bundled version.

### Changed

- The packaged extension (`.vscodeignore`) now uses an allowlist for `out/`
  instead of a denylist, so a stray build artifact can no longer be
  accidentally included in the VSIX (a stale nested copy of the extension
  had been shipping this way).

## 0.1.80 - 2026-09-21

### Fixed

- The tolerant-parser repair pass could throw an uncaught lexer error on
  common mid-typing states (e.g. an unterminated string) — Hover now
  degrades gracefully instead of crashing.

## 0.1.79 - 2026-09-21

### Changed

- New Builder: PackageNav round 3 — unified the delete control into a single
  control next to "+", replacing the previous separate/inconsistent controls.

## 0.1.78 - 2026-09-21

### Added

- New Builder (Canvas): wired the canvas up to the real editor load and save
  flow — opening from text and saving now go through the same
  `tryOpenBatch`/`insertResult` path Classic uses.

## 0.1.77 - 2026-09-21

### Changed

- New Builder: PackageNav round 2 — status dots, single-line query identity,
  and a more compact UNION delete control.

## 0.1.76 - 2026-09-21

### Changed

- New Builder: polished PackageNav's segmented navigation styling.

## 0.1.75 - 2026-09-21

### Added

- New Builder: PackageNav quick actions and a responsive layout redesign.

## 0.1.74 - 2026-09-20

### Added

- New Builder: Phase 12A/12B — temp-table producer/consumer UI foundation and
  package temp-table continuity in PackageNav.

### Fixed

- Established the UNION + temp-table compound-carrier invariant and finalized
  temp-table lifecycle semantics in the query model, closing a class of edge
  cases around which UNION member actually carries `ПОМЕСТИТЬ`/`ДОБАВИТЬ`.
- Source Browser: shortened the popover footer and made it close on Escape.

## 0.1.73 - 2026-09-20

### Changed

- New Builder: package query chips now support hover-reveal delete, empty
  states in Fields/Conditions/Grouping/Sorting are vertically centered like
  the Structure canvas, and "+"/delete actions across PackageNav are now
  color-differentiated (accent/danger) instead of uniform gray.
- New Builder: added a UNION field-mapping dialog (rename the shared column
  alias, reorder columns) ported from Classic's Union/Aliases tab — same
  positional-correspondence model, no new query semantics.
- Added a divider and heavier weight around the active query name in
  PackageNav so it reads as a title rather than blending into the
  surrounding navigation.

## 0.1.72 - 2026-09-20

### Changed

- New Builder: polished the Package/UNION navigation strip — the union
  members now use a distinct rounded-chip visual language instead of
  looking identical to the package's `[n]` navigation, per-member delete
  is hidden until hover instead of a permanent `✕`, the UNION/UNION ALL
  operator got a chevron and an explanatory tooltip, and the active query
  name got a divider and heavier weight to separate it from the
  surrounding navigation. No change to generated SDBL or query semantics.

## 0.1.71 - 2026-09-18

### Added

- New Builder: joins on the canvas now show a kind-colored curved line and a
  consolidated join manager popover (search + one popover for both listing
  and creating joins) instead of two separate buttons.
- New Builder Inspector: join conditions can now set a comparison operator
  (`=`, `<>`, `>`, ...), not just an implicit `=`, matching the Classic
  Constructor.
- Both Classic and New Builder now block selecting join fields with
  incompatible types (e.g. a string field joined to a reference field) in
  the field pickers, instead of allowing a condition that would only fail
  when the query actually runs in 1C.

## 0.1.70 - 2026-09-17

### Added

- Added the experimental Canvas-based New Builder. It remains disabled by
  default; enable `queryConsole.enableNewBuilderPreview` to show its command
  in Command Palette. The stable Classic Constructor remains unchanged.

### Changed

- Localized the native New Builder panel title and its Output Channel entry
  for English, Ukrainian, and Russian VS Code display languages.

## 0.1.69 - 2026-09-17

### Changed

- Restructured the batch-tab hover card: an entity icon and a short type
  badge ("ВТ"/"ВТ+"/"ВТ−") replace the old dot-plus-sentence type row, and
  the fields/sources/conditions rows now carry small icons instead of
  plain text labels, for faster scanning.

## 0.1.68 - 2026-09-17

### Changed

- The batch-tab hover card now lists the selected field names (e.g. "Код,
  Наименование, Ссылка") instead of just a field count, truncated to the
  first 4 with a "+N" suffix when there are more.

## 0.1.67 - 2026-09-17

### Fixed

- The new batch-tab hover card (0.1.66) was rendered in the DOM for every
  side tab at once, unpositioned until hover — with several batch queries
  this piled up as overlapping cards in an arbitrary spot on screen. The
  card now mounts only for the hovered/focused tab, and its position is
  clamped to the window bounds (flipping to the other side of the tab when
  there isn't room) so it always renders fully visible.

## 0.1.66 - 2026-09-17

### Changed

- The batch query designer's side tab strip no longer rotates long temp-table
  names sideways (`writingMode: vertical-rl`). Each batch query is now a
  compact numbered tab with a type dot; hovering shows the full name, query
  type, and field/table/condition counts.

## 0.1.65 - 2026-09-14

### Internal

- The semantic resolver's corpus-wide shadow-mode sweep is now a reviewed
  regression gate. It compares every meaningful resolver disagreement with a
  committed baseline instead of merely printing aggregate counts.
- Added `npm run corpus:shadow-baseline` for explicit, atomically written
  baseline regeneration after semantic review; it never updates the artifact
  during an ordinary test run.
- Documented the synchronous stack discipline required by the parser's active
  metadata resolver and aligned the documented regression-gate order with CI.

## 0.1.64 - 2026-09-14

### Internal

- `docs:check` now also catches a documented command with no matching
  manifest entry (previously only checked the reverse direction).
- `assertValidSdbl`'s test-suite-wide silent skip (when the independent SDBL
  grammar oracle isn't vendored) now warns once instead of staying silent.
- Strengthened the shorthand-temp-table-subquery regression test to also
  check generated text and semantic validation, and added a second test
  reproducing the real production trigger (a batch's own `ПОМЕСТИТЬ`
  registering the temp table) instead of only a resolver mock.
- Corrected a stale doc comment in `loadMetadataSafe.ts` describing an
  already-widened code path's old, narrower scope.

## 0.1.63 - 2026-09-14

### Fixed

- `docs:check` broke on a clean checkout of `main` since the previous
  release: the roadmap page linked to an in-progress design doc that was
  never actually committed. De-linked it until it ships.

### Internal

- Added a regression test locking in that the tolerant hover/completion
  snapshot builder (which recovers from broken query text by rewriting it)
  can never leak its rewritten text or the resolver it used back into a
  later, separate strict parse — the same class of module-level parser
  state leak the previous release's fix addressed.

## 0.1.62 - 2026-09-14

### Docs

- Fixed a metadata-cache doc contradiction: `limitations.md` (all three
  locales) wrongly said the cache is not automatically compared against the
  XML export; it is, matching `metadata.md`.
- `hover-and-completion.md` (all three locales) no longer promises a field's
  type in hover — only autocomplete shows it today.
- Reworded ADR 0004's round-trip contract to match what
  `corpusRegression.test.ts` actually asserts: output is compared against the
  oracle's canonical `query_text`, not literal input-text equality.
- `architecture.md` now lists the `src/core/semantic` module.
- Excluded `docs/design/**` from the packaged VSIX and linked it from the
  roadmap so it's no longer an orphaned, unreachable doc page.

## 0.1.61 - 2026-09-14

### Fixed

- A membership condition using the shorthand form
  `<Поле> В (ВЫБРАТЬ <ВТ>.<Поле>)` — an inline subquery against a temp table
  with no explicit `ИЗ` — silently dropped the temp-table source and turned
  the field into an opaque raw expression instead of synthesizing the
  implicit `ИЗ <ВТ>`, because the nested parse of that subquery lost access
  to the metadata resolver it needed to recognize the temp table. Apply had
  nothing to flag it on, since the resulting (wrong) model was internally
  consistent — this could silently corrupt an affected query. Fixed by
  threading the resolver through, matching how an equivalent subquery
  already worked in a `ИЗ (ВЫБРАТЬ …)` source position.

## 0.1.60 - 2026-09-14

### Internal

- Added a regression test locking in that hovering a field on a temp-table
  (`ПОМЕСТИТЬ`) source alias stays unresolved (no metadata is guessed for it).
  No functional change.

## 0.1.59 - 2026-09-14

### Fixed

- Hovering right after a `&Параметр` reference (the cursor position
  immediately following the token, e.g. on the following space or operator)
  no longer incorrectly showed it as a query parameter.

## 0.1.58 - 2026-09-14

### Fixed

- v0.1.57's package accidentally included a stray, unreferenced development
  build artifact (an in-progress webview bundle, unreachable from any
  registered command) left over from a local build. No functional change;
  removed and excluded from future packaging.

## 0.1.57 - 2026-09-14

### Added

- Hovering over any `&Параметр` reference in a query now shows it as a query
  parameter, even outside a virtual-table argument position. Typing `&` also
  suggests parameter names already used elsewhere in the same query.

## 0.1.56 - 2026-09-14

### Fixed

- Hovering over a field on a virtual-table source (e.g.
  `Остатки.КоличествоОстаток`) now shows the field itself — its type, and for
  накопления/бухгалтерии resource fields, which base register resource it
  came from (`Количество`) — instead of only the source table name.

## 0.1.55 - 2026-09-13

### Fixed

- Hovering over (or autocompleting after) a `&Параметр` reference whose name
  happened to match a real table alias or register field — including inside
  a virtual-table `Условие` argument — could show confidently wrong
  information for the unrelated alias/field instead of nothing. Query
  parameters are no longer mistaken for identifier references.

## 0.1.54 - 2026-09-13

### Added

- Autocomplete now suggests the valid keyword values (`Год`, `Месяц`,
  `Регистратор`, `Движения`, etc.) when the cursor is on a virtual-table
  call's `Периодичность` or `МетодДополнения` argument (e.g. `Обороты(&Нач,
  &Кон, |, Условие)`), for both РегистрНакопления and РегистрБухгалтерии forms.

## 0.1.53 - 2026-09-13

### Added

- Hovering over a bare field name inside a virtual-table `Условие`/
  `УсловиеСчета`/etc. argument (e.g. `Товар` in `Остатки(&Дата, Товар =
  &Товар)`) now resolves it against the register's own real fields
  (dimensions/resources/attributes, including through reference
  dereferencing like `Товар.Наименование`), the same way `Alias.Field` hover
  already works for regular table sources.

## 0.1.52 - 2026-09-13

### Added

- Hovering over a virtual-table call's argument (e.g. `Остатки(&Дата, Условие)`)
  now shows which parameter it is (`Период`, `Условие`, `УсловиеСчета`,
  `Субконто`, etc.) for every catalogued register kind and slice —
  РегистрСведений, РегистрНакопления, РегистрБухгалтерии, and РегистрРасчета.

## 0.1.51 - 2026-09-13

### Fixed

- Queries using `РегистрРасчета.*.ФактическийПериодДействия`,
  `РегистрРасчета.*.ДанныеГрафика`, or a `<register>.База<...>` virtual
  table now correctly preserve their actual parameters on Apply — these
  forms were previously handled by a generic fallback that didn't match
  their real parameter layout. `Последовательность.*.Границы` is unaffected
  and remains a documented round-trip exclusion for 3+ arguments.

## 0.1.50 - 2026-09-13

### Fixed

- Hover and autocomplete could show information for the wrong table when a
  bare field name inside `УПОРЯДОЧИТЬ` (ORDER BY) or `ИТОГИ` (TOTALS)
  happened to match both a `SELECT`-list output alias and an unrelated table
  alias elsewhere in the same query. They now correctly recognize it as the
  output column and show nothing rather than a confidently wrong answer.

## 0.1.49 - 2026-09-11

### Added

- Field-completion suggestions now show a richer info card (synonym, type,
  reference target, its role — attribute/standard/dimension/resource — and,
  for a resolvable reference, its own attribute count and a short field-name
  preview) when you expand a suggestion's details, instead of only the short
  type hint already shown next to it.

### Internal

- Metadata fields now carry their human-readable synonym (`<Synonym>`) from
  the source XML, when the configuration provides one; standard fields
  (`Ссылка`, `Код`, ...) still have none, since they're synthesized by the
  parser rather than read from XML.

## 0.1.48 - 2026-09-11

### Fixed

- Field-completion type hints for a numeric field silently dropped its
  digits/fraction-digits qualifiers (`Число(10,2)` showed as bare `Число`),
  and the standard `ВерсияДанных` attribute (present on every 1C object)
  showed no type at all. Numeric qualifiers are now preserved end-to-end and
  shown alongside the string-length qualifier already displayed (e.g.
  `Строка(150)`, `Число(10,2)`); `ВерсияДанных` — an internal binary version
  marker, not one of the four SDBL primitive types — now shows a fallback
  instead of nothing, rather than guessing an unverified specific type for it.

## 0.1.47 - 2026-09-11

### Fixed

- Field-completion type hints (`detail`) went silently blank for any field
  whose value type was a reference to a chart of characteristic types, chart
  of accounts, chart of calculation types, exchange plan, business process,
  or task (e.g. the near-universal `ДополнительныеРеквизитыИСведения`
  catalog attribute) — the metadata parser only recognized
  `Справочник`/`Документ`/`Перечисление` references, silently dropping
  everything else instead of showing a fallback. Added support for the
  remaining referenceable metadata kinds, and any still-unrecognized type now
  falls back to its raw type name instead of vanishing.

## 0.1.46 - 2026-09-11

### Fixed

- Generated queries with a right-nested `JOIN` (a `СОЕДИНЕНИЕ` whose own
  condition references another nested `СОЕДИНЕНИЕ`) no longer misqualify a
  bare field in the inner join's condition with an outer-chain table alias
  that isn't actually visible there — matches real 1C's own join-scoping
  behavior. Other clauses (`ГДЕ`, `ИМЕЮЩИЕ`, grouping/ordering/totals) are
  unaffected.

## 0.1.45 - 2026-09-11

### Changed

- Autocomplete now resolves the source alias using the query's real
  JOIN/subquery scope at the cursor, the same fix hover got in 0.1.44 — a
  right-nested `JOIN`'s own condition, for example, no longer suggests
  fields from a table that isn't actually visible there.

## 0.1.44 - 2026-09-11

### Changed

- Hover over a field now resolves the source alias using the query's real
  JOIN/subquery scope at the cursor (live-verified against real 1C), instead
  of matching the alias name anywhere in the whole query batch. A right-nested
  `JOIN`'s own condition, for example, no longer shows information from a
  table that isn't actually visible there. Autocomplete still uses the old,
  scope-blind lookup for now.

## 0.1.43 - 2026-09-11

### Internal

- Extended the semantic-analysis groundwork with JOIN/correlation visibility
  algorithms (`computeJoinVisibility`, nearest-ancestor subquery correlation),
  temp-table visibility, source/alias symbols, and `resolveAliasAt(position)` —
  the first position-aware alias resolver, live-verified against 5 real-1C
  JOIN/correlation visibility rules. Added a shadow-mode comparison harness
  that classifies every disagreement between the new resolver and the existing
  flat lookup (not just a raw rate), run across the full 1976-query golden
  corpus as a diagnostic report. Not yet wired into hover/completion — nothing
  user-facing yet.

## 0.1.42 - 2026-09-10

### Internal

- Closed a gap in the semantic-analysis groundwork's source mapping: a
  subquery source (`ИЗ (ВЫБРАТЬ ...) КАК Т`) now recursively records its own
  internal ranges, translated into the outer query's coordinates — previously
  only the subquery's outer span was recorded, with nothing for what's inside
  the parentheses. Nesting (including subqueries inside subqueries) is
  recovered via range containment, not a schema change. No parser/generator
  behavior changes — proven byte-for-byte identical across the full
  1976-query golden corpus. Nothing user-facing yet.

## 0.1.41 - 2026-09-10

### Internal

- Extended the semantic-analysis groundwork from 0.1.40 with batch-aware source
  mapping: `parseBatch` can now report absolute, statement-tagged source ranges
  for its whole (potentially multi-statement) output, not just a single
  statement, and the tolerant snapshot builder (`buildSemanticSnapshotFromText`)
  now actually wires this into `SemanticSnapshot` for cleanly-parsed queries.
  Ranges are deliberately withheld for a repaired/unavailable parse, since a
  repair heuristic can shift character offsets away from the real document. No
  parser/generator behavior changes — proven byte-for-byte identical across the
  full 1976-query golden corpus with and without the new instrumentation
  attached. Nothing user-facing yet.

## 0.1.40 - 2026-09-10

### Internal

- Laid the groundwork for a future semantic-analysis layer (`src/core/semantic`):
  a snapshot lifecycle with staleness and completeness tracking (`'complete'` /
  `'recovered'` / `'unavailable'`), a write-only source-location side-channel in
  the parser (`src/core/query/sourceMap.ts`) that maps query-model nodes back to
  their raw-text ranges, and a tolerant snapshot builder that recovers from an
  unparseable query instead of failing outright. Reuses the existing SELECT-list
  repair heuristic hover already relies on (moved to
  `src/core/query/selectListRepair.ts`, previously private to
  `hoverFieldInfo.ts`) rather than duplicating it. No parser/generator behavior
  changes — proven byte-for-byte identical across the full 1976-query golden
  corpus with and without the new instrumentation attached. Nothing user-facing
  yet; this is infrastructure for upcoming alias/scope-resolution work.

## 0.1.39 - 2026-09-09

### Fixed

- Local semantic validation (table-existence check) reported a false
  "table not found" for the `.Изменения` subtable (exchange-plan change
  registration), which every participating catalog/register can carry
  regardless of its kind, but which the metadata loader never materializes
  for any of them — the same class of gap already handled for
  `РегистрРасчета`/`БизнесПроцесс`/`Задача`. Reproduced at exactly the
  historically-reported 4/1976 (0.2%) rate on the golden corpus before the
  fix, 0 after.

## 0.1.38 - 2026-09-09

### Internal

- `build:webview` and `pretest:e2e` no longer shell out to the Unix `cp`
  command, which doesn't exist on a stock Windows shell — a small
  cross-platform `scripts/copy-files.mjs` replaces it, so `npm run build`
  and `npm run test:e2e` no longer require WSL/Git Bash on Windows.

## 0.1.37 - 2026-09-09

### Internal

- `README.md`/`README.uk.md`/`README.ru.md` now carry the same translation
  front matter as `docs/{locale}` and are checked by `scripts/validate-docs.mjs`
  for matching `source_version` and heading structure — a gap found during a
  repository-structure review: the localized docs already had this drift
  protection, the root READMEs didn't.

## 0.1.36 - 2026-09-09

### Internal

- Fixed `scripts/validate-docs.mjs`'s orphan-page check: it built the
  reachability graph from a separate pass that only followed plain inline
  Markdown links, so a page reachable only via a reference-style or HTML
  link was wrongly reported as orphaned. Existence/anchor checking and
  graph construction now resolve every link exactly once.
- CI's Chromium install now retries a few times before failing the build —
  the previous release's run hit a real, external `dl.google.com` apt-index
  inconsistency unrelated to any code change here.

## 0.1.35 - 2026-09-09

### Internal

- Removed the `docs/history` and `docs/tasks` archives (~104 files of
  superseded implementation plans, specs, and a closed audit) after a
  forensic review extracted everything still accurate: four architecture
  decision records, the SDBL section-emission order, the comment-preservation
  design, the corpus classification gate, and a couple of small documentation
  gaps. None of this ships in the packaged extension either way, but it no
  longer clutters the default branch. Recoverable at the `pre-docs-history-cleanup`
  git tag if needed.
- `scripts/validate-docs.mjs` now also checks in-page anchors (via a real
  GitHub-compatible slugger), case-sensitive paths, HTML links/images,
  reference-style Markdown links, orphaned documentation pages, and stale
  references to the removed archives above.

## 0.1.34 - 2026-09-09

### Added

- A query-text literal in a `.bsl` file that Query Designer cannot parse now
  gets a warning right on the `ВЫБРАТЬ`/`УНИЧТОЖИТЬ` keyword, instead of only
  failing silently once the query is actually opened. New setting
  `queryConsole.queryDiagnosticsEnabled` (on by default) turns it off if it
  produces false positives — most commonly a query assembled by concatenating
  strings, where an individual fragment is not meant to parse on its own.

## 0.1.33 - 2026-09-08

### Fixed

- Hover and autocomplete went silent for the *whole* query the moment any
  part of it had a syntax issue — most commonly while actively typing (a new
  field added on its own line before its preceding comma), since resolving
  even a single alias required the entire query to parse successfully. They
  now recover by temporarily treating the field list as a placeholder for
  that one lookup, since only the `ИЗ` clause is actually needed to answer
  "what does this alias refer to".

## 0.1.32 - 2026-09-08

### Fixed

- A metadata rebuild that came back with zero tables (e.g. a temporarily
  empty or misconfigured export path) was still committed as the new
  current snapshot, even though 0.1.31 already stopped it from overwriting
  the last known good copy — so the next open would warm-cache that same
  empty result indefinitely instead of ever retrying. It's no longer
  committed at all in that case.
- If applying the generated query text to the document threw (rather than
  just returning `false`), it wasn't caught — 0.1.31 only handled the
  `false` case. Both now fall back to the clipboard the same way.
- If a metadata generation commit failed AND its own rollback also failed,
  the leftover copy of the previous generation could still be swept away by
  a later cleanup pass. It's now left alone until a real target exists again.

## 0.1.31 - 2026-09-08

### Fixed

- The extension only activated when one of its 3 commands was run first —
  opening a `.bsl` file and just hovering or typing (without ever using the
  command palette) got no hover or autocomplete at all. It now activates on
  its own.
- "Refresh Cache" in an already-open Query Designer only showed a toast — the
  DB tree, field validation, and hover/autocomplete kept using the model
  from before the refresh until the window was reloaded. It now updates
  immediately.
- If applying the generated query text to the document failed for reasons
  outside the already-handled "source file changed" case, the text was
  silently lost — not inserted, not copied to clipboard, no message. It now
  falls back to the clipboard with a clear message either way. Also fixed a
  related case where that same clipboard fallback dropped the `"…"` string
  wrapping around the query text.
- A metadata rebuild that failed partway through could leave the previous,
  working metadata generation missing on disk instead of restored.
- A metadata export path that isn't a real 1C configuration (e.g. temporarily
  empty or misconfigured) could silently overwrite the last known good
  metadata with an empty one, affecting every subsequent open until a real
  rebuild succeeded.

## 0.1.30 - 2026-09-08

### Added

- Typing `.` after a table alias inside a query-text literal in a `.bsl` file
  now triggers field-name autocomplete — including through reference fields
  (`Alias.RefField.` offers the referenced catalog/document's own fields).

## 0.1.29 - 2026-09-08

### Added

- Hovering over a field path (`Alias.Field.Field...`) inside a query-text
  literal in a `.bsl` file now shows what the alias resolves to, what a
  reference field points to, or that a field genuinely doesn't exist —
  directly in the editor, without opening the query designer.
- The query text editor now reports a field that genuinely does not exist on
  its source table or catalog (`Поле "..." не найдено в "..."`), catching a
  class of mistakes that previously only surfaced once the query actually ran
  in 1C.

### Changed

- Replaced Ctrl/Cmd+Click on a query-text literal with a hover tooltip: hover
  over the query text and click the "Open in Query Designer" link right in
  the tooltip. No more underline on the query text.

## 0.1.28 - 2026-09-07

### Added

- Ctrl/Cmd+Click on a query-text literal in a `.bsl` file now opens the query
  constructor directly at that location, without going through the command
  palette or context menu.

### Changed

- Removed pure-redirect legacy documentation pages that only pointed
  elsewhere, and repointed everything that referenced them at the real
  current location instead.

### Internal

- Consolidated three independent, hand-duplicated implementations of
  field-path resolution (used for field-name casing correction, the report
  builder's `.*` suffix decision, and redundant `СГРУППИРОВАТЬ ПО`
  dereference removal) into one shared module. No change in generated query
  output — verified against the full 1976-query regression corpus before and
  after.

## 0.1.27 - 2026-09-05

### Changed

- Visually consolidated the custom-expression ("Довільний вираз") dialog with
  the rest of the query constructor: shared panel/section-header styling,
  icon-and-hover field rows, and a code-editor surface matching the query text
  dialog.
- Increased and unified vertical row spacing across every field/table list in
  the constructor (previously an inconsistent 1-3px depending on tab), for
  better readability.
- Restyled the localized user-guide pages (English, Ukrainian, Russian) with
  the same visual language as the README, fixed a stale command reference in
  the Ukrainian and Russian troubleshooting pages, and moved the
  translation-tracking metadata into a hidden comment so it no longer renders
  as a visible table on GitHub.

## 0.1.26 - 2026-09-05

### Changed

- Redesigned the localized README headers with a responsive project banner,
  compact Marketplace badges, and clearer language navigation.
- Replaced the static constructor screenshot with an optimized animated demo
  based on SFK metadata.

## 0.1.25 - 2026-09-05

### Added

- Canonical English user and developer documentation with synchronized Ukrainian
  and Russian user guides.
- English, Ukrainian, and Russian localization for the extension manifest,
  extension-host messages, and WebView interface.
- Documentation structure, glossary, translation metadata, and automated link,
  parity, and freshness checks.

### Changed

- Consolidated superseded technical documents under `docs/history/pre-consolidation/`.
- Centralized the current product screenshot under `docs/images/`.
- Refreshed the Marketplace README pages with a structured, localized layout.
- Updated third-party attribution and removed the superseded Claude PR-01 workflow.

Earlier release notes were not reconstructed without authoritative historical
records. Git tags and GitHub Releases remain the source for earlier releases.
