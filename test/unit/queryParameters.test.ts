/**
 * Level 0 query parameter semantics (semantic-core roadmap, memory:
 * project-semantic-core-roadmap — "Query parameter semantics boundary").
 * Pure unit tests for `collectQueryParameterOccurrences`/`collectQueryParameters`/
 * `findQueryParameterAt` — no resolver/metadata needed, this module works
 * purely off the lexer's `'param'` tokens.
 */
import { describe, it, expect } from 'vitest';
import {
  collectQueryParameterOccurrences,
  collectQueryParameters,
  findQueryParameterAt,
} from '../../src/core/query/queryParameters';

describe('collectQueryParameterOccurrences', () => {
  it('finds every &Параметр occurrence in source order, with `&` included in the range', () => {
    const text = 'ВЫБРАТЬ Товар.Наименование ИЗ Справочник.Номенклатура КАК Товар ГДЕ Товар.Код = &Код И Товар.Артикул = &Артикул';
    const occs = collectQueryParameterOccurrences(text);
    expect(occs.map(o => o.name)).toEqual(['Код', 'Артикул']);
    const first = occs[0];
    expect(text.slice(first.range.start, first.range.end)).toBe('&Код');
  });

  it('does not mistake an `&` inside a string literal for a parameter', () => {
    const text = 'ВЫБРАТЬ "текст с & символом" КАК Стр ИЗ Справочник.Номенклатура';
    expect(collectQueryParameterOccurrences(text)).toEqual([]);
  });

  it('returns an empty array when there are no parameters', () => {
    expect(collectQueryParameterOccurrences('ВЫБРАТЬ Товар.Наименование ИЗ Справочник.Номенклатура КАК Товар')).toEqual([]);
  });

  it('is scoped to the whole text passed in, across multiple statements (batch-wide, no per-statement restriction)', () => {
    const text = 'ВЫБРАТЬ Товар.Наименование ИЗ Справочник.Номенклатура КАК Товар ГДЕ Товар.Код = &Код; ' +
      'ВЫБРАТЬ Склад.Наименование ИЗ Справочник.Склады КАК Склад ГДЕ Склад.Код = &Код';
    expect(collectQueryParameterOccurrences(text).map(o => o.name)).toEqual(['Код', 'Код']);
  });
});

describe('collectQueryParameters', () => {
  it('groups occurrences by case-insensitive name, preserving each occurrence\'s own casing', () => {
    const text = 'ВЫБРАТЬ Товар.Код ИЗ Справочник.Номенклатура КАК Товар ГДЕ Товар.Код = &Код ИЛИ Товар.Код = &КОД';
    const grouped = collectQueryParameters(text);
    expect([...grouped.keys()]).toEqual(['КОД']);
    expect(grouped.get('КОД')!.map(o => o.name)).toEqual(['Код', 'КОД']);
  });

  it('returns an empty map for a query with no parameters', () => {
    expect(collectQueryParameters('ВЫБРАТЬ 1 КАК Х').size).toBe(0);
  });
});

describe('findQueryParameterAt', () => {
  const text = 'ВЫБРАТЬ Товар.Код ИЗ Справочник.Номенклатура КАК Товар ГДЕ Товар.Код = &Код';
  const paramStart = text.indexOf('&Код');

  it('finds the occurrence when position is inside its range (including on the leading `&`)', () => {
    expect(findQueryParameterAt(text, paramStart)?.name).toBe('Код');
    expect(findQueryParameterAt(text, paramStart + 2)?.name).toBe('Код');
    expect(findQueryParameterAt(text, paramStart + 3)?.name).toBe('Код'); // last char of "&Код" (index 3 = "д")
  });

  it('returns undefined at and beyond the range end (half-open [start, end), same convention as rangeContains)', () => {
    expect(findQueryParameterAt(text, paramStart + '&Код'.length)).toBeUndefined(); // position === range.end
    expect(findQueryParameterAt(text, paramStart + 5)).toBeUndefined();
  });

  it('returns undefined just before the range', () => {
    expect(findQueryParameterAt(text, paramStart - 1)).toBeUndefined();
  });

  it('returns undefined when the position is on an ordinary identifier, not a parameter', () => {
    expect(findQueryParameterAt(text, text.indexOf('Товар'))).toBeUndefined();
  });
});

describe('S2: parameters in lexically incomplete text (while typing)', () => {
  it('a bare `&` keeps the parameters already typed and does not throw', () => {
    const text = 'ВЫБРАТЬ &Дата КАК Дата, &';
    expect([...collectQueryParameters(text).values()].map(o => o[0].name)).toEqual(['Дата']);
    expect(findQueryParameterAt(text, text.indexOf('&Дата') + 1)?.name).toBe('Дата');
    expect(findQueryParameterAt(text, text.length - 1)).toBeUndefined();
  });

  it('a bare `&` in the middle keeps parameters on both sides with exact ranges', () => {
    const text = 'ВЫБРАТЬ Т.Код ИЗ Т ГДЕ Т.А = & И Т.Б = &Б';
    const occ = collectQueryParameterOccurrences(text);
    expect(occ).toEqual([{ name: 'Б', range: { start: text.lastIndexOf('&Б'), end: text.length } }]);
  });

  it('an unclosed string hides only what is inside it', () => {
    const text = 'ВЫБРАТЬ &А КАК А ГДЕ Т.Имя = "текст &НеПараметр\n  И &ТожеВнутри';
    expect(collectQueryParameterOccurrences(text).map(o => o.name)).toEqual(['А']);
  });

  it('several lexical errors in one text', () => {
    const text = 'ВЫБРАТЬ &А, &, ИЗ #, &Б, "не закрыта';
    expect(collectQueryParameterOccurrences(text).map(o => o.name)).toEqual(['А', 'Б']);
  });

  it('valid text is scanned exactly as before', () => {
    const text = 'ВЫБРАТЬ &А, "&Строка", &а // &Коммент\nИЗ Т';
    expect(collectQueryParameterOccurrences(text).map(o => o.name)).toEqual(['А', 'а']);
  });
});
