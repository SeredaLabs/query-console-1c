/**
 * A1-5: formatter/generator lexical gates read only code. Changing only the payload
 * of a string literal must not switch a gate around it: a syntax-looking payload
 * gets the same surrounding layout as a same-shaped neutral payload, and the
 * literal stays byte-for-byte.
 */
import { describe, it, expect } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { tryOpenDesignerBatch } from '../../src/webview/openDesignerBatch';
import { initialState, reducer } from '../../src/webview/state/queryStore';
import { computeBatchTextSafe } from '../../src/webview/computeBatchText';
import { decideApply, findStaticApplyBlocker } from '../../src/webview/applyGate';

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

describe('A1-5b reindentLeafCase: nested-subquery gate before the CASE reflow', () => {
  // A wrapped branch value is reflowed onto one line; a literal ВЫБРАТЬ used to stop it.
  const payloads = ['"a"', '"ВЫБРАТЬ"', '"x ВЫБРАТЬ y"', '"выбрать"', '"a\nВЫБРАТЬ"'];
  it('SELECT aggregate, WHERE call and VT condition', () => {
    expectIsolated(`ВЫБРАТЬ\n\tСУММА(ВЫБОР\n\tКОГДА Т.Код = 1\n\tТОГДА Т.Сумма\n\t+ $\n\tИНАЧЕ 0\n\tКОНЕЦ) КАК Ф\n${F}`, payloads);
    expectIsolated(`ВЫБРАТЬ Т.Код КАК К ${F} ГДЕ ЕСТЬNULL(ВЫБОР\nКОГДА Т.Код = 1 ТОГДА Т.Сумма\n+ $\nИНАЧЕ 0\nКОНЕЦ, 0) = 1`, payloads);
    expectIsolated(`ВЫБРАТЬ О.Р КАК Р ИЗ РегистрНакопления.Р.Остатки(, Т.Х = ВЫБОР\nКОГДА Т.У = 1 ТОГДА Т.С\n+ $\nИНАЧЕ 0\nКОНЕЦ) КАК О`, payloads);
  });
  it('builder condition (payloads without `(`: a literal `(` there is C26)', () => {
    expectIsolated(`ВЫБРАТЬ Т.Код КАК К ${F}\n{ГДЕ (ВЫБОР\nКОГДА Т.Код = 1 ТОГДА Т.Сумма\n+ $\nИНАЧЕ 0\nКОНЕЦ = 1)}`, payloads);
  });
});

describe('A1-5c opensWithVyborInCall: CASE opened inside a call after a multi-line head', () => {
  const payloads = ['"a"', '"ВЫБРАТЬ"', '"ВЫБОР"', '"a ВЫБОР b"', '"x ВЫБРАТЬ y"', '"a\nВЫБОР"'];
  it('literal in the nested WHEN and in the call head', () => {
    expectIsolated(caseThen('ВЫРАЗИТЬ(Т.Сумма * Т.Код\n\t\t\t/ (Т.Код * ВЫБОР\n\t\t\t\tКОГДА Т.Код = $\n\t\t\t\t\tТОГДА 1\n\t\t\tКОНЕЦ) КАК Число(15, 2))'), payloads);
    expectIsolated(caseThen('ВЫРАЗИТЬ(Т.Сумма * $\n\t\t\t/ (Т.Код * ВЫБОР\n\t\t\t\tКОГДА Т.Код = "1"\n\t\t\t\t\tТОГДА 1\n\t\t\tКОНЕЦ) КАК Число(15, 2))'), payloads);
  });
});

describe('A1-5d reindentLeafSubquery: tuple-head gate before the collapse', () => {
  // A literal `(`, `)`, `=` or word used to keep the head on two lines (C25 keeps its bytes).
  const SUB = (a: string): string => `\n\t(ВЫБРАТЬ\n\t\t${a}.Код, ${a}.Код\n\tИЗ\n\t\tСправочник.Валюты КАК ${a})`;
  const payloads = ['"a"', '"a ( b"', '"a ) b"', '"( x"', '"a=b"', '"a < b"', '"a И b"', '"НЕ"', '"a  ( b"'];
  it('WHERE, JOIN and HAVING, literal last and first', () => {
    expectIsolated(`ВЫБРАТЬ Т.Код КАК К ${F} ГДЕ (Т.Код,\n\t$) В${SUB('Х')}`, payloads);
    expectIsolated(`ВЫБРАТЬ Т.Код КАК К ${F} ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Валюты КАК Х ПО ($,\n\tХ.Код) В${SUB('Р')}`, payloads);
    expectIsolated(`ВЫБРАТЬ Т.Код КАК К ${F} СГРУППИРОВАТЬ ПО Т.Код ИМЕЮЩИЕ (\n\tТ.Код,\n\t$\n) В${SUB('Х')}`, payloads);
  });
  it('code still decides: a code `=` or ИЛИ keeps the head as written', () => {
    const head = (h: string): string => gen(`ВЫБРАТЬ Т.Код КАК К ${F} ГДЕ ${h} В${SUB('Х')}`);
    expect(head('(Т.Код,\n\tТ.Код = 1)')).toContain('(Т.Код,\n');
    expect(head('(Т.Код,\n\t"a" ИЛИ Т.Код)')).toContain('(Т.Код,\n');
  });
});

describe('A1-5e renderSource: multi-line layout of an accounting-register virtual table', () => {
  // The accounting path (`РегистрБухгалтерии`), not the accumulation one: a literal
  // `(ВЫБРАТЬ` with a line break used to spread every parameter onto its own line.
  const VT = (cond: string): string => `ВЫБРАТЬ О.Р КАК Р ИЗ РегистрБухгалтерии.Б.Остатки(, , , ${cond}) КАК О`;
  const payloads = ['"a"', '"(ВЫБРАТЬ"', '"a\n(ВЫБРАТЬ"', '"(ВЫБРАТЬ\nx"', '"x (ВЫБРАТЬ y"'];
  it('generator', () => {
    expectIsolated(VT('Т.Х = $'), payloads);
    expectIsolated(VT('Т.Х = $\n+ Т.У'), payloads);
  });
  it('Designer path: literal kept, parameters inline, Apply allowed', () => {
    for (const payload of payloads) {
      const open = tryOpenDesignerBatch(VT(`Т.Х = ${payload}`));
      if (!open.ok) throw new Error(open.error);
      const state = reducer(initialState(), { type: 'LOAD_BATCH', doc: open.doc });
      const out = computeBatchTextSafe(state, true);
      expect(out.text).toContain(`РегистрБухгалтерии.Б.Остатки(, , , Т.Х = ${payload}) КАК О`);
      expect(decideApply(out.text, out.error, findStaticApplyBlocker(state), undefined).ok).toBe(true);
    }
  });
  it('a code subquery still spreads the parameters', () => {
    expect(gen(VT('Т.Х В\n(ВЫБРАТЬ Х.А ИЗ Справочник.Валюты КАК Х)'))).toContain('Остатки(\n');
  });
});
