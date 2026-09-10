/**
 * Phase 3b of the semantic-core roadmap (memory: project-semantic-core-roadmap).
 *
 * These fixtures mirror the SAME raw SDBL text fed to a real 1C instance's
 * "Проверка" during Phase 2a's live verification (2026-09-10) — each `it`
 * name states the real compiler's actual verdict that `resolveAliasAt` must
 * stay consistent with, at the exact cursor position that verdict was about.
 */
import { describe, it, expect } from 'vitest';
import { buildSemanticSnapshotFromText } from '../../src/core/semantic/buildSemanticSnapshot';
import { resolveAliasAt } from '../../src/core/semantic/resolveAliasAt';

describe('resolveAliasAt', () => {
  it('resolves a simple single-source alias anywhere in the query', () => {
    const text = 'ВЫБРАТЬ Т.Код ИЗ Справочник.А КАК Т';
    const snapshot = buildSemanticSnapshotFromText(1, text);
    const pos = text.indexOf('Т.Код'); // inside the SELECT list
    const result = resolveAliasAt(snapshot, pos, 'Т');
    expect(result.kind).toBe('resolved');
    if (result.kind === 'resolved') expect(result.value.alias).toBe('Т');
  });

  it('returns unknown for an alias that never appears anywhere', () => {
    const text = 'ВЫБРАТЬ Т.Код ИЗ Справочник.А КАК Т';
    const snapshot = buildSemanticSnapshotFromText(1, text);
    const pos = text.indexOf('Т.Код');
    expect(resolveAliasAt(snapshot, pos, 'НетТакого')).toEqual({ kind: 'unknown' });
  });

  it('returns unknown for a non-complete snapshot (no trustworthy sourceMapEvents)', () => {
    const broken = 'ВЫБРАТЬ Т.Поле1 Т.Поле2 ИЗ Справочник.А КАК Т'; // missing comma -> recovered
    const snapshot = buildSemanticSnapshotFromText(1, broken);
    expect(snapshot.completeness).toBe('recovered');
    expect(resolveAliasAt(snapshot, 10, 'Т')).toEqual({ kind: 'unknown' });
  });

  it('returns unknown for a position outside any recorded statement', () => {
    const text = 'ВЫБРАТЬ Т.Код ИЗ Справочник.А КАК Т';
    const snapshot = buildSemanticSnapshotFromText(1, text);
    expect(resolveAliasAt(snapshot, text.length + 1000, 'Т')).toEqual({ kind: 'unknown' });
  });

  describe('flat JOIN chain (real 1C: bare field in the 2nd join\'s condition was "Ambiguous" between Т1/Т2)', () => {
    const text =
      'ВЫБРАТЬ Т1.Код КАК К1, Т2.Код КАК К2, Т3.Код КАК К3 ' +
      'ИЗ Справочник.А КАК Т1 ' +
      'ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Б КАК Т2 ПО Т1.Код = Т2.Код ' +
      'ЛЕВОЕ СОЕДИНЕНИЕ Справочник.В КАК Т3 ПО Т1.Код = Т3.Код';
    const snapshot = buildSemanticSnapshotFromText(1, text);
    const posInLastCond = text.lastIndexOf('Т1.Код'); // inside the 2nd join's own condition

    it('resolves Т1 (the chain seed) — visible per monotonic accumulation', () => {
      expect(resolveAliasAt(snapshot, posInLastCond, 'Т1').kind).toBe('resolved');
    });

    it('resolves Т2 (introduced by the EARLIER join) — visible to the later one', () => {
      expect(resolveAliasAt(snapshot, posInLastCond, 'Т2').kind).toBe('resolved');
    });

    it('resolves Т3 (this join\'s own target) too — self-reference is harmless', () => {
      expect(resolveAliasAt(snapshot, posInLastCond, 'Т3').kind).toBe('resolved');
    });
  });

  describe('flat JOIN chain: no forward reference (real 1C: "Field not found" when referencing a not-yet-introduced table)', () => {
    const text =
      'ВЫБРАТЬ Т1.Х ИЗ (ВЫБРАТЬ 1 КАК Х) КАК Т1 ' +
      'ЛЕВОЕ СОЕДИНЕНИЕ (ВЫБРАТЬ 1 КАК У) КАК Т2 ПО Т1.Х = Т2.У ' +
      'ЛЕВОЕ СОЕДИНЕНИЕ Справочник.В КАК Т3 ПО Т1.Х = Т3.Код';
    const snapshot = buildSemanticSnapshotFromText(1, text);
    const posInFirstCond = text.indexOf('Т1.Х = Т2.У');

    it('does NOT resolve Т3 from inside the FIRST join\'s condition — Т3 doesn\'t exist yet', () => {
      expect(resolveAliasAt(snapshot, posInFirstCond, 'Т3')).toEqual({ kind: 'unknown' });
    });

    it('still resolves Т1/Т2 from that same position', () => {
      expect(resolveAliasAt(snapshot, posInFirstCond, 'Т1').kind).toBe('resolved');
      expect(resolveAliasAt(snapshot, posInFirstCond, 'Т2').kind).toBe('resolved');
    });
  });

  describe('right-nested chain, INNER condition (real 1C: resolved cleanly — Т1 the outer seed is NOT a candidate there)', () => {
    const text =
      'ВЫБРАТЬ Т1.Х ИЗ (ВЫБРАТЬ 1 КАК Х) КАК Т1 ' +
      'ЛЕВОЕ СОЕДИНЕНИЕ (ВЫБРАТЬ 1 КАК Знач) КАК Т2 ' +
      'ЛЕВОЕ СОЕДИНЕНИЕ Справочник.В КАК Т3 ПО Знач = Т3.Код ' +
      'ПО Т1.Х = Т2.Знач';
    const snapshot = buildSemanticSnapshotFromText(1, text);
    const posInInnerCond = text.indexOf('Знач = Т3.Код');

    it('does NOT resolve Т1 (the outer seed) from inside the inner join\'s own condition', () => {
      expect(resolveAliasAt(snapshot, posInInnerCond, 'Т1')).toEqual({ kind: 'unknown' });
    });

    it('resolves Т2/Т3 (the inner sub-chain\'s own tables) from that same position', () => {
      expect(resolveAliasAt(snapshot, posInInnerCond, 'Т2').kind).toBe('resolved');
      expect(resolveAliasAt(snapshot, posInInnerCond, 'Т3').kind).toBe('resolved');
    });
  });

  describe('right-nested chain, OUTER condition (real 1C: "Ambiguous field" — outer condition sees the WHOLE nested sub-chain too)', () => {
    const text =
      'ВЫБРАТЬ Т1.Х ИЗ (ВЫБРАТЬ 1 КАК Х) КАК Т1 ' +
      'ЛЕВОЕ СОЕДИНЕНИЕ (ВЫБРАТЬ 1 КАК Знач) КАК Т2 ' +
      'ЛЕВОЕ СОЕДИНЕНИЕ Справочник.В КАК Т3 ПО Т2.Знач = Т3.Код ' +
      'ПО Т1.Х = Т2.Знач';
    const snapshot = buildSemanticSnapshotFromText(1, text);
    const posInOuterCond = text.lastIndexOf('Т1.Х = Т2.Знач');

    it('resolves Т1, Т2, AND Т3 from inside the OUTER join\'s own condition', () => {
      expect(resolveAliasAt(snapshot, posInOuterCond, 'Т1').kind).toBe('resolved');
      expect(resolveAliasAt(snapshot, posInOuterCond, 'Т2').kind).toBe('resolved');
      expect(resolveAliasAt(snapshot, posInOuterCond, 'Т3').kind).toBe('resolved');
    });
  });

  describe('correlated subquery (nearest-ancestor-wins correlation, Phase 2a finding 5) via a JOIN source subquery', () => {
    const text =
      'ВЫБРАТЬ Т1.Код ' +
      'ИЗ Справочник.А КАК Т1 ' +
      'ЛЕВОЕ СОЕДИНЕНИЕ (ВЫБРАТЬ Б.Код КАК Код ИЗ Справочник.Б КАК Б ГДЕ Б.Родитель = Т1.Ссылка) КАК П ' +
      'ПО Т1.Код = П.Код';
    const snapshot = buildSemanticSnapshotFromText(1, text);
    const posInSubquery = text.indexOf('Б.Родитель = Т1.Ссылка');

    it('resolves the LOCAL alias (Б) inside the subquery', () => {
      expect(resolveAliasAt(snapshot, posInSubquery, 'Б').kind).toBe('resolved');
    });

    it('resolves the OUTER alias (Т1) via correlation from inside the subquery', () => {
      expect(resolveAliasAt(snapshot, posInSubquery, 'Т1').kind).toBe('resolved');
    });

    it('does not resolve the subquery\'s own alias (П) from OUTSIDE it (in the outer join condition)', () => {
      const posOutside = text.lastIndexOf('Т1.Код = П.Код');
      // "П" itself is fine here (it's the join target being referenced), but a
      // made-up name local only to a DIFFERENT, unrelated subquery shouldn't be.
      expect(resolveAliasAt(snapshot, posOutside, 'П').kind).toBe('resolved');
      expect(resolveAliasAt(snapshot, posOutside, 'НеСуществующий')).toEqual({ kind: 'unknown' });
    });
  });

  describe('UNION member isolation (Phase 2a: hard isolation, no MCP-verified exception applies to bare aliases)', () => {
    const text =
      'ВЫБРАТЬ А.Код ИЗ Справочник.А КАК А ' +
      'ОБЪЕДИНИТЬ ВСЕ ВЫБРАТЬ Б.Код ИЗ Справочник.Б КАК Б';
    const snapshot = buildSemanticSnapshotFromText(1, text);
    const posInSecondMember = text.indexOf('Б.Код ИЗ');

    it('does not resolve the FIRST branch\'s alias (А) from within the SECOND branch', () => {
      expect(resolveAliasAt(snapshot, posInSecondMember, 'А')).toEqual({ kind: 'unknown' });
    });

    it('still resolves the second branch\'s own alias (Б) there', () => {
      expect(resolveAliasAt(snapshot, posInSecondMember, 'Б').kind).toBe('resolved');
    });
  });

  it('alias matching is case-insensitive', () => {
    const text = 'ВЫБРАТЬ Т.Код ИЗ Справочник.А КАК Т';
    const snapshot = buildSemanticSnapshotFromText(1, text);
    const pos = text.indexOf('Т.Код');
    expect(resolveAliasAt(snapshot, pos, 'т').kind).toBe('resolved');
  });
});
