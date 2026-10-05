/**
 * A1-5: formatter/generator lexical gates read only code. Changing only the payload
 * of a string literal must not switch a gate around it: a syntax-looking payload
 * gets the same surrounding layout as a same-shaped neutral payload, and the
 * literal stays byte-for-byte.
 */
import { describe, it, expect } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';

const gen = (text: string): string => generateBatch(parseBatch(text));
/** Same lines and lengths, neutral content: `"a ВЫБОР"` → `"aaaaaaa"`. */
const neutral = (literal: string): string => `"${literal.slice(1, -1).replace(/[^\n"]/gu, 'a')}"`;

/** The layout around `$` does not depend on the literal payload, and reopening is stable. */
function expectIsolated(template: string, payloads: string[]): void {
  for (const payload of payloads) {
    const out = gen(template.replace('$', payload));
    expect(out).toContain(payload);
    expect(out.split(payload).join(neutral(payload))).toBe(gen(template.replace('$', neutral(payload))));
    expect(gen(out)).toBe(out);
  }
}

const F = 'ИЗ Справочник.Валюты КАК Т';
/** A CASE whose ТОГДА value is `value`. */
const caseThen = (value: string): string =>
  `ВЫБРАТЬ\n\tВЫБОР\n\t\tКОГДА Т.Код = "1"\n\t\t\tТОГДА ${value}\n\t\tИНАЧЕ 0\n\tКОНЕЦ КАК Ф\n${F}`;

describe('A1-5a stripRedundantCaseClauseParens: ВЫРАЗИТЬ/ВЫБОР/ВЫБРАТЬ gate', () => {
  const payloads = ['"a"', '"ВЫБОР"', '"ВЫБРАТЬ"', '"ВЫРАЗИТЬ"', '"x ВЫБРАТЬ y"', '"a\nВЫБОР"'];
  it('leaf CASE clause parens', () => {
    expectIsolated(`ВЫБРАТЬ\n\tСУММА(ВЫБОР\n\tКОГДА (Т.Код = $)\n\tТОГДА (Т.Сумма - 1)\n\tИНАЧЕ 0\n\tКОНЕЦ) КАК Ф\n${F}`, payloads);
  });
  it('THEN value parens', () => {
    expectIsolated(caseThen('(Т.Код + $)'), payloads);
    expectIsolated(caseThen('(Т.Код\n\t\t\t+ $)'), payloads);
  });
});
