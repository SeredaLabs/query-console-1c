import { describe, it, expect } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { buildResolverFromTables } from '../../src/core/metadata/buildModelResolver';
import { initialState, reducer } from '../../src/webview/state/queryStore';
import { computeBatchTextSafe } from '../../src/webview/computeBatchText';
import { decideApply, findStaticApplyBlocker } from '../../src/webview/applyGate';

describe('C5: invalid input cannot silently lose clauses or nonempty VT arguments', () => {
  for (const resolver of [undefined, buildResolverFromTables([])]) {
    for (const [slice, args] of [
      ['Обороты', '&Начало, &Конец, Месяц, Измерение = &Изм'],
      ['ОстаткиИОбороты', '&Начало, &Конец, Месяц, Движения, Измерение = &Изм'],
    ]) {
      const source = `РегистрНакопления.Тест.${slice}`;
      const query = (tail: string) => `ВЫБРАТЬ Т.Поле ИЗ ${source}(${args}${tail}) КАК Т`;
      for (const wrap of [
        (s: string) => s,
        (s: string) => `ВЫБРАТЬ П.Поле ИЗ (${s}) КАК П`,
        (s: string) => `ВЫБРАТЬ 1 КАК Поле ГДЕ 1 В (${s})`,
      ]) {
        it(`${slice}: extra nonempty argument blocks Apply (${resolver ? 'empty resolver' : 'no resolver'}, ${wrap(query(''))})`, () => {
          const doc = parseBatch(wrap(query(', , &НельзяТерять')), resolver);
          let state = reducer(initialState(), { type: 'LOAD_BATCH', doc });
          state = reducer(state, { type: 'SET_FIELD_ALIAS', fieldIdx: 0, alias: 'НовоеИмя' });
          const blocker = findStaticApplyBlocker(state);
          // Embedded subquery labels may omit the register-kind prefix.
          expect(blocker).toEqual({ kind: 'unsafeVirtualTable', name: expect.stringContaining(`Тест.${slice}`) });
          const output = computeBatchTextSafe(state, true);
          expect(decideApply(output.text, output.error, blocker, undefined)).toEqual({ ok: false, kind: 'blocked' });
        });
      }
      it(`${slice}: supported arguments and trailing empty slots remain usable (${!!resolver})`, () => {
        for (const tail of ['', ', , ']) {
          const doc = parseBatch(query(tail), resolver);
          const state = reducer(initialState(), { type: 'LOAD_BATCH', doc });
          expect(findStaticApplyBlocker(state)).toBeNull();
          expect(generateBatch(doc)).toContain(`${slice}(${args})`);
        }
      });
    }
  }

  for (const text of [
    'ВЫБРАТЬ 1 КАК Код ИНДЕКСИРОВАТЬ ПО Код',
    'ВЫБРАТЬ 1 КАК Код ОБЪЕДИНИТЬ ВСЕ ВЫБРАТЬ 2 ИНДЕКСИРОВАТЬ ПО Код',
    'ВЫБРАТЬ 1 КАК Код ПОМЕСТИТЬ ВТ; ВЫБРАТЬ Т.Код ИЗ ВТ КАК Т ИНДЕКСИРОВАТЬ ПО Код',
  ]) {
    it(`rejects indexing without a temp destination: ${text}`, () => {
      expect(() => parseBatch(text)).toThrow(/ИНДЕКСИРОВАТЬ.*ПОМЕСТИТЬ/);
    });
  }

  it('keeps a UNION index whose temp destination belongs to its first member', () => {
    const text = 'ВЫБРАТЬ 1 КАК Код ПОМЕСТИТЬ ВТ ОБЪЕДИНИТЬ ВСЕ ВЫБРАТЬ 2 ИНДЕКСИРОВАТЬ ПО Код';
    const output = generateBatch(parseBatch(text));
    expect(output).toContain('ПОМЕСТИТЬ ВТ');
    expect(output).toContain('ИНДЕКСИРОВАТЬ ПО');
    expect(generateBatch(parseBatch(output))).toBe(output);
  });

  // Platform-invalid shapes that open today: Apply must refuse rather than write
  // an altered text (RP11/RP12 mangle the condition, RP15 loses the subquery parentheses).
  for (const [id, text] of [
    ['RP11', 'ВЫБРАТЬ\n\tВ.Код КАК Код\nИЗ\n\tСправочник.Валюты КАК В\nГДЕ\n\tНЕ В.ПометкаУдаления'],
    ['RP12', 'ВЫБРАТЬ\n\tИ.Код КАК Код\nИЗ\n\tСправочник.Валюты КАК И\nГДЕ\n\tНЕ И.ПометкаУдаления'],
    ['RP15', 'ВЫБРАТЬ\n\t(ВЫБРАТЬ ПЕРВЫЕ 1 К.Курс ИЗ РегистрСведений.КурсыВалют КАК К) КАК Курс\nИЗ\n\tСправочник.Валюты КАК Вал'],
  ]) {
    for (const resolver of [undefined, buildResolverFromTables([])]) {
      it(`${id}: Apply refuses to write (${resolver ? 'empty resolver' : 'no resolver'})`, () => {
        const state = reducer(initialState(), { type: 'LOAD_BATCH', doc: parseBatch(text, resolver) });
        const output = computeBatchTextSafe(state, true);
        const decision = decideApply(output.text, output.error, findStaticApplyBlocker(state), undefined);
        expect(decision.ok).toBe(false);
      });
    }
  }

  for (const text of [
    "ВЫБРАТЬ\n\tК.Курс КАК Курс\nИЗ\n\tРегистрСведений.КурсыВалют КАК К\nГДЕ\n\tК.Период > '20240101000000'",
    "ВЫБРАТЬ '20240101' КАК Д",
    "ВЫБРАТЬ 1 КАК Код ОБЪЕДИНИТЬ ВСЕ ВЫБРАТЬ '20240101'",
    "ВЫБРАТЬ П.Д ИЗ (ВЫБРАТЬ '20240101' КАК Д) КАК П",
    "ВЫБРАТЬ 1 КАК Код ПОМЕСТИТЬ ВТ; ВЫБРАТЬ Т.Код ИЗ ВТ КАК Т ГДЕ &Д > '20240101'",
  ]) {
    it(`RP23: rejects a single-quoted literal on open: ${text}`, () => {
      expect(() => parseBatch(text)).toThrow(/одинарных кавычках.*ДАТАВРЕМЯ/);
    });
  }

  it('RP23: DATETIME constants and apostrophes inside strings or comments still parse', () => {
    const text = 'ВЫБРАТЬ\n\tДАТАВРЕМЯ(2024, 1, 1) КАК Д, // it\'s a date\n\t"it\'s" КАК С';
    const output = generateBatch(parseBatch(text));
    expect(output).toContain('ДАТАВРЕМЯ(2024, 1, 1)');
    expect(output).toContain('"it\'s"');
  });
});
