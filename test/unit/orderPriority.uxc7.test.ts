import { expect, it } from 'vitest';
import { initialState, reducer, assembleBatch } from '../../src/webview/state/queryStore';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { dispatchCompoundSection, compoundSections } from '../../src/webview/compoundSections';

it('moves whole ORDER entries by position, preserving duplicate refs and section metadata', () => {
  const state = initialState();
  state.order = { auto: true, commentLeading: ['// keep'], fields: [
    { tableId: 't', path: 'Код', direction: 'desc', hierarchy: true, qualified: true },
    { tableId: 't', path: 'Код', direction: 'asc', selectAlias: 'Второй' },
    { tableId: '', path: '', direction: 'desc', expression: '&Порядок' },
  ] };
  const before = structuredClone(state);
  const moved = reducer(state, { type: 'MOVE_ORDER_FIELD', fieldIdx: 1, direction: 'up' });
  expect(moved.order.fields).toEqual([state.order.fields[1], state.order.fields[0], state.order.fields[2]]);
  expect(moved.order.fields[1]).toBe(state.order.fields[0]);
  expect(moved.order.auto).toBe(true);
  expect(moved.order.commentLeading).toBe(state.order.commentLeading);
  expect(state).toEqual(before);
  expect(reducer(moved, { type: 'MOVE_ORDER_FIELD', fieldIdx: 0, direction: 'down' })).toEqual(state);
});

it('out-of-range and edge moves are no-ops', () => {
  const state = initialState();
  state.order.fields = [{ tableId: 't', path: 'Код', direction: 'asc' }];
  for (const fieldIdx of [-1, 0, 1, NaN, 0.5]) for (const direction of ['up', 'down'] as const) {
    expect(reducer(state, { type: 'MOVE_ORDER_FIELD', fieldIdx, direction })).toBe(state);
  }
  expect(reducer(initialState(), { type: 'MOVE_ORDER_FIELD', fieldIdx: 0, direction: 'down' })).toEqual(initialState());
});

it('moves UNION tail keys without changing its member or other sections; save/reopen retains order', () => {
  const input = 'ВЫБРАТЬ 1 КАК А, 2 КАК Б ОБЪЕДИНИТЬ ВСЕ ВЫБРАТЬ 3, 4 УПОРЯДОЧИТЬ ПО // keep\nА УБЫВ, Б АВТОУПОРЯДОЧИВАНИЕ';
  let state = reducer(initialState(), { type: 'LOAD_BATCH', doc: parseBatch(input, undefined, { preserveComments: true }) });
  const before = assembleBatch(state);
  const keys = compoundSections(state).last.order!.fields;
  dispatchCompoundSection(state, action => { state = reducer(state, action); }, { type: 'MOVE_ORDER_FIELD', fieldIdx: 1, direction: 'up' });
  expect(state.activeQuery).toBe(0);
  const after = assembleBatch(state);
  expect(after.members[0].members[0]).toEqual(before.members[0].members[0]);
  expect(compoundSections(state).last.order!.fields).toEqual([keys[1], keys[0]]);
  const output = generateBatch(after);
  expect(output).toContain('УПОРЯДОЧИТЬ ПО\n\t// keep\n\tБ,\n\tА УБЫВ');
  expect(output).toContain('АВТОУПОРЯДОЧИВАНИЕ');
  expect(generateBatch(parseBatch(output, undefined, { preserveComments: true }))).toBe(output);
});
