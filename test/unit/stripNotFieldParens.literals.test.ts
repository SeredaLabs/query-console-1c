/**
 * `НЕ(Алиас.Путь)` → `НЕ Алиас.Путь` (stripNotFieldParens) applies only inside
 * the lexer's code ranges (C25b-1). String literals and comments are user text
 * and stay byte-for-byte; when the text cannot be lexed it is left unchanged.
 * The rule itself is unchanged: these tests also pin its current output.
 */
import { describe, it, expect } from 'vitest';
import { stripNotFieldParens } from '../../src/core/query/exprFormatter';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';

const where = (condition: string): string =>
  `ВЫБРАТЬ Т.Код КАК Код ИЗ Справочник.Валюты КАК Т ГДЕ ${condition}`;
const head = 'ВЫБРАТЬ\n\tТ.Код КАК Код\nИЗ\n\tСправочник.Валюты КАК Т\nГДЕ\n';
const gen = (text: string, preserveComments = false): string =>
  generateBatch(parseBatch(text, undefined, preserveComments ? { preserveComments: true } : undefined));

describe('stripNotFieldParens: the rule in code (unchanged output)', () => {
  it.each([
    ['НЕ(Т.Поле)', 'НЕ Т.Поле'],
    ['НЕ(Т.А) И НЕ(Т.Б)', 'НЕ Т.А И НЕ Т.Б'],
    ['НЕ(\n\tТ.Поле\n)', 'НЕ Т.Поле'],
    ['Т.Н = "x" И НЕ(Т.А)', 'Т.Н = "x" И НЕ Т.А'],
    ['"x"НЕ(Т.А)', '"x"НЕ Т.А'],
    ['НЕ(Т.А = 1)', 'НЕ(Т.А = 1)'],
    ['ТНЕ(Т.А)', 'ТНЕ(Т.А)'],
  ])('%j → %j', (input, output) => {
    expect(stripNotFieldParens(input)).toBe(output);
  });

  it('WHERE: single negated field and a chain', () => {
    expect(gen(where('НЕ(Т.ПометкаУдаления)'))).toBe(`${head}\tНЕ Т.ПометкаУдаления`);
    expect(gen(where('НЕ(Т.ПометкаУдаления) И НЕ(Т.Предопределенный)')))
      .toBe(`${head}\tНЕ Т.ПометкаУдаления\n\tИ НЕ Т.Предопределенный`);
  });

  it('keeps the current output when a comment is present', () => {
    expect(gen(where('НЕ(Т.ПометкаУдаления) // НЕ(Т.Б)\n'), true))
      .toBe(`${head}\tНЕ Т.ПометкаУдаления\n\t// НЕ(Т.Б)`);
  });
});

describe('stripNotFieldParens: literals and comments are not rewritten', () => {
  it.each([
    ['Т.Наименование = "НЕ(x)"'],
    ['Т.Н = "a ""НЕ(x)"" b"'],
  ])('literal %j stays byte-for-byte', input => {
    expect(stripNotFieldParens(input)).toBe(input);
  });

  it('comment text stays byte-for-byte while code is rewritten', () => {
    expect(stripNotFieldParens('НЕ(Т.А) // НЕ(Т.Б)')).toBe('НЕ Т.А // НЕ(Т.Б)');
  });

  it('untokenizable text is left unchanged', () => {
    expect(stripNotFieldParens('НЕ(Т.А) И Т.Н = "x')).toBe('НЕ(Т.А) И Т.Н = "x');
  });

  it('WHERE: confirmed literal "НЕ(x)"', () => {
    expect(gen(where('Т.Наименование = "НЕ(x)"'))).toBe(`${head}\tТ.Наименование = "НЕ(x)"`);
  });

  it('WHERE OR-chain: literal kept, negated field still unwrapped', () => {
    expect(gen(where('Т.Код = 1 ИЛИ Т.Наименование = "НЕ(x)"')))
      .toBe(`${head}\t(Т.Код = 1\n\t\t\tИЛИ Т.Наименование = "НЕ(x)")`);
    expect(gen(where('НЕ(Т.ПометкаУдаления) ИЛИ Т.Наименование = "НЕ(x)"')))
      .toBe(`${head}\t(НЕ Т.ПометкаУдаления\n\t\t\tИЛИ Т.Наименование = "НЕ(x)")`);
  });

  it('HAVING: literal kept', () => {
    const text = 'ВЫБРАТЬ Т.Код КАК Код, КОЛИЧЕСТВО(*) КАК К ИЗ Справочник.Валюты КАК Т '
      + 'СГРУППИРОВАТЬ ПО Т.Код ИМЕЮЩИЕ КОЛИЧЕСТВО(*) > 1 ИЛИ МАКСИМУМ(Т.Наименование) = "НЕ(x)"';
    expect(gen(text)).toContain('\n\t\tИЛИ МАКСИМУМ(Т.Наименование) = "НЕ(x)")');
  });

  it('virtual-table condition: literal kept, negated field still unwrapped', () => {
    const text = 'ВЫБРАТЬ О.Регистратор КАК Р ИЗ РегистрНакопления.Р.Остатки(, НЕ(Т.Г) И Т.Н = "НЕ(x)") КАК О';
    expect(gen(text)).toContain('Остатки(\n\t\t\t,\n\t\t\tНЕ Т.Г\n\t\t\t\tИ Т.Н = "НЕ(x)") КАК О');
  });
});
