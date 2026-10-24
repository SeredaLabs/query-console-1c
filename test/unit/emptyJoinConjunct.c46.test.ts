import { describe, expect, it } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { findMalformedCustomExpressions } from '../../src/core/query/semanticValidator';
import { tryOpenDesignerBatch } from '../../src/webview/openDesignerBatch';
import { initialState, reducer, type QueryState } from '../../src/webview/state/queryStore';
import { findStaticApplyBlocker } from '../../src/webview/applyGate';
import { computeBatchTextSafe } from '../../src/webview/computeBatchText';

// C46: a join condition with an empty `И` operand stays one custom conjunct (C45) and
// OK / Save refuses it, but the generator split it again and printed the empty
// operand as `()`. Query Text shows that generated text; «Применить» reopened it as
// valid conjuncts plus an empty group the acceptor took, so OK wrote `И ()`
// (platform: «Wrong parameters "И"»). A typed empty group `()` was accepted the same
// way in ГДЕ / ИМЕЮЩИЕ / ПО (platform: «Operation not allowed in clause "ГДЕ"»).
// Evidence: test/fixtures/platform/c46-empty-group.json.

const J = 'ВЫБРАТЬ А.Код КАК Код ИЗ Справочник.Валюты КАК А ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Валюты КАК Б ПО ';
const T = 'ВЫБРАТЬ Т.Код КАК Код ИЗ Справочник.Валюты КАК Т ';
const G = 'ВЫБРАТЬ Т.Код КАК Код ИЗ Справочник.Валюты КАК Т СГРУППИРОВАТЬ ПО Т.Код ';

const parse = (text: string) => parseBatch(text, undefined, { preserveComments: true });

/** Standalone `И` words: none may disappear between the input and the generated text. */
const andCount = (text: string) => (text.match(/(?<![\p{L}\p{N}_.])И(?![\p{L}\p{N}_])/gu) ?? []).length;

function load(text: string): QueryState {
  const r = tryOpenDesignerBatch(text);
  if (!r.ok) throw new Error(`does not open: ${r.error}`);
  return reducer(initialState(), { type: 'LOAD_BATCH', doc: r.doc });
}

/** The text Query Text opens with («Показать запрос», `handleShowQuery`). */
function shownText(state: QueryState): string {
  const { text, error } = computeBatchTextSafe(state, true);
  if (error) throw new Error(error);
  return text.replace(/\r\n?/g, '\n');
}

/**
 * «Применить» in Query Text without an edit (`handleApplyQueryEdit`): the shown text
 * is reopened and loaded unless the shared malformed check refuses it.
 */
function applyShownText(state: QueryState): QueryState | 'refused' {
  const r = tryOpenDesignerBatch(shownText(state));
  if (!r.ok) throw new Error(`does not reopen: ${r.error}`);
  if (findMalformedCustomExpressions(r.doc).length > 0) return 'refused';
  return reducer(initialState(), { type: 'LOAD_BATCH', doc: r.doc });
}

describe('C46: an empty join conjunct stays refused through Query Text', () => {
  const cases = [
    `${J}А.Код = Б.Код И И А.Код = 1`,
    `${J}И А.Код = Б.Код`,
    `${J}А.Код = Б.Код И`,
    `${J}(А.Код = Б.Код И)`,
    `${J}И`,
    `${J}А.Код = Б.Код И (А.Код = 1 ИЛИ А.Код = 2) И`,
    `${J}А.Код = Б.Код И И А.Код = 1 // к`,
  ];
  for (const input of cases) {
    it(JSON.stringify(input.replace(/^ВЫБРАТЬ .*? ПО /, 'ПО ')), () => {
      let state = load(input);
      expect(findStaticApplyBlocker(state)).toEqual({ kind: 'malformedCustom' });
      const first = shownText(state);
      expect(first).not.toMatch(/\(\s*\)/);
      expect(andCount(first)).toBe(andCount(input));
      for (let pass = 0; pass < 3; pass++) {
        const next = applyShownText(state);
        // Either Query Text refuses the text, or the reloaded model is still blocked.
        if (next === 'refused') break;
        expect(findStaticApplyBlocker(next)).toEqual({ kind: 'malformedCustom' });
        expect(shownText(next)).toBe(first);
        state = next;
      }
      expect(generateBatch(parse(first))).toBe(first);
    });
  }

  it('English `AND AND` (translated on open)', () => {
    const state = load('SELECT А.Код AS Код FROM Справочник.Валюты AS А LEFT JOIN Справочник.Валюты AS Б ON А.Код = Б.Код AND AND А.Код = 1');
    expect(findStaticApplyBlocker(state)).toEqual({ kind: 'malformedCustom' });
    const first = shownText(state);
    expect(first).not.toMatch(/\(\s*\)/);
    expect(andCount(first)).toBe(2);
    expect(applyShownText(state)).toBe('refused');
  });

  it('prints the authored conjuncts without inventing `()`', () => {
    expect(generateBatch(parse(`${J}А.Код = Б.Код И И А.Код = 1`))).toBe(
      'ВЫБРАТЬ\n\tА.Код КАК Код\nИЗ\n\tСправочник.Валюты КАК А\n\t\tЛЕВОЕ СОЕДИНЕНИЕ Справочник.Валюты КАК Б\n' +
      '\t\tПО А.Код = Б.Код\n\t\t\tИ \n\t\t\tИ А.Код = 1');
  });
});

describe('C46: a typed empty group `()` is refused', () => {
  for (const input of [
    `${J}А.Код = Б.Код И ()`,
    `${J}А.Код = Б.Код И (А.Код = 1) И ()`,
    `${T}ГДЕ ()`,
    `${T}ГДЕ Т.Код = 1 И ()`,
    `${T}ГДЕ НЕ ()`,
    `${T}ГДЕ (())`,
    `${G}ИМЕЮЩИЕ КОЛИЧЕСТВО(Т.Код) > 1 И ()`,
  ]) {
    it(JSON.stringify(input.replace(/^.* (?=(ГДЕ|ИМЕЮЩИЕ) )/, '').replace(/^ВЫБРАТЬ .*? ПО /, 'ПО ')), () => {
      const state = load(input);
      expect(findStaticApplyBlocker(state)).toEqual({ kind: 'malformedCustom' });
      expect(applyShownText(state)).toBe('refused');
    });
  }
});

describe('C46: valid conditions are unchanged', () => {
  for (const input of [
    `${J}А.Код = Б.Код И А.Наименование = Б.Наименование`,
    `${J}(А.Код = Б.Код И А.Код = 1)`,
    `${J}А.Код = Б.Код И (А.Код = 1 ИЛИ А.Код = 2)`,
    `${J}А.Код = Б.Код И А.Код МЕЖДУ 1 И 2`,
    `${T}ГДЕ (Т.Код = 1)`,
    `${T}ГДЕ ((Т.Код = 1)) И Т.Код <> 2`,
  ]) {
    it(JSON.stringify(input.replace(/^ВЫБРАТЬ .*? (ГДЕ|ПО) /, '$1 ')), () => {
      const state = load(input);
      expect(findStaticApplyBlocker(state)).toBeNull();
      const shown = shownText(state);
      expect(shown).not.toMatch(/\(\s*\)/);
      expect(applyShownText(state)).not.toBe('refused');
    });
  }
});
