/**
 * N4: the accounting-register virtual-table path did not merge adjacent DCS braces,
 * unlike the other VT paths. Platform (СхемаЗапроса, SL_kza 2026-10-11) merges them
 * there too: `Хозрасчетный.Остатки(, , , {(&П1)} {(&П2)})` → `{(&П1), (&П2)}`, also
 * across a line break. The merge now runs before the brace wrap/alias step, as in
 * `renderVirtualParams`.
 */
import { describe, it, expect } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';

const gen = (text: string): string => generateBatch(parseBatch(text));

describe('N4: adjacent DCS braces merge in an accounting virtual table', () => {
  it.each([
    'ВЫБРАТЬ О.СуммаОстаток КАК С ИЗ РегистрБухгалтерии.Хозрасчетный.Остатки(, , , {(&П1)} {(&П2)}) КАК О',
    'ВЫБРАТЬ О.СуммаОстаток КАК С ИЗ РегистрБухгалтерии.Хозрасчетный.Остатки(, , , {(&П1)}\n{(&П2)}) КАК О',
  ])('platform canonical text: %j', text => {
    expect(gen(text)).toBe('ВЫБРАТЬ\n\tО.СуммаОстаток КАК С\nИЗ\n\tРегистрБухгалтерии.Хозрасчетный.Остатки(, , , {(&П1), (&П2)}) КАК О');
  });

  it('same merge as the accumulation path, reopen stable', () => {
    const acc = gen('ВЫБРАТЬ О.С КАК С ИЗ РегистрБухгалтерии.Х.Остатки(, , , {(&П1)} {(О.А + 1)}) КАК О');
    expect(acc).toContain('Остатки(, , , {(&П1), (О.А + 1)}) КАК О');
    expect(gen('ВЫБРАТЬ О.Р КАК Р ИЗ РегистрНакопления.Р.Остатки(, {(&П1)} {(О.А + 1)}) КАК О')).toContain('Остатки(, {(&П1), (О.А + 1)}) КАК О');
    expect(gen(acc)).toBe(acc);
  });

  it('a single brace is unchanged', () => {
    expect(gen('ВЫБРАТЬ О.С КАК С ИЗ РегистрБухгалтерии.Х.Остатки(, , , {(&П1)}) КАК О')).toContain('Остатки(, , , {(&П1)}) КАК О');
  });
});
