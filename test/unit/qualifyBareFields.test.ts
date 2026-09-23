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

describe('qualifyBareFields: correlated bare field, nearest enclosing level wins (live-verified real-1C rule)', () => {
  // Real 1C (semantic-core roadmap Phase 2a, see src/core/semantic/correlation.ts):
  // a bare field the subquery's own source lacks resolves to the NEAREST
  // enclosing level that has it, even when a farther level has it too.
  // Today this holds twice over: each nested subquery is parsed by its own
  // `parseDocument` call (bottom-up), so the innermost one is qualified while
  // only its parent is in scope; and the pass itself walks outer levels via
  // `matchesAtNearestLevel`. These tests pin the rule so a future single-pass
  // parse cannot silently fall back to pooling all ancestors together.
  const T = (name: string, fields: string[]): MetaTable => ({
    kind: 'Справочник', name, fullName: `Справочник.${name}`,
    fields: fields.map(f => ({ name: f, kind: 'standard' as const, types: [{ primitive: 'Число' as const }] })),
  });
  const r = buildResolverFromTables([T('А', ['Код', 'Цена']), T('Б', ['Код', 'Цена']), T('В', ['Имя'])]);
  const nested = (innerSelect: string) =>
    'ВЫБРАТЬ А.Код ИЗ Справочник.А КАК А ГДЕ А.Код В ' +
    '(ВЫБРАТЬ Б.Код ИЗ Справочник.Б КАК Б ГДЕ Б.Код В ' +
    `(ВЫБРАТЬ ${innerSelect} ИЗ Справочник.В КАК В))`;

  it('parent and grandparent both own the field — qualified by the PARENT, not left ambiguous', () => {
    const out = generateBatch(parseBatch(nested('Цена'), r));
    expect(out).toContain('Б.Цена');
    expect(out).not.toContain('В.Цена');
  });

  it('only the grandparent owns the field — falls through to the grandparent', () => {
    const r2 = buildResolverFromTables([T('А', ['Код', 'Цена']), T('Б', ['Код']), T('В', ['Имя'])]);
    const out = generateBatch(parseBatch(nested('Цена'), r2));
    expect(out).toContain('А.Цена');
  });

  it('two owners at the SAME nearest level stay unresolved (not rebound to either)', () => {
    const r3 = buildResolverFromTables([T('А', ['Код']), T('Б', ['Код', 'Цена']), T('Г', ['Цена']), T('В', ['Имя'])]);
    const q =
      'ВЫБРАТЬ А.Код ИЗ Справочник.А КАК А ГДЕ А.Код В ' +
      '(ВЫБРАТЬ Б.Код ИЗ Справочник.Б КАК Б, Справочник.Г КАК Г ГДЕ Б.Код В ' +
      '(ВЫБРАТЬ Цена ИЗ Справочник.В КАК В))';
    const out = generateBatch(parseBatch(q, r3));
    expect(out).not.toContain('Б.Цена');
    expect(out).not.toContain('Г.Цена');
  });
});
