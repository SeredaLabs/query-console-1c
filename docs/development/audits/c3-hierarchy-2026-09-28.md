# C3 — preserve ORDER hierarchy without source metadata

## Live observation

On 2026-09-28 the user supplied access to the 1C web client at
`https://sldev.ukr-china.eu/SL_kza/` and opened its query wizard. The displayed
configuration was `[КОПИЯ] WMS Meest China KZA / БСП 3.1.3`; the web client used
English UI labels and produced Russian query text. The exact platform build and
live metadata export were not captured, so this is a case-specific observation,
not a universal platform/version attestation.

Input entered into the query console:

```sdbl
ВЫБРАТЬ Г.Наименование КАК Наименование ИЗ Справочник.ИдентификаторыОбъектовМетаданных КАК Г УПОРЯДОЧИТЬ ПО Г.Наименование ИЕРАРХИЯ
```

The wizard's **Query** editor displayed the following text; accepting the
wizard returned the same text to the query console:

```sdbl
ВЫБРАТЬ
	Г.Наименование КАК Наименование
ИЗ
	Справочник.ИдентификаторыОбъектовМетаданных КАК Г

УПОРЯДОЧИТЬ ПО
	Г.Наименование ИЕРАРХИЯ
```

The query was not executed. This confirms the earlier RP20 result: dropping the
modifier solely because the extension lacks metadata loses text retained by the
platform. A second catalog control was attempted, but the wizard still showed
the first query's source alias; it is excluded from the evidence. No new claim
about nonhierarchical catalogs follows from this session.

## Focused implementation

`sdblParser` now records `hierarchical: false` when a metadata source is known
and lacks the hierarchy property. `undefined` remains the unavailable-metadata
case. Synthetic temporary/package sources keep their existing model shape.
`sdblGenerator.renderOrder` preserves an entered modifier for metadata-shaped
sources unless hierarchy is explicitly known to be false; the existing reference
field, select-alias, parameter-source, temp-source and subquery rules remain.
This is conservative preservation under uncertainty, not an assertion that every
unknown source is hierarchical. Existing models without the optional flag follow
the same conservative path; no persisted format/version is introduced.

`orderHierarchyDirection.test.ts` adds 18 cases: three direction forms across
absent/empty resolvers, corpus/explicit hierarchical metadata, and known metadata
with explicit false or an omitted hierarchy property. Each checks a second
round-trip and an unrelated alias edit. Browser tests additionally check both
Classic and Canvas load/save/reopen.

Exactly **one of 181 curated oracle fixtures** changes:
`0078-order-hierarchy-dropped-nonref.json` now ends its ORDER field with
`ИЕРАРХИЯ`. The historical filename is retained. Its input is unchanged; the
source and field match the live observation, with a different source alias.
The old expected output contradicted RP20 and this observation. No corpus golden,
snapshot or classification baseline is refreshed.

## Verification

Baseline: 213 tests passed with:

```bash
npx vitest run test/unit/orderHierarchyDirection.test.ts test/unit/oracleGolden.test.ts
```

Before implementation, `npx vitest run test/unit/orderHierarchyDirection.test.ts`
produced six expected failures (the two missing-metadata modes × three directions).
After implementation all 18 new cases passed; fixture 0078 was the sole curated
output difference and was updated for the reason above.

The first full unit run exposed four model-shape regressions from adding false
to synthetic temp sources. The implementation was narrowed; those existing
assertions were retained. Targeted recovery check:

```bash
npx vitest run test/unit/orderHierarchyDirection.test.ts test/unit/oracleGolden.test.ts test/unit/sdblParser.test.ts test/unit/buildSemanticSnapshot.test.ts
```

The targeted recovery check passed all **498 tests**. Final gates after the
implementation was narrowed:

| Command | Result |
| --- | --- |
| `npm test` | All three typechecks and 3186 tests in 131 files passed |
| `npm run test:e2e` | 91 browser tests passed, including 13 Canvas/parity tests |
| `npm run test:integration` | 38 VS Code integration tests passed |
| `npm run docs:check` | Passed: 61 Markdown files, 52 reachable pages |
| `git diff --check` | Passed |

The independent tree-sitter WASM oracle remains unavailable; its skip is explicit.
