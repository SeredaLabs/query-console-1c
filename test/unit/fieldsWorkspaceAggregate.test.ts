/**
 * Regression lock-in for a bug found via live QA (2026-09-18) right after
 * shipping New Builder Phase 7 (Fields Workspace): setting a per-field
 * aggregate through `SET_FIELD_FUNC` produced `СУММА(Табл.Поле)` with NO
 * `КАК` alias in the generated SDBL — because the reducer set `func` but not
 * `funcOperandQualified`, and `buildFieldLines` (sdblGenerator.ts) only
 * synthesizes an auto-alias for a qualified-operand aggregate when that flag
 * is set (it mirrors what the parser sets for `tryAggregate`'s qualified
 * case — see sdblParser.ts `operandQualified`).
 */
import { describe, it, expect } from 'vitest';
import { reducer, initialState, assembleBatch } from '../../src/webview/state/queryStore';
import type { QueryState } from '../../src/webview/state/queryStore';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import type { MetaTable } from '../../src/core/metadata/types';

const автомобили: MetaTable = {
  kind: 'Справочник',
  name: 'Автомобили',
  fullName: 'Справочник.Автомобили',
  fields: [
    { name: 'Ссылка', kind: 'standard', types: [] },
    { name: 'Расстояние', kind: 'attribute', types: [{ primitive: 'Число' }] },
  ],
};

function withOneField(): { state: QueryState; tableId: string } {
  let s = initialState();
  s = reducer(s, { type: 'SET_METADATA', tables: [автомобили] });
  s = reducer(s, { type: 'ADD_TABLE', table: автомобили });
  const tableId = s.selectedTables[0].id;
  s = reducer(s, { type: 'ADD_FIELD', tableId, fieldPath: 'Расстояние' });
  return { state: s, tableId };
}

describe('SET_FIELD_FUNC — per-field aggregate on the Fields Workspace', () => {
  it('sets funcOperandQualified alongside func', () => {
    const { state } = withOneField();
    const next = reducer(state, { type: 'SET_FIELD_FUNC', fieldIdx: 0, func: 'Сумма' });
    expect(next.selectedFields[0].func).toBe('Сумма');
    expect(next.selectedFields[0].funcOperandQualified).toBe(true);
  });

  it('clears funcOperandQualified when the aggregate is removed', () => {
    const { state } = withOneField();
    let next = reducer(state, { type: 'SET_FIELD_FUNC', fieldIdx: 0, func: 'Сумма' });
    next = reducer(next, { type: 'SET_FIELD_FUNC', fieldIdx: 0, func: undefined });
    expect(next.selectedFields[0].func).toBeUndefined();
    expect(next.selectedFields[0].funcOperandQualified).toBeUndefined();
  });

  it('generates an auto-alias for the aggregate (СУММА(...) КАК ...), not a bare expression', () => {
    const { state } = withOneField();
    const next = reducer(state, { type: 'SET_FIELD_FUNC', fieldIdx: 0, func: 'Сумма' });
    const text = generateBatch(assembleBatch(next));
    expect(text).toMatch(/СУММА\(Автомобили\.Расстояние\)\s+КАК\s+\S+/);
  });

  it('an expression whose field IS already a grouped plain field needs no separate GROUP BY entry (SQL functional dependency — matches 1C)', () => {
    let s = initialState();
    s = reducer(s, { type: 'SET_METADATA', tables: [автомобили] });
    s = reducer(s, { type: 'ADD_TABLE', table: автомобили });
    const tableId = s.selectedTables[0].id;
    s = reducer(s, { type: 'ADD_FIELD', tableId, fieldPath: 'Ссылка' });
    s = reducer(s, { type: 'ADD_FIELD', tableId, fieldPath: 'Расстояние' });
    s = reducer(s, { type: 'ADD_EXPRESSION_FIELD', tableId, expression: 'ЕСТЬNULL(Автомобили.Расстояние, 0)' });
    s = reducer(s, { type: 'SET_FIELD_FUNC', fieldIdx: 0, func: 'Количество' });

    const text = generateBatch(assembleBatch(s));
    // Розстояння вже саме є ключем групування — вираз над ним валідний без
    // окремого запису (SQL functional dependency), генератор сам це вирішує
    // (analyzeGroupExpr/appendMissingGroupRefs) — не дублюємо цю логіку в reducer.
    expect(text).toMatch(/СГРУППИРОВАТЬ ПО[\s\S]*Автомобили\.Расстояние/);
  });

  it('groups an arbitrary expression even when it is the ONLY non-aggregate field (fixed 2026-09-18)', () => {
    // Питання користувача: "а як система знає по яких саме полях групувати,
    // якщо там будуть довільні вирази" — SET_FIELD_FUNC тепер додає в
    // groupFields і прості поля, і довільні вирази (FieldRef{expression}).
    let s = initialState();
    s = reducer(s, { type: 'SET_METADATA', tables: [автомобили] });
    s = reducer(s, { type: 'ADD_TABLE', table: автомобили });
    const tableId = s.selectedTables[0].id;
    s = reducer(s, { type: 'ADD_FIELD', tableId, fieldPath: 'Ссылка' });
    s = reducer(s, { type: 'ADD_EXPRESSION_FIELD', tableId, expression: 'ЕСТЬNULL(Автомобили.Расстояние, 0)' });
    s = reducer(s, { type: 'SET_FIELD_FUNC', fieldIdx: 0, func: 'Количество' });

    expect(s.grouping.groupFields).toEqual([{ tableId: '', path: '', expression: 'ЕСТЬNULL(Автомобили.Расстояние, 0)' }]);
    const text = generateBatch(assembleBatch(s));
    expect(text).toMatch(/СГРУППИРОВАТЬ ПО[\s\S]*ЕСТЬNULL\(Автомобили\.Расстояние, 0\)/);
  });
});
