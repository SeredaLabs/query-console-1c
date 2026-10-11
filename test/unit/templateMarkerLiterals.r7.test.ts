/**
 * R7: `isStructurallyValidExpression` does not judge a query template (`%1`, `#Товар#`,
 * `[Ид]`) and accepts it. The marker test ran over the raw text, literals and comments
 * included, so `Т.А + "50%" +` was accepted while `Т.А + "x" +` was rejected, and Apply
 * allowed the malformed expression. Markers now count only in code.
 */
import { describe, it, expect } from 'vitest';
import { isStructurallyValidExpression } from '../../src/core/query/expressionSyntaxCheck';
import { parseBatch } from '../../src/core/query/sdblParser';
import { findMalformedCustomExpressions } from '../../src/core/query/semanticValidator';

describe('R7: a marker inside a literal or comment does not switch the check off', () => {
  it.each(['Т.А + "50%" +', 'Т.А + "#" +', 'Т.А + "[x]" +', 'Т.А + "@" +', 'Т.А + // 50%\n1 +'])('%j is malformed', expr => {
    expect(isStructurallyValidExpression(expr)).toBe(false);
  });

  it.each(['Т.А + "50%"', 'Т.А + "#" + Т.Б', 'ПОДСТРОКА(Т.А, 1, 2) = "[x]"'])('%j stays valid', expr => {
    expect(isStructurallyValidExpression(expr)).toBe(true);
  });

  it.each(['Т.А + %1', '#Товар#.Код', '[Ид] + 1', 'Т.А + %1 +'])('template %j is still not judged', expr => {
    expect(isStructurallyValidExpression(expr)).toBe(true);
  });

  it.each([
    'Т.Имя НЕ ПОДОБНО "%текст%"', 'Т.Имя НЕ ПОДОБНО "текст"', 'Т.Имя НЕ ПОДОБНО "т" СПЕЦСИМВОЛ "~"',
    'Т.Имя НЕ МЕЖДУ "а" И "б"', 'Т.Код НЕ В ("1", "2")',
  ])('infix НЕ %j is valid (platform: accepted, printed as prefix НЕ)', expr => {
    // Without a `%` in the literal the infix НЕ ПОДОБНО / НЕ МЕЖДУ used to be rejected.
    expect(isStructurallyValidExpression(expr)).toBe(true);
  });

  it('the Apply-side check finds the malformed expression', () => {
    const doc = parseBatch('ВЫБРАТЬ Т.Код КАК К ИЗ Справочник.Валюты КАК Т ГДЕ Т.Наименование + "50%" + = "x"');
    expect(findMalformedCustomExpressions(doc).length).toBeGreaterThan(0);
  });
});
