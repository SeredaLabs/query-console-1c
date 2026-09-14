/**
 * Phase 2x-2 follow-up (semantic-core roadmap, memory: project-semantic-core-roadmap):
 * pure unit tests for `describeVirtualTableOutputField` — the reverse
 * (output field name → base resource + suffix) mapping used to enrich VT
 * output-field hover. Exercises the register-kind/slice matrix requested
 * during review: Остатки/Обороты/ОстаткиИОбороты for both РегистрНакопления
 * and РегистрБухгалтерии, plus the "no suffix at all" and "no base field"
 * boundary cases.
 */
import { describe, it, expect } from 'vitest';
import { describeVirtualTableOutputField } from '../../src/core/metadata/virtualTableOutputField';
import type { MetaTable } from '../../src/core/metadata/types';

const ACCUM_BASE: MetaTable = {
  kind: 'РегистрНакопления', name: 'Продажи', fullName: 'РегистрНакопления.Продажи',
  fields: [
    { name: 'Товар', kind: 'dimension', types: [{ ref: { kind: 'Справочник', name: 'Номенклатура' } }] },
    { name: 'Количество', kind: 'resource', types: [{ primitive: 'Число' }] },
    { name: 'Сумма', kind: 'resource', types: [{ primitive: 'Число' }] },
  ],
};

describe('describeVirtualTableOutputField: РегистрНакопления', () => {
  it('Остатки: <ресурс>Остаток → base resource + "Остаток" suffix', () => {
    const r = describeVirtualTableOutputField('РегистрНакопления', ACCUM_BASE, 'КоличествоОстаток');
    expect(r).toEqual({ outputName: 'КоличествоОстаток', baseFieldName: 'Количество', suffix: 'Остаток' });
  });

  it('Обороты (Balance): <ресурс>Приход / <ресурс>Расход resolve too, not just Оборот', () => {
    expect(describeVirtualTableOutputField('РегистрНакопления', ACCUM_BASE, 'СуммаПриход'))
      .toEqual({ outputName: 'СуммаПриход', baseFieldName: 'Сумма', suffix: 'Приход' });
    expect(describeVirtualTableOutputField('РегистрНакопления', ACCUM_BASE, 'СуммаРасход'))
      .toEqual({ outputName: 'СуммаРасход', baseFieldName: 'Сумма', suffix: 'Расход' });
  });

  it('ОстаткиИОбороты: НачальныйОстаток/КонечныйОстаток resolve to the same base resource', () => {
    expect(describeVirtualTableOutputField('РегистрНакопления', ACCUM_BASE, 'КоличествоНачальныйОстаток'))
      .toEqual({ outputName: 'КоличествоНачальныйОстаток', baseFieldName: 'Количество', suffix: 'НачальныйОстаток' });
    expect(describeVirtualTableOutputField('РегистрНакопления', ACCUM_BASE, 'КоличествоКонечныйОстаток'))
      .toEqual({ outputName: 'КоличествоКонечныйОстаток', baseFieldName: 'Количество', suffix: 'КонечныйОстаток' });
  });

  it('a dimension (no suffix, passes through unchanged) is NOT reverse-mapped — undefined, not a wrong guess', () => {
    expect(describeVirtualTableOutputField('РегистрНакопления', ACCUM_BASE, 'Товар')).toBeUndefined();
  });

  it('an output name that happens to textually end with a suffix but has no matching base resource is undefined', () => {
    // "СуммаНачальныйОстаток" тут НЕ існує як реальний ресурс "СуммаНачальный" — тому
    // жоден суфікс не повинен дати хибне сумісне "знайдено".
    expect(describeVirtualTableOutputField('РегистрНакопления', ACCUM_BASE, 'НеіснуєОстаток')).toBeUndefined();
  });

});

const ACCOUNTING_BASE: MetaTable = {
  kind: 'РегистрБухгалтерии', name: 'ХозОперации', fullName: 'РегистрБухгалтерии.ХозОперации',
  fields: [
    { name: 'Сумма', kind: 'resource', types: [{ primitive: 'Число' }] },
  ],
};

describe('describeVirtualTableOutputField: РегистрБухгалтерии', () => {
  it('Остатки: СуммаОстатокДт/СуммаОстатокКт (its own, накопления-different suffix set)', () => {
    expect(describeVirtualTableOutputField('РегистрБухгалтерии', ACCOUNTING_BASE, 'СуммаОстатокДт'))
      .toEqual({ outputName: 'СуммаОстатокДт', baseFieldName: 'Сумма', suffix: 'ОстатокДт' });
    expect(describeVirtualTableOutputField('РегистрБухгалтерии', ACCOUNTING_BASE, 'СуммаОстатокКт'))
      .toEqual({ outputName: 'СуммаОстатокКт', baseFieldName: 'Сумма', suffix: 'ОстатокКт' });
  });

  it('Обороты: СуммаОборотДт/СуммаОборотКт — a накопления-only suffix (plain "Оборот") does NOT wrongly match', () => {
    expect(describeVirtualTableOutputField('РегистрБухгалтерии', ACCOUNTING_BASE, 'СуммаОборотДт'))
      .toEqual({ outputName: 'СуммаОборотДт', baseFieldName: 'Сумма', suffix: 'ОборотДт' });
  });

  it('synthesized fields with no base-register equivalent (Счет, Субконто1) are correctly NOT reverse-mapped', () => {
    expect(describeVirtualTableOutputField('РегистрБухгалтерии', ACCOUNTING_BASE, 'Счет')).toBeUndefined();
    expect(describeVirtualTableOutputField('РегистрБухгалтерии', ACCOUNTING_BASE, 'Субконто1')).toBeUndefined();
  });
});

describe('describeVirtualTableOutputField: register kinds without a suffix table', () => {
  it('РегистрСведений has no suffix table at all (slices pass fields through unchanged) — always undefined', () => {
    const base: MetaTable = {
      kind: 'РегистрСведений', name: 'Цены', fullName: 'РегистрСведений.Цены',
      fields: [{ name: 'Цена', kind: 'resource', types: [{ primitive: 'Число' }] }],
    };
    expect(describeVirtualTableOutputField('РегистрСведений', base, 'Цена')).toBeUndefined();
  });
});
