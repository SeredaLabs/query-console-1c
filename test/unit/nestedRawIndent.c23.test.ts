/**
 * C22/C23: raw multiline text inside a nested query (a TOTALS aggregate, a
 * condition comparing CASE expressions with subqueries, …) is rebased to the
 * query's own level when parsed, so the nesting padding the generator adds is not
 * added again on every open → Save → reopen. Literal contents stay verbatim and a
 * top-level query is unaffected.
 */
import { describe, expect, it } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { tryOpenDesignerBatch } from '../../src/webview/openDesignerBatch';
import { initialState, reducer } from '../../src/webview/state/queryStore';
import { computeBatchTextSafe } from '../../src/webview/computeBatchText';

const V = 'Справочник.Валюты';
const gen = (text: string): string => {
  const opened = tryOpenDesignerBatch(text);
  if (!opened.ok) throw new Error(opened.error);
  return computeBatchTextSafe(reducer(initialState(), { type: 'LOAD_BATCH', doc: opened.doc }), true).text;
};
const passes = (text: string, n = 4): string[] => {
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(text = gen(text));
  return out;
};

// A CASE = CASE condition whose branches hold subqueries, laid out over several
// lines with the indentation of a deeper level than where it is placed.
const caseCondition = [
  'ВЫБОР',
  '\t\t\t\t\tКОГДА ИСТИНА В',
  '\t\t\t\t\t\t\t(ВЫБРАТЬ ПЕРВЫЕ 1',
  '\t\t\t\t\t\t\t\tИСТИНА',
  '\t\t\t\t\t\t\tИЗ',
  `\t\t\t\t\t\t\t\t${V} КАК З`,
  '\t\t\t\t\t\t\t\t\tВНУТРЕННЕЕ СОЕДИНЕНИЕ Справочник.Банки КАК Б',
  '\t\t\t\t\t\t\t\t\tПО',
  '\t\t\t\t\t\t\t\t\t\tЗ.Код = Г.Код',
  '\t\t\t\t\t\t\t\t\t\t\tИ Б.Код = З.Код)',
  '\t\t\t\t\t\tТОГДА ИСТИНА',
  '\t\t\t\t\tИНАЧЕ ЛОЖЬ',
  '\t\t\t\tКОНЕЦ = ВЫБОР',
  '\t\t\t\t\tКОГДА Г.Код = "1"',
  '\t\t\t\t\t\tТОГДА ИСТИНА',
  '\t\t\t\t\tИНАЧЕ ЛОЖЬ',
  '\t\t\t\tКОНЕЦ',
].join('\n');

describe('C22/C23 nested raw multiline text reopens stably', () => {
  it.each([
    ['C23 condition in a source subquery', `ВЫБРАТЬ П.А КАК А ИЗ (ВЫБРАТЬ Г.Код КАК А ИЗ ${V} КАК Г ГДЕ ${caseCondition}) КАК П`],
    ['C23 condition in a condition subquery', `ВЫБРАТЬ Х.Код КАК А ИЗ ${V} КАК Х ГДЕ ИСТИНА В (ВЫБРАТЬ ПЕРВЫЕ 1 ИСТИНА ИЗ ${V} КАК Г ГДЕ ${caseCondition})`],
    ['C23 two levels deep', `ВЫБРАТЬ Р.А КАК А ИЗ (ВЫБРАТЬ П.А КАК А ИЗ (ВЫБРАТЬ Г.Код КАК А ИЗ ${V} КАК Г ГДЕ ${caseCondition}) КАК П) КАК Р`],
    ['C22 TOTALS aggregate in a source subquery', `ВЫБРАТЬ П.А ИЗ (ВЫБРАТЬ Т.Код КАК А ИЗ ${V} КАК Т ИТОГИ СУММА(1\n+ 2) ПО ОБЩИЕ\n) КАК П`],
  ])('%s', (_name, input) => {
    const out = passes(input);
    expect(out[1]).toBe(out[0]);
    expect(out[3]).toBe(out[0]);
  });

  it('keeps a multiline string literal inside a nested raw condition verbatim', () => {
    const input = `ВЫБРАТЬ П.А КАК А ИЗ (ВЫБРАТЬ Г.Код КАК А ИЗ ${V} КАК Г ГДЕ ВЫБОР КОГДА Г.Код = "a\n\t\tb"\n\t\t\tТОГДА ИСТИНА ИНАЧЕ ЛОЖЬ КОНЕЦ = ИСТИНА) КАК П`;
    const out = passes(input);
    expect(out[0]).toContain('"a\n\t\tb"');
    expect(out[3]).toBe(out[0]);
  });

  it('leaves a top-level query unchanged', () => {
    const input = `ВЫБРАТЬ Г.Код КАК А ИЗ ${V} КАК Г ГДЕ ${caseCondition}`;
    expect(generateBatch(parseBatch(input, undefined, { preserveComments: true }))).toBe(
      generateBatch(parseBatch(generateBatch(parseBatch(input, undefined, { preserveComments: true })), undefined, { preserveComments: true })),
    );
  });
});
