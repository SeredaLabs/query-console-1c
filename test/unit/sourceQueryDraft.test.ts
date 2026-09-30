import { describe, expect, it } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { finishSourceQueryDraft, sourceQueryDraft } from '../../src/webview/sourceQueryDraft';
import { reducer } from '../../src/webview/state/queryStore';

describe('source query draft uses the shared model and Apply gate', () => {
  const text = 'ВЫБРАТЬ П.Код ИЗ (ВЫБРАТЬ В.Код КАК Код ИЗ Справочник.Валюты КАК В ГДЕ В.Код = &Код) КАК П';
  it('initialization and a cancelled recursive edit never mutate the parent tree', () => {
    const doc = parseBatch(text).members[0];
    const before = structuredClone(doc);
    const draft = sourceQueryDraft(doc);
    const source = draft.selectedTables[0];
    let child = sourceQueryDraft(source.subquery);
    child = reducer(child, { type: 'SET_FIELD_ALIAS', fieldIdx: 0, alias: 'Черновик' });
    expect(doc).toEqual(before);
    expect(draft.selectedTables[0].subquery!.members[0].model.fields[0].alias).toBe('Код');
  });
  it('returns the edited nested UNION with preserved HAVING and ORDER hierarchy', () => {
    const input = 'ВЫБРАТЬ В.Код КАК Код ИЗ Справочник.Валюты КАК В СГРУППИРОВАТЬ ПО В.Код ИМЕЮЩИЕ В.Код <> "" ОБЪЕДИНИТЬ ВСЕ ВЫБРАТЬ Б.Код ИЗ Справочник.Валюты КАК Б УПОРЯДОЧИТЬ ПО Код ИЕРАРХИЯ';
    let draft = sourceQueryDraft(parseBatch(input).members[0]);
    draft = reducer(draft, { type: 'SET_SELECTION_ALLOWED', allowed: true });
    const result = finishSourceQueryDraft(draft);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('valid draft refused');
    const output = generateBatch({ members: [result.doc] });
    expect(output).toContain('РАЗРЕШЕННЫЕ');
    expect(output).toContain('ИМЕЮЩИЕ');
    expect(output).toContain('ИЕРАРХИЯ');
    expect(result.doc.members).toHaveLength(2);
  });
  it('refuses malformed edits, duplicate aliases, temp operations and packages', () => {
    let state = sourceQueryDraft(parseBatch('ВЫБРАТЬ 1 КАК А, 2 КАК Б').members[0]);
    state = reducer(state, { type: 'SET_FIELD_EXPRESSION', fieldIdx: 0, expression: '1 +' });
    expect(finishSourceQueryDraft(state).ok).toBe(false);
    state = reducer(state, { type: 'SET_FIELD_EXPRESSION', fieldIdx: 0, expression: '1' });
    state = reducer(state, { type: 'SET_FIELD_ALIAS', fieldIdx: 1, alias: 'А' });
    expect(finishSourceQueryDraft(state).ok).toBe(false);
    state = reducer(state, { type: 'SET_FIELD_ALIAS', fieldIdx: 1, alias: 'Б' });
    expect(finishSourceQueryDraft(state).ok).toBe(true);
    expect(finishSourceQueryDraft(reducer(state, { type: 'SET_QUERY_TYPE', queryType: 'createTemp' })).ok).toBe(false);
    expect(finishSourceQueryDraft(reducer(state, { type: 'ADD_BATCH_QUERY' })).ok).toBe(false);
  });
});
