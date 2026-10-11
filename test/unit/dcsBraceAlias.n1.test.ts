/**
 * N1: in a virtual-table DCS brace parameter, the `КАК` check (already aliased?) ran over
 * the raw brace content. `КАК` inside a string literal therefore suppressed the
 * automatic `Поле<2k>` alias (`aliasDcsBraceExprs`) and the inner parentheses of a
 * bare parameter expression (`wrapDcsBraceParam`). Only a `КАК` in code counts now; a
 * literal payload gets the layout of a same-shaped neutral literal.
 */
import { describe, it, expect } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';

const gen = (text: string): string => generateBatch(parseBatch(text));
const neutral = (literal: string): string => `"${literal.slice(1, -1).replace(/[^\n"]/gu, 'a')}"`;
const VT = (args: string): string => `ВЫБРАТЬ О.Р КАК Р ИЗ РегистрНакопления.Р.Остатки(${args}) КАК О`;
const templates: Record<string, string> = {
  aliasFirst: VT('{(О.Х + $)}, {(О.У)}'),
  aliasCondition: VT(', {(О.Х = $)}'),
  bareParam: VT('{&П + $}'),
};

describe('N1: КАК inside a DCS-brace literal does not count as an alias', () => {
  for (const [name, template] of Object.entries(templates)) {
    it.each(['"a КАК b"', '"КАК"', '"x КАК"', '"как"'])(`${name}: %s`, payload => {
      const out = gen(template.replace('$', payload));
      expect(out).toContain(payload);
      expect(out.split(payload).join(neutral(payload))).toBe(gen(template.replace('$', neutral(payload))));
      expect(gen(out)).toBe(out);
    });
  }

  it('a КАК in code still marks the brace as aliased', () => {
    expect(gen(VT('{(О.Х) КАК Мое}, {(О.У)}'))).toContain('{(О.Х) КАК Мое}, {(О.У) КАК Поле4}');
  });
});
