/**
 * R8: `sdblParser.nestingPad` (C22/C23 nesting-pad detection) applied its section-line
 * pattern to every line of a nested query, including continuation lines of a multi-line
 * string literal. A literal line starting with a section word (`"aaa⏎ГДЕ"`) was taken
 * for a section, the rebase was skipped and the subquery moved one tab deeper. Lines
 * that start inside a literal no longer count; the payload gets the layout of a
 * same-shaped neutral literal.
 */
import { describe, it, expect } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';

const gen = (text: string): string => generateBatch(parseBatch(text));
const neutral = (literal: string): string => `"${literal.slice(1, -1).replace(/[^\n"]/gu, 'a')}"`;
const SUB = (p: string): string => `\n(ВЫБРАТЬ\n\t\tР.К\n\tИЗ\n\t\tСправочник.Р КАК Р\n\tГДЕ\n\t\tР.Н = ${p})`;
const contexts: Record<string, (p: string) => string> = {
  vtCondition: p => `ВЫБРАТЬ О.Р КАК Р ИЗ РегистрНакопления.Р.Остатки(, Номенклатура В${SUB(p)}) КАК О`,
  joinOn: p => `ВЫБРАТЬ Т.Код КАК К ИЗ Справочник.Валюты КАК Т ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Валюты КАК Х ПО Т.Код В${SUB(p)}`,
  caseBranch: p => `ВЫБРАТЬ ВЫБОР КОГДА Т.Код В${SUB(p)} ТОГДА 1 ИНАЧЕ 0 КОНЕЦ КАК Ф ИЗ Справочник.Валюты КАК Т`,
};

describe('R8: a literal line starting with a section word is not a section', () => {
  for (const [name, make] of Object.entries(contexts)) {
    it.each(['"aaa\nГДЕ"', '"aaa\nИЗ"', '"a\nСГРУППИРОВАТЬ ПО"', '"a\nУПОРЯДОЧИТЬ"'])(`${name}: %j`, payload => {
      const out = gen(make(payload));
      expect(out).toContain(payload);
      expect(out.split(payload).join(neutral(payload))).toBe(gen(make(neutral(payload))));
      expect(gen(out)).toBe(out);
    });
  }
});
