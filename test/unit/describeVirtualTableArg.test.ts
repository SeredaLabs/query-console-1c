/**
 * Phase 2x-2 of the semantic-core roadmap (memory: project-semantic-core-roadmap).
 */
import { describe, it, expect } from 'vitest';
import { buildSemanticSnapshotFromText } from '../../src/core/semantic/buildSemanticSnapshot';
import { describeVirtualTableArgAt } from '../../src/core/semantic/describeVirtualTableArg';

describe('describeVirtualTableArgAt', () => {
  it('resolves the first argument of РегистрСведений.SliceLast to its "period" role', () => {
    const text = 'ВЫБРАТЬ Т.Период ИЗ РегистрСведений.ЦеныНоменклатуры.СрезПоследних(&Дата, ИСТИНА) КАК Т';
    const snapshot = buildSemanticSnapshotFromText(1, text);
    const pos = text.indexOf('&Дата') + 1;
    const result = describeVirtualTableArgAt(snapshot, pos);
    expect(result.kind).toBe('resolved');
    if (result.kind === 'resolved') {
      expect(result.value.tableFullName).toBe('РегистрСведений.ЦеныНоменклатуры.СрезПоследних');
      expect(result.value.param).toEqual({ name: 'Период', role: 'period' });
    }
  });

  it('resolves the second argument of the same call to its "condition" role', () => {
    const text = 'ВЫБРАТЬ Т.Период ИЗ РегистрСведений.ЦеныНоменклатуры.СрезПоследних(&Дата, ИСТИНА) КАК Т';
    const snapshot = buildSemanticSnapshotFromText(1, text);
    const pos = text.indexOf('ИСТИНА') + 1;
    const result = describeVirtualTableArgAt(snapshot, pos);
    expect(result.kind).toBe('resolved');
    if (result.kind === 'resolved') expect(result.value.param.role).toBe('condition');
  });

  it('РегистрБухгалтерии.Остатки: 3rd slot resolves to "subconto", not the РегистрНакопления shape', () => {
    const text = 'ВЫБРАТЬ Т.Период ИЗ РегистрБухгалтерии.ХозОперации.Остатки(&Дата, &УсловиеСчета, ИСТИНА, &Условие) КАК Т';
    const snapshot = buildSemanticSnapshotFromText(1, text);
    const pos = text.indexOf('ИСТИНА') + 1;
    const result = describeVirtualTableArgAt(snapshot, pos);
    expect(result.kind).toBe('resolved');
    if (result.kind === 'resolved') expect(result.value.param).toEqual({ name: 'Субконто', role: 'subconto' });
  });

  it('РегистрРасчета.ФактическийПериодДействия: single argument resolves to "condition" (not "period")', () => {
    const text = 'ВЫБРАТЬ Т.Период ИЗ РегистрРасчета.Начисления.ФактическийПериодДействия(Регистратор = &Регистратор) КАК Т';
    const snapshot = buildSemanticSnapshotFromText(1, text);
    const pos = text.indexOf('Регистратор');
    const result = describeVirtualTableArgAt(snapshot, pos);
    expect(result.kind).toBe('resolved');
    if (result.kind === 'resolved') expect(result.value.param.role).toBe('condition');
  });

  it('РегистрРасчета.База<Имя>: prefix-matched signature resolves all 4 slots by role', () => {
    const text = 'ВЫБРАТЬ Т.Период ИЗ РегистрРасчета.Начисления.БазаНачисленияБазовые(&ИзмОсн, &ИзмБаза, &Разрезы, ИСТИНА) КАК Т';
    const snapshot = buildSemanticSnapshotFromText(1, text);
    const roles = ['&ИзмОсн', '&ИзмБаза', '&Разрезы', 'ИСТИНА'].map((needle) => {
      const pos = text.indexOf(needle) + 1;
      const result = describeVirtualTableArgAt(snapshot, pos);
      return result.kind === 'resolved' ? result.value.param.role : result.kind;
    });
    expect(roles).toEqual(['mainDimensions', 'baseDimensions', 'sections', 'condition']);
  });

  it('a position outside any virtual-table argument (e.g. on the table alias) is unknown', () => {
    const text = 'ВЫБРАТЬ Т.Период ИЗ РегистрНакопления.Продажи.Остатки(&Дата, ИСТИНА) КАК Т';
    const snapshot = buildSemanticSnapshotFromText(1, text);
    const pos = text.lastIndexOf('КАК Т') + 'КАК '.length;
    expect(describeVirtualTableArgAt(snapshot, pos).kind).toBe('unknown');
  });

  it('a regular (non-virtual) table source is unknown for any position', () => {
    const text = 'ВЫБРАТЬ Т.Поле ИЗ Справочник.Валюты КАК Т';
    const snapshot = buildSemanticSnapshotFromText(1, text);
    expect(describeVirtualTableArgAt(snapshot, text.indexOf('Валюты')).kind).toBe('unknown');
  });

  it('unknown for a non-complete snapshot (recovered/unavailable)', () => {
    const broken = 'ВЫБРАТЬ Т.Поле1 Т.Поле2 ИЗ РегистрНакопления.Продажи.Остатки(&Дата, ИСТИНА) КАК Т';
    const snapshot = buildSemanticSnapshotFromText(1, broken);
    expect(snapshot.completeness).not.toBe('complete');
    expect(describeVirtualTableArgAt(snapshot, 0).kind).toBe('unknown');
  });

  it('resolves correctly for a virtual-table source inside a subquery (own per-model table numbering)', () => {
    const text = 'ВЫБРАТЬ Т.Поле ИЗ (ВЫБРАТЬ Б.Период ИЗ РегистрНакопления.Продажи.Остатки(&Дата, ИСТИНА) КАК Б) КАК Т';
    const snapshot = buildSemanticSnapshotFromText(1, text);
    const pos = text.indexOf('&Дата') + 1;
    const result = describeVirtualTableArgAt(snapshot, pos);
    expect(result.kind).toBe('resolved');
    if (result.kind === 'resolved') {
      expect(result.value.tableFullName).toBe('РегистрНакопления.Продажи.Остатки');
      expect(result.value.param.role).toBe('period');
    }
  });
});
