/**
 * A1-6: parser/model lexical gates read only code. Changing only the payload of a
 * string literal must not change the parser route, the QueryModel or the generated
 * text around it: a syntax-looking payload gives the same model and text as a
 * same-shaped neutral payload, and the literal stays byte-for-byte.
 */
import { describe, it, expect } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { renderOperatorRhs } from '../../src/core/query/exprFormatter';
import { tryOpenDesignerBatch } from '../../src/webview/openDesignerBatch';
import { initialState, reducer } from '../../src/webview/state/queryStore';
import { computeBatchTextSafe } from '../../src/webview/computeBatchText';
import { decideApply, findStaticApplyBlocker } from '../../src/webview/applyGate';

const gen = (text: string): string => generateBatch(parseBatch(text));
/** Same lines and lengths, neutral content: `"a, b"` → `"aaaa"`. */
const neutral = (literal: string): string => `"${literal.slice(1, -1).replace(/[^\n"]/gu, 'a')}"`;
/** The parsed batch without positions, the payload written as its neutral form. */
const model = (text: string, payload?: string): string => {
  const json = JSON.stringify(parseBatch(text), (k, v) => (k === 'id' || k === 'sourceMap' || k === 'span') ? undefined : v);
  if (payload === undefined) return json;
  return json.split(JSON.stringify(payload).slice(1, -1)).join(JSON.stringify(neutral(payload)).slice(1, -1));
};

/** Model and text around `$` do not depend on the payload; reopening is stable. */
function expectIsolated(template: string, payloads: string[]): void {
  for (const payload of payloads) {
    const query = template.replace('$', payload);
    const control = template.replace('$', neutral(payload));
    expect(model(query, payload)).toBe(model(control));
    const out = gen(query);
    expect(out).toContain(payload);
    expect(out.split(payload).join(neutral(payload))).toBe(gen(control));
    expect(gen(out)).toBe(out);
  }
}

const F = 'ИЗ Справочник.Валюты КАК Т';
/** Designer open → generated text → Apply allowed. */
function designerApplies(text: string): boolean {
  const open = tryOpenDesignerBatch(text);
  if (!open.ok) return false;
  const state = reducer(initialState(), { type: 'LOAD_BATCH', doc: open.doc });
  const out = computeBatchTextSafe(state, true);
  return decideApply(out.text, out.error, findStaticApplyBlocker(state), undefined).ok;
}
/** A canonical (not compact) membership subquery `<lhs> В (ВЫБРАТЬ …)`. */
const SUBQ = (body: string): string => `(ВЫБРАТЬ\n\t\tХ.Код\n\tИЗ\n\t\tСправочник.Валюты КАК Х\n${body})`;

describe('A1-6a isPureBalancedList + valueListIsMulti: value list of В', () => {
  const payloads = ['"a"', '"("', '")"', '","', '"(,"', '"a ( b"', '"ВЫБРАТЬ"', '"(ВЫБРАТЬ"', '"a\n("'];
  it('WHERE: one, two and multi-line elements', () => {
    expectIsolated(`ВЫБРАТЬ Т.Код КАК К ${F} ГДЕ Т.Код В ($)`, payloads);
    expectIsolated(`ВЫБРАТЬ Т.Код КАК К ${F} ГДЕ Т.Код В ($, "z")`, payloads);
    expectIsolated(`ВЫБРАТЬ Т.Код КАК К ${F} ГДЕ Т.Код В ($,\n"z")`, payloads);
  });
  it('subquery body, HAVING and a bare field', () => {
    expectIsolated(`ВЫБРАТЬ Т.Код КАК К ${F} ГДЕ Т.Ссылка В (ВЫБРАТЬ Х.Ссылка ИЗ Справочник.Валюты КАК Х ГДЕ Х.Код В ($,\n"z"))`, payloads);
    expectIsolated(`ВЫБРАТЬ Т.Код КАК К ${F} СГРУППИРОВАТЬ ПО Т.Код ИМЕЮЩИЕ Т.Код В ($, "z")`, payloads);
    expectIsolated(`ВЫБРАТЬ Т.Код КАК К ${F} ГДЕ Код В ($, "z")`, payloads);
  });
  it('unknown lexical facts: one element, no flattening (fails closed, no raw scan)', () => {
    // An unterminated literal cannot be lexed. Parser input is always a lexed slice,
    // so only a direct call reaches this.
    expect(renderOperatorRhs('В', '("x, 1)')).toBe('В("x, 1)');
    expect(renderOperatorRhs('В', '("x,\n1)')).toBe('В("x,\n1)');
  });
});

describe('A1-6b isCompactSubquerySource: structural route of a non-field `В` subquery', () => {
  // A literal ВЫБРАТЬ … ИЗ on one line used to take the structural route.
  const payloads = ['"a"', '"ВЫБРАТЬ x ИЗ y"', '"a ВЫБРАТЬ, ИЗ b"', '"a\nВЫБРАТЬ x ИЗ y"'];
  it('literal in WHERE and in the select list of the subquery', () => {
    expectIsolated(`ВЫБРАТЬ Т.Код КАК К ${F} ГДЕ 1 В\n\t${SUBQ('\tГДЕ\n\t\tХ.Код = $')}`, payloads);
    expectIsolated(`ВЫБРАТЬ Т.Код КАК К ${F} ГДЕ &П В\n\t${SUBQ('\tГДЕ\n\t\tХ.Код = $')}`, payloads);
    expectIsolated(`ВЫБРАТЬ Т.Код КАК К ${F} ГДЕ 1 В\n\t(ВЫБРАТЬ\n\t\t$\n\tИЗ\n\t\tСправочник.Валюты КАК Х)`, payloads);
  });
  it('a code-compact subquery still takes the structural route; Designer applies', () => {
    const compact = `ВЫБРАТЬ Т.Код КАК К ${F} ГДЕ 1 В (ВЫБРАТЬ Х.Код ИЗ Справочник.Валюты КАК Х ГДЕ Х.Код = "ВЫБРАТЬ x ИЗ y")`;
    expect(model(compact)).toContain('"leftExpr":"1"');
    for (const payload of payloads) expect(designerApplies(`ВЫБРАТЬ Т.Код КАК К ${F} ГДЕ 1 В\n\t${SUBQ(`\tГДЕ\n\t\tХ.Код = ${payload}`)}`)).toBe(true);
  });
});
