/**
 * `qualifyBareFields.ts`'s JOIN-condition scoping fix (semantic-core roadmap
 * follow-up work, memory: project-semantic-core-roadmap) — makes the pass
 * context-aware for JOIN conditions specifically, via `computeJoinVisibility`
 * (live-verified against real 1C, Phase 2a), instead of qualifying every
 * clause (including every JOIN's own `ПО`) against the whole flat model.
 *
 * These fixtures mirror `test/unit/joinVisibility.test.ts`'s right-nested/
 * flat-chain structures, but this time with an actual bare FIELD (not just
 * structural visibility) whose real 1C-correct qualification depends on
 * scoping being respected — proven end-to-end via `parseBatch`/`generateBatch`
 * (the pass's real entry point), not by calling internals directly.
 */
import { describe, it, expect } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { buildResolverFromTables } from '../../src/core/metadata/buildModelResolver';
import type { MetaTable } from '../../src/core/metadata/types';

const A: MetaTable = {
  kind: 'Справочник', name: 'А', fullName: 'Справочник.А',
  fields: [{ name: 'УникальноеА', kind: 'standard', types: [] }],
};
const B: MetaTable = {
  kind: 'Справочник', name: 'Б', fullName: 'Справочник.Б',
  fields: [{ name: 'УникальноеБ', kind: 'standard', types: [] }],
};

const resolver = buildResolverFromTables([A, B]);

describe('qualifyBareFields: JOIN-condition scoping (right-nested/flat-chain, live-verified real-1C rules)', () => {
  it("right-nested JOIN's own (INNER) condition does NOT qualify a bare field to the OUTER seed, even when the seed is the only known metadata owner", () => {
    const text =
      'ВЫБРАТЬ Т1.УникальноеА ' +
      'ИЗ Справочник.А КАК Т1 ' +
      'ЛЕВОЕ СОЕДИНЕНИЕ (ВЫБРАТЬ 1 КАК Знач) КАК Т2 ' +
      'ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Б КАК Т3 ПО УникальноеА = Т3.УникальноеБ ' +
      'ПО Т1.УникальноеА = Т2.Знач';
    const model = parseBatch(text, resolver);
    const out = generateBatch(model);
    // Т1 is NOT visible from the inner (Т2-Т3) join's own condition (Phase 2a
    // live-verified rule) — "УникальноеА" must stay BARE, not confidently
    // (and wrongly) qualified to Т1 just because Т1 is the only metadata
    // owner across the WHOLE query.
    expect(out).toContain('ПО УникальноеА = Т3.УникальноеБ');
    expect(out).not.toContain('ПО Т1.УникальноеА = Т3.УникальноеБ');
  });

  it("the OUTER join's own condition still sees the seed AND the whole nested sub-chain — unaffected by the inner-condition narrowing", () => {
    const text =
      'ВЫБРАТЬ Т1.УникальноеА ' +
      'ИЗ Справочник.А КАК Т1 ' +
      'ЛЕВОЕ СОЕДИНЕНИЕ (ВЫБРАТЬ 1 КАК Знач) КАК Т2 ' +
      'ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Б КАК Т3 ПО Т3.УникальноеБ = Т3.УникальноеБ ' +
      'ПО УникальноеА = Т2.Знач';
    const model = parseBatch(text, resolver);
    const out = generateBatch(model);
    // Bare "УникальноеА" in the OUTER join's own condition IS correctly
    // qualified to Т1 — the outer join sees its own seed.
    expect(out).toContain('ПО Т1.УникальноеА = Т2.Знач');
  });

  it('a bare field in WHERE (not any JOIN condition) is still qualified against the FULL flat source set, unaffected by JOIN-condition narrowing', () => {
    const text =
      'ВЫБРАТЬ Т1.УникальноеА ' +
      'ИЗ Справочник.А КАК Т1 ' +
      'ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Б КАК Т2 ПО Т1.УникальноеА = Т2.УникальноеБ ' +
      'ГДЕ УникальноеБ = "x"';
    const model = parseBatch(text, resolver);
    const out = generateBatch(model);
    expect(out).toContain('Т2.УникальноеБ = "x"');
  });

  it('flat (left-associative) JOIN chain: a later join still correctly qualifies a bare field owned by an EARLIER table in the same chain', () => {
    const text =
      'ВЫБРАТЬ Т1.УникальноеА ' +
      'ИЗ Справочник.А КАК Т1 ' +
      'ЛЕВОЕ СОЕДИНЕНИЕ (ВЫБРАТЬ 1 КАК Знач) КАК Т2 ПО Т1.УникальноеА = Т2.Знач ' +
      'ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Б КАК Т3 ПО УникальноеА = Т3.УникальноеБ';
    const model = parseBatch(text, resolver);
    const out = generateBatch(model);
    // Flat chain: the 2nd join sees everything introduced before it (Т1) —
    // monotonic accumulation, unaffected by the right-nested-specific fix.
    expect(out).toContain('ПО Т1.УникальноеА = Т3.УникальноеБ');
  });

  it('golden-corpus zero-impact sanity: a normal single-JOIN query with an unambiguous owner still qualifies exactly as before', () => {
    const text =
      'ВЫБРАТЬ Т1.УникальноеА ' +
      'ИЗ Справочник.А КАК Т1 ' +
      'ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Б КАК Т2 ПО УникальноеА = Т2.УникальноеБ';
    const model = parseBatch(text, resolver);
    const out = generateBatch(model);
    expect(out).toContain('ПО Т1.УникальноеА = Т2.УникальноеБ');
  });
});
