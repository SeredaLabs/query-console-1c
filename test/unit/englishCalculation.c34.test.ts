/**
 * C34: English names of calculation registers, charts of calculation types and
 * sequences, and of their virtual tables. Not attested on a platform base: SL_kza has
 * none of these objects, and the platform answers `Table not found` alike for
 * `CalculationRegister.X`, `Catalog.X` and an invented `Blabla.X` (validate_query,
 * 2026-10-21), so a kind name cannot be attested without an object. Source instead:
 * the bilingual SDBL lexer of 1c-syntax/bsl-parser (`SDBLLexer.g4` @ d446af2:
 * CALCULATIONREGISTER, CHARTOFCALCULATIONTYPES, SEQUENCE, ACTUALACTIONPERIOD,
 * SCHEDULEDATA, BOUNDARIES) and the 1C developer guide, lesson 18
 * (`CalculationRegister.Accruals.ScheduleData(…)`, `….BaseAccruals(…)`).
 * Standard attribute names of these kinds are not mapped (no source).
 */
import { describe, it, expect } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { canonicalTableName } from '../../src/core/query/sdblEnglish';

const source = (q: string) => parseBatch(q).members[0].members[0].model.tables[0];

describe('C34: English kinds and virtual tables', () => {
  it.each([
    ['CalculationRegister.Начисления', 'РегистрРасчета.Начисления'],
    ['calculationregister.Начисления.ScheduleData', 'РегистрРасчета.Начисления.ДанныеГрафика'],
    ['CalculationRegister.Начисления.ActualActionPeriod', 'РегистрРасчета.Начисления.ФактическийПериодДействия'],
    ['CalculationRegister.Начисления.BaseНачисления', 'РегистрРасчета.Начисления.БазаНачисления'],
    ['ChartOfCalculationTypes.Основные', 'ПланВидовРасчета.Основные'],
    ['Sequence.Партии', 'Последовательность.Партии'],
    ['Sequence.Партии.Boundaries', 'Последовательность.Партии.Границы'],
  ])('%s → %s', (en, ru) => {
    expect(canonicalTableName(en)).toBe(ru);
  });

  it('a third segment that is no virtual table of the kind is kept', () => {
    expect(canonicalTableName('CalculationRegister.Начисления.Balance')).toBe('РегистрРасчета.Начисления.Balance');
    expect(canonicalTableName('CalculationRegister.Начисления.Base')).toBe('РегистрРасчета.Начисления.Base');
    expect(canonicalTableName('Sequence.Партии.ScheduleData')).toBe('Последовательность.Партии.ScheduleData');
    expect(canonicalTableName('Catalog.X.BaseY')).toBe('Справочник.X.BaseY');
  });

  it.each([
    ['SELECT T.Сотрудник FROM CalculationRegister.Начисления.ScheduleData(Recorder = &Р) AS T',
      'ВЫБРАТЬ T.Сотрудник ИЗ РегистрРасчета.Начисления.ДанныеГрафика(Recorder = &Р) КАК T'],
    ['SELECT T.Сотрудник FROM CalculationRegister.Начисления.ActualActionPeriod(Recorder = &Р) AS T',
      'ВЫБРАТЬ T.Сотрудник ИЗ РегистрРасчета.Начисления.ФактическийПериодДействия(Recorder = &Р) КАК T'],
    ['SELECT T.Сотрудник FROM CalculationRegister.Начисления.BaseНачисления(&Изм, &Изм, , ) AS T',
      'ВЫБРАТЬ T.Сотрудник ИЗ РегистрРасчета.Начисления.БазаНачисления(&Изм, &Изм, , ) КАК T'],
    ['SELECT T.Ссылка FROM ChartOfCalculationTypes.Основные AS T',
      'ВЫБРАТЬ T.Ссылка ИЗ ПланВидовРасчета.Основные КАК T'],
  ])('parses as its Russian twin: %s', (en, ru) => {
    expect(source(en)).toEqual(source(ru));
  });
});
