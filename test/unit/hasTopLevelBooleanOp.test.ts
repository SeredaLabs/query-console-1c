/**
 * A1, first slice: `hasTopLevelBooleanOp` takes its lexical facts from lexer
 * tokens. Pinned behavior, including the accepted fixes over the former raw
 * scanner (И/ИЛИ inside comments, date literals and `#`-names are not
 * operators) and the fallback for text the lexer rejects.
 */
import { describe, it, expect } from 'vitest';
import { hasTopLevelBooleanOp } from '../../src/core/query/sdblGenerator';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';

describe('hasTopLevelBooleanOp', () => {
  for (const [expr, expected] of [
    // real top-level operators
    ['А = 1 И Б = 2', true],
    ['А = 1 ИЛИ Б = 2', true],
    ['а = 1 или б = 2', true],
    ['А = 1 ИЛИ(Б = 2)', true],
    ['А = 1', false],
    ['(А = 1 И Б = 2)', false],
    ['А = "x И y"', false],
    // МЕЖДУ … И is not a Boolean operator; a further И is
    ['А МЕЖДУ 1 И 2', false],
    ['А МЕЖДУ 1 И 2 И Б = 3', true],
    ['(А МЕЖДУ 1 И 2) И Б = 3', true],
    // parameters and names are single tokens
    ['А = &И', false],
    ['А = &ИЛИ', false],
    ['#И = 1', false],
    // comments and date literals are not code (behavior fix over the raw scanner)
    ['А = 1 // И комментарий', false],
    ['А = 1 // или комментарий\n', false],
    ["Д = 'x И y'", false],
    ["Д = 'x ИЛИ y'", false],
    ['А = 1 // коммент\nИ Б = 2', true],
    // a comment's (, ) or " does not change lexical depth or string state
    ['А = 1 // (\nИ Б = 2', true],
    ['А = 1 // )\nИ Б = 2', true],
    ['А = 1 // "\nИ Б = 2', true],
    ['(А = 1 // )\nИ Б = 2)', false],
  ] as const) {
    it(`${JSON.stringify(expr)} → ${expected}`, () => {
      expect(hasTopLevelBooleanOp(expr)).toBe(expected);
    });
  }

  describe('text the lexer rejects: no throw, former scanner result', () => {
    for (const [what, expr, expected] of [
      ['unclosed string', 'А = "x И', false],
      ['unclosed string after an operator', 'А = 1 И Б = "x', true],
      ['unclosed date', "Д = 'x И", true],
      ['bare &', 'А = & И Б', true],
      ['bare #', 'А = # И Б', true],
      ['unexpected character', 'А = § И Б', true],
    ] as const) {
      it(what, () => {
        expect(() => hasTopLevelBooleanOp(expr)).not.toThrow();
        expect(hasTopLevelBooleanOp(expr)).toBe(expected);
      });
    }
  });

  it('invalid SDBL `1И` does not throw', () => {
    expect(() => hasTopLevelBooleanOp('1И')).not.toThrow();
  });

  it('generation with lexically broken custom conditions does not throw', () => {
    const doc = parseBatch('ВЫБРАТЬ Т.А КАК А ИЗ Спр.Т КАК Т ЛЕВОЕ СОЕДИНЕНИЕ Спр.Б КАК Б ПО Т.А = Б.А ГДЕ Т.А = 1');
    const model = doc.members[0].members[0].model;
    for (const broken of ['Т.А = "x И', 'Т.А = & И Т.Б = 2', 'Т.А = § ИЛИ Т.Б']) {
      model.conditions = [{ custom: true, expression: broken }];
      model.joins![0].custom = true;
      model.joins![0].expression = broken;
      expect(() => generateBatch(doc)).not.toThrow();
    }
  });
});
