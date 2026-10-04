/**
 * Composite virtual-table conditions (reindentVtCondition, multi-line conjunct
 * branch) re-indent code lines only (C25c-2): a line that continues a
 * multi-line string literal is kept byte-for-byte, and the line that opens it
 * keeps its trailing whitespace. Code lines keep their current indentation;
 * the paren-depth computation is unchanged. CASE and subquery conjuncts, which
 * already kept their literals, are pinned as guards.
 */
import { describe, it, expect } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';

/** The rendered virtual-table call for the given arguments. */
const vt = (args: string, source = 'РегистрНакопления.Р.Остатки'): string => {
  const out = generateBatch(parseBatch(`ВЫБРАТЬ О.Р КАК Р ИЗ ${source}(${args}) КАК О`));
  return out.slice(out.indexOf('Остатки'), out.lastIndexOf(' КАК О'));
};
const head = 'Остатки(\n\t\t\t,\n\t\t\tТ.Г = 2\n\t\t\t\t';
const accountingHead = 'Остатки(\n\t\t\t,\n\t\t\t,\n\t\t\t,\n\t\t\tТ.Г = 2\n\t\t\t\t';
const ACCOUNTING = 'РегистрБухгалтерии.Б.Остатки';

describe('composite condition code (unchanged output)', () => {
  it.each([
    [', Т.Г = 2 И (Т.Ф = 1\n  ИЛИ Т.Х = 3)', `${head}И (Т.Ф = 1\n\t\t\t\t\tИЛИ Т.Х = 3))`],
    [', Т.Г = 2 И (Т.Ф = 1\n  ИЛИ Т.Х = 4\n  ИЛИ Т.Ц = 2)', `${head}И (Т.Ф = 1\n\t\t\t\t\tИЛИ Т.Х = 4\n\t\t\t\t\tИЛИ Т.Ц = 2))`],
    [', Т.Г = 2 И Т.Х = 1\n  И Т.У = 2', `${head}И Т.Х = 1\n\t\t\t\tИ Т.У = 2)`],
  ])('%j', (args, output) => {
    expect(vt(args)).toBe(output);
  });

  it('accounting register', () => {
    expect(vt(', , , Т.Г = 2 И (Т.Ф = 1\n  ИЛИ Т.Х = 3)', ACCOUNTING)).toBe(`${accountingHead}И (Т.Ф = 1\n\t\t\t\t\tИЛИ Т.Х = 3))`);
  });

  it('CASE and subquery conjuncts already keep their literals (guards)', () => {
    expect(vt(', Т.Г = 2 И ВЫБОР КОГДА Т.Х = "a\n  b" ТОГДА 1 ИНАЧЕ 0 КОНЕЦ = 1')).toBe(
      `${head}И ВЫБОР\n\t\t\t\t\tКОГДА Т.Х = "a\n  b"\n\t\t\t\t\t\tТОГДА 1\n\t\t\t\t\tИНАЧЕ 0\n\t\t\t\tКОНЕЦ = 1)`);
    expect(vt(', Т.Г = 2 И Т.Ф В\n(ВЫБРАТЬ Х.А ИЗ Справочник.Валюты КАК Х ГДЕ Х.Н = "a\n  b")')).toBe(
      `${head}И Т.Ф В\n\t\t\t\t\t(ВЫБРАТЬ\n\t\t\t\t\t\tХ.А\n\t\t\t\t\tИЗ\n\t\t\t\t\t\tСправочник.Валюты КАК Х\n\t\t\t\t\tГДЕ\n\t\t\t\t\t\tХ.Н = "a\n  b"))`);
  });
});

describe('multi-line literals stay byte-for-byte', () => {
  it.each([
    [', Т.Г = 2 И (Т.Ф = 1\n  ИЛИ Т.Х = "a\n  b")', `${head}И (Т.Ф = 1\n\t\t\t\t\tИЛИ Т.Х = "a\n  b"))`],
    [', Т.Г = 2 И Т.Х = "a\n  b"', `${head}И Т.Х = "a\n  b")`],
    [', Т.Г = 2 И (Т.Ф = 1\n  ИЛИ Т.Х = "a\n\t \tb")', `${head}И (Т.Ф = 1\n\t\t\t\t\tИЛИ Т.Х = "a\n\t \tb"))`],
    [', Т.Г = 2 И Т.Х = "a  \n b"', `${head}И Т.Х = "a  \n b")`],
    [', Т.Г = 2 И (Т.Ф = 1\n  ИЛИ Т.Х = "a  \n b")', `${head}И (Т.Ф = 1\n\t\t\t\t\tИЛИ Т.Х = "a  \n b"))`],
  ])('%j', (args, output) => {
    expect(vt(args)).toBe(output);
  });

  it('a code line after the literal keeps its current indentation', () => {
    expect(vt(', Т.Г = 2 И (Т.Ф = 1\n  ИЛИ Т.Х = "a\n  b"\n  ИЛИ Т.Ц = 2)'))
      .toBe(`${head}И (Т.Ф = 1\n\t\t\t\t\tИЛИ Т.Х = "a\n  b"\n\t\t\t\t\tИЛИ Т.Ц = 2))`);
  });

  it('`ИЛИ` at the start of a literal line does not shift later `И` lines', () => {
    expect(vt(', Т.Г = 2 И (Т.Ф = 1\n  И Т.Х = 1\n  И Т.Ц = 2)'))
      .toBe(`${head}И (Т.Ф = 1\n\t\t\t\t\tИ Т.Х = 1\n\t\t\t\t\tИ Т.Ц = 2))`);
    expect(vt(', Т.Г = 2 И (Т.Ф = 1\n  И Т.Х = "a\nИЛИ b"\n  И Т.Ц = 2)'))
      .toBe(`${head}И (Т.Ф = 1\n\t\t\t\t\tИ Т.Х = "a\nИЛИ b"\n\t\t\t\t\tИ Т.Ц = 2))`);
  });

  it('accounting register', () => {
    expect(vt(', , , Т.Г = 2 И (Т.Ф = 1\n  ИЛИ Т.Х = "a\n  b")', ACCOUNTING))
      .toBe(`${accountingHead}И (Т.Ф = 1\n\t\t\t\t\tИЛИ Т.Х = "a\n  b"))`);
  });
});
