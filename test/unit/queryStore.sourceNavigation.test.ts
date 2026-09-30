import { expect, it } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { initialState, reducer } from '../../src/webview/state/queryStore';

for (const kind of ['subquery', 'temp'] as const) it(`${kind}: an unchanged exported column retains navigation fields on update (C19)`, () => {
  const input = kind === 'subquery'
    ? 'ВЫБРАТЬ П.Ссылка.Код КАК Код ИЗ (ВЫБРАТЬ В.Ссылка КАК Ссылка ИЗ Справочник.Валюты КАК В) КАК П'
    : 'ВЫБРАТЬ П.Ссылка.Код КАК Код ИЗ ВнешняяВТ КАК П';
  const state = reducer(initialState(), { type: 'LOAD_BATCH', doc: parseBatch(input) });
  expect(state.selectedFields[0].path).toBe('Ссылка.Код');
  const table = state.selectedTables[0];
  const next = reducer(state, kind === 'subquery'
    ? { type: 'UPDATE_SUBQUERY_TABLE', tableId: table.id, subquery: table.subquery!, columns: ['Ссылка'] }
    : { type: 'UPDATE_TEMP_TABLE', tableId: table.id, name: table.fullName, fields: [{ name: 'Ссылка' }] });
  expect(next.selectedFields).toEqual(state.selectedFields);
});
