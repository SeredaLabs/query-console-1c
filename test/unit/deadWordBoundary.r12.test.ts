/**
 * R12: three guards used `\bВЫБРАТЬ\b` / `\bВЫБОР\b`. In JavaScript `\b` is an ASCII
 * word boundary even with `/u`, so on query text they never fired — except when the
 * word sat between two ASCII word characters (`_ВЫБРАТЬ_`, `aВЫБРАТЬb`), where they
 * misfired, also inside a string literal or an identifier, and skipped the CASE
 * layout (`reindentLeafCase`; the same guards stood in `reindentLeafBool` and the VT
 * parameter-CASE gate). The guards are removed; the surrounding logic already handles
 * subqueries and CASE without them, so ordinary text is unaffected.
 */
import { describe, it, expect } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';

const gen = (text: string): string => generateBatch(parseBatch(text));
const F = 'ИЗ Справочник.Валюты КАК Т';
const templates: Record<string, string> = {
  caseLeaf: `ВЫБРАТЬ\n\tСУММА(ВЫБОР\n\tКОГДА Т.Код = $\n\tТОГДА Т.Сумма\n\t+ 1\n\tИНАЧЕ 0\n\tКОНЕЦ) КАК Ф\n${F}`,
  boolLeaf: `ВЫБРАТЬ\n\tТ.Код = $\n\t\t\tИ Т.Код = 2 КАК Ф\n${F}`,
  vtCase: `ВЫБРАТЬ О.Р КАК Р ИЗ РегистрНакопления.Р.Остатки(, Т.Х = ВЫБОР\nКОГДА Т.У = $ ТОГДА Т.С\nИНАЧЕ 0\nКОНЕЦ) КАК О`,
};

describe('R12: ASCII-adjacent ВЫБРАТЬ/ВЫБОР no longer switches the layout', () => {
  for (const [name, template] of Object.entries(templates)) {
    it.each([
      ['"_ВЫБРАТЬ_"', '"aaaaaaaaa"'],
      ['"aВЫБРАТЬb"', '"aaaaaaaaa"'],
      ['"_ВЫБОР_"', '"aaaaaaa"'],
      ['Т._ВЫБРАТЬ_', 'Т.aaaaaaaaa'],
    ])(`${name}: %s lays out like %s`, (payload, neutral) => {
      const out = gen(template.replace('$', payload));
      expect(out).toContain(payload);
      expect(out.split(payload).join(neutral)).toBe(gen(template.replace('$', neutral)));
      expect(gen(out)).toBe(out);
    });
  }
});
