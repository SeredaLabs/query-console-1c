import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { tryOpenDesignerBatch } from '../../src/webview/openDesignerBatch';
import { initialState, reducer } from '../../src/webview/state/queryStore';
import { findStaticApplyBlocker } from '../../src/webview/applyGate';
import { computeBatchTextSafe } from '../../src/webview/computeBatchText';

// C54: `stripNegatedFieldParens` turned `(НЕ Т.Поле) <tail>` into `НЕ Т.Поле <tail>` for
// any tail, so `НЕ` took the whole predicate: `(НЕ Т.Ф) В (ИСТИНА, ЛОЖЬ)` (1 row for a
// false Ф) became `НЕ Т.Ф В (…)` (0 rows), and `(НЕ Т.Ф) ЕСТЬ NULL` changed for a NULL Ф.
// The parentheses are now kept when an operator whose result depends on them follows.
// Before `В` this departs from the platform's canonical text (ADR 0004, boolean operand
// scope exception); before `ЕСТЬ NULL` and `>` it matches it.
// Evidence: test/fixtures/platform/c54-negated-operand.json.

const S = 'Справочник.Валюты';
const P = 'Т.ПометкаУдаления';
const W = `ВЫБРАТЬ Т.Код ИЗ ${S} КАК Т ГДЕ `;
const H = `ВЫБРАТЬ Т.Код ИЗ ${S} КАК Т СГРУППИРОВАТЬ ПО Т.Код, Т.ПометкаУдаления ИМЕЮЩИЕ `;
const fixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../fixtures/platform/c54-negated-operand.json'), 'utf8'));
const probe = (name: string) => fixture.validation.find((c: { name: string }) => c.name === name);

const save = (text: string) => generateBatch(parseBatch(text, undefined, { preserveComments: true }));
const constructorSave = (text: string) =>
  generateBatch(parseBatch(text, undefined, { wildcardPolicy: 'constructor' }), { wildcardPolicy: 'constructor' });
const flat = (text: string) => text.replace(/\s+/g, ' ');

/** The texts of three Saves; OK / Save is allowed on each. */
function threeSaves(input: string): string[] {
  const texts: string[] = [];
  let text = input;
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
  return texts;
}

describe('C54: `(НЕ поле)` keeps its parentheses before an operator that depends on them', () => {
  const cases: [string, string, string][] = [
    ['В (&П)', `${W}(НЕ ${P}) В (&П)`, `(НЕ ${P}) В (&П)`],
    ['В (список)', `${W}(НЕ ${P}) В (ИСТИНА, ЛОЖЬ)`, `(НЕ ${P}) В (ИСТИНА, ЛОЖЬ)`],
    ['В (подзапрос), multi-line', `${W}(НЕ ${P}) В\n\t\t\t(ВЫБРАТЬ\n\t\t\t\tШ.ПометкаУдаления\n\t\t\tИЗ\n\t\t\t\t${S} КАК Ш)`, `(НЕ ${P}) В (ВЫБРАТЬ`],
    ['ЕСТЬ NULL', `${W}(НЕ ${P}) ЕСТЬ NULL`, `(НЕ ${P}) ЕСТЬ NULL`],
    ['ЕСТЬ НЕ NULL', `${W}(НЕ ${P}) ЕСТЬ НЕ NULL`, `(НЕ ${P}) ЕСТЬ НЕ NULL`],
    ['> ЛОЖЬ', `${W}(НЕ ${P}) > ЛОЖЬ`, `(НЕ ${P}) > ЛОЖЬ`],
    ['ИЛИ operand', `${W}Т.Код = &К ИЛИ (НЕ ${P}) В (&П)`, `ИЛИ (НЕ ${P}) В (&П)`],
    ['И chain', `${W}(НЕ ${P}) В (&П) И Т.Код = &К`, `(НЕ ${P}) В (&П) И Т.Код = &К`],
    ['ИМЕЮЩИЕ', `${H}(НЕ ${P}) В (&П)`, `ИМЕЮЩИЕ (НЕ ${P}) В (&П)`],
    ['virtual-table condition', 'ВЫБРАТЬ К.Курс ИЗ РегистрСведений.КурсыВалют.СрезПоследних(&Д, Кратность = 1 И (НЕ Валюта.ПометкаУдаления) В (&П)) КАК К',
      'Кратность = 1 И (НЕ Валюта.ПометкаУдаления) В (&П)'],
    ['nested raw subquery', `${W}Т.Код = &К ИЛИ Т.Ссылка В (ВЫБРАТЬ Х.Ссылка ИЗ ${S} КАК Х ГДЕ (НЕ Х.ПометкаУдаления) В (&П))`,
      'ГДЕ (НЕ Х.ПометкаУдаления) В (&П)'],
  ];
  it.each(cases)('%s: kept on three Saves, text stable', (_name, input, kept) => {
    const texts = threeSaves(input);
    for (const t of texts) expect(flat(t)).toContain(kept);
    expect(texts[1]).toBe(texts[0]);
    expect(texts[2]).toBe(texts[0]);
  });

  // The compact subquery form takes another layout once (R2, not changed here).
  it('В (подзапрос), compact: kept on three Saves', () => {
    for (const t of threeSaves(`${W}(НЕ ${P}) В (ВЫБРАТЬ Ш.ПометкаУдаления ИЗ ${S} КАК Ш)`)) {
      expect(flat(t)).toContain(`(НЕ ${P}) В`);
    }
  });

  it.each([['is_null'], ['gt_false']])('%s: the platform text, byte for byte', name => {
    const c = probe(name);
    expect(constructorSave(c.query)).toBe(c.platform.query_text);
  });

  it('В: the platform drops the parentheses and changes the result; the Designer keeps them (ADR 0004)', () => {
    const c = probe('in_param');
    expect(constructorSave(c.query)).not.toBe(c.platform.query_text);
    expect(constructorSave(c.query)).toBe(c.platform.query_text.replace('НЕ Т.ПометкаУдаления В', '(НЕ Т.ПометкаУдаления) В'));
    const rows = Object.fromEntries(fixture.execution.map((e: { name: string; rows: number }) => [e.name, e.rows]));
    expect([rows.in_list_with_parentheses, rows.in_list_without_parentheses]).toEqual([1, 0]);
  });
});

describe('C54: other forms are printed as before', () => {
  const controls: [string, string, string][] = [
    ['a whole negated field', `${W}(НЕ ${P})`, `ГДЕ НЕ ${P}`],
    ['after И', `${W}Т.Код = &К И (НЕ ${P})`, `И НЕ ${P}`],
    ['before ИЛИ', `${W}(НЕ ${P}) ИЛИ Т.Код = &К`, `(НЕ ${P} ИЛИ Т.Код = &К)`],
    ['НЕ(поле)', `${W}НЕ(${P})`, `ГДЕ НЕ ${P}`],
    ['НЕ (поле В …)', `${W}НЕ (${P} В (&П))`, `ГДЕ НЕ ${P} В (&П)`],
    // `=` / `<>` give the same result either way; their printing is unchanged.
    ['= ИСТИНА', `${W}(НЕ ${P}) = ИСТИНА`, `ГДЕ НЕ ${P} = ИСТИНА`],
    ['<> ЛОЖЬ', `${W}(НЕ ${P}) <> ЛОЖЬ`, `ГДЕ НЕ ${P} <> ЛОЖЬ`],
    ['НЕ В of a negated field', `${W}(НЕ ${P}) НЕ В (&П)`, `ГДЕ НЕ(НЕ ${P}) В (&П)`],
    ['join ПО', `ВЫБРАТЬ А.Код ИЗ ${S} КАК А ЛЕВОЕ СОЕДИНЕНИЕ ${S} КАК Б ПО А.Код = Б.Код И (НЕ А.ПометкаУдаления) В (&П)`,
      'И ((НЕ А.ПометкаУдаления) В (&П))'],
    ['select field', `ВЫБРАТЬ (НЕ ${P}) В (&П) КАК Ф ИЗ ${S} КАК Т`, `(НЕ ${P}) В (&П) КАК Ф`],
  ];
  it.each(controls)('%s', (_name, input, expected) => {
    expect(flat(save(input))).toContain(expected);
  });
});
