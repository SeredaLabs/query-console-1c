/**
 * C34: English names of calculation registers, charts of calculation types and
 * sequences, and of their virtual tables.
 *
 * Not attested on a platform base: SL_kza has none of these objects, and the platform
 * answers `Table not found` alike for `CalculationRegister.X`, `Catalog.X` and an
 * invented `Blabla.X` (validate_query, 2026-10-21), so a kind name cannot be attested
 * without an object.
 *
 * Sources, kept apart:
 * - official 1C developer guide, lesson 18: `CalculationRegister`, `ScheduleData`
 *   (`CalculationRegister.Accruals.ScheduleData(…)`);
 * - third-party only, not a platform verdict: the bilingual SDBL lexer of
 *   1c-syntax/bsl-parser (`SDBLLexer.g4` @ d446af2): `ChartOfCalculationTypes`,
 *   `Sequence`, `ActualActionPeriod`, `Boundaries`.
 *
 * Not mapped: the base table `Base<Register>` (the guide shows `….BaseAccruals(…)`,
 * but a recalculation is also a third segment of a calculation register, so a
 * `Base…` rename could change a valid query), standard attribute names of these
 * kinds and the standard tabular sections of a chart of calculation types.
 */
import { describe, it, expect } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { canonicalTableName } from '../../src/core/query/sdblEnglish';
import { tryOpenDesignerBatch } from '../../src/webview/openDesignerBatch';
import { initialState, reducer } from '../../src/webview/state/queryStore';
import { computeBatchTextSafe } from '../../src/webview/computeBatchText';

const source = (q: string) => parseBatch(q).members[0].members[0].model.tables[0];

function designerText(query: string): string {
  const open = tryOpenDesignerBatch(query);
  if (!open.ok) throw new Error(open.error);
  return computeBatchTextSafe(reducer(initialState(), { type: 'LOAD_BATCH', doc: open.doc }), true).text;
}

describe('C34: English kinds and virtual tables', () => {
  it.each([
    ['CalculationRegister.Начисления', 'РегистрРасчета.Начисления'],
    ['calculationregister.Начисления.ScheduleData', 'РегистрРасчета.Начисления.ДанныеГрафика'],
    ['CalculationRegister.Начисления.ActualActionPeriod', 'РегистрРасчета.Начисления.ФактическийПериодДействия'],
    ['ChartOfCalculationTypes.Основные', 'ПланВидовРасчета.Основные'],
    ['Sequence.Партии', 'Последовательность.Партии'],
    ['Sequence.Партии.Boundaries', 'Последовательность.Партии.Границы'],
  ])('%s → %s', (en, ru) => {
    expect(canonicalTableName(en)).toBe(ru);
  });

  it('a third segment that is no mapped virtual table of the kind is kept', () => {
    expect(canonicalTableName('CalculationRegister.Начисления.Balance')).toBe('РегистрРасчета.Начисления.Balance');
    expect(canonicalTableName('Sequence.Партии.ScheduleData')).toBe('Последовательность.Партии.ScheduleData');
    expect(canonicalTableName('Catalog.X.BaseY')).toBe('Справочник.X.BaseY');
  });

  it.each([
    ['SELECT T.Сотрудник FROM CalculationRegister.Начисления.ScheduleData(Recorder = &Р) AS T',
      'ВЫБРАТЬ T.Сотрудник ИЗ РегистрРасчета.Начисления.ДанныеГрафика(Recorder = &Р) КАК T'],
    ['SELECT T.Сотрудник FROM CalculationRegister.Начисления.ActualActionPeriod(Recorder = &Р) AS T',
      'ВЫБРАТЬ T.Сотрудник ИЗ РегистрРасчета.Начисления.ФактическийПериодДействия(Recorder = &Р) КАК T'],
    ['SELECT T.Ссылка FROM ChartOfCalculationTypes.Основные AS T',
      'ВЫБРАТЬ T.Ссылка ИЗ ПланВидовРасчета.Основные КАК T'],
  ])('parses as its Russian twin: %s', (en, ru) => {
    expect(source(en)).toEqual(source(ru));
  });
});

describe('C34: recalculation and base-table names are never renamed', () => {
  it.each(['Base', 'BaseRecalc', 'baseНачисления', 'BASEНачисления', 'ПерерасчетНачислений', 'Baseline'])(
    'CalculationRegister.Начисления.%s keeps its third segment', name => {
      expect(canonicalTableName(`CalculationRegister.Начисления.${name}`)).toBe(`РегистрРасчета.Начисления.${name}`);
    });

  it.each([
    'SELECT T.Сотрудник FROM CalculationRegister.Начисления.BaseRecalc AS T',
    'SELECT T.Сотрудник FROM CalculationRegister.Начисления.ПерерасчетНачислений AS T',
  ])('Designer → Apply keeps the recalculation: %s', query => {
    const name = /Начисления\.(\S+)/u.exec(query)![1];
    const text = designerText(query);
    expect(text).toContain(`РегистрРасчета.Начисления.${name} КАК T`);
    expect(text).not.toContain('База');
  });

  it('an English base table is kept as written', () => {
    const t = source('SELECT T.Сотрудник FROM CalculationRegister.Начисления.BaseНачисления(&А, &Б, , ) AS T');
    expect(t.fullName).toBe('РегистрРасчета.Начисления.BaseНачисления');
  });
});
