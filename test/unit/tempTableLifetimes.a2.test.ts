import { describe, expect, it } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { deriveTempTableLifetimePositions, newestLifetimeAt } from '../../src/core/query/tempTableLifetimes';
import { deriveTempTableLifetimes, visibleTempTableAt } from '../../src/core/query/tempTableSemantics';
import { availableTempTables, availableTempTablesWithOrigin, initialState, reducer, derivePackageTempTableContinuity } from '../../src/webview/state/queryStore';

describe('A2 shared temp-table lifetimes', () => {
  it('keeps orphan operations separate, matches names case-insensitively and tracks independent creates', () => {
    const batch = parseBatch([
      'УНИЧТОЖИТЬ ВТ',
      'ВЫБРАТЬ 0 КАК Код ДОБАВИТЬ ВТ',
      'ВЫБРАТЬ 1 КАК Код ПОМЕСТИТЬ Вт',
      'ВЫБРАТЬ 2 КАК Код ДОБАВИТЬ вт',
      'УНИЧТОЖИТЬ ВТ',
      'ВЫБРАТЬ 3 КАК Новое ПОМЕСТИТЬ вТ',
      'ВЫБРАТЬ 4',
    ].join('; '));
    const list = deriveTempTableLifetimePositions(batch.members).get('ВТ')!;
    expect(list).toEqual([
      { name: 'Вт', createIndex: 2, appendIndices: [3], dropIndex: 4 },
      { name: 'вТ', createIndex: 5, appendIndices: [], dropIndex: null },
    ]);
    expect(Array.from({ length: 7 }, (_, i) => newestLifetimeAt(list, i)?.createIndex))
      .toEqual([undefined, undefined, undefined, 2, 2, undefined, 5]);
    expect(newestLifetimeAt(undefined, 0)).toBeUndefined();
  });

  it('does not revive a shadowed schema after an invalid repeated create and drop', () => {
    const batch = parseBatch('ВЫБРАТЬ 1 КАК Старое ПОМЕСТИТЬ ВТ; '
      + 'ВЫБРАТЬ 2 КАК Новое ПОМЕСТИТЬ ВТ; УНИЧТОЖИТЬ ВТ; ВЫБРАТЬ * ИЗ ВТ');
    const list = deriveTempTableLifetimePositions(batch.members).get('ВТ')!;
    expect(list.map(l => l.dropIndex)).toEqual([null, 2]);
    expect(newestLifetimeAt(list, 1)?.createIndex).toBe(0);
    expect(newestLifetimeAt(list, 2)?.createIndex).toBe(1);
    expect(newestLifetimeAt(list, 3)).toBeUndefined();
    // Recovery from invalid input must not invent a surviving older table.
    expect(visibleTempTableAt(deriveTempTableLifetimes(batch), 3, 'ВТ')).toBeUndefined();
    const state = reducer(reducer(initialState(), { type: 'LOAD_BATCH', doc: batch }), { type: 'SET_ACTIVE_BATCH', index: 3 });
    expect(availableTempTables(state)).toEqual([]);
    expect(availableTempTablesWithOrigin(state)).toEqual([]);
    expect(derivePackageTempTableContinuity(state).get(3)).toBeUndefined();
    // Match the existing parser registry: the wildcard stays unresolved.
    expect(batch.members[3].members[0].model.fields).toEqual([
      { tableId: '', path: '', expression: '*' },
    ]);
  });

  it('does not attach later orphan append/drop to a shadowed lifetime', () => {
    const batch = parseBatch([
      'ВЫБРАТЬ 1 КАК Старое ПОМЕСТИТЬ ВТ',
      'ВЫБРАТЬ 2 КАК Новое ПОМЕСТИТЬ вт',
      'УНИЧТОЖИТЬ ВТ',
      'ВЫБРАТЬ 3 КАК Код ДОБАВИТЬ Вт',
      'УНИЧТОЖИТЬ вт',
      'ВЫБРАТЬ 4 КАК Последнее ПОМЕСТИТЬ ВТ',
      'ВЫБРАТЬ ВТ.Последнее ИЗ ВТ',
    ].join('; '));
    const list = deriveTempTableLifetimePositions(batch.members).get('ВТ')!;
    expect(list.map(l => [l.createIndex, l.appendIndices, l.dropIndex])).toEqual([
      [0, [], null], [1, [], 2], [5, [], null],
    ]);
    expect(newestLifetimeAt(list, 5)).toBeUndefined();
    expect(newestLifetimeAt(list, 6)?.createIndex).toBe(5);
    const state = reducer(initialState(), { type: 'LOAD_BATCH', doc: batch });
    const relations = derivePackageTempTableContinuity(state);
    expect(relations.get(0)).toMatchObject([{ role: 'creates', relatedMembers: [] }]);
    expect(relations.get(3)).toBeUndefined();
    expect(relations.get(4)).toBeUndefined();
    expect(relations.get(6)).toContainEqual({ tempTableName: 'ВТ', role: 'consumes', relatedMembers: [5] });
  });

  it('gives Designer and semantics identical visibility and origin through a valid lifecycle', () => {
    const batch = parseBatch('ВЫБРАТЬ 1 КАК Старое ПОМЕСТИТЬ ВТ; '
      + 'ВЫБРАТЬ 2 КАК Старое ДОБАВИТЬ ВТ; УНИЧТОЖИТЬ ВТ; '
      + 'ВЫБРАТЬ 3 КАК Новое ПОМЕСТИТЬ ВТ; ВЫБРАТЬ ВТ.Новое ИЗ ВТ');
    const semantic = deriveTempTableLifetimes(batch);
    const expected = [undefined, ['Старое'], ['Старое'], undefined, ['Новое']];
    let state = reducer(initialState(), { type: 'LOAD_BATCH', doc: batch });
    for (let i = 0; i < batch.members.length; i++) {
      state = reducer(state, { type: 'SET_ACTIVE_BATCH', index: i });
      expect(availableTempTables(state)[0]?.fields.map(f => f.name)).toEqual(expected[i]);
      expect(visibleTempTableAt(semantic, i, 'вт')?.table.fields.map(f => f.name)).toEqual(expected[i]);
      expect(availableTempTablesWithOrigin(state)[0]?.createdAt).toBe([undefined, 0, 0, undefined, 3][i]);
    }
  });

  it('does not attach later appends to earlier consumers', () => {
    const batch = parseBatch('ВЫБРАТЬ 1 КАК Код ПОМЕСТИТЬ ВТ; ВЫБРАТЬ ВТ.Код ИЗ ВТ; '
      + 'ВЫБРАТЬ 2 КАК Код ДОБАВИТЬ ВТ; ВЫБРАТЬ ВТ.Код ИЗ ВТ; УНИЧТОЖИТЬ ВТ');
    const relations = derivePackageTempTableContinuity(reducer(initialState(), { type: 'LOAD_BATCH', doc: batch }));
    expect(relations.get(1)).toContainEqual({ tempTableName: 'ВТ', role: 'consumes', relatedMembers: [0] });
    expect(relations.get(3)).toContainEqual({ tempTableName: 'ВТ', role: 'consumes', relatedMembers: [0, 2] });
    expect(relations.get(4)).toContainEqual({ tempTableName: 'ВТ', role: 'drops', relatedMembers: [0, 2] });
  });
});
