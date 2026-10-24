import { describe, expect, it } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { findMalformedCustomExpressions } from '../../src/core/query/semanticValidator';
import { analyze, MALFORMED_CUSTOM_EXPRESSION } from '../../src/core/query/queryAnalysisService';
import { tryOpenDesignerBatch } from '../../src/webview/openDesignerBatch';
import { initialState, reducer } from '../../src/webview/state/queryStore';
import { findStaticApplyBlocker } from '../../src/webview/applyGate';

// C45: splitting a condition on a top-level `И` silently dropped an empty operand
// (`ГДЕ В.Код = 1 И` was written back as `ГДЕ В.Код = 1`). Such a condition now
// stays one custom condition with its text, like a top-level `ИЛИ`, so the shared
// `malformedCustom` check refuses OK / Save and Query Text reports it.

const F = 'ВЫБРАТЬ В.Код КАК Код ИЗ Справочник.Валюты КАК В ';
const G = 'ВЫБРАТЬ В.Код КАК Код ИЗ Справочник.Валюты КАК В СГРУППИРОВАТЬ ПО В.Код ';
const J = 'ВЫБРАТЬ А.Код КАК Код ИЗ Справочник.Валюты КАК А ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Валюты КАК Б ПО ';

const parse = (text: string) => parseBatch(text, undefined, { preserveComments: true });
const flat = (text: string) => text.replace(/\s+/g, ' ');

/** The static Apply blocker OK / Save and the designer switch use. */
function finalApplyBlocker(text: string) {
  const r = tryOpenDesignerBatch(text);
  if (!r.ok) throw new Error(`does not open: ${r.error}`);
  return findStaticApplyBlocker(reducer(initialState(), { type: 'LOAD_BATCH', doc: r.doc }));
}

const T = 'ВЫБРАТЬ Т.Код КАК Код ИЗ Справочник.Валюты КАК Т ';
const TWO = 'ВЫБРАТЬ А.Код КАК Код ИЗ Справочник.Валюты КАК А, Справочник.Валюты КАК Б ';

/** Standalone `И` words: none may disappear between the input and the generated text. */
const andCount = (text: string) => (text.match(/(?<![\p{L}\p{N}_.])И(?![\p{L}\p{N}_])/gu) ?? []).length;

/** [input, text the generated query must still contain] */
const emptyConjunct: [string, string][] = [
  [`${F}ГДЕ В.Код = 1 И`, 'В.Код = 1 И'],
  [`${F}ГДЕ В.Код = 1 И;`, 'В.Код = 1 И'],
  [`${F}ГДЕ В.Код = 1 И\nУПОРЯДОЧИТЬ ПО В.Код`, 'В.Код = 1 И'],
  [`${F}ГДЕ И В.Код = 1`, 'И В.Код = 1'],
  [`${F}ГДЕ В.Код = 1 И И В.Код = 2`, 'В.Код = 1 И И В.Код = 2'],
  // The generator prints a custom condition without its outer parentheses (unchanged).
  [`${F}ГДЕ (В.Код = 1 И)`, 'В.Код = 1 И'],
  [`${F}ГДЕ В.Код = 1 И (В.Код = 2 И)`, 'В.Код = 2 И'],
  [`${F}ГДЕ В.Код МЕЖДУ 1 И 2 И`, 'В.Код МЕЖДУ 1 И 2 И'],
  [`${F}ГДЕ В.Код = 1 И // c\n`, 'В.Код = 1 И'],
  [`${G}ИМЕЮЩИЕ КОЛИЧЕСТВО(В.Код) > 1 И`, 'КОЛИЧЕСТВО(В.Код) > 1 И'],
  // A condition of `И` alone is not a field: no `Т.И` is invented for the sole source.
  [`${T}ГДЕ И`, 'ГДЕ И'],
  [`${T}ГДЕ И;`, 'ГДЕ И'],
  [`${T}ГДЕ НЕ И`, 'ГДЕ НЕ И'],
  [`${TWO}ГДЕ И`, 'ГДЕ И'],
  [`${T}ГДЕ Т.Код = 1 И И`, 'Т.Код = 1 И И'],
  [`${T}ГДЕ Т.Код = 1 И НЕ И`, 'Т.Код = 1 И НЕ И'],
  [`${T}ГДЕ (И)`, 'ГДЕ И'],
  [`${T}ГДЕ Т.Код = 1 И (И)`, 'Т.Код = 1 И И'],
  [`${T}ГДЕ (И) И Т.Код = 1`, 'И Т.Код = 1'],
  [`${G}ИМЕЮЩИЕ И`, 'ИМЕЮЩИЕ И'],
  // English: `parseBatch` keeps `AND` as written (the designer translates it to `И`);
  // the kept slice is the whole token, not the length of its Russian form (`A`).
  ['SELECT Т.Код AS Код FROM Catalog.Валюты AS Т WHERE AND', 'ГДЕ AND'],
  ['SELECT Т.Код AS Код FROM Catalog.Валюты AS Т WHERE Т.Код = 1 AND', 'Т.Код = 1 AND'],
];

describe('C45: an empty conjunct keeps its text and is refused', () => {
  for (const [input, kept] of emptyConjunct) {
    it(JSON.stringify(input.replace(/^(ВЫБРАТЬ|SELECT) .*? (ГДЕ|ИМЕЮЩИЕ|WHERE) /, '$2 ')), () => {
      const doc = parse(input);
      const output = generateBatch(doc);
      expect(flat(output)).toContain(kept);
      expect(output).not.toMatch(/\.И(?![\p{L}\p{N}_])/u);
      if (!input.startsWith('SELECT')) expect(andCount(output)).toBe(andCount(input));
      expect(findMalformedCustomExpressions(doc).length).toBeGreaterThan(0);
      expect(finalApplyBlocker(input)).toEqual({ kind: 'malformedCustom' });
      expect(analyze(input).diagnostics).toEqual([{ message: MALFORMED_CUSTOM_EXPRESSION }]);
    });
  }

  it('keeps the comment next to a trailing И', () => {
    const output = generateBatch(parse(`${F}ГДЕ В.Код = 1 И // c\n`));
    expect(output).toContain('// c');
    expect(output.split('// c')).toHaveLength(2);
  });

  // Source alias `И` (platform-invalid, catalog `source.alias-reserved-word-i`): the
  // condition stays as written and the `И` qualifier keeps Apply refused.
  it('keeps a condition on the alias И and refuses it', () => {
    const input = 'ВЫБРАТЬ И.Код КАК Код ИЗ Справочник.Валюты КАК И ГДЕ И.Код = 1 И И.Код = 2';
    expect(flat(generateBatch(parse(input)))).toContain('ГДЕ И.Код = 1 И И.Код = 2');
    expect(finalApplyBlocker(input)).toEqual({ kind: 'malformedCustom' });
  });
});

// Join `ПО`: the parser keeps the condition as one custom expression. The generated
// text and the refusal after reopening it are pinned in emptyJoinConjunct.c46.test.ts.
describe('C45: an empty join conjunct is refused (text: C46)', () => {
  for (const input of [
    `${J}И А.Код = Б.Код`,
    `${J}А.Код = Б.Код И И А.Код = 1`,
    `${J}А.Код = Б.Код И`,
    `${J}(А.Код = Б.Код И)`,
    `${J}И`,
  ]) {
    it(JSON.stringify(input.replace(/^ВЫБРАТЬ .*? ПО /, 'ПО ')), () => {
      const doc = parse(input);
      expect(findMalformedCustomExpressions(doc).length).toBeGreaterThan(0);
      expect(finalApplyBlocker(input)).toEqual({ kind: 'malformedCustom' });
    });
  }
});

describe('C45: valid conjunctions are split exactly as before', () => {
  const controls: [string, string][] = [
    [`${F}ГДЕ В.Код = 1 И В.Наименование = "а"`,
      'ВЫБРАТЬ\n\tВ.Код КАК Код\nИЗ\n\tСправочник.Валюты КАК В\nГДЕ\n\tВ.Код = 1\n\tИ В.Наименование = "а"'],
    [`${F}ГДЕ В.Код МЕЖДУ 1 И 2 И В.Код <> 3`,
      'ВЫБРАТЬ\n\tВ.Код КАК Код\nИЗ\n\tСправочник.Валюты КАК В\nГДЕ\n\tВ.Код МЕЖДУ 1 И 2\n\tИ В.Код <> 3'],
    [`${F}ГДЕ (В.Код = 1 И В.Код = 2)`,
      'ВЫБРАТЬ\n\tВ.Код КАК Код\nИЗ\n\tСправочник.Валюты КАК В\nГДЕ\n\tВ.Код = 1\n\tИ В.Код = 2'],
    [`${F}ГДЕ (В.Код = 1 ИЛИ В.Код = 2) И В.Код <> 3`,
      'ВЫБРАТЬ\n\tВ.Код КАК Код\nИЗ\n\tСправочник.Валюты КАК В\nГДЕ\n\t(В.Код = 1\n\t\t\tИЛИ В.Код = 2)\n\tИ В.Код <> 3'],
    [`${F}ГДЕ В.Код = 1 // c\nИ В.Код = 2`,
      'ВЫБРАТЬ\n\tВ.Код КАК Код\nИЗ\n\tСправочник.Валюты КАК В\nГДЕ\n\tВ.Код = 1\n\t// c\n\tИ В.Код = 2'],
    [`${G}ИМЕЮЩИЕ КОЛИЧЕСТВО(В.Код) > 1 И СУММА(В.Код) > 2`,
      'ВЫБРАТЬ\n\tВ.Код КАК Код\nИЗ\n\tСправочник.Валюты КАК В\n\nСГРУППИРОВАТЬ ПО\n\tВ.Код\n\nИМЕЮЩИЕ\n\tКОЛИЧЕСТВО(В.Код) > 1 И\n\tСУММА(В.Код) > 2'],
    [`${J}А.Код = Б.Код И А.Наименование = Б.Наименование`,
      'ВЫБРАТЬ\n\tА.Код КАК Код\nИЗ\n\tСправочник.Валюты КАК А\n\t\tЛЕВОЕ СОЕДИНЕНИЕ Справочник.Валюты КАК Б\n\t\tПО А.Код = Б.Код\n\t\t\tИ А.Наименование = Б.Наименование'],
    [`${J}(А.Код = Б.Код И А.Код = 1)`,
      'ВЫБРАТЬ\n\tА.Код КАК Код\nИЗ\n\tСправочник.Валюты КАК А\n\t\tЛЕВОЕ СОЕДИНЕНИЕ Справочник.Валюты КАК Б\n\t\tПО А.Код = Б.Код\n\t\t\tИ (А.Код = 1)'],
  ];
  for (const [input, expected] of controls) {
    it(JSON.stringify(input.replace(/^ВЫБРАТЬ .*? (ГДЕ|ИМЕЮЩИЕ|ПО) /, '$1 ')), () => {
      const doc = parse(input);
      expect(generateBatch(doc)).toBe(expected);
      expect(findMalformedCustomExpressions(doc)).toEqual([]);
      expect(finalApplyBlocker(input)).toBeNull();
    });
  }
});
