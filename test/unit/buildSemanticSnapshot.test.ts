/**
 * Phase 1c of the semantic-core roadmap (memory: project-semantic-core-roadmap).
 * `buildSemanticSnapshotFromText` is the tolerant entry point: it must NEVER
 * throw, and must report the right `SemanticCompleteness` for each of the three
 * strategies it tries (complete → recovered → unavailable).
 */
import { describe, it, expect } from 'vitest';
import { buildSemanticSnapshotFromText } from '../../src/core/semantic/buildSemanticSnapshot';
import { hasTrustworthyPositions, createSemanticSnapshot } from '../../src/core/semantic/semanticSnapshot';
import { parseBatch } from '../../src/core/query/sdblParser';
import { tryParseBatch } from '../../src/core/query/validateBatch';

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

  it("a query with a broken top-level SELECT list (missing comma) yields completeness 'recovered', with sources/aliases intact and sourceMapEvents that slice back to the ORIGINAL text", () => {
    const broken = 'ВЫБРАТЬ Т.Поле1 Т.Поле2 ИЗ Справочник.Валюты КАК Т ГДЕ Т.Поле1 = 1'; // missing comma
    const snapshot = buildSemanticSnapshotFromText(1, broken);
    expect(snapshot.completeness).toBe('recovered');
    // Source/alias structure survives repair even though the field list doesn't.
    expect(snapshot.model.members[0].members[0].model.tables[0].alias).toBe('Т');
    // The repair placeholder is length-preserving, so ranges recorded against
    // the repaired text are valid against the user's real text too.
    const table = snapshot.sourceMapEvents.find((e) => e.kind === 'table')!;
    expect(table).toBeDefined();
    expect(broken.slice(table.range.start, table.range.end)).toBe('Справочник.Валюты КАК Т');
    const member = snapshot.sourceMapEvents.find((e) => e.kind === 'unionMember')!;
    expect(member.range.start).toBe(0); // covers the broken SELECT list itself
    expect(hasTrustworthyPositions(snapshot)).toBe(true);
  });

  it("an empty SELECT list (too short for the '1' placeholder) is still repaired in place, so the 'recovered' snapshot keeps positions", () => {
    const broken = 'ВЫБРАТЬ ИЗ Справочник.Валюты КАК Т';
    const snapshot = buildSemanticSnapshotFromText(1, broken);
    expect(snapshot.completeness).toBe('recovered');
    expect(snapshot.model.members[0].members[0].model.tables[0].alias).toBe('Т');
    const table = snapshot.sourceMapEvents.find((e) => e.kind === 'table')!;
    expect(broken.slice(table.range.start, table.range.end)).toBe('Справочник.Валюты КАК Т');
    expect(hasTrustworthyPositions(snapshot)).toBe(true);
  });

  it("hasTrustworthyPositions: 'recovered' without events and 'unavailable' are not trustworthy", () => {
    const empty = { members: [] };
    expect(hasTrustworthyPositions(createSemanticSnapshot(1, 'x', empty, 'recovered'))).toBe(false);
    expect(hasTrustworthyPositions(createSemanticSnapshot(1, 'x', empty, 'unavailable'))).toBe(false);
  });

  it("a query that cannot be parsed even after repair yields completeness 'unavailable' with an empty model and no sourceMapEvents, never a throw", () => {
    const hopeless = 'ЭТО ВООБЩЕ НЕ ЗАПРОС {{{';
    expect(() => buildSemanticSnapshotFromText(1, hopeless)).not.toThrow();
    const snapshot = buildSemanticSnapshotFromText(1, hopeless);
    expect(snapshot.completeness).toBe('unavailable');
    expect(snapshot.model.members).toEqual([]);
    expect(snapshot.sourceMapEvents).toEqual([]);
  });

  it("a query with an unterminated string literal (common mid-edit state) yields completeness 'unavailable' instead of throwing, since the lexer itself fails during repair", () => {
    const midEdit = 'ВЫБРАТЬ Т.Поле ИЗ Справочник.Валюты КАК Т ГДЕ Т.Поле = "abc';
    expect(() => buildSemanticSnapshotFromText(1, midEdit)).not.toThrow();
    const snapshot = buildSemanticSnapshotFromText(1, midEdit);
    expect(snapshot.completeness).toBe('unavailable');
    expect(snapshot.model.members).toEqual([]);
  });

  it('sourceHash reflects the ORIGINAL text passed in, not any internally-repaired variant', () => {
    const broken = 'ВЫБРАТЬ Т.Поле1 Т.Поле2 ИЗ Справочник.Валюты КАК Т';
    const clean = 'ВЫБРАТЬ Т.Поле1 Т.Поле2 ИЗ Справочник.Валюты КАК Т'; // same text
    const a = buildSemanticSnapshotFromText(1, broken);
    const b = buildSemanticSnapshotFromText(2, clean);
    expect(a.sourceHash).toBe(b.sourceHash);
  });

  it("Phase 3d: 'complete' snapshot has index.symbolsById materialized (one Symbol per source alias) — no longer empty", () => {
    const snapshot = buildSemanticSnapshotFromText(
      1,
      'ВЫБРАТЬ Т1.Код ИЗ Справочник.А КАК Т1 ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Б КАК Т2 ПО Т1.Код = Т2.Код',
    );
    expect(snapshot.index.symbolsById.size).toBe(2);
    expect(Array.from(snapshot.index.symbolsById.values()).map((s) => s.alias)).toEqual(['Т1', 'Т2']);
  });

  it("Phase 3d: 'recovered' snapshot also gets symbolsById materialized (source/alias structure survives repair)", () => {
    const broken = 'ВЫБРАТЬ Т.Поле1 Т.Поле2 ИЗ Справочник.Валюты КАК Т';
    const snapshot = buildSemanticSnapshotFromText(1, broken);
    expect(snapshot.completeness).toBe('recovered');
    expect(Array.from(snapshot.index.symbolsById.values()).map((s) => s.alias)).toEqual(['Т']);
  });

  it("'unavailable' snapshot has an empty index (empty model, nothing to collect)", () => {
    const snapshot = buildSemanticSnapshotFromText(1, 'ЭТО ВООБЩЕ НЕ ЗАПРОС {{{');
    expect(snapshot.index.symbolsById.size).toBe(0);
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

/**
 * Strict/tolerant boundary (architectural debt review, 2026-09-14): the tolerant
 * snapshot builder above internally calls the SAME `parseBatch` that Apply's
 * strict path (`tryParseBatch`/`validateBatchText`) uses — on a REWRITTEN
 * (`repairSelectListsForRecovery`) copy of the text, and `parseDocument` keeps
 * module-level parser state (`sourceResolver`, see the P0 regression fixed the
 * same day this test was added — a nested `parseDocument` call that forgot to
 * thread it corrupted an unrelated sibling query). These tests lock in that
 * running the tolerant path — on broken input, with its own resolver — can
 * never leak into a SEPARATE, later strict `parseBatch` call: neither the
 * repaired TEXT, nor any resolver used to build the tolerant snapshot.
 */
describe('strict/tolerant boundary: buildSemanticSnapshotFromText never affects a later, separate parseBatch', () => {
  const BROKEN = 'ВЫБРАТЬ Т.Поле1 Т.Поле2 ИЗ Справочник.Валюты КАК Т ГДЕ Т.Поле1 = 1'; // missing comma

  it('building a tolerant/recovered snapshot for broken text does not make a later strict parse of the SAME text succeed', () => {
    expect(tryParseBatch(BROKEN).ok).toBe(false);
    const snapshot = buildSemanticSnapshotFromText(1, BROKEN);
    expect(snapshot.completeness).toBe('recovered');
    // Apply's own strict check, run AFTER the tolerant path, must fail exactly
    // as before — the repaired text must never leak back as if it were real.
    expect(tryParseBatch(BROKEN).ok).toBe(false);
  });

  it('a resolver used only for a broken/tolerant snapshot does not leak into an unrelated, later strict parseBatch call', () => {
    // Probe query depends on the same module-level sourceResolver the P0 fix
    // addressed: the shorthand membership-subquery form needs a resolver that
    // recognizes the temp table to synthesize its `ИЗ`.
    const tempResolver = {
      tableByFullName: (full: string) =>
        full === 'ВТ' ? { kind: 'РегистрСведений' as const, name: 'ВТ', fullName: 'ВТ', fields: [] } : undefined,
    };
    const probe = 'ВЫБРАТЬ Т.Код ИЗ Справочник.Валюты КАК Т ГДЕ Т.Код В (ВЫБРАТЬ ВТ.Код)';

    // A DIFFERENT resolver (knows nothing about "ВТ") feeds the tolerant path.
    const unrelatedResolver = { tableByFullName: () => undefined };
    buildSemanticSnapshotFromText(1, BROKEN, unrelatedResolver);

    // The probe, parsed strictly with ITS OWN resolver right after, must still
    // resolve "ВТ" correctly — unaffected by whichever resolver (or none) the
    // tolerant call above used internally.
    const batch = parseBatch(probe, tempResolver);
    const cond = (batch.members[0].members[0].model.conditions![0] as any);
    expect(cond.subquery.members[0].model.tables).toEqual([{ id: 't0', fullName: 'ВТ', alias: 'ВТ' }]);
  });
});
