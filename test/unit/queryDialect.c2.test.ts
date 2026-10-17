/**
 * C2 slice 2: the dialect of a BSL string literal (`queryDialect.ts`) and how the
 * editor uses it. A Russian start is always a 1C query; an English start is a 1C
 * query when it parses, native SQL when it has code SDBL never has, otherwise
 * unknown (a query, but parse errors are not reported).
 */
import { describe, it, expect } from 'vitest';
import { detectQueryDialect, leadingQueryWord } from '../../src/core/query/queryDialect';
import { findAllQueryLiterals, findQueryAt, findQueryKeywordRange } from '../../src/extension/queryAtCursor';
import { computeQueryParseProblems } from '../../src/extension/queryDiagnostics';

describe('detectQueryDialect', () => {
  it.each([
    ['ВЫБРАТЬ Т.Код ИЗ Справочник.Валюты КАК Т', 'sdbl'],
    ['выбрать ИЗ', 'sdbl'], // broken, still a 1C query
    ['УНИЧТОЖИТЬ ВТ', 'sdbl'],
    ['SELECT C.Code AS Code FROM Catalog.Валюты AS C WHERE NOT C.DeletionMark', 'sdbl'],
    ['select 1 as A union all select 2', 'sdbl'],
    ['DROP TT', 'sdbl'],
    ['SELECT TOP 10 * FROM [dbo].[Orders]', 'nativeSql'],
    ['SELECT * FROM Orders WHERE Id = @Id', 'nativeSql'],
    ['SELECT 1 -- comment', 'nativeSql'],
    ['SELECT /* hint */ 1', 'nativeSql'],
    ['SELECT C.Code FROM', 'unknown'], // unfinished English query
    ['Selection', undefined],
    ['ВЫБРАТЬКОД', undefined],
    ['Текст', undefined],
  ])('%s → %s', (text, dialect) => {
    expect(detectQueryDialect(text)).toBe(dialect);
  });

  it('a marker inside a string literal or a // comment is not native SQL', () => {
    expect(detectQueryDialect('SELECT "@x [y] --" AS A FROM // @z\n')).toBe('unknown');
  });

  it('the leading word needs a word boundary', () => {
    expect(leadingQueryWord('SELECT\n1')).toBe('SELECT');
    expect(leadingQueryWord('SELECTED')).toBeUndefined();
  });
});

describe('editor detection in BSL', () => {
  const bsl = [
    'А = "SELECT C.Code AS Code FROM Catalog.Валюты AS C";',
    'Б = "SELECT TOP 10 * FROM [dbo].[Orders]";',
    'В = "SELECT C.Code FROM";',
    'Г = "ВЫБРАТЬ ИЗ Справочник.Т КАК Т";',
  ].join('\n');

  it('English 1C and unknown literals are queries; native SQL is not', () => {
    expect(findAllQueryLiterals(bsl).map(h => [h.text, h.dialect])).toEqual([
      ['SELECT C.Code AS Code FROM Catalog.Валюты AS C', 'sdbl'],
      ['SELECT C.Code FROM', 'unknown'],
      ['ВЫБРАТЬ ИЗ Справочник.Т КАК Т', 'sdbl'],
    ]);
    expect(findQueryAt(bsl, bsl.indexOf('dbo'))).toBeNull();
  });

  it('the keyword range covers an English keyword', () => {
    const hit = findAllQueryLiterals(bsl)[0];
    const range = findQueryKeywordRange(bsl, hit)!;
    expect(bsl.slice(range.start, range.end)).toBe('SELECT');
  });

  it('parse errors are reported only for literals known to be 1C queries', () => {
    const problems = computeQueryParseProblems(bsl);
    expect(problems.map(p => bsl.slice(p.start, p.end))).toEqual(['ВЫБРАТЬ']);
    expect(problems[0].start).toBe(bsl.indexOf('ВЫБРАТЬ'));
  });
});
