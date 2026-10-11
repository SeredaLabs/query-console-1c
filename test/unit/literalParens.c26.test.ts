/**
 * C26: `sdblParser.stripOuterParens` (builder `{ГДЕ …}` field, arbitrary JOIN conjunct,
 * whole arbitrary JOIN condition) decided whether the whole text sits in one outer pair
 * by counting every parenthesis, also inside string literals. A `(` or `)` in a literal
 * kept the outer pair, the generator added its own, and every Designer → Apply → reopen
 * added one more pair (Apply allowed each step). Parentheses now count only in code
 * (shared lexer `codeRanges`); unknown lexical facts keep the pair. The generator's
 * `stripOneEnclosingParen` (JOIN И-chain split) had the same rule and follows it too.
 *
 * Platform (СхемаЗапроса, SL_kza 2026-10-11): the JOIN cases print one pair,
 * `И (Т.Наименование = "(y")`, which is now our text byte for byte.
 */
import { describe, it, expect } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { tryOpenDesignerBatch } from '../../src/webview/openDesignerBatch';
import { initialState, reducer } from '../../src/webview/state/queryStore';
import { computeBatchTextSafe } from '../../src/webview/computeBatchText';
import { decideApply, findStaticApplyBlocker } from '../../src/webview/applyGate';

const gen = (text: string): string => generateBatch(parseBatch(text));
const neutral = (literal: string): string => `"${literal.slice(1, -1).replace(/[^\n"]/gu, 'a')}"`;

/** One Designer open → generated text → Apply decision. */
function designer(text: string): { text: string; applyOk: boolean } {
  const open = tryOpenDesignerBatch(text);
  if (!open.ok) throw new Error(open.error);
  const state = reducer(initialState(), { type: 'LOAD_BATCH', doc: open.doc });
  const out = computeBatchTextSafe(state, true);
  return { text: out.text, applyOk: decideApply(out.text, out.error, findStaticApplyBlocker(state), undefined).ok };
}

const F = 'ИЗ Справочник.Валюты КАК Т';
const J = `${F} ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Валюты КАК Х ПО`;
const contexts: Record<string, string> = {
  builderWhere: `ВЫБРАТЬ Т.Код КАК К ${F}\n{ГДЕ (Т.Наименование = $ ИЛИ Т.Код = 2)}`,
  joinConjunctSubquery: `ВЫБРАТЬ Т.Код КАК К ${J} Т.Ссылка = Х.Ссылка И Х.Код В (ВЫБРАТЬ Р.Код ИЗ Справочник.Валюты КАК Р ГДЕ Р.Наименование = $) И Х.Код = 1`,
  joinAndSplit: `ВЫБРАТЬ Т.Код КАК К ${J} (Т.Ссылка = Х.Ссылка И (Т.Наименование = $) И Х.Код = 1)`,
};
const payloads = ['"(y"', '")y"', '"((y"', '"a)(b"', '"a\n(y"', '"a)\nb"'];

describe('C26: a parenthesis inside a literal does not add parentheses on reopen', () => {
  for (const [name, template] of Object.entries(contexts)) {
    it.each(payloads)(`${name}: %j — 3 Designer → Apply → reopen cycles`, payload => {
      const first = designer(template.replace('$', payload));
      expect(first.applyOk).toBe(true);
      expect(first.text).toContain(payload);
      let text = first.text;
      for (let cycle = 0; cycle < 3; cycle++) {
        const next = designer(text);
        expect(next.applyOk).toBe(true);
        expect(next.text).toBe(text);
        text = next.text;
      }
      // The layout does not depend on the literal payload.
      expect(first.text.split(payload).join(neutral(payload))).toBe(designer(template.replace('$', neutral(payload))).text);
    });
  }
});

describe('C26: platform canonical text for the JOIN cases', () => {
  it('JOIN conjunct with a subquery', () => {
    expect(gen(`ВЫБРАТЬ Т.Код КАК К ${J} Т.Ссылка = Х.Ссылка И Х.Код В (ВЫБРАТЬ Р.Код ИЗ Справочник.Валюты КАК Р ГДЕ Р.Наименование = "(y") И Х.Код = "1"`))
      .toContain('\t\tПО Т.Ссылка = Х.Ссылка\n\t\t\tИ (Х.Код В\n\t\t\t\t(ВЫБРАТЬ\n\t\t\t\t\tР.Код\n\t\t\t\tИЗ\n\t\t\t\t\tСправочник.Валюты КАК Р\n\t\t\t\tГДЕ\n\t\t\t\t\tР.Наименование = "(y"))\n\t\t\tИ (Х.Код = "1")');
  });

  it('JOIN И-chain split', () => {
    expect(gen(`ВЫБРАТЬ Т.Код КАК К ${J} (Т.Ссылка = Х.Ссылка И (Т.Наименование = "(y") И Х.Код = "1")`)).toBe(
      'ВЫБРАТЬ\n\tТ.Код КАК К\nИЗ\n\tСправочник.Валюты КАК Т\n\t\tЛЕВОЕ СОЕДИНЕНИЕ Справочник.Валюты КАК Х\n' +
      '\t\tПО Т.Ссылка = Х.Ссылка\n\t\t\tИ (Т.Наименование = "(y")\n\t\t\tИ (Х.Код = "1")',
    );
  });
});

describe('C26: what still holds', () => {
  it('code parentheses are handled as before', () => {
    expect(gen(`ВЫБРАТЬ Т.Код КАК К ${J} Т.Ссылка = Х.Ссылка И ((НЕ Х.Код = 1))`)).toContain('\t\t\tИ (НЕ Х.Код = 1)');
    // The builder strips one code pair and the generator adds one: unchanged and stable.
    const builder = gen(`ВЫБРАТЬ Т.Код КАК К ${F}\n{ГДЕ ((Т.Код = 1 ИЛИ Т.Код = 2))}`);
    expect(builder).toContain('\t((Т.Код = 1 ИЛИ Т.Код = 2)) КАК Поле2}');
    expect(gen(builder)).toBe(builder);
    expect(gen(`ВЫБРАТЬ Т.Код КАК К ${F}\n{ГДЕ (Т.Код = 1 ИЛИ Т.Код = 2)}`)).toContain('\t(Т.Код = 1 ИЛИ Т.Код = 2) КАК Поле2}');
  });

  it.each(['(', ')', '(('])('a parenthesis in a comment changes nothing: %j', mark => {
    const text = `ВЫБРАТЬ Т.Код КАК К ${F}\n{ГДЕ (Т.Наименование = "y" // ${mark}\nИЛИ Т.Код = 2)}`;
    const first = designer(text);
    expect(first.text).toContain(`// ${mark}`);
    expect(designer(first.text).text).toBe(first.text);
  });
});
