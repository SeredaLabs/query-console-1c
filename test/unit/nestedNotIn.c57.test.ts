import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { tryOpenDesignerBatch } from '../../src/webview/openDesignerBatch';
import { initialState, reducer } from '../../src/webview/state/queryStore';
import { findStaticApplyBlocker } from '../../src/webview/applyGate';
import { computeBatchTextSafe } from '../../src/webview/computeBatchText';

// C57: rule 3 of `canonicalizeLeafLexemes` printed `X НЕ В (…)` / `X НЕ ПОДОБНО …` as a
// prefix of the whole one-line leaf without counting parentheses or `И`, so a negation
// inside a subquery, a function argument or after `И` became a negation of the outer
// expression, and OK / Save wrote it. `НЕ` now moves only at the leaf's top level and
// only when no `И`/`ИЛИ`/`ВЫБОР`/`КОГДА`/`ТОГДА`/`ИНАЧЕ` precedes it there.

const S = 'Справочник.Валюты';
const W = `ВЫБРАТЬ Т.Код ИЗ ${S} КАК Т ГДЕ `;
const OR_SUB = (inner: string) => `${W}Т.Код = &К ИЛИ Т.Ссылка В (ВЫБРАТЬ Х.Ссылка ИЗ ${S} КАК Х ГДЕ ${inner})`;
const H = `ВЫБРАТЬ Т.Код ИЗ ${S} КАК Т СГРУППИРОВАТЬ ПО Т.Код, Т.Ссылка ИМЕЮЩИЕ `;
const F = (expr: string) => `ВЫБРАТЬ ${expr} КАК Ф ИЗ ${S} КАК Т`;
const VT = (cond: string) => `ВЫБРАТЬ К.Курс ИЗ РегистрСведений.КурсыВалют.СрезПоследних(&Д, ${cond}) КАК К`;
const J = `ВЫБРАТЬ А.Код ИЗ ${S} КАК А ЛЕВОЕ СОЕДИНЕНИЕ ${S} КАК Б ПО А.Код = Б.Код И `;

const save = (text: string) => generateBatch(parseBatch(text, undefined, { preserveComments: true }));
const flat = (text: string) => text.replace(/\s+/g, ' ');

/** OK / Save is allowed on the opened text and on two reopens; the text is stable. */
function savedThreeTimes(input: string): string {
  let text = input;
  const texts: string[] = [];
  for (let pass = 0; pass < 3; pass++) {
    const r = tryOpenDesignerBatch(text);
    if (!r.ok) throw new Error(`does not open: ${r.error}`);
    const state = reducer(initialState(), { type: 'LOAD_BATCH', doc: r.doc });
    expect(findStaticApplyBlocker(state), `pass ${pass + 1}`).toBeNull();
    const { text: shown, error } = computeBatchTextSafe(state, true);
    expect(error).toBeNull();
    texts.push(shown);
    text = shown;
  }
  expect(texts[1]).toBe(texts[0]);
  expect(texts[2]).toBe(texts[0]);
  return texts[0];
}

describe('C57: a nested `НЕ` stays with its operand', () => {
  const cases: [string, string, string, RegExp][] = [
    ['raw ИЛИ subquery, НЕ В (&С)', OR_SUB('Х.Ссылка НЕ В (&С)'), 'НЕ Х.Ссылка В (&С)', /ИЛИ НЕ Т\.Ссылка/],
    ['raw ИЛИ subquery, НЕ ПОДОБНО', OR_SUB('Х.Наименование НЕ ПОДОБНО "а%"'), 'НЕ Х.Наименование ПОДОБНО "а%"', /ИЛИ НЕ Т\.Ссылка/],
    ['ИМЕЮЩИЕ raw subquery', `${H}Т.Код = &К ИЛИ Т.Ссылка В (ВЫБРАТЬ Х.Ссылка ИЗ ${S} КАК Х ГДЕ Х.Ссылка НЕ В (&С))`,
      'НЕ Х.Ссылка В (&С)', /ИЛИ НЕ Т\.Ссылка/],
    ['function argument', `${W}ЕСТЬNULL(Т.Код НЕ В (&С), ЛОЖЬ)`, 'ЕСТЬNULL(Т.Код НЕ В (&С), ЛОЖЬ)', /НЕ ЕСТЬNULL/],
    ['virtual-table condition after И', VT('Кратность = 1 И Валюта НЕ В (&В)'), 'Кратность = 1 И Валюта НЕ В (&В)', /НЕ Кратность/],
  ];
  it.each(cases)('%s', (_name, input, kept, outerNot) => {
    const out = flat(savedThreeTimes(input));
    expect(out).toContain(kept);
    expect(out).not.toMatch(outerNot);
  });

  it('prints the platform text of the recorded probe', () => {
    const fixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../fixtures/platform/c57-nested-not-in.json'), 'utf8'));
    for (const c of fixture.cases) {
      const ours = generateBatch(parseBatch(c.query, undefined, { wildcardPolicy: 'constructor' }), { wildcardPolicy: 'constructor' });
      expect(ours).toBe(c.platform.query_text);
    }
  });
});

describe('C57: a top-level infix `НЕ` is still printed first', () => {
  const controls: [string, string, string][] = [
    ['ГДЕ НЕ В', `${W}Т.Код НЕ В (&С)`, 'ГДЕ НЕ Т.Код В (&С)'],
    ['ГДЕ НЕ ПОДОБНО', `${W}Т.Наименование НЕ ПОДОБНО "а%"`, 'ГДЕ НЕ Т.Наименование ПОДОБНО "а%"'],
    ['grouped left side', `${W}(Т.Код + 1) НЕ В (&С)`, 'ГДЕ НЕ Т.Код + 1 В (&С)'],
    ['call on the left side', `${W}ЕСТЬNULL(Т.Код, 0) НЕ В (&С)`, 'ГДЕ НЕ ЕСТЬNULL(Т.Код, 0) В (&С)'],
    ['ИЛИ operand', `${W}Т.Код = &К ИЛИ Т.Ссылка НЕ В (&С)`, 'ИЛИ НЕ Т.Ссылка В (&С)'],
    ['string with НЕ В', `${W}Т.Наименование = "a НЕ В b" ИЛИ Т.Код НЕ В (&С)`, '"a НЕ В b" ИЛИ НЕ Т.Код В (&С)'],
    ['field ВЫБОР', F('ВЫБОР КОГДА Т.Код НЕ В (&С) ТОГДА 1 ИНАЧЕ 0 КОНЕЦ'), 'КОГДА НЕ Т.Код В (&С)'],
    ['field И chain', F('Т.Код = "1" И Т.Наименование НЕ ПОДОБНО "а%"'), 'И НЕ Т.Наименование ПОДОБНО "а%"'],
    ['field', F('Т.Код НЕ В (&С)'), 'НЕ Т.Код В (&С) КАК Ф'],
    ['virtual-table condition', VT('Валюта НЕ В (&В)'), '&Д, НЕ Валюта В (&В))'],
    ['join ПО', `${J}А.Ссылка НЕ В (&С)`, 'И (НЕ А.Ссылка В (&С))'],
    ['join ПО subquery', `${J}А.Ссылка В (ВЫБРАТЬ Х.Ссылка ИЗ ${S} КАК Х ГДЕ Х.Ссылка НЕ В (&С))`, 'ГДЕ НЕ Х.Ссылка В (&С)'],
  ];
  it.each(controls)('%s', (_name, input, expected) => {
    expect(flat(save(input))).toContain(expected);
  });
});
