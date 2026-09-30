/**
 * Classic ↔ Canvas switching hands the current model to the other UI as its
 * generated text. It is allowed only when that text reopens through the same
 * designer-open gate; otherwise the current UI keeps its state.
 */
import { describe, it, expect } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { initialState, reducer } from '../../src/webview/state/queryStore';
import { computeBatchTextSafe } from '../../src/webview/computeBatchText';
import { tryOpenDesignerBatch } from '../../src/webview/openDesignerBatch';
import { prepareDesignerSwitch } from '../../src/webview/designerSwitch';
import { setLocale } from '../../src/webview/i18n';

const load = (text: string) => reducer(initialState(), { type: 'LOAD_BATCH', doc: parseBatch(text, undefined, { preserveComments: true }) });

describe('prepareDesignerSwitch', () => {
  it('an empty designer switches with empty text', () => {
    expect(prepareDesignerSwitch(initialState(), undefined)).toEqual({ ok: true, text: '' });
  });

  it('carries the current model as its generated text, comments included', () => {
    const state = load('// до запиту\nВЫБРАТЬ Т.Код КАК Код, // хвіст\nТ.Наименование КАК Имя ИЗ Справочник.Валюты КАК Т ГДЕ Т.Код = &К УПОРЯДОЧИТЬ ПО Код');
    const prepared = prepareDesignerSwitch(state, undefined);
    expect(prepared).toEqual({ ok: true, text: computeBatchTextSafe(state, true).text });
    if (!prepared.ok) return;
    expect(prepared.text).toContain('// до запиту');
    expect(prepared.text).toContain('// хвіст');
    // The other UI opens it without a comment-loss confirmation and regenerates it unchanged.
    const reopened = tryOpenDesignerBatch(prepared.text);
    expect(reopened.ok).toBe(true);
    if (reopened.ok) expect(computeBatchTextSafe(reducer(initialState(), { type: 'LOAD_BATCH', doc: reopened.doc }), true).text).toBe(prepared.text);
  });

  it('refuses a model whose text would not reopen, with a localized reason', () => {
    try {
      setLocale('uk');
      const loaded = load('ВЫБРАТЬ Т.Код КАК Код, Т.Наименование КАК Имя ИЗ Справочник.Валюты КАК Т');
      const state = reducer(loaded, { type: 'SET_FIELD_ALIAS', fieldIdx: 1, alias: 'Код' });
      const prepared = prepareDesignerSwitch(state, undefined);
      expect(prepared.ok).toBe(false);
      if (!prepared.ok) expect(prepared.error).toMatch(/^Неможливо перемкнути режим конструктора: /);
    } finally {
      setLocale('en');
    }
  });
});
