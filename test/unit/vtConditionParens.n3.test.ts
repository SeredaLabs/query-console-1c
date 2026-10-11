/**
 * N3: `reindentVtCondition` counted the parentheses of a multi-line OR group per line
 * with a line-local quote toggle, so a `(` or `)` on a continuation line of a
 * multi-line string literal shifted the indent of the following lines (accumulation
 * and accounting virtual tables). Parentheses now count by the conjunct's code ranges;
 * a literal payload gets the layout of a same-shaped neutral literal.
 */
import { describe, it, expect } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';

const gen = (text: string): string => generateBatch(parseBatch(text));
const neutral = (literal: string): string => `"${literal.slice(1, -1).replace(/[^\n"]/gu, 'a')}"`;
const vts: Record<string, (c: string) => string> = {
  accumulation: c => `ВЫБРАТЬ О.Р КАК Р ИЗ РегистрНакопления.Р.Остатки(, ${c}) КАК О`,
  accounting: c => `ВЫБРАТЬ О.С КАК С ИЗ РегистрБухгалтерии.Х.Остатки(, , , ${c}) КАК О`,
};

describe('N3: a parenthesis inside a multi-line literal does not shift the OR group', () => {
  for (const [name, vt] of Object.entries(vts)) {
    it.each(['"a\n(b"', '"a\n)b"', '"a\n((b"', '"a)\nb("'])(`${name}: %j`, payload => {
      const template = '(Т.Х = $\nИЛИ Т.У = 1) И Т.Z = 2';
      const out = gen(vt(template.replace('$', payload)));
      expect(out).toContain(payload);
      expect(out.split(payload).join(neutral(payload))).toBe(gen(vt(template.replace('$', neutral(payload)))));
      expect(gen(out)).toBe(out);
    });
  }

  it('code parentheses still drive the group indent', () => {
    const out = gen(vts.accumulation('(Т.Х = 1\nИЛИ (Т.У = 1\nИ Т.W = 3)) И Т.Z = 2'));
    expect(out).toContain('\t\t\t\tИЛИ (Т.У = 1\n');
  });
});
