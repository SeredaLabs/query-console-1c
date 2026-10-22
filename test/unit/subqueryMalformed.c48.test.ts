import { describe, expect, it } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { findMalformedCustomExpressions } from '../../src/core/query/semanticValidator';
import { embeddedSubqueryTexts } from '../../src/core/query/expressionSyntaxCheck';
import { analyze, MALFORMED_CUSTOM_EXPRESSION } from '../../src/core/query/queryAnalysisService';
import { tryOpenDesignerBatch } from '../../src/webview/openDesignerBatch';
import { initialState, reducer } from '../../src/webview/state/queryStore';
import { findStaticApplyBlocker } from '../../src/webview/applyGate';

// C48: a `(ВЫБРАТЬ …)` group inside custom text the parser kept raw (outer alias `В`,
// top-level `ИЛИ`, `ВЫБОР`, `НЕ (…)`, a join `ПО`) was skipped by the expression
// acceptor by bracket balance only, and no subquery model existed to check it, so a
// broken inner condition passed OK / Save. Such groups are now parsed and walked.

const sub = (where: string) => `ВЫБРАТЬ Х.Код ИЗ Справочник.Валюты КАК Х ГДЕ ${where}`;

/** Forms whose IN-subquery stays inside raw custom text. */
const forms: [string, (s: string) => string][] = [
  ['outer alias В', s => `ВЫБРАТЬ В.Код КАК Код ИЗ Справочник.Валюты КАК В ГДЕ В.Код В (${s})`],
  ['top-level ИЛИ', s => `ВЫБРАТЬ Т.Код КАК Код ИЗ Справочник.Валюты КАК Т ГДЕ Т.Код = 1 ИЛИ Т.Код В (${s})`],
  ['ВЫБОР in a field', s => `ВЫБРАТЬ ВЫБОР КОГДА Т.Код В (${s}) ТОГДА 1 ИНАЧЕ 0 КОНЕЦ КАК Флаг ИЗ Справочник.Валюты КАК Т`],
  ['НЕ (… ИЛИ В)', s => `ВЫБРАТЬ Т.Код КАК Код ИЗ Справочник.Валюты КАК Т ГДЕ НЕ (Т.Код = 1 ИЛИ Т.Код В (${s}))`],
  ['join ПО', s => 'ВЫБРАТЬ А.Код КАК Код ИЗ Справочник.Валюты КАК А ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Валюты КАК Б '
    + `ПО А.Код = Б.Код И А.Код В (${s})`],
  ['raw inside raw', s => 'ВЫБРАТЬ Т.Код КАК Код ИЗ Справочник.Валюты КАК Т ГДЕ Т.Код = 1 ИЛИ Т.Код В '
    + `(ВЫБРАТЬ Ю.Код ИЗ Справочник.Валюты КАК Ю ГДЕ Ю.Код = 2 ИЛИ Ю.Код В (${s}))`],
  ['English OR', s => `SELECT Т.Код AS Код FROM Catalog.Валюты AS Т WHERE Т.Код = 1 OR Т.Код IN (${s})`],
];

const broken: [string, string][] = [
  ['trailing И', sub('Х.Код = 1 И')],
  ['missing operand', sub('Х.Код = ')],
  ['lone И', sub('И')],
  ['no source after ИЗ', 'ВЫБРАТЬ Х.Код ИЗ'],
];

const valid: [string, string][] = [
  ['plain condition', sub('Х.Код = 1')],
  ['parameter and string with a subquery-like literal', sub('Х.Код = &П И Х.Наименование ПОДОБНО "%(ВЫБРАТЬ И%"')],
  ['comment with a bracket', `${sub('Х.Код = 1')} // (ВЫБРАТЬ И\n`],
  ['reference to the outer alias', sub('Х.Код <> 0 И Х.Ссылка = Х.Ссылка')],
  ['table unknown without metadata', 'ВЫБРАТЬ Х.Код ИЗ Справочник.НетТакойТаблицы КАК Х ГДЕ Х.Код = 1'],
  ['union', `${sub('Х.Код = 1')} ОБЪЕДИНИТЬ ВСЕ ${sub('Х.Код = 2')}`],
  ['nested modeled subquery', sub('Х.Код В (ВЫБРАТЬ Я.Код ИЗ Справочник.Валюты КАК Я ГДЕ Я.Код = 1)')],
];

function openOrThrow(text: string) {
  const r = tryOpenDesignerBatch(text);
  if (!r.ok) throw new Error(`does not open: ${r.error}`);
  return r.doc;
}

/** The static Apply blocker OK / Save and the designer switch use. */
const finalApplyBlocker = (text: string) =>
  findStaticApplyBlocker(reducer(initialState(), { type: 'LOAD_BATCH', doc: openOrThrow(text) }));

const parse = (text: string) => parseBatch(text, undefined, { preserveComments: true });
const flat = (text: string) => text.replace(/\s+/g, ' ').trim();

describe('C48: a broken condition inside a raw-text subquery is refused', () => {
  for (const [form, wrap] of forms) {
    for (const [name, inner] of broken) {
      it(`${form}: ${name}`, () => {
        const input = wrap(inner);
        const doc = parse(input);
        expect(findMalformedCustomExpressions(doc).length).toBeGreaterThan(0);
        expect(finalApplyBlocker(input)).toEqual({ kind: 'malformedCustom' });
        expect(analyze(input).diagnostics).toEqual([{ message: MALFORMED_CUSTOM_EXPRESSION }]);
      });
    }
  }
});

describe('C48: structurally valid subqueries in the same forms stay applicable', () => {
  for (const [form, wrap] of forms) {
    for (const [name, inner] of valid) {
      it(`${form}: ${name}`, () => {
        const input = wrap(inner);
        const doc = parse(input);
        expect(findMalformedCustomExpressions(doc)).toEqual([]);
        expect(finalApplyBlocker(input)).toBeNull();
        expect(analyze(input).diagnostics).toEqual([]);
      });
    }
  }

  // The fix only reads the model: the generated text of a raw subquery is unchanged.
  it('keeps the raw subquery text in the generated query', () => {
    const input = forms[1][1](sub('Х.Код = 1'));
    expect(flat(generateBatch(parse(input)))).toContain(`Т.Код В (${sub('Х.Код = 1')})`);
  });

  // C49 (OPEN): the parser already qualifies `ГРУППИРУЮЩИМ` as a field in raw text; the
  // corrupted text is refused instead of written. Update when C49 is fixed.
  it('refuses grouping sets corrupted by bare-field qualification (C49)', () => {
    const input = forms[1][1]('ВЫБРАТЬ Х.Код ИЗ Справочник.Валюты КАК Х СГРУППИРОВАТЬ ПО ГРУППИРУЮЩИМ НАБОРАМ ((Х.Код), (Х.Наименование))');
    expect(generateBatch(parse(input))).toContain('Х.ГРУППИРУЮЩИМ');
    expect(finalApplyBlocker(input)).toEqual({ kind: 'malformedCustom' });
  });

  // Template markers are substituted before the text becomes SDBL (R7): not judged.
  it('does not judge a subquery with a template marker', () => {
    const input = forms[1][1]('ВЫБРАТЬ Х.Код ИЗ #Таблица# КАК Х ГДЕ Х.Код = 1 И');
    expect(finalApplyBlocker(input)).toBeNull();
  });
});

describe('C48: subquery boundaries come from lexer tokens', () => {
  it('returns top-level groups only, nested ones stay in their text', () => {
    expect(embeddedSubqueryTexts('А В (ВЫБРАТЬ 1 ГДЕ Б В (ВЫБРАТЬ 2)) ИЛИ (ВЫБРАТЬ 3)'))
      .toEqual(['ВЫБРАТЬ 1 ГДЕ Б В (ВЫБРАТЬ 2)', 'ВЫБРАТЬ 3']);
  });

  it('ignores brackets and ВЫБРАТЬ in strings and comments', () => {
    expect(embeddedSubqueryTexts('А = "(ВЫБРАТЬ" ИЛИ А В (ВЫБРАТЬ ")" // )\n ИЗ Т)'))
      .toEqual(['ВЫБРАТЬ ")" // )\n ИЗ Т']);
    expect(embeddedSubqueryTexts('А = 1 // (ВЫБРАТЬ И\n')).toEqual([]);
  });

  it('finds a subquery written in lower case', () => {
    expect(embeddedSubqueryTexts('А В (выбрать 1) ИЛИ Б В (select 2)')).toEqual(['выбрать 1', 'select 2']);
  });

  it('skips a non-subquery group, an unclosed group, unlexable text and template text', () => {
    expect(embeddedSubqueryTexts('(А) В (1, 2)')).toEqual([]);
    expect(embeddedSubqueryTexts('А В (ВЫБРАТЬ 1')).toEqual([]);
    expect(embeddedSubqueryTexts('А В (ВЫБРАТЬ "')).toEqual([]);
    expect(embeddedSubqueryTexts('А В (ВЫБРАТЬ 1 ИЗ #Т#)')).toEqual([]);
  });

  // Every level is a strict substring of its parent, so the walk ends; a broken
  // condition at the deepest level is still found.
  it('walks deeply nested raw subqueries', () => {
    const nest = (depth: number, where: string): string => {
      let s = sub(where);
      for (let d = 0; d < depth; d++) {
        s = `ВЫБРАТЬ Х.Код ИЗ Справочник.Валюты КАК Х ГДЕ Х.Код = ${d} ИЛИ Х.Код В (${s})`;
      }
      return forms[1][1](s);
    };
    expect(finalApplyBlocker(nest(6, 'Х.Код = 1'))).toBeNull();
    expect(finalApplyBlocker(nest(6, 'Х.Код = 1 И'))).toEqual({ kind: 'malformedCustom' });
  });
});
