/**
 * Phase 2b of the semantic-core roadmap (memory: project-semantic-core-roadmap).
 *
 * These fixtures mirror EXACTLY the raw SDBL text fed to a real 1C instance's
 * "Проверка" (compile-check) during Phase 2a's live verification session
 * (2026-09-10) — each `it` name states the real compiler's actual verdict
 * (ambiguous / field not found / resolved) that `computeJoinVisibility`'s
 * output must be consistent with. This is the regression lock-in for that
 * live session, per this project's "verify against real behavior, then lock
 * it in as a fixture" discipline.
 */
import { describe, it, expect } from 'vitest';
import { parseQuery } from '../../src/core/query/sdblParser';
import { computeJoinVisibility } from '../../src/core/semantic/joinVisibility';

describe('computeJoinVisibility', () => {
  it('returns an empty map when the query has no joins', () => {
    const model = parseQuery('ВЫБРАТЬ Т1.Код ИЗ Справочник.Номенклатура КАК Т1');
    expect(computeJoinVisibility(model).size).toBe(0);
  });

  it('flat chain: the 3rd join sees the chain seed and every earlier table (real 1C: "Ambiguous field Код" between Т1/Т2)', () => {
    const model = parseQuery(
      'ВЫБРАТЬ Т1.Код КАК Код1, Т2.Код КАК Код2, Т3.Код КАК Код3 ' +
        'ИЗ Справочник.Номенклатура КАК Т1 ' +
        'ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Номенклатура КАК Т2 ПО Т1.Код = Т2.Код ' +
        'ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Номенклатура КАК Т3 ПО Т1.Код = Т3.Код',
    );
    const visibility = computeJoinVisibility(model);
    expect(model.joins).toHaveLength(2);
    const [join12, join13] = model.joins!;
    expect(visibility.get(join12)).toEqual(new Set(['t0', 't1']));
    // The 3rd join (T1-T3) sees T1 AND T2 (the earlier join's table) — matches
    // real 1C reporting "Код" ambiguous when written bare there.
    expect(visibility.get(join13)).toEqual(new Set(['t0', 't1', 't2']));
  });

  it('flat chain: an EARLIER join never sees a table introduced by a LATER one (real 1C: "Field not found" for a forward reference)', () => {
    const model = parseQuery(
      'ВЫБРАТЬ Т1.Х ИЗ (ВЫБРАТЬ 1 КАК Х) КАК Т1 ' +
        'ЛЕВОЕ СОЕДИНЕНИЕ (ВЫБРАТЬ 1 КАК У) КАК Т2 ПО Т1.Х = Т2.У ' +
        'ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Номенклатура КАК Т3 ПО Т1.Х = Т3.Код',
    );
    const visibility = computeJoinVisibility(model);
    const [join12] = model.joins!;
    // T3 must NOT appear in the first join's visible set — it doesn't exist yet.
    expect(visibility.get(join12)).toEqual(new Set(['t0', 't1']));
  });

  it('right-nested chain: the INNER join\'s own condition sees only its own sub-chain, NOT the outer seed (real 1C: resolves cleanly, no ambiguity)', () => {
    const model = parseQuery(
      'ВЫБРАТЬ Т1.Х ИЗ (ВЫБРАТЬ 1 КАК Х) КАК Т1 ' +
        'ЛЕВОЕ СОЕДИНЕНИЕ (ВЫБРАТЬ 1 КАК Знач) КАК Т2 ' +
        'ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Номенклатура КАК Т3 ПО Знач = Т3.Код ' +
        'ПО Т1.Х = Т2.Знач',
    );
    const visibility = computeJoinVisibility(model);
    expect(model.joins).toHaveLength(2);
    const inner = model.joins!.find((j) => (j.depth ?? 0) > 0)!;
    const outer = model.joins!.find((j) => (j.depth ?? 0) === 0)!;
    expect(inner).toBeDefined();
    expect(outer).toBeDefined();
    // Inner (T2-T3) condition: only {T2, T3} — T1 excluded.
    expect(visibility.get(inner)).toEqual(new Set(['t1', 't2']));
  });

  it('right-nested chain: the OUTER join\'s own condition sees the outer seed AND the whole (already-closed) inner sub-chain (real 1C: "Ambiguous field" between the seed and the nested table)', () => {
    const model = parseQuery(
      'ВЫБРАТЬ Т1.Х ИЗ (ВЫБРАТЬ 1 КАК Х) КАК Т1 ' +
        'ЛЕВОЕ СОЕДИНЕНИЕ (ВЫБРАТЬ 1 КАК Знач) КАК Т2 ' +
        'ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Номенклатура КАК Т3 ПО Т2.Знач = Т3.Код ' +
        'ПО Т1.Х = Т2.Знач',
    );
    const visibility = computeJoinVisibility(model);
    const outer = model.joins!.find((j) => (j.depth ?? 0) === 0)!;
    // Outer (T1-(T2,T3)) condition: everything — {T1, T2, T3}.
    expect(visibility.get(outer)).toEqual(new Set(['t0', 't1', 't2']));
  });

  it('falls back to "every table visible" for disconnected (comma-separated) FROM sources — matches the existing flat behavior, not yet improved', () => {
    const model = parseQuery(
      'ВЫБРАТЬ Т1.Код ИЗ Справочник.Номенклатура КАК Т1, Справочник.Номенклатура КАК Т2 ' +
        'ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Номенклатура КАК Т3 ПО Т2.Код = Т3.Код',
    );
    const visibility = computeJoinVisibility(model);
    const [join] = model.joins!;
    expect(visibility.get(join)).toEqual(new Set(['t0', 't1', 't2']));
  });

  it('a self-join (same metadata table, two aliases) still tracks each table instance by its own distinct id', () => {
    const model = parseQuery(
      'ВЫБРАТЬ А.Код ИЗ Справочник.Номенклатура КАК А ' +
        'ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Номенклатура КАК Б ПО А.Код = Б.Код',
    );
    const visibility = computeJoinVisibility(model);
    const [join] = model.joins!;
    expect(visibility.get(join)).toEqual(new Set(['t0', 't1']));
  });
});
