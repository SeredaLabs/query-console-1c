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

describe('A1-6c hasRedundantHavingOrParens: structural route for an ИМЕЮЩИЕ OR chain', () => {
  const having = (cond: string): string =>
    `ВЫБРАТЬ Т.Код КАК К ${F} ГДЕ 1 В\n\t${SUBQ(`\tСГРУППИРОВАТЬ ПО\n\t\tХ.Код\n\tИМЕЮЩИЕ\n\t\t${cond}`)}`;
  it('a literal ИМЕЮЩИЕ … ИЛИ before a real ИМЕЮЩИЕ, and literal section words or ИЛИ inside it', () => {
    // Excluded: R8 (ledger) — a literal line that starts with a section word at column 0
    // (`"a⏎ИМЕЮЩИЕ …"`) is read by the parser's nestingPad scan. Not fixed here.
    expectIsolated(`ВЫБРАТЬ Т.Код КАК К ${F} ГДЕ 1 В\n\t${SUBQ('\tГДЕ\n\t\tХ.Код = $\n\tСГРУППИРОВАТЬ ПО\n\t\tХ.Код')}`,
      ['"a"', '"ИМЕЮЩИЕ a ИЛИ b"', '"a ИМЕЮЩИЕ\nx ИЛИ y"']);
    expectIsolated(having('(МАКСИМУМ(Х.Код) = $\n\t\t\tИ МАКСИМУМ(Х.Код) = "1")\n\t\tИЛИ МАКСИМУМ(Х.Код) = "2"'),
      ['"a"', '"УПОРЯДОЧИТЬ"', '"ИТОГИ"', '"x ОБЪЕДИНИТЬ y"']);
    expectIsolated(having('(МАКСИМУМ(Х.Код) = $\n\t\t\tИ МАКСИМУМ(Х.Код) = "1")'), ['"a"', '"ИЛИ"', '"a ИЛИ b"']);
  });
  it('a code OR chain in ИМЕЮЩИЕ still takes the structural route; Designer applies', () => {
    expect(model(having('(МАКСИМУМ(Х.Код) = "1"\n\t\t\tИ МАКСИМУМ(Х.Код) = "2")\n\t\tИЛИ МАКСИМУМ(Х.Код) = "3"'))).toContain('"leftExpr":"1"');
    expect(designerApplies(having('(МАКСИМУМ(Х.Код) = "УПОРЯДОЧИТЬ"\n\t\t\tИ МАКСИМУМ(Х.Код) = "1")\n\t\tИЛИ МАКСИМУМ(Х.Код) = "2"'))).toBe(true);
  });
});

describe('A1-6d expandAndChainConjuncts: split of a JOIN И chain', () => {
  // A literal ВЫБОР kept the chain whole; reopening split it only on the second cycle.
  const J = `ВЫБРАТЬ Т.Код КАК К ${F} ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Валюты КАК Х ПО`;
  const payloads = ['"a"', '"ВЫБОР"', '"выбор"', '"a ВЫБОР b"', '"a ВЫБОР\nb"', '"x\nВЫБОР"'];
  it('the chain is split as with a neutral literal; QueryModel unchanged; stable at once', () => {
    expectIsolated(`${J} Т.Ссылка = Х.Ссылка И (Х.Код = $ И Х.Код = "1")`, payloads);
    expectIsolated(`${J} Т.Ссылка = Х.Ссылка И (Х.Код = "1" И Х.Код = $ И Х.Наименование = "2")`, payloads);
    expectIsolated(`${J} (Т.Ссылка = Х.Ссылка И Х.Код = $) И Х.Код = "1"`, payloads);
    for (const payload of payloads) expect(designerApplies(`${J} Т.Ссылка = Х.Ссылка И (Х.Код = ${payload} И Х.Код = "1")`)).toBe(true);
  });
  it('a code ВЫБОР still keeps the chain whole', () => {
    expect(gen(`${J} Т.Ссылка = Х.Ссылка И (ВЫБОР КОГДА Х.Код = "1" ТОГДА 1 КОНЕЦ = 1 И Х.Код = "2")`)).toContain('ВЫБОР');
  });
});

describe('A1 bodyHasUnwrappedBoolOr: canonical membership subquery with a top-level ИЛИ', () => {
  // A literal ГДЕ/ИМЕЮЩИЕ … ИЛИ or a literal section word used to switch the reflow.
  // Excluded: R8 (ledger) — literal lines that start with a section word at column 0.
  const BODY = (where: string): string => `(ВЫБРАТЬ\n\t\tР.Код\n\tИЗ\n\t\tСправочник.Валюты КАК Р\n\tГДЕ\n\t\t${where})`;
  const JOIN = (where: string): string =>
    `ВЫБРАТЬ Т.Код КАК К ${F} ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Валюты КАК Х ПО Т.Ссылка = Х.Ссылка И Х.Код В\n${BODY(where)}`;
  const VT = (where: string): string =>
    `ВЫБРАТЬ О.Р КАК Р ИЗ РегистрНакопления.Р.Остатки(, Т.Ф В\n${BODY(where)}) КАК О`;
  const payloads = ['"a"', '"ГДЕ a ИЛИ b"', '"ИМЕЮЩИЕ x ИЛИ y"', '"x ГДЕ y"', '"УПОРЯДОЧИТЬ"', '"a ГДЕ\nx ИЛИ y"'];
  it('JOIN and VT condition, AND and OR bodies', () => {
    for (const make of [JOIN, VT]) {
      expectIsolated(make('Р.Н = $\n\t\t\tИ Р.К = 1'), payloads);
      expectIsolated(make('Р.Н = $\n\t\t\tИЛИ Р.К = 1'), payloads);
    }
    // A `(` in the literal: VT only — in a JOIN condition it is C26 (ledger), not this gate.
    expectIsolated(VT('Р.Н = $\n\t\t\tИ Р.К = 1'), ['"a ( ИЛИ b"']);
    for (const payload of payloads) expect(designerApplies(JOIN(`Р.Н = ${payload}\n\t\t\tИ Р.К = 1`))).toBe(true);
  });
});
