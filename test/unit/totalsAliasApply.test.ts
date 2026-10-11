/**
 * The malformed-expression Apply check got an ИТОГИ aggregate together with its kept
 * alias (`ВЫБОР … КОНЕЦ КАК Код`) and rejected it for the `КАК`, so Apply was blocked
 * for a platform-valid query (СхемаЗапроса, SL_kza 2026-10-11, keeps the alias). The
 * block was hidden whenever a literal contained `%`/`@`/`#`, which used to switch the
 * check off (R7). The trailing top-level alias is no longer part of the checked text.
 */
import { describe, it, expect } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { findMalformedCustomExpressions } from '../../src/core/query/semanticValidator';
import { tryOpenDesignerBatch } from '../../src/webview/openDesignerBatch';
import { initialState, reducer } from '../../src/webview/state/queryStore';
import { computeBatchTextSafe } from '../../src/webview/computeBatchText';
import { decideApply, findStaticApplyBlocker } from '../../src/webview/applyGate';

const Q = (total: string): string =>
  `ВЫБРАТЬ Т.Код КАК Код, Т.Наименование КАК Наименование, Т.Ссылка КАК Ссылка ИЗ Справочник.Валюты КАК Т\nИТОГИ\n\t${total}\nПО\n\tСсылка`;

function applyOk(text: string): boolean {
  const open = tryOpenDesignerBatch(text);
  if (!open.ok) throw new Error(open.error);
  const state = reducer(initialState(), { type: 'LOAD_BATCH', doc: open.doc });
  const out = computeBatchTextSafe(state, true);
  return decideApply(out.text, out.error, findStaticApplyBlocker(state), undefined).ok;
}

describe('ИТОГИ aggregate alias does not block Apply', () => {
  it.each(['"x"', '"КОНЕЦ"', '"/ @"', '"50%"'])('CASE aggregate with alias, literal %s', literal => {
    const text = Q(`ВЫБОР КОГДА МАКСИМУМ(Наименование) = ${literal} ТОГДА 1 ИНАЧЕ 0 КОНЕЦ КАК Код`);
    expect(findMalformedCustomExpressions(parseBatch(text))).toEqual([]);
    expect(applyOk(text)).toBe(true);
  });

  it('a malformed aggregate with an alias is still reported', () => {
    const text = Q('ВЫБОР КОГДА МАКСИМУМ(Наименование) = ТОГДА 1 КОНЕЦ КАК Код');
    expect(findMalformedCustomExpressions(parseBatch(text)).map(h => h.kind)).toContain('totalField');
  });
});
