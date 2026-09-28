/**
 * Every recovery path turns a repaired text into a snapshot by the same rule: a
 * repair that shifted offsets yields a `'recovered'` snapshot WITHOUT positions.
 * Real repairs never shift offsets, so the section repair is wrapped to prepend
 * one character when `shift` is set, for both the nested-section path
 * (`preferNestedRecovery`, the plain parse succeeded) and the ordinary candidate
 * loop (the plain parse failed).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

const control = vi.hoisted(() => ({ shift: undefined as boolean | undefined }));

vi.mock('../../src/core/query/selectListRepair', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/query/selectListRepair')>();
  return {
    ...actual,
    repairTrailingSectionsForRecovery: (text: string, nested = false): string | undefined => {
      const repaired = actual.repairTrailingSectionsForRecovery(text, nested);
      return repaired !== undefined && control.shift === nested ? ' ' + repaired : repaired;
    },
  };
});

import { buildSemanticSnapshotFromText } from '../../src/core/semantic/buildSemanticSnapshot';
import { hasTrustworthyPositions } from '../../src/core/semantic/semanticSnapshot';

const FROM = 'ИЗ Справочник.Товары КАК Т';
// Plain parse succeeds, but the broken inner section hides the subquery: nested path.
const NESTED = `ВЫБРАТЬ Т.Ссылка ${FROM} ГДЕ Т.Контрагент В (ВЫБРАТЬ К.Ссылка ИЗ Справочник.Контрагенты КАК К СГРУППИРОВАТЬ ПО К. ,)`;
// Plain parse fails on the statement-level section: candidate loop.
const LOOP = `ВЫБРАТЬ Т.Ссылка ${FROM} УПОРЯДОЧИТЬ ПО Т. ,`;

afterEach(() => { control.shift = undefined; });

describe('recovery: one offset rule for every path', () => {
  for (const [path, text, nested] of [
    ['nested-section recovery', NESTED, true],
    ['candidate loop', LOOP, false],
  ] as const) {
    it(`${path}: positions only while offsets are preserved`, () => {
      const kept = buildSemanticSnapshotFromText(1, text);
      expect(kept.completeness).toBe('recovered');
      expect(hasTrustworthyPositions(kept)).toBe(true);

      control.shift = nested;
      const shifted = buildSemanticSnapshotFromText(1, text);
      expect(shifted.completeness).toBe('recovered');
      expect(shifted.index.symbolsById.size).toBe(kept.index.symbolsById.size);
      expect(shifted.sourceMapEvents).toEqual([]);
      expect(hasTrustworthyPositions(shifted)).toBe(false);
    });
  }
});
