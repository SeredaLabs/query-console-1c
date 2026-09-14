import { describe, expect, it } from 'vitest';
import type { Join, SelectedTable } from '../../src/core/query/queryModel';
import { computeAutoLayout } from '../../src/webview-canvas/structure/layout';

function table(id: string, fullName = `Довідник.${id}`): SelectedTable {
  return { id, fullName };
}

function join(leftTableId: string, rightTableId: string): Join {
  return { leftTableId, rightTableId, leftAll: false, rightAll: false, custom: false, operator: '=' };
}

describe('webview-canvas structure/layout: computeAutoLayout', () => {
  it('не рахує позицію для tableId, що вже є в existingPositions', () => {
    const tables = [table('t1')];
    const existing = { t1: { x: 999, y: 999 } };
    const patch = computeAutoLayout(tables, [], existing);
    expect(patch).toEqual({});
  });

  it('таблиці без жодного зв\'язку розкладаються сіткою без накладання', () => {
    const tables = [table('t1'), table('t2'), table('t3')];
    const patch = computeAutoLayout(tables, [], {});
    expect(Object.keys(patch).sort()).toEqual(['t1', 't2', 't3']);
    // Жодні дві картки не мають однакової позиції.
    const positions = Object.values(patch);
    const unique = new Set(positions.map(p => `${p.x},${p.y}`));
    expect(unique.size).toBe(positions.length);
  });

  it('з\'єднані join\'ом таблиці лягають у різні BFS-шари (різний Y)', () => {
    const tables = [table('t1'), table('t2')];
    const joins = [join('t1', 't2')];
    const patch = computeAutoLayout(tables, joins, {});
    expect(patch.t1.y).not.toBe(patch.t2.y);
    // Той самий шар (жоден інший вузол на ньому) — X може збігатися, Y — ні.
    expect(patch.t1.x).toBe(patch.t2.x);
  });

  it('вже розташовані (existingPositions) картки НЕ повертаються в патчі, нові — так', () => {
    const tables = [table('t1'), table('t2')];
    const existing = { t1: { x: 10, y: 10 } };
    const patch = computeAutoLayout(tables, [join('t1', 't2')], existing);
    expect(patch).not.toHaveProperty('t1');
    expect(patch).toHaveProperty('t2');
  });

  it('порожній вхід (усі таблиці вже мають позицію) повертає порожній патч', () => {
    const tables = [table('t1')];
    const patch = computeAutoLayout(tables, [], { t1: { x: 0, y: 0 } });
    expect(patch).toEqual({});
  });
});
