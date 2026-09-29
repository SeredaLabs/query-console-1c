import { describe, expect, it } from 'vitest';
import { hasTopLevelComma, generateBatch } from '../../src/core/query/sdblGenerator';
import { parseBatch } from '../../src/core/query/sdblParser';

describe('hasTopLevelComma (A1.3)', () => {
  it.each([
    ['', false],
    ['Т.А', false],
    ['Т.А, &П', true],
    ['Ф(А, Б)', false],
    ['Ф(А, Г(Б, В)), Д', true],
    ['(А, Б)', false],
    ['"a,b"', false],
    ['"a"",b"', false],
    ['"a"",b", В', true],
    ['&П, #Имя#', true],
    ['{А, Б}', true],
    ['[А, Б]', true],
    [')А, Б', false],
    ['(А, Б', false],
  ])('preserves existing result for %j', (text, expected) => {
    expect(hasTopLevelComma(text as string)).toBe(expected);
  });

  it.each([
    ["'a,b'", false],
    ["'(', А", true],
    ['А // ,', false],
    ['А // (\n, Б', true],
    ['Ф(А // )\n, Б)', false],
  ])('takes literal/comment boundaries from tokens: %j', (text, expected) => {
    expect(hasTopLevelComma(text as string)).toBe(expected);
  });

  it.each([
    ['А, "unfinished'],
    ['"unfinished,'],
    ["'unfinished,"],
    ['&, А'],
    ['#(А, Б)'],
    ['§, А'],
    ['(§, А)'],
  ])('returns unknown for lexer-rejected text: %j', (text) => {
    expect(hasTopLevelComma(text as string)).toBeUndefined();
  });
});

describe('comma detection through generator consumers', () => {
  it.each([
    ['{&П}', '{(&П)}'],
    ['{&П, &Б}', '{&П, &Б}'],
    ['{(&П + 1)}', '{(&П + 1) КАК Поле2}'],
    ['{(&П + "a,b")}', '{(&П + "a,b") КАК Поле2}'],
  ])('preserves DCS parameter/list formatting for %s', (input, expected) => {
    const out = generateBatch(parseBatch(
      `ВЫБРАТЬ Т.А ИЗ РегистрНакопления.Продажи.Остатки(${input}, ) КАК Т`,
    ));
    expect(out).toContain(`Остатки(${expected}, ) КАК Т`);
  });

  it('keeps tuple membership distinct from scalar membership', () => {
    const gen = (expr: string) => generateBatch(parseBatch(
      `ВЫБРАТЬ Т.А ИЗ Спр.Т КАК Т ГДЕ ${expr}`,
    ));
    expect(gen('(Т.А, Т.Б) НЕ В (&П)')).toContain('НЕ (Т.А, Т.Б) В');
    expect(gen('(Т.А) НЕ В (&П)')).not.toContain('НЕ (Т.А) В');
    expect(gen('(Т.А + "a,b") НЕ В (&П)')).not.toContain('НЕ (Т.А +');
  });

  it('keeps NOT grouping for tuples and removes it for a scalar JOIN operand', () => {
    const gen = (expression: string) => {
      const doc = parseBatch('ВЫБРАТЬ Т.А ИЗ Спр.Т КАК Т ЛЕВОЕ СОЕДИНЕНИЕ Спр.Б КАК Б ПО Т.А = Б.А');
      doc.members[0].members[0].model.joins![0].conditions = [{ custom: true, expression }];
      return generateBatch(doc);
    };
    expect(gen('НЕ (Т.А = "a,b")')).toContain('(НЕ Т.А = "a,b")');
    // Lexer date-token robustness for manual input, not a platform-valid date claim.
    expect(gen("НЕ (Т.А = 'a,b')")).toContain("(НЕ Т.А = 'a,b')");
    expect(gen('НЕ (Т.А, Т.Б)')).toContain('(НЕ (Т.А, Т.Б))');
  });
});
