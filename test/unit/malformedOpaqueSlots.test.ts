import { describe, expect, it } from 'vitest';
import { buildYamlResolver } from '../../src/core/metadata/buildYamlResolver';
import { parseBatch } from '../../src/core/query/sdblParser';
import { tryOpenBatch } from '../../src/core/query/validateBatch';
import { findMalformedCustomExpressions } from '../../src/core/query/semanticValidator';
import { initialState, reducer } from '../../src/webview/state/queryStore';
import { computeBatchTextSafe } from '../../src/webview/computeBatchText';
import { decideApply, findStaticApplyBlocker } from '../../src/webview/applyGate';

const resolver = buildYamlResolver('test/fixtures/corpus/metadata/cf');
const VT_DOUBLE_EQ = 'ВЫБРАТЬ Т.Период\nИЗ РегистрСведений.Курсы.СрезПоследних(, Код = = &Код) КАК Т';
const PERIOD_DOUBLE_EQ = 'ВЫБРАТЬ 1 КАК Число\nИТОГИ ПО Число ПЕРИОДАМИ(Месяц, &А = = 1, &Б)';

function applyOf(text: string, metadata: boolean) {
  const active = metadata ? resolver : undefined;
  const opened = tryOpenBatch(text, active, { preserveComments: true });
  expect(opened.ok, opened.ok ? '' : opened.error).toBe(true);
  if (!opened.ok) throw new Error(opened.error);
  const state = reducer(initialState(), { type: 'LOAD_BATCH', doc: opened.doc });
  const out = computeBatchTextSafe(state, true);
  return {
    hits: findMalformedCustomExpressions(opened.doc),
    blocker: findStaticApplyBlocker(state),
    decision: decideApply(out.text, out.error, findStaticApplyBlocker(state), active),
  };
}

for (const metadata of [false, true]) {
  describe(`C11 opaque slots with metadata=${metadata}`, () => {
    it('blocks Код = = &Код in a virtual-table condition (malformedCustom, Apply disabled)', () => {
      const r = applyOf(VT_DOUBLE_EQ, metadata);
      expect(r.hits.some(h => h.kind === 'virtualTableArg' && h.text.includes('Код = = &Код'))).toBe(true);
      expect(r.blocker).toEqual({ kind: 'malformedCustom' });
      expect(r.decision).toEqual({ ok: false, kind: 'blocked' });
    });

    it('blocks &А = = 1 in ПЕРИОДАМИ (malformedCustom, Apply disabled)', () => {
      const r = applyOf(PERIOD_DOUBLE_EQ, metadata);
      expect(r.hits.some(h => h.kind === 'periodBy' && h.text.includes('&А = = 1'))).toBe(true);
      expect(r.blocker).toEqual({ kind: 'malformedCustom' });
      expect(r.decision).toEqual({ ok: false, kind: 'blocked' });
    });

    it('still applies a DCS virtual-table argument {(Код = &Код) КАК Отбор}', () => {
      const r = applyOf(
        'ВЫБРАТЬ Т.Период ИЗ РегистрСведений.Курсы.СрезПоследних(, {(Код = &Код) КАК Отбор}) КАК Т',
        metadata,
      );
      expect(r.hits).toEqual([]);
      expect(r.blocker).toBeNull();
      expect(r.decision).toEqual({ ok: true });
    });

    it('still flags Код = = 1 when a string literal contains braces', () => {
      const r = applyOf(
        'ВЫБРАТЬ Т.Период ИЗ РегистрСведений.Курсы.СрезПоследних(, Валюта.Наименование = "{x}" И Код = = 1) КАК Т',
        metadata,
      );
      expect(r.hits.some(h => h.kind === 'virtualTableArg' && h.text.includes('Код = = 1'))).toBe(true);
      expect(r.blocker).toEqual({ kind: 'malformedCustom' });
      expect(r.decision).toEqual({ ok: false, kind: 'blocked' });
    });

    it('still applies МЕЖДУ and does not treat its right-hand side as a standalone expression', () => {
      const r = applyOf('ВЫБРАТЬ Т.Код ИЗ Справочник.Валюты КАК Т ГДЕ Т.Код МЕЖДУ &А И &Б', metadata);
      expect(r.hits).toEqual([]);
      expect(r.blocker).toBeNull();
      expect(r.decision).toEqual({ ok: true });
    });

    it('still applies closed characteristics', () => {
      const r = applyOf('ВЫБРАТЬ 1 КАК Число {ХАРАКТЕРИСТИКИ ТИП(Справочник.Валюты)}', metadata);
      expect(r.hits).toEqual([]);
      expect(r.blocker).toBeNull();
      expect(r.decision).toEqual({ ok: true });
    });

    it('still applies valid ПЕРИОДАМИ date arguments', () => {
      const r = applyOf('ВЫБРАТЬ 1 КАК Число ИТОГИ ПО Число ПЕРИОДАМИ(Месяц, &А, &Б)', metadata);
      expect(r.hits).toEqual([]);
      expect(r.blocker).toBeNull();
      expect(r.decision).toEqual({ ok: true });
    });
  });
}

const VALID_VIRTUAL_ARGS: Array<{ kind: string; text: string }> = [
  { kind: 'info-slice-last', text: 'ВЫБРАТЬ Т.Период ИЗ РегистрСведений.Курсы.СрезПоследних(&Период, Код = &Код) КАК Т' },
  { kind: 'info-slice-first', text: 'ВЫБРАТЬ Т.Период ИЗ РегистрСведений.Курсы.СрезПервых(&Период, Код = &Код) КАК Т' },
  { kind: 'accum-balance', text: 'ВЫБРАТЬ Т.Период ИЗ РегистрНакопления.ОстаткиТоваров.Остатки(&Период, Номенклатура = &Н) КАК Т' },
  { kind: 'accum-turnovers', text: 'ВЫБРАТЬ Т.Период ИЗ РегистрНакопления.ОстаткиТоваров.Обороты(&Н, &К, Месяц, Номенклатура = &Н) КАК Т' },
  { kind: 'accum-balance-and-turnovers', text: 'ВЫБРАТЬ Т.Период ИЗ РегистрНакопления.ОстаткиТоваров.ОстаткиИОбороты(&Н, &К, Месяц, Движения, Номенклатура = &Н) КАК Т' },
  { kind: 'acct-balance', text: 'ВЫБРАТЬ Т.Период ИЗ РегистрБухгалтерии.Хозрасчетный.Остатки(&П, Счет = &С, , Сумма <> 0) КАК Т' },
  { kind: 'acct-turnovers', text: 'ВЫБРАТЬ Т.Период ИЗ РегистрБухгалтерии.Хозрасчетный.Обороты(&Н, &К, Месяц, Счет = &С, , Сумма <> 0) КАК Т' },
  { kind: 'acct-dt-kt', text: 'ВЫБРАТЬ Т.Период ИЗ РегистрБухгалтерии.Хозрасчетный.ОборотыДтКт(&Н, &К, Месяц, СчетДт = &Д, , СчетКт = &Кт, , Сумма <> 0) КАК Т' },
  { kind: 'acct-balance-and-turnovers', text: 'ВЫБРАТЬ Т.Период ИЗ РегистрБухгалтерии.Хозрасчетный.ОстаткиИОбороты(&Н, &К, Месяц, Движения, Счет = &С, , Сумма <> 0) КАК Т' },
  { kind: 'acct-movements', text: 'ВЫБРАТЬ Т.Период ИЗ РегистрБухгалтерии.Хозрасчетный.ДвиженияССубконто(&Н, &К, Счет = &С, Период УБЫВ, 10) КАК Т' },
  { kind: 'acct-subconto', text: 'ВЫБРАТЬ Т.Период ИЗ РегистрБухгалтерии.Хозрасчетный.Субконто(&П, Счет = &С) КАК Т' },
  { kind: 'calc-schedule', text: 'ВЫБРАТЬ Т.Период ИЗ РегистрРасчета.Начисления.ДанныеГрафика(Сотрудник = &С) КАК Т' },
  { kind: 'calc-actual-period', text: 'ВЫБРАТЬ Т.Период ИЗ РегистрРасчета.Начисления.ФактическийПериодДействия(Сотрудник = &С) КАК Т' },
  { kind: 'calc-base', text: 'ВЫБРАТЬ Т.Период ИЗ РегистрРасчета.Начисления.БазаНачисления(Организация, Контрагент, Разрез, Сотрудник = &С) КАК Т' },
];

describe('C11 synthetic valid virtual-table arguments are not blocked', () => {
  for (const metadata of [false, true]) {
    for (const sample of VALID_VIRTUAL_ARGS) {
      it(`${sample.kind} metadata=${metadata}`, () => {
        const r = applyOf(sample.text, metadata);
        expect(r.hits, JSON.stringify(r.hits)).toEqual([]);
        expect(r.blocker).toBeNull();
        expect(r.decision).toEqual({ ok: true });
      });
    }
  }
});

describe('C11 constructed expression slots', () => {
  it('checks a malformed tabular-section castPrefix', () => {
    const batch = {
      members: [{
        members: [{
          name: 'Запрос 1',
          distinct: false,
          model: {
            tables: [{ id: 't0', fullName: 'Справочник.Валюты', alias: 'Т' }],
            fields: [{ tableId: 't0', path: 'Код', alias: 'Код' }],
            tabSectionFields: [{
              tableId: 't0', tsName: 'Товары', tsFullName: 'Справочник.Валюты.Товары', fields: [],
              castPrefix: 'ВЫРАЗИТЬ(Т.Ссылка',
            }],
          },
        }],
      }],
    };
    expect(findMalformedCustomExpressions(batch)).toEqual([
      { kind: 'castPrefix', text: 'ВЫРАЗИТЬ(Т.Ссылка' },
    ]);
  });

  it('accepts a well-formed castPrefix', () => {
    const batch = {
      members: [{
        members: [{
          name: 'Запрос 1',
          distinct: false,
          model: {
            tables: [{ id: 't0', fullName: 'Справочник.Валюты', alias: 'Т' }],
            fields: [{ tableId: 't0', path: 'Код', alias: 'Код' }],
            tabSectionFields: [{
              tableId: 't0', tsName: 'Товары', tsFullName: 'Справочник.Валюты.Товары', fields: [],
              castPrefix: 'ВЫРАЗИТЬ(Т.Ссылка КАК Документ.Заказ)',
            }],
          },
        }],
      }],
    };
    expect(findMalformedCustomExpressions(batch)).toEqual([]);
  });

  it('checks a non-custom comparison param and skips МЕЖДУ RHS', () => {
    expect(findMalformedCustomExpressions({
      members: [{
        members: [{
          name: 'Запрос 1',
          distinct: false,
          model: {
            tables: [{ id: 't0', fullName: 'Справочник.Валюты', alias: 'Т' }],
            fields: [{ tableId: 't0', path: 'Код', alias: 'Код' }],
            conditions: [{ custom: false, tableId: 't0', path: 'Код', operator: '=', param: '= = &Код' }],
          },
        }],
      }],
    })).toEqual([{ kind: 'condition', text: '= = &Код' }]);
    expect(findMalformedCustomExpressions(parseBatch(
      'ВЫБРАТЬ Т.Код ИЗ Справочник.Валюты КАК Т ГДЕ Т.Код МЕЖДУ &А И &Б',
    ))).toEqual([]);
  });
});
