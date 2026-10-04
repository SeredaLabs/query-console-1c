/**
 * stripRedundantLeafParens finds redundant parenthesis pairs from tokens; its
 * whitespace post-pass (collapse runs, tighten `(`/`)`/`,`, trim the edges)
 * applies only to code (C25b-2). String/date literals and comments stay
 * byte-for-byte, and unknown lexical facts leave the text unchanged. The code
 * cases pin the current output.
 */
import { describe, it, expect } from 'vitest';
import { stripRedundantLeafParens } from '../../src/core/query/exprFormatter';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';

const where = (condition: string): string =>
  `ВЫБРАТЬ Т.Код КАК Код ИЗ Справочник.Валюты КАК Т ГДЕ ${condition}`;
const head = 'ВЫБРАТЬ\n\tТ.Код КАК Код\nИЗ\n\tСправочник.Валюты КАК Т\nГДЕ\n';
const gen = (text: string): string => generateBatch(parseBatch(text));

describe('stripRedundantLeafParens: code (unchanged output)', () => {
  it.each([
    ['(Т.Код) = 1', 'Т.Код = 1'],
    ['(Т.Код)  =  1', 'Т.Код = 1'],
    ['НЕ ((Т.А ИЛИ Т.Б))', 'НЕ (Т.А ИЛИ Т.Б)'],
    ['( Т.Код ) = ( 1 )', 'Т.Код = 1'],
    ['ЕСТЬNULL((Т.А) , 0) = 1', 'ЕСТЬNULL(Т.А, 0) = 1'],
    ['(Т.А) = (1) И (Т.Б) = (2)', 'Т.А = 1 И Т.Б = 2'],
    [' (Т.Код) = 1 ', 'Т.Код = 1'],
    ['Т.Код = 1', 'Т.Код = 1'],
    ['(Т.Код) =\n"a  b"', '(Т.Код) =\n"a  b"'],
  ])('%j → %j, idempotent', (input, output) => {
    expect(stripRedundantLeafParens(input)).toBe(output);
    expect(stripRedundantLeafParens(output)).toBe(output);
  });

  it('WHERE without literals', () => {
    expect(gen(where('(Т.Код) = 1 И (Т.Наименование) = &Н')))
      .toBe(`${head}\tТ.Код = 1\n\tИ Т.Наименование = &Н`);
  });
});

describe('stripRedundantLeafParens: literals and comments stay byte-for-byte', () => {
  it.each([
    ['(Т.Код) = "a  b"', 'Т.Код = "a  b"'],
    ['(Т.Код) = "( a )"', 'Т.Код = "( a )"'],
    ['(Т.Код) = "a  ""b""  c"', 'Т.Код = "a  ""b""  c"'],
    ['"a  b" = (Т.Код)', '"a  b" = Т.Код'],
    ['"a  b" = (Т.Код) ИЛИ Т.Н = "c  d"', '"a  b" = Т.Код ИЛИ Т.Н = "c  d"'],
    ['"  a" = (Т.Код)', '"  a" = Т.Код'],
    ['(Т.Код) = "a  "', 'Т.Код = "a  "'],
    [' (Т.Код) = "a  b" ', 'Т.Код = "a  b"'],
    ["(Т.Д) = '2024  01'", "Т.Д = '2024  01'"],
    ['(Т.Код) = 1 // a  b  ', 'Т.Код = 1 // a  b  '],
    ['(Т.Код)  =  1 // c', 'Т.Код = 1 // c'],
  ])('%j → %j', (input, output) => {
    expect(stripRedundantLeafParens(input)).toBe(output);
  });

  it.each([
    ['(Т.Код) = "a  b'],
    ['(Т.Код) = &'],
  ])('unlexable %j is left unchanged', input => {
    expect(stripRedundantLeafParens(input)).toBe(input);
  });

  it('WHERE: single, AND, OR', () => {
    expect(gen(where('(Т.Код) = "a  b"'))).toBe(`${head}\tТ.Код = "a  b"`);
    expect(gen(where('(Т.Код) = "a  b" И Т.Код = 1'))).toBe(`${head}\tТ.Код = "a  b"\n\tИ Т.Код = 1`);
    expect(gen(where('(Т.Код) = "a  b" ИЛИ Т.Код = 1'))).toBe(`${head}\t(Т.Код = "a  b"\n\t\t\tИЛИ Т.Код = 1)`);
  });

  it('HAVING', () => {
    const text = 'ВЫБРАТЬ Т.Код КАК Код ИЗ Справочник.Валюты КАК Т '
      + 'СГРУППИРОВАТЬ ПО Т.Код ИМЕЮЩИЕ (МАКСИМУМ(Т.Наименование)) = "a  b"';
    expect(gen(text)).toContain('\n\nИМЕЮЩИЕ\n\tМАКСИМУМ(Т.Наименование) = "a  b"');
  });

  it('virtual-table condition', () => {
    const text = 'ВЫБРАТЬ О.Р КАК Р ИЗ РегистрНакопления.Р.Остатки(, (Т.Г) = "a  b") КАК О';
    expect(gen(text)).toContain('РегистрНакопления.Р.Остатки(, Т.Г = "a  b") КАК О');
  });

  it('JOIN does not route through this function (reachability check)', () => {
    const text = 'ВЫБРАТЬ Т.Код КАК Код ИЗ Справочник.Валюты КАК Т '
      + 'ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Валюты КАК Б ПО (Т.Код) = "a  b"';
    expect(gen(text)).toContain('\t\tПО ((Т.Код) = "a  b")');
  });
});
