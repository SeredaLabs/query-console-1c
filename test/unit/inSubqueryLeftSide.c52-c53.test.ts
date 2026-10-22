import { describe, expect, it } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { tokenize } from '../../src/core/query/sdblLexer';

// C52 / C53: a non-reference left side of a compact `В (ВЫБРАТЬ …)` is printed by
// the `leftExpr` path; the multi-line output re-parses as a raw leaf. The raw leaf
// shifts the subquery one tab per leading `НЕ` (C52: `НЕ НЕ X В` moved on the second
// Save) and prints a left side split over lines on one line (C53: a tuple broken by a
// line comment or a line break kept a column-0 line until the next Save).

const S = 'Справочник.Валюты';
const SUB1 = `(ВЫБРАТЬ Х.Код ИЗ ${S} КАК Х)`;
const SUB2 = `(ВЫБРАТЬ Х.Код, Х.Наименование ИЗ ${S} КАК Х)`;
const W = `ВЫБРАТЬ Т.Код ИЗ ${S} КАК Т ГДЕ `;
const H = `ВЫБРАТЬ Т.Код ИЗ ${S} КАК Т СГРУППИРОВАТЬ ПО Т.Код, Т.Наименование ИМЕЮЩИЕ `;

const save = (text: string) => generateBatch(parseBatch(text, undefined, { preserveComments: true }));
const tail = (text: string, head: string) => text.slice(text.indexOf(head));
/** Code tokens only: the meaning of the text, independent of layout and comments. */
const code = (text: string) => tokenize(text).filter(t => t.type !== 'eof').map(t => t.value).join(' ');
const comments = (text: string) => text.match(/\/\/[^\n]*/g) ?? [];

/** The subquery block after `… В` with `(ВЫБРАТЬ` on `tabs` tabs. */
const block1 = (tabs: number) => {
  const t = '\t'.repeat(tabs);
  return `${t}(ВЫБРАТЬ\n${t}\tХ.Код\n${t}ИЗ\n${t}\t${S} КАК Х)`;
};
const block2 = (tabs: number, note = '') => {
  const t = '\t'.repeat(tabs);
  return `${t}(ВЫБРАТЬ\n${t}\tХ.Код,\n${t}\tХ.Наименование${note}\n${t}ИЗ\n${t}\t${S} КАК Х)`;
};

describe('C52: each leading НЕ of the left side shifts the subquery, on the first Save', () => {
  it.each([
    ['ГДЕ НЕ НЕ field', W + `НЕ НЕ Т.Код В ${SUB1}`, 'ГДЕ', `ГДЕ\n\tНЕ НЕ Т.Код В\n${block1(5)}`],
    ['ГДЕ НЕ НЕ НЕ field', W + `НЕ НЕ НЕ Т.Код В ${SUB1}`, 'ГДЕ', `ГДЕ\n\tНЕ НЕ НЕ Т.Код В\n${block1(6)}`],
    ['ГДЕ НЕ НЕ tuple', W + `НЕ НЕ (Т.Код, Т.Наименование) В ${SUB2}`, 'ГДЕ',
      `ГДЕ\n\tНЕ НЕ (Т.Код, Т.Наименование) В\n${block2(5)}`],
    ['ИМЕЮЩИЕ НЕ НЕ field', H + `НЕ НЕ Т.Код В ${SUB1}`, 'ИМЕЮЩИЕ', `ИМЕЮЩИЕ\n\tНЕ НЕ Т.Код В\n${block1(4)}`],
  ])('%s', (_name, input, head, expected) => {
    const once = save(input);
    expect(tail(once, head)).toBe(expected);
    expect(save(once)).toBe(once);
    expect(code(once)).toContain(code(input.slice(input.indexOf(head) + head.length + 1, input.indexOf(' В ('))));
  });

  it('inside a condition subquery', () => {
    const once = save(W + `Т.Код В (ВЫБРАТЬ Р.Код ИЗ ${S} КАК Р ГДЕ НЕ НЕ Р.Код В ${SUB1})`);
    expect(once).toContain('\t\t\t\tНЕ НЕ Р.Код В\n\t\t\t\t\t\t\t(ВЫБРАТЬ\n');
    expect(save(once)).toBe(once);
  });
});

describe('C53: a left side split over lines is printed on one line, on the first Save', () => {
  it.each([
    ['comment after the first element', W + `(Т.Код, // c\n Т.Наименование) В ${SUB2}`],
    ['comment after the last element', W + `(Т.Код, Т.Наименование // c\n) В ${SUB2}`],
    ['comment after the opening parenthesis', W + `( // c\n Т.Код, Т.Наименование) В ${SUB2}`],
    ['line break, no comment', W + `(Т.Код,\n Т.Наименование) В ${SUB2}`],
    ['line break and tabs', W + `(Т.Код,\n\t\tТ.Наименование) В ${SUB2}`],
  ])('ГДЕ: %s', (_name, input) => {
    const once = save(input);
    const lead = comments(input).map(c => `\t${c}\n`).join('');
    expect(tail(once, 'ГДЕ')).toBe(`ГДЕ\n${lead}\t(Т.Код, Т.Наименование) В\n${block2(3)}`);
    expect(save(once)).toBe(once);
  });

  it.each([
    ['ИМЕЮЩИЕ', H + `(Т.Код, // c\n Т.Наименование) В ${SUB2}`, 'ИМЕЮЩИЕ',
      `ИМЕЮЩИЕ\n\t// c\n\t(Т.Код, Т.Наименование) В\n${block2(2)}`],
    ['a conjunct', W + `Т.Код = 1 И (Т.Код, // c\n Т.Наименование) В ${SUB2}`, 'ГДЕ',
      `ГДЕ\n\tТ.Код = 1\n\t// c\n\tИ (Т.Код, Т.Наименование) В\n${block2(3)}`],
    ['a literal tuple', W + `(1, // c\n 2) В ${SUB2}`, 'ГДЕ', `ГДЕ\n\t// c\n\t(1, 2) В\n${block2(3)}`],
    // Stable on main, but with the column-0 line: now the same one-line layout.
    ['`НЕ В`', W + `(Т.Код, // c\n Т.Наименование) НЕ В ${SUB2}`, 'ГДЕ',
      `ГДЕ\n\t// c\n\tНЕ (Т.Код, Т.Наименование) В\n${block2(4)}`],
    ['a commented subquery', W + `(Т.Код, // c\n Т.Наименование) В (ВЫБРАТЬ Х.Код, Х.Наименование // d\n ИЗ ${S} КАК Х)`,
      'ГДЕ', `ГДЕ\n\t// c\n\t(Т.Код, Т.Наименование) В\n${block2(3, ' // d')}`],
    ['a function call', W + `ЕСТЬNULL(Т.Код,\n 0) В ${SUB1}`, 'ГДЕ', `ГДЕ\n\tЕСТЬNULL(Т.Код, 0) В\n${block1(3)}`],
  ])('%s', (_name, input, head, expected) => {
    const once = save(input);
    expect(tail(once, head)).toBe(expected);
    expect(save(once)).toBe(once);
  });

  it('keeps every comment and the code of the condition', () => {
    const input = W + `(Т.Код, // c\n Т.Наименование) В ${SUB2}`;
    const once = save(input);
    expect(comments(once)).toEqual(comments(input));
    expect(code(once)).toBe(code(save(input.replace(' // c\n', ' '))));
  });

  it('inside a condition subquery', () => {
    const once = save(W + `Т.Код В (ВЫБРАТЬ Р.Код ИЗ ${S} КАК Р ГДЕ (Р.Код, // c\n Р.Наименование) В ${SUB2})`);
    expect(once).toContain('\t\t\t\t// c\n\t\t\t\t(Р.Код, Р.Наименование) В\n');
    expect(save(once)).toBe(once);
  });
});

describe('C52 / C53: unchanged controls', () => {
  it.each([
    ['single НЕ', W + `НЕ Т.Код В ${SUB1}`, `ГДЕ\n\tНЕ Т.Код В\n${block1(4)}`],
    ['НЕ before a tuple НЕ В', W + `НЕ (Т.Код, Т.Наименование) НЕ В ${SUB2}`,
      `ГДЕ\n\tНЕ (Т.Код, Т.Наименование) НЕ В\n${block2(4)}`],
    ['one-line tuple', W + `(Т.Код, Т.Наименование) В ${SUB2}`, `ГДЕ\n\t(Т.Код, Т.Наименование) В\n${block2(3)}`],
  ])('%s', (_name, input, expected) => {
    const once = save(input);
    expect(tail(once, 'ГДЕ')).toBe(expected);
    expect(save(once)).toBe(once);
  });

  it('a single-field ИМЕЮЩИЕ IN-subquery keeps base 3', () => {
    const once = save(H + `Т.Код В ${SUB1}`);
    expect(tail(once, 'ИМЕЮЩИЕ')).toBe(`ИМЕЮЩИЕ\n\tТ.Код В\n${block1(3)}`);
  });
});
