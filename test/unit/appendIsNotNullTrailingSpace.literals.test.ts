/**
 * The constructor's `ЕСТЬ НЕ NULL` spacing quirk (appendIsNotNullTrailingSpace:
 * a space after `NULL` before `КАК`, before `)` and at the end of a line) is
 * applied only where the insertion point is code in the whole text (C25b-3).
 * String/date literals and comments stay byte-for-byte; unknown lexical facts
 * leave the text unchanged. The code cases pin the current output.
 */
import { describe, it, expect } from 'vitest';
import { appendIsNotNullTrailingSpace } from '../../src/core/query/exprFormatter';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';

const where = (condition: string): string =>
  `ВЫБРАТЬ Т.Код КАК Код ИЗ Справочник.Валюты КАК Т ГДЕ ${condition}`;
const head = 'ВЫБРАТЬ\n\tТ.Код КАК Код\nИЗ\n\tСправочник.Валюты КАК Т\nГДЕ\n';
const gen = (text: string): string => generateBatch(parseBatch(text));

describe('appendIsNotNullTrailingSpace: code (unchanged output)', () => {
  it.each([
    ['Т.А ЕСТЬ НЕ NULL', 'Т.А ЕСТЬ НЕ NULL '],
    ['Т.А ЕСТЬ НЕ NULL КАК Х', 'Т.А ЕСТЬ НЕ NULL  КАК Х'],
    ['(Т.А ЕСТЬ НЕ NULL)', '(Т.А ЕСТЬ НЕ NULL )'],
    ['Т.А ЕСТЬ НЕ NULL\nИ Т.Б ЕСТЬ НЕ NULL', 'Т.А ЕСТЬ НЕ NULL \nИ Т.Б ЕСТЬ НЕ NULL '],
    ['(Т.А ЕСТЬ   НЕ  NULL)', '(Т.А ЕСТЬ   НЕ  NULL )'],
    ['Т.А ЕСТЬ НЕ NULL// c', 'Т.А ЕСТЬ НЕ NULL// c'],
    ['Т.А ЕСТЬ НЕ NULL ', 'Т.А ЕСТЬ НЕ NULL '],
    ['Т.А ЕСТЬ NULL', 'Т.А ЕСТЬ NULL'],
  ])('%j → %j, idempotent', (input, output) => {
    expect(appendIsNotNullTrailingSpace(input)).toBe(output);
    expect(appendIsNotNullTrailingSpace(output)).toBe(output);
  });

  it('WHERE and select list without literals', () => {
    expect(gen(where('Т.Наименование ЕСТЬ НЕ NULL'))).toBe(`${head}\tТ.Наименование ЕСТЬ НЕ NULL `);
    expect(gen('ВЫБРАТЬ Т.Код ЕСТЬ НЕ NULL КАК Е ИЗ Справочник.Валюты КАК Т'))
      .toBe('ВЫБРАТЬ\n\tТ.Код ЕСТЬ НЕ NULL  КАК Е\nИЗ\n\tСправочник.Валюты КАК Т');
  });
});

describe('appendIsNotNullTrailingSpace: literals and comments stay byte-for-byte', () => {
  it.each([
    ['Т.Н = "ЕСТЬ НЕ NULL)"', 'Т.Н = "ЕСТЬ НЕ NULL)"'],
    ['Т.Н = "ЕСТЬ НЕ NULL КАК x"', 'Т.Н = "ЕСТЬ НЕ NULL КАК x"'],
    ['Т.Н = "a ""ЕСТЬ НЕ NULL)"" b"', 'Т.Н = "a ""ЕСТЬ НЕ NULL)"" b"'],
    ['Т.Н = "a\nЕСТЬ НЕ NULL\nb"', 'Т.Н = "a\nЕСТЬ НЕ NULL\nb"'],
    ['Т.А ЕСТЬ НЕ NULL И Т.Н = "ЕСТЬ НЕ NULL)"', 'Т.А ЕСТЬ НЕ NULL И Т.Н = "ЕСТЬ НЕ NULL)"'],
    ['Т.Н = "ЕСТЬ НЕ NULL)" И (Т.А ЕСТЬ НЕ NULL)', 'Т.Н = "ЕСТЬ НЕ NULL)" И (Т.А ЕСТЬ НЕ NULL )'],
    ['Т.А = 1 // ЕСТЬ НЕ NULL', 'Т.А = 1 // ЕСТЬ НЕ NULL'],
    ["Т.Д = 'ЕСТЬ НЕ NULL)'", "Т.Д = 'ЕСТЬ НЕ NULL)'"],
  ])('%j → %j', (input, output) => {
    expect(appendIsNotNullTrailingSpace(input)).toBe(output);
  });

  it('unlexable text is left unchanged', () => {
    expect(appendIsNotNullTrailingSpace('Т.Н = "ЕСТЬ НЕ NULL)')).toBe('Т.Н = "ЕСТЬ НЕ NULL)');
  });

  it('WHERE: literal with `)`, with `КАК`, and a multi-line literal', () => {
    expect(gen(where('Т.Наименование = "ЕСТЬ НЕ NULL)"'))).toBe(`${head}\tТ.Наименование = "ЕСТЬ НЕ NULL)"`);
    expect(gen(where('Т.Наименование ЕСТЬ НЕ NULL И Т.Код = "ЕСТЬ НЕ NULL КАК x"')))
      .toBe(`${head}\tТ.Наименование ЕСТЬ НЕ NULL \n\tИ Т.Код = "ЕСТЬ НЕ NULL КАК x"`);
    expect(gen(where('Т.Наименование = "a\nЕСТЬ НЕ NULL\nb"'))).toBe(`${head}\tТ.Наименование = "a\nЕСТЬ НЕ NULL\nb"`);
  });

  it('HAVING', () => {
    const text = 'ВЫБРАТЬ Т.Код КАК Код ИЗ Справочник.Валюты КАК Т '
      + 'СГРУППИРОВАТЬ ПО Т.Код ИМЕЮЩИЕ МАКСИМУМ(Т.Наименование) = "ЕСТЬ НЕ NULL)"';
    expect(gen(text)).toContain('\n\nИМЕЮЩИЕ\n\tМАКСИМУМ(Т.Наименование) = "ЕСТЬ НЕ NULL)"');
  });

  it('select list: literal kept, code quirk kept', () => {
    expect(gen('ВЫБРАТЬ "ЕСТЬ НЕ NULL)" КАК Х, Т.Код ЕСТЬ НЕ NULL КАК Е ИЗ Справочник.Валюты КАК Т'))
      .toBe('ВЫБРАТЬ\n\t"ЕСТЬ НЕ NULL)" КАК Х,\n\tТ.Код ЕСТЬ НЕ NULL  КАК Е\nИЗ\n\tСправочник.Валюты КАК Т');
  });
});
