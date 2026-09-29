/**
 * A1.2: `splitTopLevelAnd` takes its lexical facts from lexer tokens and cuts
 * fragments from the original text by token position. Accepted fixes over the
 * former raw scanner: И inside a date literal or a `#`-name is not a boundary.
 */
import { describe, it, expect } from 'vitest';
import { splitTopLevelAnd } from '../../src/core/query/sdblGenerator';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';

describe('splitTopLevelAnd', () => {
  for (const [expr, expected] of [
    ['А = 1 И Б = 2', ['А = 1', 'Б = 2']],
    ['А = 1 И Б = 2 И В = 3', ['А = 1', 'Б = 2', 'В = 3']],
    ['а = 1 и б = 2', ['а = 1', 'б = 2']],
    ['(А И Б) И (В И (Г И Д))', ['(А И Б)', '(В И (Г И Д))']],
    ['А = 1 ИЛИ Б = 2', ['А = 1 ИЛИ Б = 2']],
    ['А МЕЖДУ 1 И 2', ['А МЕЖДУ 1 И 2']],
    ['А МЕЖДУ 1 И 2 И Б = 3', ['А МЕЖДУ 1 И 2', 'Б = 3']],
    ['С = "x И y" И Б = 2', ['С = "x И y"', 'Б = 2']],
    ["Д = 'x И y' И Б = 2", ["Д = 'x И y'", 'Б = 2']],
    ['А = &И И Б = &ИЛИ', ['А = &И', 'Б = &ИЛИ']],
    ['#И = 1 И Б = 2', ['#И = 1', 'Б = 2']],
    ['  А = 1  И\n Б = 2 ', ['А = 1', 'Б = 2']],
  ] as const) {
    it(`${JSON.stringify(expr)}`, () => {
      expect(splitTopLevelAnd(expr)).toEqual(expected);
    });
  }

  it('comments are not code (direct scanner robustness)', () => {
    expect(splitTopLevelAnd('А = 1 // И к')).toEqual(['А = 1 // И к']);
    expect(splitTopLevelAnd('А = 1 // (\nИ Б = 2')).toEqual(['А = 1 // (', 'Б = 2']);
  });

  describe('text the lexer rejects: no throw, former scanner result', () => {
    for (const [what, expr, expected] of [
      ['unclosed string', 'А = 1 И Б = "x И', ['А = 1', 'Б = "x И']],
      ['unclosed date', "А = 1 И Д = 'x И", ['А = 1', "Д = 'x", '']],
      ['bare &', 'А = & И Б', ['А = &', 'Б']],
      ['bare #', 'А = # И Б', ['А = #', 'Б']],
      ['unexpected character', 'А = § И Б', ['А = §', 'Б']],
    ] as const) {
      it(what, () => {
        expect(() => splitTopLevelAnd(expr)).not.toThrow();
        expect(splitTopLevelAnd(expr)).toEqual(expected);
      });
    }
  });

  it('invalid SDBL `1И` does not throw', () => {
    expect(() => splitTopLevelAnd('А = 1И Б')).not.toThrow();
  });
});

describe('splitTopLevelAnd through a JOIN AND chain', () => {
  const gen = (expression: string): string => {
    const doc = parseBatch('ВЫБРАТЬ Т.А КАК А ИЗ Спр.Т КАК Т ЛЕВОЕ СОЕДИНЕНИЕ Спр.Б КАК Б ПО Т.А = Б.А ГДЕ Т.А = 1');
    const join = doc.members[0].members[0].model.joins![0];
    join.custom = true;
    join.expression = expression;
    join.conditions = [{ custom: true, expression }];
    const out = generateBatch(doc);
    return out.slice(out.indexOf('ПО '), out.indexOf('\nГДЕ'));
  };

  it('an ordinary AND chain is split into conjuncts as before', () => {
    expect(gen('Т.А = Б.А И Т.Б = &П И Т.В > 0')).toBe('ПО Т.А = Б.А\n\t\t\tИ (Т.Б = &П)\n\t\t\tИ (Т.В > 0)');
  });

  it('a date literal is no longer cut at its И', () => {
    expect(gen("Т.А = Б.А И Т.Д = 'x И y'")).toBe("ПО Т.А = Б.А\n\t\t\tИ (Т.Д = 'x И y')");
  });

  it('a #-name is no longer cut at its И', () => {
    expect(gen('Т.А = Б.А И #И = 1')).toBe('ПО Т.А = Б.А\n\t\t\tИ (#И = 1)');
  });
});
