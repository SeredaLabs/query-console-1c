import { describe, expect, it } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { assembleBatch, initialState, modelToFlat, reducer, restoreSaved } from '../../src/webview/state/queryStore';
import { computeBatchTextSafe } from '../../src/webview/computeBatchText';
import { decideApply, findStaticApplyBlocker } from '../../src/webview/applyGate';

const query = (value: number) => `ВЫБРАТЬ В.Код КАК Код ИЗ Справочник.Валюты КАК В СГРУППИРОВАТЬ ПО В.Код ИМЕЮЩИЕ В.Код > ${value}`;
const load = (text: string) => reducer(initialState(), { type: 'LOAD_BATCH', doc: parseBatch(text) });

describe('C9: HAVING survives the flat store', () => {
  it.each([
    query(0),
    'ВЫБРАТЬ КОЛИЧЕСТВО(*) КАК Число ИЗ Справочник.Валюты КАК В ИМЕЮЩИЕ КОЛИЧЕСТВО(*) > 1',
    query(0) + ' И В.Код В (ВЫБРАТЬ Б.Код ИЗ Справочник.Валюты КАК Б)',
  ])('load/assemble/reopen preserves %s', text => {
    const doc = parseBatch(text);
    const output = generateBatch(assembleBatch(load(text)));
    expect(output).toBe(generateBatch(doc));
    expect(generateBatch(assembleBatch(load(output)))).toBe(output);
  });

  it('retains HAVING during an unrelated field-alias edit and allows Apply', () => {
    const doc = parseBatch(query(0));
    const state = reducer(load(query(0)), { type: 'SET_FIELD_ALIAS', fieldIdx: 0, alias: 'НовыйКод' });
    const assembled = assembleBatch(state);
    expect(assembled.members[0].members[0].model.having).toEqual(doc.members[0].members[0].model.having);
    const preview = computeBatchTextSafe(state, true);
    expect(preview.text).toContain('ИМЕЮЩИЕ');
    expect(preview.text).toContain('НовыйКод');
    expect(decideApply(preview.text, preview.error, findStaticApplyBlocker(state), undefined)).toEqual({ ok: true });
  });

  it('keeps separate HAVING conditions across UNION members and batch switches', () => {
    const text = query(1) + ' ОБЪЕДИНИТЬ ВСЕ ' + query(2) + '; ' + query(3);
    let state = load(text);
    state = reducer(state, { type: 'SET_ACTIVE_QUERY', index: 1 });
    state = reducer(state, { type: 'SET_ACTIVE_BATCH', index: 1 });
    state = reducer(state, { type: 'SET_ACTIVE_BATCH', index: 0 });
    state = reducer(state, { type: 'SET_ACTIVE_QUERY', index: 0 });
    expect(generateBatch(assembleBatch(state))).toBe(generateBatch(parseBatch(text)));
  });

  it.each(['ADD_QUERY', 'ADD_BATCH_QUERY'] as const)('%s starts without a previous HAVING', type => {
    let state = load(query(7));
    state = reducer(state, { type });
    const assembled = assembleBatch(state);
    expect(assembled.members[0].members[0].model.having).toEqual(parseBatch(query(7)).members[0].members[0].model.having);
    const active = type === 'ADD_QUERY' ? assembled.members[0].members[1] : assembled.members[1].members[0];
    expect(active.model.having).toBeUndefined();
  });

  it('loading a query without HAVING clears the previous condition', () => {
    const state = reducer(load(query(7)), { type: 'LOAD_BATCH', doc: parseBatch('ВЫБРАТЬ 1 КАК Число') });
    expect(assembleBatch(state).members[0].members[0].model.having).toBeUndefined();
  });

  it('restores an older snapshot without HAVING and clears the active value', () => {
    const state = load(query(7));
    const older = modelToFlat(parseBatch(query(0)).members[0].members[0].model);
    delete older.having;
    const restored = { ...state, ...restoreSaved(state, older) };
    expect(assembleBatch(restored).members[0].members[0].model.having).toBeUndefined();
  });

  it('retains malformed HAVING so Apply remains blocked', () => {
    const doc = parseBatch(query(0));
    doc.members[0].members[0].model.having = [{ custom: true, expression: 'В.Код = &' }];
    const state = reducer(initialState(), { type: 'LOAD_BATCH', doc });
    const preview = computeBatchTextSafe(state, true);
    expect(preview.error).toBeNull();
    expect(preview.text).toContain('В.Код = &');
    expect(findStaticApplyBlocker(state)).toEqual({ kind: 'malformedCustom' });
    expect(decideApply(preview.text, preview.error, findStaticApplyBlocker(state), undefined)).toEqual({ ok: false, kind: 'blocked' });
  });
});
