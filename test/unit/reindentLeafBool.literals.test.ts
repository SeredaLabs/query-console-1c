/**
 * The flat И/ИЛИ chain re-indent (reindentLeafBool) of select-list leaves and
 * builder `{ГДЕ (…)}` conditions reads only code lines (C25d): a line that
 * continues a multi-line string literal is not a chain continuation, even when
 * the literal text starts with `И`/`ИЛИ`, so the text is kept as written —
 * exactly as for any other literal line. Unknown lexical facts → preserve.
 * The code cases and the safe paths pin the current output.
 */
import { describe, it, expect } from 'vitest';
import { reindentLeafBool } from '../../src/core/query/exprFormatter';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';

const gen = (text: string): string => generateBatch(parseBatch(text));
const FROM = '\nИЗ\n\tСправочник.Валюты КАК Т';
/** Select list with one expression column. */
const select = (expr: string): string => gen(`ВЫБРАТЬ ${expr} КАК Х ИЗ Справочник.Валюты КАК Т`);
const selected = (expr: string): string => `ВЫБРАТЬ\n\t${expr} КАК Х${FROM}`;
/** The rendered `{ГДЕ …}` builder element for the given condition. */
const builder = (condition: string): string =>
  gen(`ВЫБРАТЬ Т.Код КАК Код ИЗ Справочник.Валюты КАК Т\n{ГДЕ ${condition}}`).split('{ГДЕ\n')[1];

describe('code chains (unchanged output)', () => {
  it.each([
    ['Т.Код = 1\n  И Т.Код = 2', 'Т.Код = 1\n\t\tИ Т.Код = 2'],
    ['Т.Код = 1\nИЛИ Т.Код = 2', 'Т.Код = 1\n\t\tИЛИ Т.Код = 2'],
    ['Т.Код = 1\nИЛИ Т.Код = 2\nИ Т.Код = 3', 'Т.Код = 1\n\t\tИЛИ Т.Код = 2\n\t\t\tИ Т.Код = 3'],
    ['(Т.Код = 1\nИ Т.Код = 2)\nИ Т.Код = 3', '(Т.Код = 1\n\t\tИ Т.Код = 2)\n\t\tИ Т.Код = 3'],
  ])('select list %j', (expr, output) => {
    expect(select(expr)).toBe(selected(output));
  });

  it('builder condition', () => {
    expect(builder('(Т.Код = 2\nИЛИ Т.Наименование = 1)')).toBe('\t(Т.Код = 2\n\t\t\tИЛИ Т.Наименование = 1) КАК Поле2}');
  });
});

describe('literals on other paths (unchanged output, controls)', () => {
  it.each([['"x\n  ИЛИ y"'], ['"x\nКОГДА y"'], ['"a\n  b"']])('select list %j', expr => {
    expect(select(expr)).toBe(selected(expr));
  });

  it('a real code line after the literal (boolean select path)', () => {
    expect(select('"x\nИЛИ y"\nИ Т.Код = 2')).toBe(selected('"x\nИЛИ y"\n\t\tИ Т.Код = 2'));
  });

  it('WHERE', () => {
    expect(gen('ВЫБРАТЬ Т.Код КАК Код ИЗ Справочник.Валюты КАК Т ГДЕ Т.Наименование = "x\nИЛИ y"'))
      .toBe(`ВЫБРАТЬ\n\tТ.Код КАК Код${FROM}\nГДЕ\n\tТ.Наименование = "x\nИЛИ y"`);
  });

  it('builder: any other literal line keeps the chain as written', () => {
    expect(builder('(Т.Код = 2 ИЛИ Т.Наименование = "x\nzzz")\nИ Т.Код = 3'))
      .toBe('\t((Т.Код = 2 ИЛИ Т.Наименование = "x\nzzz")\nИ Т.Код = 3) КАК Поле2}');
  });
});

describe('literal lines starting with И/ИЛИ stay byte-for-byte', () => {
  it.each([
    ['"x\nИЛИ y"'],
    ['"x\nИ (y"'],
    ['"x\nИ y"'],
    ['"x\nили y"'],
    ['"x\nИЛИ y  \nИ z"'],
    ['Т.Наименование = "x\nИЛИ y"'],
    ['ПОДСТРОКА("x\nИЛИ y", 1, 2)'],
    ['"x\nИЛИ y" + Т.Наименование'],
  ])('select list %j', expr => {
    expect(select(expr)).toBe(selected(expr));
  });

  it('temporary table', () => {
    expect(gen('ВЫБРАТЬ "x\nИЛИ y" КАК Х ПОМЕСТИТЬ ВТ ИЗ Справочник.Валюты КАК Т'))
      .toBe('ВЫБРАТЬ\n\t"x\nИЛИ y" КАК Х\nПОМЕСТИТЬ ВТ\nИЗ\n\tСправочник.Валюты КАК Т');
  });

  it('UNION', () => {
    expect(gen('ВЫБРАТЬ "x\nИЛИ y" КАК Х ИЗ Справочник.Валюты КАК Т ОБЪЕДИНИТЬ ВСЕ ВЫБРАТЬ "x\nИЛИ y" ИЗ Справочник.Валюты КАК Т'))
      .toBe(`ВЫБРАТЬ\n\t"x\nИЛИ y" КАК Х${FROM}\n\nОБЪЕДИНИТЬ ВСЕ\n\nВЫБРАТЬ\n\t"x\nИЛИ y"${FROM}`);
  });

  it('builder condition, alone and before a real code line', () => {
    expect(builder('(Т.Код = 2 ИЛИ Т.Наименование = "x\nИЛИ y")'))
      .toBe('\t(Т.Код = 2 ИЛИ Т.Наименование = "x\nИЛИ y") КАК Поле2}');
    expect(builder('(Т.Код = 2 ИЛИ Т.Наименование = "x\nИЛИ y")\nИ Т.Код = 3'))
      .toBe('\t((Т.Код = 2 ИЛИ Т.Наименование = "x\nИЛИ y")\nИ Т.Код = 3) КАК Поле2}');
  });

  it('direct: a literal line ends the chain; unknown lexical facts → preserve', () => {
    expect(reindentLeafBool('Т.А = 1\nИЛИ Т.Б = "x\nИЛИ y"', 1)).toBe('Т.А = 1\nИЛИ Т.Б = "x\nИЛИ y"');
    expect(reindentLeafBool('"x\nИЛИ y', 1)).toBe('"x\nИЛИ y');
  });
});
