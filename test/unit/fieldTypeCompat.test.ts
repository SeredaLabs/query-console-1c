import { describe, it, expect } from 'vitest';
import { fieldsTypeCompatible, typesOverlap } from '../../src/core/query/fieldTypeCompat';
import type { MetaField } from '../../src/core/metadata/types';

function field(name: string, types: MetaField['types']): MetaField {
  return { name, kind: 'attribute', types };
}

describe('typesOverlap', () => {
  it('same primitive overlaps', () => {
    expect(typesOverlap({ primitive: 'Строка' }, { primitive: 'Строка' })).toBe(true);
  });

  it('different primitives do not overlap', () => {
    expect(typesOverlap({ primitive: 'Строка' }, { primitive: 'Число' })).toBe(false);
  });

  it('same ref (kind+name) overlaps', () => {
    const ref = { kind: 'Справочник' as const, name: 'Контрагенты' };
    expect(typesOverlap({ ref }, { ref: { ...ref } })).toBe(true);
  });

  it('same kind, different ref name does not overlap', () => {
    expect(
      typesOverlap(
        { ref: { kind: 'Справочник', name: 'Контрагенты' } },
        { ref: { kind: 'Справочник', name: 'Номенклатура' } }
      )
    ).toBe(false);
  });

  it('primitive vs ref never overlaps', () => {
    expect(typesOverlap({ primitive: 'Строка' }, { ref: { kind: 'Документ', name: 'ЗаказКлиента' } })).toBe(false);
  });
});

describe('fieldsTypeCompatible', () => {
  it('blocks Строка = ДокументСсылка', () => {
    const a = field('Наименование', [{ primitive: 'Строка' }]);
    const b = field('Ссылка', [{ ref: { kind: 'Документ', name: 'ЗаказКлиента' } }]);
    expect(fieldsTypeCompatible(a, b)).toBe(false);
  });

  it('allows Ссылка = Ссылка on the same reference type', () => {
    const a = field('Ссылка', [{ ref: { kind: 'Справочник', name: 'Контрагенты' } }]);
    const b = field('Ссылка', [{ ref: { kind: 'Справочник', name: 'Контрагенты' } }]);
    expect(fieldsTypeCompatible(a, b)).toBe(true);
  });

  it('allows composite field if at least one type pair overlaps', () => {
    const a = field('Владелец', [
      { ref: { kind: 'Справочник', name: 'Контрагенты' } },
      { ref: { kind: 'Справочник', name: 'Номенклатура' } },
    ]);
    const b = field('Ссылка', [{ ref: { kind: 'Справочник', name: 'Номенклатура' } }]);
    expect(fieldsTypeCompatible(a, b)).toBe(true);
  });

  it('does not block when a field has no recognized types (raw/unresolved)', () => {
    const a = field('Странное', [{ raw: 'cfg:НеизвестныйРеф' }]);
    const b = field('Наименование', [{ primitive: 'Строка' }]);
    expect(fieldsTypeCompatible(a, b)).toBe(true);
  });
});
