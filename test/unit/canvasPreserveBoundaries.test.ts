import { expect, it } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { findStaticApplyBlocker } from '../../src/webview/applyGate';
import { initialState, reducer } from '../../src/webview/state/queryStore';

it('known negated IN hierarchy with keyword alias В is safely blocked (C18)', () => {
  const input = 'ВЫБРАТЬ В.Код КАК Код ИЗ Справочник.Валюты КАК В ГДЕ НЕ В.Ссылка В ИЕРАРХИИ (ВЫБРАТЬ Б.Ссылка ИЗ Справочник.Банки КАК Б)';
  // The parser mistakes the alias for an IN operator and produces В.НЕ В
  // .Ссылка. Pin the protective gate; do not claim this input is preserved.
  const doc = parseBatch(input);
  expect(doc.members[0].members[0].model.conditions![0].expression).toBe('В.НЕ В .Ссылка В ИЕРАРХИИ (ВЫБРАТЬ Б.Ссылка ИЗ Справочник.Банки КАК Б)');
  expect(findStaticApplyBlocker(reducer(initialState(), { type: 'LOAD_BATCH', doc }))).toEqual({ kind: 'malformedCustom' });
});
