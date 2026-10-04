/**
 * CASE conjuncts of composite virtual-table conditions (reindentVtCondition)
 * are recognised only by a `ВЫБОР` in code, and the head line is trimmed only
 * where its trailing whitespace is code (C25 R9): a literal payload neither
 * selects the CASE layout nor loses the whitespace before a line break.
 * Code CASE conjuncts keep their current layout.
 */
import { describe, it, expect } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';

/** The rendered virtual-table call `Остатки(…)` for the given arguments. */
const vt = (args: string): string => {
  const out = generateBatch(parseBatch(`ВЫБРАТЬ О.Р КАК Р ИЗ РегистрНакопления.Р.Остатки(${args}) КАК О`));
  return out.slice(out.indexOf('Остатки'), out.lastIndexOf(' КАК О'));
};
const head = 'Остатки(\n\t\t\t,\n\t\t\t';
/** Same lines and lengths, neutral content: `"a ⏎ВЫБОР"` → `"aa⏎aaaaa"`. */
const neutral = (literal: string): string => `"${literal.slice(1, -1).replace(/[^\n]/gu, 'a')}"`;

describe('code CASE conjuncts (unchanged output)', () => {
  it.each([
    [', Т.Г = 2 И ВЫБОР\nКОГДА Т.Х = 1 ТОГДА 1 ИНАЧЕ 0 КОНЕЦ = 1',
      `${head}Т.Г = 2\n\t\t\t\tИ ВЫБОР\n\t\t\t\t\tКОГДА Т.Х = 1\n\t\t\t\t\t\tТОГДА 1\n\t\t\t\t\tИНАЧЕ 0\n\t\t\t\tКОНЕЦ = 1)`],
    [', Т.Г = 2 И ВЫБОР КОГДА Т.Х = "a \nb" ТОГДА 1 ИНАЧЕ 0 КОНЕЦ = 1',
      `${head}Т.Г = 2\n\t\t\t\tИ ВЫБОР\n\t\t\t\t\tКОГДА Т.Х = "a \nb"\n\t\t\t\t\t\tТОГДА 1\n\t\t\t\t\tИНАЧЕ 0\n\t\t\t\tКОНЕЦ = 1)`],
    [', Т.Г = 2 И Т.Х = "a \nb"', `${head}Т.Г = 2\n\t\t\t\tИ Т.Х = "a \nb")`],
    [', Т.Х = "a \nВЫБОР"', `${head}Т.Х = "a \nВЫБОР")`],
  ])('%j', (args, output) => {
    expect(vt(args)).toBe(output);
  });
});

describe('a literal payload does not select the CASE layout', () => {
  const positions = [', Т.Г = 2 И Т.Х = $', ', Т.Х = $ И Т.Г = 2', ', Т.Г = 2 И Т.Х = $ И Т.У = 3', ', Т.Г = 2 ИЛИ Т.Х = $'];
  const payloads = ['"a \nВЫБОР"', '"a\t\nВЫБОР"', '"a   \nВЫБОР"', '"a \nКОГДА"', '"a \nТОГДА"', '"a \nКОНЕЦ"',
    '"a ""q"" \nВЫБОР"', '"a \nВЫБОРКА"', '"ВЫБОР \nb"'];
  for (const position of positions) {
    it.each(payloads)(`${JSON.stringify(position)} with %j`, literal => {
      const out = vt(position.replace('$', literal));
      expect(out).toContain(literal);
      expect(out.split(literal).join(neutral(literal))).toBe(vt(position.replace('$', neutral(literal))));
    });
  }
});

describe('a literal `ВЫБОР` keeps the group layout of the surrounding code', () => {
  const groups = [', Т.Г = 2 И (Т.Ф = 1\n  ИЛИ Т.Х = $)', ', Т.Г = 2 И (Т.Ф = 1\n  ИЛИ Т.Х = $\n  ИЛИ Т.Ц = 2)',
    ', Т.Г = 2 И (Т.Ф = $\n  И Т.Х = 1\n  ИЛИ Т.Ц = 2)'];
  for (const group of groups) {
    it.each(['"ВЫБОР"', '"a ВЫБОР b"', '"""ВЫБОР"""'])(`${JSON.stringify(group)} with %j`, literal => {
      const out = vt(group.replace('$', literal));
      expect(out).toContain(literal);
      expect(out.split(literal).join(neutral(literal))).toBe(vt(group.replace('$', neutral(literal))));
    });
  }
});

describe('the CASE head line keeps literal whitespace', () => {
  it.each([
    [', Т.Г = 2 И "a \nb" = ВЫБОР КОГДА Т.У = 1 ТОГДА "x" ИНАЧЕ "y" КОНЕЦ',
      `${head}Т.Г = 2\n\t\t\t\tИ "a \nb" = ВЫБОР\n\t\t\t\t\tКОГДА Т.У = 1\n\t\t\t\t\t\tТОГДА "x"\n\t\t\t\t\tИНАЧЕ "y"\n\t\t\t\tКОНЕЦ)`],
    [', Т.Г = 2 И ПОДСТРОКА("a \nb", 1, 2) = ВЫБОР\nКОГДА Т.У = 1 ТОГДА "x" КОНЕЦ',
      `${head}Т.Г = 2\n\t\t\t\tИ ПОДСТРОКА("a \nb", 1, 2) = ВЫБОР\n\t\t\t\t\tКОГДА Т.У = 1\n\t\t\t\t\t\tТОГДА "x"\n\t\t\t\tКОНЕЦ)`],
  ])('%j', (args, output) => {
    expect(vt(args)).toBe(output);
  });
});
