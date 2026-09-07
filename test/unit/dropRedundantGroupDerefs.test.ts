/**
 * Pre-migration safety audit (semantic-core hardening) found that
 * `prefixResolvesToReference` in `dropRedundantGroupDerefs.ts` has TWO behaviors
 * not exercised by any test in this repo: its head-segment `dimension`/`resource`
 * special case, and its `metaFor`'s tabular-section-as-3-segment-source fallback
 * (the corpus examples cited in the file's own comments — ФормированиеПартийЗЕРНО,
 * Взаимозачет etc. — belong to a larger, non-committed corpus, not the frozen
 * `test/fixtures/corpus/golden.jsonl` this repo's CI actually gates on). Without
 * these, a regression in either behavior would pass `npm test` green. Added here
 * BEFORE any FieldPathResolver migration touches this file, so a future migration
 * has a real regression net for exactly the two divergences that migration must
 * reconcile deliberately (see fieldPathResolver.ts's doc comment).
 */
import { describe, it, expect } from 'vitest';
import { dropRedundantGroupDerefs } from '../../src/core/query/dropRedundantGroupDerefs';
import { buildResolverFromTables } from '../../src/core/metadata/buildModelResolver';
import type { MetaTable } from '../../src/core/metadata/types';
import type { QueryModel } from '../../src/core/query/queryModel';

const KONTRAGENTY: MetaTable = {
  kind: 'Справочник',
  name: 'Контрагенты',
  fullName: 'Справочник.Контрагенты',
  fields: [{ name: 'Наименование', kind: 'standard', types: [{ primitive: 'Строка' }] }],
};

// Register with a DIMENSION field that is itself a reference — exercises the
// "head segment classified dimension/resource is never dropped" special case
// (dropRedundantGroupDerefs.ts's own comment: "Головной сегмент-ИЗМЕРЕНИЕ/РЕСУРС
// регистра — НЕ дропается").
const REGISTR: MetaTable = {
  kind: 'РегистрНакопления',
  name: 'Продажи',
  fullName: 'РегистрНакопления.Продажи',
  fields: [
    { name: 'Контрагент', kind: 'dimension', types: [{ ref: { kind: 'Справочник', name: 'Контрагенты' } }] },
  ],
};

// A regular (non-register) table whose head field is a plain reference attribute —
// the case this whole rule DOES drop.
const TOVARY: MetaTable = {
  kind: 'Справочник',
  name: 'Товары',
  fullName: 'Справочник.Товары',
  fields: [
    { name: 'Контрагент', kind: 'standard', types: [{ ref: { kind: 'Справочник', name: 'Контрагенты' } }] },
  ],
};

// Tabular section as a FROM-source (`ИЗ Справочник.Спецификации.Состав КАК ТЧ`) —
// exercises metaFor's 3-segment tabularSections fallback (the branch
// resolveBuilderStar.ts's own metaFor does NOT have).
const SPECIFICATIONS: MetaTable = {
  kind: 'Справочник',
  name: 'Спецификации',
  fullName: 'Справочник.Спецификации',
  fields: [],
  tabularSections: [
    {
      kind: 'ТабличнаяЧасть',
      name: 'Состав',
      fullName: 'Справочник.Спецификации.Состав',
      fields: [
        { name: 'Номенклатура', kind: 'standard', types: [{ ref: { kind: 'Справочник', name: 'Товары' } }] },
      ],
    },
  ],
};

const resolver = buildResolverFromTables([KONTRAGENTY, REGISTR, TOVARY, SPECIFICATIONS]);

function modelWithGroupPrefix(tableFullName: string, prefixPath: string, deepPath: string): QueryModel {
  return {
    tables: [{ id: 't1', fullName: tableFullName, alias: 'Т' }],
    fields: [],
    grouping: {
      multiple: false,
      groupFields: [
        { tableId: 't1', path: prefixPath },
        { tableId: 't1', path: deepPath },
      ],
      explicitGroupCount: 2,
    },
  };
}

describe('dropRedundantGroupDerefs — head-segment dimension/resource special case', () => {
  it('does NOT drop when the prefix is a register DIMENSION field (even though it IS a reference)', () => {
    const model = modelWithGroupPrefix('РегистрНакопления.Продажи', 'Контрагент', 'Контрагент.Наименование');
    dropRedundantGroupDerefs(model, resolver);
    expect(model.grouping!.groupFields).toHaveLength(2); // nothing dropped
    expect(model.grouping!.groupFields.map(f => f.path)).toEqual(['Контрагент', 'Контрагент.Наименование']);
  });

  it('DOES drop the same shape when the prefix is a plain (non-dimension) reference attribute', () => {
    const model = modelWithGroupPrefix('Справочник.Товары', 'Контрагент', 'Контрагент.Наименование');
    dropRedundantGroupDerefs(model, resolver);
    expect(model.grouping!.groupFields).toHaveLength(1); // "Контрагент.Наименование" dropped
    expect(model.grouping!.groupFields.map(f => f.path)).toEqual(['Контрагент']);
  });
});

describe('dropRedundantGroupDerefs — metaFor tabular-section-as-3-segment-source fallback', () => {
  it('resolves a tabular-section FROM-source via its parent\'s tabularSections and drops the redundant deref', () => {
    const model = modelWithGroupPrefix(
      'Справочник.Спецификации.Состав',
      'Номенклатура',
      'Номенклатура.Наименование'
    );
    dropRedundantGroupDerefs(model, resolver);
    expect(model.grouping!.groupFields).toHaveLength(1);
    expect(model.grouping!.groupFields.map(f => f.path)).toEqual(['Номенклатура']);
  });
});
