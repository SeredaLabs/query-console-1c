/**
 * The redundant call-wrapper removal in CASE leaves (stripRedundantCallWrapParens)
 * cleans spaces next to the removed parentheses only in code (C25 R2): string
 * literals stay byte-for-byte even when a wrapper pair is removed elsewhere in
 * the same leaf. The code cases pin the current output.
 */
import { describe, it, expect } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';

/** The rendered select column (without `ВЫБРАТЬ` / `ИЗ …`). */
const column = (expr: string): string => {
  const out = generateBatch(parseBatch(`ВЫБРАТЬ ${expr} КАК Х ИЗ РегистрНакопления.Р КАК Т`));
  return out.slice(out.indexOf('\n') + 1, out.lastIndexOf('\nИЗ'));
};
const caseOf = (when: string, then = '1', tail = ' + СУММА(Т.А)'): string =>
  `\tВЫБОР\n\t\tКОГДА Т.Б = ${when}\n\t\t\tТОГДА ${then}\n\tКОНЕЦ${tail} КАК Х`;

describe('call-wrapper removal in code (unchanged output)', () => {
  it.each([
    ['ВЫБОР КОГДА Т.Б = 1 ТОГДА 1 КОНЕЦ + (СУММА(Т.А))', caseOf('1')],
    ['ВЫБОР КОГДА Т.Б = 1 ТОГДА 1 КОНЕЦ + ( СУММА( Т.А ) )', caseOf('1')],
    ['ЕСТЬNULL((СУММА(Т.А)) - (СУММА(Т.Б)), 0) + ВЫБОР КОГДА Т.Б = 1 ТОГДА 1 КОНЕЦ',
      '\tЕСТЬNULL(СУММА(Т.А) - СУММА(Т.Б), 0) + ВЫБОР\n\t\tКОГДА Т.Б = 1\n\t\t\tТОГДА 1\n\tКОНЕЦ КАК Х'],
    ['ВЫБОР КОГДА Т.Б = 1 ТОГДА (ЕСТЬNULL(Т.А, 0)) КОНЕЦ', caseOf('1', 'ЕСТЬNULL(Т.А, 0)', '')],
    ['ВЫБОР КОГДА Т.Б = "( x )" ТОГДА 1 КОНЕЦ', caseOf('"( x )"', '1', '')],
  ])('%j', (expr, output) => {
    expect(column(expr)).toBe(output);
  });
});

describe('literals stay byte-for-byte when a wrapper is removed', () => {
  it.each([
    ['"( x )"'],
    ['"a (  b"'],
    ['"a  ) b"'],
    ['"a ""( x )"" b"'],
  ])('КОГДА %s', literal => {
    expect(column(`ВЫБОР КОГДА Т.Б = ${literal} ТОГДА 1 КОНЕЦ + (СУММА(Т.А))`)).toBe(caseOf(literal));
  });

  it('ТОГДА and ИНАЧЕ values', () => {
    expect(column('ВЫБОР КОГДА Т.Б = 1 ТОГДА "( x )" ИНАЧЕ " ) " КОНЕЦ + (СУММА(Т.А))'))
      .toBe('\tВЫБОР\n\t\tКОГДА Т.Б = 1\n\t\t\tТОГДА "( x )"\n\t\tИНАЧЕ " ) "\n\tКОНЕЦ + СУММА(Т.А) КАК Х');
  });

  it('inside an aggregate argument', () => {
    expect(column('СУММА(ВЫБОР КОГДА Т.Б = "( x )" ТОГДА 1 КОНЕЦ) + (СУММА(Т.А))'))
      .toBe('\tСУММА(ВЫБОР\n\t\t\tКОГДА Т.Б = "( x )"\n\t\t\t\tТОГДА 1\n\t\tКОНЕЦ) + СУММА(Т.А) КАК Х');
  });
});
