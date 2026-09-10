/**
 * Phase 1c of the semantic-core roadmap (memory: project-semantic-core-roadmap).
 * `buildSemanticSnapshotFromText` is the tolerant entry point: it must NEVER
 * throw, and must report the right `SemanticCompleteness` for each of the three
 * strategies it tries (complete → recovered → unavailable).
 */
import { describe, it, expect } from 'vitest';
import { buildSemanticSnapshotFromText } from '../../src/core/semantic/buildSemanticSnapshot';

describe('buildSemanticSnapshotFromText', () => {
  it("a cleanly-parseable query yields completeness 'complete' with the real model", () => {
    const snapshot = buildSemanticSnapshotFromText(1, 'ВЫБРАТЬ Т.Поле ИЗ Справочник.Валюты КАК Т');
    expect(snapshot.completeness).toBe('complete');
    expect(snapshot.model.members[0].members[0].model.tables[0].alias).toBe('Т');
  });

  it("a 'complete' snapshot carries real, absolute sourceMapEvents that slice back to the source", () => {
    const text = 'ВЫБРАТЬ Т.Поле ИЗ Справочник.Валюты КАК Т';
    const snapshot = buildSemanticSnapshotFromText(1, text);
    expect(snapshot.sourceMapEvents.length).toBeGreaterThan(0);
    const table = snapshot.sourceMapEvents.find((e) => e.kind === 'table')!;
    expect(table).toBeDefined();
    expect(table.statementIndex).toBe(0);
    expect(text.slice(table.range.start, table.range.end)).toBe('Справочник.Валюты КАК Т');
  });

  it("a query with a broken top-level SELECT list (missing comma) yields completeness 'recovered', with sources/aliases still intact but NO sourceMapEvents", () => {
    const broken = 'ВЫБРАТЬ Т.Поле1 Т.Поле2 ИЗ Справочник.Валюты КАК Т ГДЕ Т.Поле1 = 1'; // missing comma
    const snapshot = buildSemanticSnapshotFromText(1, broken);
    expect(snapshot.completeness).toBe('recovered');
    // Source/alias structure survives repair even though the field list doesn't.
    expect(snapshot.model.members[0].members[0].model.tables[0].alias).toBe('Т');
    // Repair reflows character offsets, so a 'recovered' snapshot must never
    // claim ranges against the ORIGINAL text — see sourceMapEvents' own doc.
    expect(snapshot.sourceMapEvents).toEqual([]);
  });

  it("a query that cannot be parsed even after repair yields completeness 'unavailable' with an empty model and no sourceMapEvents, never a throw", () => {
    const hopeless = 'ЭТО ВООБЩЕ НЕ ЗАПРОС {{{';
    expect(() => buildSemanticSnapshotFromText(1, hopeless)).not.toThrow();
    const snapshot = buildSemanticSnapshotFromText(1, hopeless);
    expect(snapshot.completeness).toBe('unavailable');
    expect(snapshot.model.members).toEqual([]);
    expect(snapshot.sourceMapEvents).toEqual([]);
  });

  it('sourceHash reflects the ORIGINAL text passed in, not any internally-repaired variant', () => {
    const broken = 'ВЫБРАТЬ Т.Поле1 Т.Поле2 ИЗ Справочник.Валюты КАК Т';
    const clean = 'ВЫБРАТЬ Т.Поле1 Т.Поле2 ИЗ Справочник.Валюты КАК Т'; // same text
    const a = buildSemanticSnapshotFromText(1, broken);
    const b = buildSemanticSnapshotFromText(2, clean);
    expect(a.sourceHash).toBe(b.sourceHash);
  });

  it('never throws across a small mix of valid/broken/garbage inputs', () => {
    const inputs = [
      'ВЫБРАТЬ 1',
      'ВЫБРАТЬ Т.А Т.Б ИЗ Справочник.Валюты КАК Т',
      '',
      '((( не запрос',
    ];
    for (const text of inputs) {
      expect(() => buildSemanticSnapshotFromText(1, text)).not.toThrow();
    }
  });
});
