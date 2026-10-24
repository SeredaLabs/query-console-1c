import { describe, expect, it } from 'vitest';
import { tryOpenDesignerBatch } from '../../src/webview/openDesignerBatch';
import { initialState, reducer, type QueryState } from '../../src/webview/state/queryStore';
import { findStaticApplyBlocker } from '../../src/webview/applyGate';
import { computeBatchTextSafe } from '../../src/webview/computeBatchText';
import { reindentLeafSubquery } from '../../src/core/query/exprFormatter';

// C49: in a subquery kept as raw text, bare-field qualification took `ГРУППИРУЮЩИМ` and
// `НАБОРАМ` for fields (`Х.ГРУППИРУЮЩИМ Х.НАБОРАМ`) and Apply refused the corrupted text.
// Two more steps then changed the grouping sets: the leaf parenthesis cleanup removed the
// parentheses of the first set (`((Х.Код), …)` → `(Х.Код, …)`, a form the parser refuses),
// and the second Save glued the closing `)` of the set list to the last set. These tests
// cover preservation only: grouping sets are not confirmed on an available platform
// (grammar-parity area group.grouping-sets, pending-platform-evidence).

const S = 'Справочник.Валюты';
const SETS = '((Х.Код), (Х.Наименование))';
const SUB = `ВЫБРАТЬ Х.Код ИЗ ${S} КАК Х СГРУППИРОВАТЬ ПО ГРУППИРУЮЩИМ НАБОРАМ ${SETS}`;
const OR = (sets: string) =>
  `ВЫБРАТЬ Т.Код ИЗ ${S} КАК Т ГДЕ Т.Код = 1 ИЛИ Т.Код В (ВЫБРАТЬ Х.Код ИЗ ${S} КАК Х СГРУППИРОВАТЬ ПО ГРУППИРУЮЩИМ НАБОРАМ ${sets})`;

function load(text: string): QueryState {
  const r = tryOpenDesignerBatch(text);
  if (!r.ok) throw new Error(`does not open: ${r.error}`);
  return reducer(initialState(), { type: 'LOAD_BATCH', doc: r.doc });
}

/** Open → Apply check → Save, three times: the Save texts and the Apply blockers. */
function threeSaves(input: string): { texts: string[]; blockers: unknown[] } {
  const texts: string[] = [];
  const blockers: unknown[] = [];
  let text = input;
  for (let pass = 0; pass < 3; pass++) {
    const state = load(text);
    blockers.push(findStaticApplyBlocker(state));
    const { text: saved, error } = computeBatchTextSafe(state, true);
    expect(error).toBeNull();
    texts.push(saved);
    text = saved;
  }
  return { texts, blockers };
}

/** The grouping-set list as one line: `НАБОРАМ ((a), (b))`. */
const setList = (text: string) => text.replace(/\s+/g, ' ').replace(/\( /g, '(').replace(/ \)/g, ')');

const qualified = /[\p{L}\p{N}_]\.(?:ГРУППИРУЮЩИМ|НАБОРАМ)(?![\p{L}\p{N}_])/iu;

describe('C49: grouping sets in a raw-text subquery are kept', () => {
  const contexts: [string, string, string][] = [
    ['ИЛИ, qualified fields', OR(SETS), SETS],
    ['ИЛИ, bare fields', `ВЫБРАТЬ Т.Код ИЗ ${S} КАК Т ГДЕ Т.Код = 1 ИЛИ Т.Код В (ВЫБРАТЬ Код ИЗ ${S} СГРУППИРОВАТЬ ПО ГРУППИРУЮЩИМ НАБОРАМ ((Код), (Наименование)))`,
      '((Справочник.Валюты.Код), (Справочник.Валюты.Наименование))'],
    ['ИЛИ, multi-line', `ВЫБРАТЬ Т.Код ИЗ ${S} КАК Т ГДЕ Т.Код = 1 ИЛИ Т.Код В\n\t(ВЫБРАТЬ\n\t\tХ.Код\n\tИЗ\n\t\t${S} КАК Х\n\tСГРУППИРОВАТЬ ПО\n\t\tГРУППИРУЮЩИМ НАБОРАМ ${SETS})`, SETS],
    ['ИЛИ, lower case', OR(SETS).replace('ГРУППИРУЮЩИМ НАБОРАМ', 'группирующим наборам'), SETS],
    ['field ВЫБОР', `ВЫБРАТЬ ВЫБОР КОГДА Т.Код В (${SUB}) ТОГДА 1 ИНАЧЕ 0 КОНЕЦ КАК Ф ИЗ ${S} КАК Т`, SETS],
    ['join ПО', `ВЫБРАТЬ А.Код ИЗ ${S} КАК А ЛЕВОЕ СОЕДИНЕНИЕ ${S} КАК Б ПО А.Код = Б.Код И А.Код В (${SUB})`, SETS],
    ['ИМЕЮЩИЕ', `ВЫБРАТЬ Т.Код ИЗ ${S} КАК Т СГРУППИРОВАТЬ ПО Т.Код ИМЕЮЩИЕ Т.Код = 1 ИЛИ Т.Код В (${SUB})`, SETS],
    ['two levels of raw text', `ВЫБРАТЬ Т.Код ИЗ ${S} КАК Т ГДЕ Т.Код = 1 ИЛИ Т.Ссылка В (ВЫБРАТЬ Х.Ссылка ИЗ ${S} КАК Х ГДЕ Х.Код = 2 ИЛИ Х.Код В `
      + `(ВЫБРАТЬ Ш.Код ИЗ ${S} КАК Ш СГРУППИРОВАТЬ ПО ГРУППИРУЮЩИМ НАБОРАМ ((Ш.Код), (Ш.Наименование))))`, '((Ш.Код), (Ш.Наименование))'],
  ];

  it.each(contexts)('%s: applicable and unchanged on three Saves', (_name, input, sets) => {
    const { texts, blockers } = threeSaves(input);
    expect(blockers).toEqual([null, null, null]);
    expect(texts[0]).not.toMatch(qualified);
    expect(setList(texts[0])).toContain(`ГРУППИРУЮЩИМ НАБОРАМ ${sets}`);
    expect(texts[1]).toBe(texts[0]);
    expect(texts[2]).toBe(texts[0]);
  });

  // The parentheses of a set are grammar: none is removed, at any depth.
  const setForms: [string, string][] = [
    ['one set', '((Х.Код))'],
    ['set of two fields', '((Х.Код, Х.Наименование))'],
    ['mixed sets', '((Х.Код, Х.Наименование), (Х.Код))'],
    ['expression in a set', '((Х.Код + 1), (Х.Наименование))'],
  ];
  it.each(setForms)('%s: the set parentheses are kept on three Saves', (_name, sets) => {
    const { texts, blockers } = threeSaves(OR(sets));
    expect(blockers).toEqual([null, null, null]);
    expect(setList(texts[0])).toContain(`ГРУППИРУЮЩИМ НАБОРАМ ${sets}`);
    expect(texts[1]).toBe(texts[0]);
    expect(texts[2]).toBe(texts[0]);
  });

  // Forms the parser does not read stay refused; their text is kept as written.
  const refused: [string, string, string][] = [
    ['empty set', OR('((Х.Код), ())'), 'ГРУППИРУЮЩИМ НАБОРАМ ((Х.Код), ())'],
    // СГРУППИРОВАТЬ ВСЕ ПО is not read by the parser at all (not part of C49).
    ['СГРУППИРОВАТЬ ВСЕ ПО', OR(SETS).replace('СГРУППИРОВАТЬ ПО', 'СГРУППИРОВАТЬ ВСЕ ПО'), `СГРУППИРОВАТЬ ВСЕ ПО ГРУППИРУЮЩИМ НАБОРАМ ${SETS}`],
    ['broken condition in the subquery', OR(SETS).replace(' СГРУППИРОВАТЬ', ' ГДЕ Х.Код = 1 И СГРУППИРОВАТЬ'), `ГРУППИРУЮЩИМ НАБОРАМ ${SETS}`],
  ];
  it.each(refused)('%s: refused, text kept', (_name, input, kept) => {
    const { texts, blockers } = threeSaves(input);
    expect(blockers).toEqual([{ kind: 'malformedCustom' }, { kind: 'malformedCustom' }, { kind: 'malformedCustom' }]);
    for (const t of texts) {
      expect(t).not.toMatch(qualified);
      expect(setList(t)).toContain(kept);
    }
  });
});

describe('C49: controls are unchanged', () => {
  const controls: [string, string, string][] = [
    ['modelled subquery', `ВЫБРАТЬ Т.Код ИЗ ${S} КАК Т ГДЕ Т.Код В (${SUB})`, SETS],
    ['top level', `ВЫБРАТЬ Т.Код, Т.Наименование ИЗ ${S} КАК Т СГРУППИРОВАТЬ ПО ГРУППИРУЮЩИМ НАБОРАМ ((Т.Код), (Т.Наименование))`,
      'ГРУППИРУЮЩИМ НАБОРАМ ((Т.Код), (Т.Наименование))'],
    ['ordinary grouping in raw text', `ВЫБРАТЬ Т.Код ИЗ ${S} КАК Т ГДЕ Т.Код = 1 ИЛИ Т.Код В (ВЫБРАТЬ Х.Код ИЗ ${S} КАК Х СГРУППИРОВАТЬ ПО Х.Код)`,
      'СГРУППИРОВАТЬ ПО Х.Код'],
    // The leaf cleanup still removes redundant predicate parentheses inside a subquery.
    ['НЕ (… В подзапрос) in raw text', `ВЫБРАТЬ Т.Код ИЗ ${S} КАК Т ГДЕ Т.Код = &К ИЛИ Т.Ссылка В `
      + `(ВЫБРАТЬ Х.Ссылка ИЗ ${S} КАК Х ГДЕ НЕ (Х.Ссылка В (ВЫБРАТЬ Ш.Ссылка ИЗ ${S} КАК Ш)))`, 'ГДЕ НЕ Х.Ссылка В (ВЫБРАТЬ Ш.Ссылка'],
  ];
  it.each(controls)('%s', (_name, input, kept) => {
    const { texts, blockers } = threeSaves(input);
    expect(blockers).toEqual([null, null, null]);
    expect(setList(texts[0])).toContain(kept);
    expect(texts[1]).toBe(texts[0]);
    expect(texts[2]).toBe(texts[0]);
  });

  it('a subquery closed on its own line is still glued to its last line', () => {
    const { texts } = threeSaves(`ВЫБРАТЬ Т.Код ИЗ ${S} КАК Т ГДЕ Т.Код = 1 ИЛИ Т.Код В\n\t(ВЫБРАТЬ\n\t\tХ.Код\n\tИЗ\n\t\t${S} КАК Х\n\t)`);
    expect(texts[0]).toMatch(/Справочник\.Валюты КАК Х\)\)$/u);
  });
});

describe('C49: the closing line of a raw subquery reads brackets in code only', () => {
  const head = 'Т.Код В\n\t(ВЫБРАТЬ\n\t\tХ.Код\n\tИЗ\n\t\tСправочник.Валюты КАК Х\n';
  const cases: [string, string, boolean][] = [
    ['an open bracket in a string literal', '\tГДЕ\n\t\tХ.Наименование = "(("\n\t)', true],
    ['a closing bracket in a string literal', '\tГДЕ\n\t\tХ.Наименование = ")"\n\t)', true],
    ['a grouping-set list', '\tСГРУППИРОВАТЬ ПО ГРУППИРУЮЩИМ НАБОРАМ\n\t(\n\t\t(Х.Код),\n\t\t(Х.Наименование)\n\t))', false],
    ['a grouping-set list with a literal', '\tГДЕ\n\t\tХ.Наименование = ")"\n\tСГРУППИРОВАТЬ ПО ГРУППИРУЮЩИМ НАБОРАМ\n\t(\n\t\t(Х.Код)\n\t))', false],
  ];
  it.each(cases)('%s', (_name, tail, glued) => {
    const out = reindentLeafSubquery(head + tail, 1);
    const lastLine = out.split('\n').pop()!;
    expect(/^\t*\)+$/u.test(lastLine)).toBe(!glued);
  });

  // The rule relies on an earlier check of the same function: from the `(ВЫБРАТЬ` line
  // the block stays open until the last line, which closes it. So the first `(` of the
  // body is the subquery's own, and any further open bracket belongs to the body.
  const nesting: [string, string, string, boolean][] = [
    ['deep groups closed inside the body', 'Т.Код В',
      '\tГДЕ\n\t\t((Х.Код = 1) И (Х.Код В (1, (2))))\n\t)', true],
    ['the closing line also closes the head', '(Т.Код = 1 ИЛИ Т.Код В',
      '\tГДЕ\n\t\tХ.Код = 1\n\t))', true],
    ['a set list and the head closed on one line', '(Т.Код = 1 ИЛИ Т.Код В',
      '\tСГРУППИРОВАТЬ ПО ГРУППИРУЮЩИМ НАБОРАМ\n\t(\n\t\t((Х.Код))\n\t)))', false],
  ];
  it.each(nesting)('%s', (_name, lead, tail, glued) => {
    const out = reindentLeafSubquery(head.replace('Т.Код В', lead) + tail, 1);
    expect(/^\t*\)+$/u.test(out.split('\n').pop()!)).toBe(!glued);
  });

  // Broken balance or an unusual opening line: the leaf is kept as written.
  const unchanged: [string, string][] = [
    ['the block closes before the last line', `${head}\tГДЕ\n\t\tХ.Код = 1)\n\t)`],
    ['the block is not closed', `${head}\tГДЕ\n\t\t(Х.Код = 1\n\t)`],
    ['two brackets before ВЫБРАТЬ', head.replace('\t(ВЫБРАТЬ', '\t((ВЫБРАТЬ') + '\t))'],
  ];
  it.each(unchanged)('%s', (_name, leaf) => {
    const out = reindentLeafSubquery(leaf, 1);
    expect(out.split('\n').pop()).toBe(leaf.split('\n').pop());
  });

  // A bracket in a comment already stops the reindent before this rule (its bracket
  // balance check counts comments); the leaf is kept as written, as before C49.
  it('a bracket in a comment: the leaf is kept as written', () => {
    const leaf = `${head}\tГДЕ // ((\n\t\tХ.Код = 1\n\t)`;
    expect(reindentLeafSubquery(leaf, 1)).toBe(leaf);
  });
});
