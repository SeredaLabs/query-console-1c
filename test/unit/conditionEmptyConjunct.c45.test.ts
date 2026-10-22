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
  [`${J}И А.Код = Б.Код`, 'И А.Код = Б.Код'],
  // The generator re-splits a custom join expression on `И` (currently `И ()` for the
  // empty operand; generator unchanged, see C45) — only the kept `И` and refusal are pinned.
  [`${J}А.Код = Б.Код И И А.Код = 1`, 'А.Код = Б.Код И'],
  [`${J}А.Код = Б.Код И`, 'А.Код = Б.Код И'],
];

describe('C45: an empty conjunct keeps its text and is refused', () => {
  for (const [input, kept] of emptyConjunct) {
    it(JSON.stringify(input.replace(/^ВЫБРАТЬ .*? (ГДЕ|ИМЕЮЩИЕ|ПО) /, '$1 ')), () => {
      const doc = parse(input);
      expect(flat(generateBatch(doc))).toContain(kept);
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
