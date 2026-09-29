import { describe, expect, it } from 'vitest';
import { generateBatch, moveNotBeforeTuple } from '../../src/core/query/sdblGenerator';
import { parseBatch } from '../../src/core/query/sdblParser';

describe('moveNotBeforeTuple (A1.4)', () => {
  it.each([
    ['(А, Б) НЕ В (&П)', 'НЕ (А, Б) В (&П)'],
    ['(Ф(А, Б), В) НЕ В (&П)', 'НЕ (Ф(А, Б), В) В (&П)'],
    ['((А), (Б)) НЕ В ИЕРАРХИИ (&П)', 'НЕ ((А), (Б)) В ИЕРАРХИИ (&П)'],
    ['("a)"",(", Б) НЕ В (&П)', 'НЕ ("a)"",(", Б) В (&П)'],
    ['(А, Б)\tНЕ\nВ\tИЕРАРХИИ  (&П)  ', 'НЕ (А, Б) В\tИЕРАРХИИ  (&П)  '],
    ['(А, Б) НЕ В(&П)', 'НЕ (А, Б) В(&П)'],
    ['(А, Б) НЕ В (&П) // хвост', 'НЕ (А, Б) В (&П) // хвост'],
  ])('preserves the existing transformation: %s', (input, expected) => {
    expect(moveNotBeforeTuple(input)).toBe(expected);
  });

  it.each([
    '', 'А НЕ В (&П)', ' (А, Б) НЕ В (&П)', '(А) НЕ В (&П)',
    '(Ф(А, Б)) НЕ В (&П)', '("a,b") НЕ В (&П)',
    '(А, Б) не в (&П)', '(А, Б) НЕ Внутри', '(А, Б)НЕ В (&П)',
    '(А, Б) НЕВ (&П)', '(А, Б) В (&П)', '((А, Б) НЕ В (&П)',
    '(А, Б) + В НЕ В (&П)', '(А, Б) // комментарий\nНЕ В (&П)',
  ])('leaves nonmatching input verbatim: %s', input => {
    expect(moveNotBeforeTuple(input)).toBe(input);
  });

  it.each([
    ["('(', Б) НЕ В (&П)", "НЕ ('(', Б) В (&П)"],
    ["(')', Б) НЕ В (&П)", "НЕ (')', Б) В (&П)"],
    ['(А, // )\nБ) НЕ В (&П)', 'НЕ (А, // )\nБ) В (&П)'],
    ['(А, // (\nБ) НЕ В (&П)', 'НЕ (А, // (\nБ) В (&П)'],
  ])('ignores parentheses in date tokens and comments: %s', (input, expected) => {
    expect(moveNotBeforeTuple(input)).toBe(expected);
  });

  it.each([
    ['(А, &) НЕ В (&П)'],
    ['(А, #) НЕ В (&П)'],
    ['(А, §) НЕ В (&П)'],
    ['(А, Б) НЕ В ("unfinished'],
    ['(А, "unfinished) НЕ В (&П)'],
    ["('(', Б) НЕ В (&)"],
    ["(А, 'unfinished) НЕ В (&П)"],
  ])('leaves lexer-rejected text untouched, including invalid tails: %s', (input) => {
    expect(moveNotBeforeTuple(input)).toBe(input);
  });
});

describe('tuple NOT membership through WHERE and HAVING generation', () => {
  it.each(['ГДЕ', 'ИМЕЮЩИЕ'])('%s preserves tuple membership and reopens stably', slot => {
    const query = `ВЫБРАТЬ Т.А ИЗ Спр.Т КАК Т ${slot} (Т.А, Т.Б) НЕ В ((1, 2))`;
    const out = generateBatch(parseBatch(query));
    expect(out).toContain('НЕ (Т.А, Т.Б) В');
    expect(generateBatch(parseBatch(out))).toBe(out);
  });
});
