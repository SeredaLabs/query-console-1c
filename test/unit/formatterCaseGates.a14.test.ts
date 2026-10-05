/**
 * A1-4: the formatter's nested-CASE gates (`isSingleTopLevelCaseValue`,
 * `opensWithTopLevelVybor`) read only code. Changing only the payload of a string
 * literal must not switch them: a syntax-looking payload (`ВЫБОР`, `ВЫБРАТЬ`, …) gets
 * the same surrounding CASE layout as a same-shaped neutral payload, and the literal
 * stays byte-for-byte.
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

/** A CASE whose ТОГДА value is `value`. */
const caseThen = (value: string): string =>
  `ВЫБРАТЬ\n\tВЫБОР\n\t\tКОГДА Т.Код = "1"\n\t\t\tТОГДА ${value}\n\t\tИНАЧЕ 0\n\tКОНЕЦ КАК Ф\nИЗ Справочник.Валюты КАК Т`;

describe('formatter CASE gates ignore literal payloads', () => {
  it('isSingleTopLevelCaseValue: one top-level ВЫБОР, no ВЫБРАТЬ', () => {
    const payloads = ['"a"', '"ВЫБОР"', '"ВЫБРАТЬ"', '"a ВЫБОР b"', '"x ВЫБРАТЬ y"', '"a\nВЫБОР"'];
    expectIsolated(caseThen('Т.Сумма * ВЫБОР\n\t\t\t\tКОГДА Т.Код = $\n\t\t\t\t\tТОГДА 1\n\t\t\t\tИНАЧЕ 0\n\t\t\tКОНЕЦ'), payloads);
    expectIsolated(caseThen('$ + Т.Сумма * ВЫБОР\n\t\t\t\tКОГДА Т.Код = "1"\n\t\t\t\t\tТОГДА 1\n\t\t\tКОНЕЦ'), payloads);
  });

  it('opensWithTopLevelVybor: CASE-arithmetic chain without ВЫБРАТЬ', () => {
    const chain = (first: string, second: string): string => caseThen(
      `ВЫБОР\n\t\t\t\tКОГДА Т.Код = ${first}\n\t\t\t\t\tТОГДА 1\n\t\t\tКОНЕЦ - ВЫБОР\n\t\t\t\tКОГДА Т.Код = ${second}\n\t\t\t\t\tТОГДА 2\n\t\t\tКОНЕЦ`);
    const payloads = ['"a"', '"ВЫБРАТЬ"', '"x ВЫБРАТЬ y"', '"a\nВЫБРАТЬ"', '"ВЫБОР"'];
    expectIsolated(chain('$', '"2"'), payloads);
    expectIsolated(chain('"1"', '$'), payloads);
  });

  it('opensWithTopLevelVybor: CASE inside a call opener', () => {
    expectIsolated(caseThen('ВЫРАЗИТЬ(Т.Сумма / ВЫБОР\n\t\t\t\tКОГДА Т.Код = $\n\t\t\t\t\tТОГДА 1\n\t\t\t\tИНАЧЕ 2\n\t\t\tКОНЕЦ КАК Число(15, 2))'),
      ['"a"', '"ВЫБРАТЬ"', '"x ВЫБРАТЬ y"']);
  });
});
