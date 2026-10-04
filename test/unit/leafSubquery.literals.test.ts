/**
 * Leaf subquery re-indentation (reindentLeafSubquery) keeps multi-line string
 * literals byte-for-byte (C25 R3): when a line break lies inside a literal the
 * leaf is kept as written instead of being re-indented line by line, so the
 * literal payload cannot change the code around it. Covered through a JOIN
 * `ПО` condition, a virtual-table condition and a CASE branch. Code-only
 * subqueries keep their current canonical layout.
 */
import { describe, it, expect } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { reindentLeafSubquery } from '../../src/core/query/exprFormatter';

const gen = (text: string): string => generateBatch(parseBatch(text));
const SUB = (literal: string): string =>
  `(ВЫБРАТЬ\n\t\tР.К\n\tИЗ\n\t\tСправочник.Р КАК Р\n\tГДЕ\n\t\tР.Н = ${literal})`;
const contexts: Record<string, (literal: string) => string> = {
  join: l => `ВЫБРАТЬ Т.Код КАК Код ИЗ Справочник.Валюты КАК Т ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Валюты КАК Х ПО Т.Ссылка = Х.Ссылка И Х.Код В\n${SUB(l)}\nИ Х.Код = 1`,
  vt: l => `ВЫБРАТЬ О.Р КАК Р ИЗ РегистрНакопления.Р.Остатки(, Склад = &С И Номенклатура В\n${SUB(l)}) КАК О`,
  case: l => `ВЫБРАТЬ ВЫБОР КОГДА Т.Код = 1 ТОГДА Т.Код В\n${SUB(l)}\nИНАЧЕ ЛОЖЬ КОНЕЦ КАК Поле ИЗ Справочник.Валюты КАК Т`,
};
/** Same lines and lengths, neutral content: `"x⏎ИЛИ y"` → `"a⏎aaaaa"`. */
const neutral = (literal: string): string => `"${literal.slice(1, -1).replace(/[^\n]/gu, 'a')}"`;
/** Payload shapes of the separate ledger findings R8 and C26 (see below). */
const R8_PAYLOAD = /\n(?:ИЗ|ГДЕ)(?![\p{L}\p{N}_])/u;
const C26_PAYLOAD = /\(/u;
const payloads = [
  '"a\n  b"',
  '"а   \n\nПО б   \nИ\n\t\tв"',
  '"x\nИЛИ y\nИ z"',
  '"ВЫБОР\nВЫБРАТЬ 1\nГДЕ"',
  '"a\n)  ( b"',
  '"{\n}  {"',
  '"a ""q""\n  ""r"" b"',
  '"x\nИ (z"',
];

describe('code-only subqueries (unchanged output)', () => {
  it.each([
    ['join', 'ВЫБРАТЬ\n\tТ.Код КАК Код\nИЗ\n\tСправочник.Валюты КАК Т\n\t\tЛЕВОЕ СОЕДИНЕНИЕ Справочник.Валюты КАК Х\n\t\tПО Т.Ссылка = Х.Ссылка\n\t\t\tИ (Х.Код В\n\t\t\t\t(ВЫБРАТЬ\n\t\t\t\t\tР.К\n\t\t\t\tИЗ\n\t\t\t\t\tСправочник.Р КАК Р\n\t\t\t\tГДЕ\n\t\t\t\t\tР.Н = "abc"))\n\t\t\tИ (Х.Код = 1)'],
    ['vt', 'ВЫБРАТЬ\n\tО.Р КАК Р\nИЗ\n\tРегистрНакопления.Р.Остатки(\n\t\t\t,\n\t\t\tСклад = &С\n\t\t\t\tИ Номенклатура В\n\t\t\t\t\t(ВЫБРАТЬ\n\t\t\t\t\t\tР.К\n\t\t\t\t\tИЗ\n\t\t\t\t\t\tСправочник.Р КАК Р\n\t\t\t\t\tГДЕ\n\t\t\t\t\t\tР.Н = "abc")) КАК О'],
    ['case', 'ВЫБРАТЬ\n\tВЫБОР\n\t\tКОГДА Т.Код = 1\n\t\t\tТОГДА Т.Код В\n\t\t\t\t\t(ВЫБРАТЬ\n\t\t\t\t\t\tР.К\n\t\t\t\t\tИЗ\n\t\t\t\t\t\tСправочник.Р КАК Р\n\t\t\t\t\tГДЕ\n\t\t\t\t\t\tР.Н = "abc")\n\t\tИНАЧЕ ЛОЖЬ\n\tКОНЕЦ КАК Поле\nИЗ\n\tСправочник.Валюты КАК Т'],
  ])('%s with a one-line literal', (name, output) => {
    expect(gen(contexts[name]('"abc"'))).toBe(output);
  });
});

describe('multi-line literals stay byte-for-byte', () => {
  for (const [name, make] of Object.entries(contexts)) {
    it.each(payloads)(`${name}: %j`, literal => {
      const out = gen(make(literal));
      expect(out).toContain(literal);
      // Only the payload differs from a same-shaped neutral literal. Excluded:
      // R8 (ledger) — a literal line starting with a section word at column 0
      // (`⏎ГДЕ`) is read by the parser's nestingPad scan. Not fixed here.
      if (R8_PAYLOAD.test(literal)) return;
      expect(out.split(literal).join(neutral(literal))).toBe(gen(make(neutral(literal))));
    });
  }
});

describe('round trip is a fixed point', () => {
  // Excluded: C26 (ledger) — a `(` inside a literal makes a JOIN condition gain
  // one more pair of parentheses on every reopen, with or without this fix.
  // Literal bytes for these payloads are still checked above.
  for (const [name, make] of Object.entries(contexts)) {
    it.each(payloads.filter(p => !C26_PAYLOAD.test(p)))(`${name}: %j`, literal => {
      const once = gen(make(literal));
      expect(gen(once)).toBe(once);
    });
  }
});

describe('direct', () => {
  it('a line break inside a literal or unknown lexical facts keep the text', () => {
    expect(reindentLeafSubquery('Т.А В\n(ВЫБРАТЬ Р.К ИЗ Справочник.Р КАК Р ГДЕ Р.Н = "a\n  b")', 2))
      .toBe('Т.А В\n(ВЫБРАТЬ Р.К ИЗ Справочник.Р КАК Р ГДЕ Р.Н = "a\n  b")');
    // `$` cannot be lexed; this text used to be re-indented.
    const unknown = 'Т.А$ В\n(ВЫБРАТЬ\nР.К\nИЗ\nСправочник.Р КАК Р\nГДЕ\nР.Н = 1)';
    expect(reindentLeafSubquery(unknown, 2)).toBe(unknown);
  });
});
