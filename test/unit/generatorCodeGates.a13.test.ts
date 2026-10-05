/**
 * A1-3: generator formatting gates read only code. Changing only the payload of a
 * string literal must not switch a gate around it: a syntax-looking payload
 * (`ВЫБОР`, `В (ВЫБРАТЬ`, `ТОГДА ВЫБОР`, `НЕ(`, …) gets the same surrounding
 * layout as a same-shaped neutral payload, and the literal stays byte-for-byte.
 */
import { describe, it, expect } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';

const gen = (text: string): string => generateBatch(parseBatch(text));
/** Same lines and lengths, neutral content: `"Т В (ВЫБРАТЬ"` → `"aaaaaaaaaaaa"`. */
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

const VT = (args: string): string => `ВЫБРАТЬ О.Р КАК Р ИЗ РегистрНакопления.Р.Остатки(${args}) КАК О`;
const F = 'ИЗ Справочник.Валюты КАК Т';
const SUBQ = 'Т.Ф В (ВЫБРАТЬ Х.А ИЗ Справочник.Валюты КАК Х ГДЕ Х.Н = $)';

describe('generator gates ignore literal payloads', () => {
  it('renderVirtualParams: inline-membership and CASE-parameter gates', () => {
    expectIsolated(VT(', Т.Х = $'), ['"Т В (ВЫБРАТЬ"', '"a В ИЕРАРХИИ (ВЫБРАТЬ"']);
    expectIsolated(VT(', Т.Х = ВЫБОР КОГДА Т.У = $ ТОГДА 1 ИНАЧЕ 0 КОНЕЦ'), ['"Т В (ВЫБРАТЬ"']);
  });

  it('reflowInlineMembershipSubquery: join, ИЗ and nested-CASE gates of the body', () => {
    expectIsolated(VT(`, ${SUBQ}`), ['"ТОГДА ВЫБОР\n"', '"x ЛЕВОЕ СОЕДИНЕНИЕ y"', '"a ИНАЧЕ ВЫБОР\nb"']);
    expectIsolated(`ВЫБРАТЬ Т.Код КАК Код ${F} ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Валюты КАК Х ПО Т.Ссылка = Х.Ссылка И Х.Код В\n`
      + '(ВЫБРАТЬ\n\t\tР.Код\n\tИЗ\n\t\tСправочник.Валюты КАК Р\n\tГДЕ\n\t\tР.Н = $)', ['"ТОГДА ВЫБОР\n"']);
  });

  it('breakInlineParenGroup: CASE/subquery bail-out', () => {
    expectIsolated(VT(', Т.Г = 2 И (Т.Ф = 1 ИЛИ Т.Х = $)'), ['"ВЫБОР"', '"a ВЫБРАТЬ b"', '"выбор"']);
  });

  it('reindentVtCondition: the two subquery gates after a broken paren group', () => {
    expectIsolated(VT(', Т.Г = 2 И (Т.Ф = 1 ИЛИ Т.Х = $)'), ['"Т В (ВЫБРАТЬ"', '"В ИЕРАРХИИ (ВЫБРАТЬ"', '"(ВЫБРАТЬ"']);
    expectIsolated(VT(', Т.Г = 2 И (Т.Ф = $ ИЛИ Т.Х = 1)'), ['"a ""Т В (ВЫБРАТЬ"" b"']);
  });

  it('builderBlock: CASE, subquery and НЕ( gates of a builder condition', () => {
    expectIsolated(`ВЫБРАТЬ Т.Код КАК Код ${F}\n{ГДЕ (Т.Н = $\nИЛИ Т.Код = 1)}`, ['"ВЫБОР"', '"НЕ(x)"', '"ВЫБРАТЬ"']);
  });
});
