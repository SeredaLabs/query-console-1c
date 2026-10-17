/**
 * C28: removing the redundant parentheses of `(МАКСИМУМ(Код)) + ВЫБОР …` left a
 * double space (`МАКСИМУМ(Код)  + ВЫБОР`) that the next Designer open collapsed,
 * so the first Apply differed from the second. A multi-line literal only routed
 * the expression to the CASE reflow; the space came from the parenthesis removal.
 */
import { describe, it, expect } from 'vitest';
import { reindentLeafCase } from '../../src/core/query/exprFormatter';
import { tryOpenDesignerBatch } from '../../src/webview/openDesignerBatch';
import { initialState, reducer } from '../../src/webview/state/queryStore';
import { computeBatchTextSafe } from '../../src/webview/computeBatchText';

const designer = (text: string): string => {
  const open = tryOpenDesignerBatch(text);
  if (!open.ok) throw new Error(open.error);
  return computeBatchTextSafe(reducer(initialState(), { type: 'LOAD_BATCH', doc: open.doc }), true).text;
};

describe('C28: a removed parenthesis leaves no double space', () => {
  it('the CASE reflow strips the wrap with one space', () => {
    expect(reindentLeafCase('(МАКСИМУМ(Код)) + ВЫБОР КОГДА Т.А = 1 ТОГДА 1 ИНАЧЕ 0 КОНЕЦ', 1).split('\n')[0])
      .toBe('МАКСИМУМ(Код) + ВЫБОР');
  });

  it.each([
    ['totals, aggregate first', 'ИТОГИ (МАКСИМУМ(Код)) + ВЫБОР КОГДА Т.Код = "а\nб" ТОГДА 1 ИНАЧЕ 0 КОНЕЦ КАК Код ПО ОБЩИЕ'],
    ['totals, aggregate last', 'ИТОГИ ВЫБОР КОГДА Т.Код = "а\nб" ТОГДА 1 ИНАЧЕ 0 КОНЕЦ - (СУММА(Т.Ч)) КАК Код ПО ОБЩИЕ'],
  ])('%s: the first Designer text is already stable', (_name, totals) => {
    const first = designer(`ВЫБРАТЬ Т.Код КАК Код, Т.Ч КАК Ч ИЗ Справочник.Валюты КАК Т ${totals}`);
    expect(first).not.toMatch(/ {2}/u);
    expect(designer(first)).toBe(first);
  });
});
