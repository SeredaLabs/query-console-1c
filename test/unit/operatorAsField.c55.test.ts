import { describe, expect, it } from 'vitest';
import { findMalformedCustomExpressions } from '../../src/core/query/semanticValidator';
import { tryOpenDesignerBatch } from '../../src/webview/openDesignerBatch';
import { initialState, reducer, type QueryState } from '../../src/webview/state/queryStore';
import { findStaticApplyBlocker } from '../../src/webview/applyGate';
import { computeBatchTextSafe } from '../../src/webview/computeBatchText';

// C55: an incomplete condition ending in an operator word (`… И НЕ`, `ГДЕ ЕСТЬ`) was
// taken as a bare field. Under a sole source the word was qualified (`Т.НЕ`) and Apply
// wrote an invented field, also with metadata; elsewhere the structural acceptor took
// the word as a field (`… И ЕСТЬ`) and Apply wrote the incomplete text. Only `НЕ` and
// `ВЫБОР` were refused without a sole source. The platform refuses both the input
// (syntax error) and the qualified output (`Field not found "Т.НЕ"`).

const WORDS = ['НЕ', 'ВЫБОР', 'КОГДА', 'ТОГДА', 'ИНАЧЕ', 'КОНЕЦ', 'ЕСТЬ', 'МЕЖДУ', 'ПОДОБНО', 'В', 'СПЕЦСИМВОЛ'];

const T = 'ВЫБРАТЬ Т.Код КАК Код ИЗ Справочник.Валюты КАК Т ';
const BARE = 'ВЫБРАТЬ Код ИЗ Справочник.Валюты ';
const TWO = 'ВЫБРАТЬ А.Код КАК Код ИЗ Справочник.Валюты КАК А, Справочник.Валюты КАК Б ';
const G = 'ВЫБРАТЬ Т.Код КАК Код ИЗ Справочник.Валюты КАК Т СГРУППИРОВАТЬ ПО Т.Код ';
const J = 'ВЫБРАТЬ А.Код КАК Код ИЗ Справочник.Валюты КАК А ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Валюты КАК Б ПО ';

function load(text: string): QueryState {
  const r = tryOpenDesignerBatch(text);
  if (!r.ok) throw new Error(`does not open: ${r.error}`);
  return reducer(initialState(), { type: 'LOAD_BATCH', doc: r.doc });
}

/** The text Query Text opens with («Показать запрос»). */
function shownText(state: QueryState): string {
  const { text, error } = computeBatchTextSafe(state, true);
  if (error) throw new Error(error);
  return text.replace(/\r\n?/g, '\n');
}

/** «Применить» in Query Text without an edit: refused, or the reloaded model. */
function applyShownText(state: QueryState): QueryState | 'refused' {
  const r = tryOpenDesignerBatch(shownText(state));
  if (!r.ok) throw new Error(`does not reopen: ${r.error}`);
  if (findMalformedCustomExpressions(r.doc).length > 0) return 'refused';
  return reducer(initialState(), { type: 'LOAD_BATCH', doc: r.doc });
}

/** `<alias>.<word>` — an invented field the word must never become. */
const invented = (text: string, word: string) =>
  new RegExp(`[\\p{L}\\p{N}_]\\.${word}(?![\\p{L}\\p{N}_])`, 'u').test(text);

function expectRefused(input: string, word: string): void {
  const state = load(input);
  expect(findStaticApplyBlocker(state)).toEqual({ kind: 'malformedCustom' });
  const shown = shownText(state);
  expect(invented(shown, word)).toBe(false);
  expect(applyShownText(state)).toBe('refused');
}

describe('C55: an operator word is never taken as a field', () => {
  for (const w of WORDS) {
    for (const [slot, input] of [
      ['ГДЕ … И w', `${T}ГДЕ Т.Код = 1 И ${w}`],
      ['ГДЕ w', `${T}ГДЕ ${w}`],
      ['ГДЕ НЕ w', `${T}ГДЕ НЕ ${w}`],
      ['bare source', `${BARE}ГДЕ Код = 1 И ${w}`],
      ['two sources', `${TWO}ГДЕ А.Код = 1 И ${w}`],
      ['ИМЕЮЩИЕ', `${G}ИМЕЮЩИЕ КОЛИЧЕСТВО(Т.Код) > 1 И ${w}`],
      ['ПО', `${J}А.Код = Б.Код И ${w}`],
    ] as const) {
      it(`${w}: ${slot}`, () => expectRefused(input, w));
    }
  }

  // English words are opened in Russian; the invented field would be `Т.НЕ` etc.
  for (const [en, ru] of [['NOT', 'НЕ'], ['CASE', 'ВЫБОР'], ['IS', 'ЕСТЬ'], ['BETWEEN', 'МЕЖДУ'], ['IN', 'В']]) {
    it(`English ${en}`, () =>
      expectRefused(`SELECT Т.Код AS Код FROM Справочник.Валюты AS Т WHERE Т.Код = 1 AND ${en}`, ru));
  }
});

describe('C55: fields and aliases are unchanged', () => {
  const controls: [string, string][] = [
    [`${T}ГДЕ ПометкаУдаления`, 'Т.ПометкаУдаления'],
    [`${T}ГДЕ НЕ ПометкаУдаления`, 'НЕ Т.ПометкаУдаления'],
    [`${BARE}ГДЕ Код = 1 И ПометкаУдаления`, 'Валюты.ПометкаУдаления'],
    [`${T}ГДЕ Ссылка В (&С)`, 'Т.Ссылка В(&С)'],
    [`${T}ГДЕ Т.Ссылка ССЫЛКА Справочник.Валюты`, 'Т.Ссылка ССЫЛКА Справочник.Валюты'],
    [`${T}ГДЕ Т.Код МЕЖДУ 1 И 2 И Т.Наименование ПОДОБНО "а%"`, 'Т.Код МЕЖДУ 1 И 2'],
    [`${T}ГДЕ ВЫБОР КОГДА Т.Код = 1 ТОГДА ИСТИНА ИНАЧЕ ЛОЖЬ КОНЕЦ`, 'КОГДА Т.Код = 1'],
    [`${T}ГДЕ Т.Наименование ЕСТЬ НЕ NULL`, 'Т.Наименование ЕСТЬ НЕ NULL'],
    // Source alias `В` (platform-invalid, RP11) is kept as before: a word with a dot is a path.
    ['ВЫБРАТЬ В.Код КАК Код ИЗ Справочник.Валюты КАК В ГДЕ В.Код = 1', 'В.Код = 1'],
  ];
  for (const [input, fragment] of controls) {
    it(JSON.stringify(input.replace(/^.*? ГДЕ /, 'ГДЕ ')), () => {
      const state = load(input);
      expect(findStaticApplyBlocker(state)).toBeNull();
      const shown = shownText(state);
      expect(shown).toContain(fragment);
      expect(applyShownText(state)).not.toBe('refused');
    });
  }
});
