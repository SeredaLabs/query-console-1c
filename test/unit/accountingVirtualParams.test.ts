import { describe, it, expect } from 'vitest';
import { accountingParamFields } from '../../src/core/query/accountingVirtualParams';

const keys = (slice: string, corr: boolean) => accountingParamFields(slice, corr).map(f => f.key);

// PR-04 (ТЗ v2.1 §31): "ВидыСубконто" был безымянным позиционным слотом
// (accountingPositionKeys возвращал `null` вместо ключа) — любое значение там
// молча терялось при parse→generate. Ожидания ниже обновлены под фикс; см.
// test/unit/virtualTableRoundTrip.test.ts для проверки самого round-trip'а.
describe('accountingParamFields', () => {
  it('Остатки', () => {
    expect(keys('Остатки', true)).toEqual(['period', 'accountCondition', 'subcontoTypes', 'condition']);
  });
  it('Обороты corr includes corrAccountCondition и corrSubcontoTypes', () => {
    expect(keys('Обороты', true)).toEqual([
      'startPeriod', 'endPeriod', 'periodicity', 'accountCondition', 'subcontoTypes', 'condition',
      'corrAccountCondition', 'corrSubcontoTypes',
    ]);
  });
  it('Обороты non-corr omits corrAccountCondition/corrSubcontoTypes', () => {
    expect(keys('Обороты', false)).toEqual(['startPeriod', 'endPeriod', 'periodicity', 'accountCondition', 'subcontoTypes', 'condition']);
  });
  it('ОборотыДтКт: отдельные "виды субконто" для Дт и Кт счетов', () => {
    expect(keys('ОборотыДтКт', true)).toEqual([
      'startPeriod', 'endPeriod', 'periodicity', 'accountDtCondition', 'subcontoDtTypes',
      'accountKtCondition', 'subcontoKtTypes', 'condition',
    ]);
  });
  it('ОстаткиИОбороты has fillMethod', () => {
    expect(keys('ОстаткиИОбороты', true)).toEqual([
      'startPeriod', 'endPeriod', 'periodicity', 'fillMethod', 'accountCondition', 'subcontoTypes', 'condition',
    ]);
    expect(accountingParamFields('ОстаткиИОбороты', true).find(f => f.key === 'fillMethod')!.control).toBe('fillMethod');
  });
  it('ДвиженияССубконто', () => {
    expect(keys('ДвиженияССубконто', false)).toEqual(['startPeriod', 'endPeriod', 'condition', 'order', 'top']);
  });
  it('Субконто (PR-04: раньше отсутствовал, оба параметра терялись)', () => {
    expect(keys('Субконто', false)).toEqual(['period', 'accountCondition']);
    expect(keys('Субконто', true)).toEqual(['period', 'accountCondition']); // не зависит от corr/hasSubconto
  });
});
