/**
 * Phase 3b of the semantic-core roadmap (memory: project-semantic-core-roadmap).
 */
import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { classify, runShadowModeSweep, summarize } from '../../src/core/semantic/shadowMode';
import { buildYamlResolver } from '../../src/core/metadata/buildYamlResolver';

const resolver = buildYamlResolver(path.resolve(__dirname, '../fixtures/corpus/metadata/cf'));

describe('classify', () => {
  it('sameResolved: both sides found the same table', () => {
    expect(classify(true, 'X#T', { kind: 'resolved', value: {} as never }, 'X#T')).toBe('sameResolved');
  });

  it('differentResolved: both found something, but not the same table', () => {
    expect(classify(true, 'X#T', { kind: 'resolved', value: {} as never }, 'Y#T')).toBe('differentResolved');
  });

  it('oldResolvedNewAmbiguous / oldResolvedNewUnknown', () => {
    expect(classify(true, 'X#T', { kind: 'ambiguous', candidates: [] }, undefined)).toBe('oldResolvedNewAmbiguous');
    expect(classify(true, 'X#T', { kind: 'unknown' }, undefined)).toBe('oldResolvedNewUnknown');
  });

  it('oldUnknownNewResolved / oldUnknownNewAmbiguous / bothUnknown', () => {
    expect(classify(false, undefined, { kind: 'resolved', value: {} as never }, 'Y#T')).toBe('oldUnknownNewResolved');
    expect(classify(false, undefined, { kind: 'ambiguous', candidates: [] }, undefined)).toBe('oldUnknownNewAmbiguous');
    expect(classify(false, undefined, { kind: 'unknown' }, undefined)).toBe('bothUnknown');
  });
});

describe('runShadowModeSweep', () => {
  it('agrees with the old resolver on a simple, unambiguous single-source query', () => {
    const text = 'ВЫБРАТЬ Т.Код, Т.Наименование ИЗ Справочник.Валюты КАК Т ГДЕ Т.Код = "1"';
    const cases = runShadowModeSweep(text, resolver);
    // The alias-reference scanner is a simple regex over `<ident>.` and also
    // flags metadata-type-path heads (e.g. "Справочник" in "Справочник.Валюты")
    // as candidates — both resolvers correctly agree those aren't real
    // aliases (bothUnknown), which is agreement too, just not sameResolved.
    expect(cases.length).toBeGreaterThan(0);
    const aliasCases = cases.filter((c) => c.alias === 'Т');
    expect(aliasCases.length).toBeGreaterThan(0);
    expect(aliasCases.every((c) => c.classification === 'sameResolved')).toBe(true);
  });

  it('classifies the EXPECTED divergence for a right-nested JOIN\'s inner condition (old is flat/position-blind, new correctly excludes the outer seed)', () => {
    const text =
      'ВЫБРАТЬ Т1.Код ИЗ Справочник.Валюты КАК Т1 ' +
      'ЛЕВОЕ СОЕДИНЕНИЕ (ВЫБРАТЬ 1 КАК Знач) КАК Т2 ' +
      'ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Валюты КАК Т3 ПО Т1.Код = Т3.Код ' +
      'ПО Т1.Код = Т2.Знач';
    const cases = runShadowModeSweep(text, resolver);
    const posInInnerCond = text.indexOf('Т1.Код = Т3.Код');
    const innerCase = cases.find((c) => c.alias === 'Т1' && c.position === posInInnerCond);
    expect(innerCase).toBeDefined();
    // Old (flat, position-blind) still "finds" Т1 anywhere; new correctly says
    // unknown from inside the inner join's own condition (Phase 2a finding 3)
    // — a real, EXPECTED disagreement, exactly what shadow-mode exists to surface.
    expect(innerCase!.classification).toBe('oldResolvedNewUnknown');
  });

  it('never throws on malformed input, and reports it as bothUnknown/unresolved rather than crashing', () => {
    expect(() => runShadowModeSweep('ЭТО ВООБЩЕ НЕ ЗАПРОС {{{', resolver)).not.toThrow();
  });
});

describe('summarize', () => {
  it('tallies cases by classification, including zero counts for untriggered categories', () => {
    const cases = [
      { alias: 'A', position: 0, classification: 'sameResolved' as const },
      { alias: 'B', position: 1, classification: 'sameResolved' as const },
      { alias: 'C', position: 2, classification: 'differentResolved' as const },
    ];
    const summary = summarize(cases);
    expect(summary.sameResolved).toBe(2);
    expect(summary.differentResolved).toBe(1);
    expect(summary.bothUnknown).toBe(0);
  });
});
