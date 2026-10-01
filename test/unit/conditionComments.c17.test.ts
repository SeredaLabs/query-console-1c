import { describe, expect, it } from 'vitest';
import { buildYamlResolver } from '../../src/core/metadata/buildYamlResolver';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { tokenize } from '../../src/core/query/sdblLexer';
import { tryOpenDesignerBatch } from '../../src/webview/openDesignerBatch';
import { initialState, reducer } from '../../src/webview/state/queryStore';
import { computeBatchTextSafe } from '../../src/webview/computeBatchText';
import { decideApply, findStaticApplyBlocker } from '../../src/webview/applyGate';

const resolver = buildYamlResolver('test/fixtures/corpus/metadata/cf');
const head = 'ВЫБРАТЬ Т.Код КАК А ИЗ Справочник.Валюты КАК Т';
const commentsOf = (text: string) => tokenize(text, { comments: true }).filter(t => t.type === 'comment').map(t => t.text);
const cases: Array<[string, string]> = [
  ['WHERE OR', `${head} ГДЕ Т.Код = 1 // before OR\nИЛИ Т.Код = 2`],
  ['WHERE AND', `${head} ГДЕ Т.Код = &А // before AND\nИ Т.Код = &Б // trailing  `],
  ['WHERE edge and repeated comments', `${head} ГДЕ\n// repeated\nТ.Код = &А\n// repeated\nИ // between operator and code\nТ.Код = &Б\n// final\nУПОРЯДОЧИТЬ ПО А`],
  ['WHERE parenthesis flattening', `${head} ГДЕ (// opening\nТ.Код = &А // internal\nИ Т.Код = &Б // closing\n)`],
  ['WHERE NOT OR', `${head} ГДЕ НЕ (Т.Код = 1 // not OR\nИЛИ Т.Код = 2) И Т.Код = &А`],
  ['WHERE internal standard RHS', `${head} ГДЕ Т.Код // lhs\n= &А`],
  ['WHERE quoted slash', `${head} ГДЕ Т.Код = "// string" // actual\nИЛИ Т.Код = "x"`],
  ['HAVING AND', `${head} СГРУППИРОВАТЬ ПО Т.Код ИМЕЮЩИЕ КОЛИЧЕСТВО(*) > 1 // before AND\nИ СУММА(1) > 0`],
  ['HAVING trailing', `${head} СГРУППИРОВАТЬ ПО Т.Код ИМЕЮЩИЕ КОЛИЧЕСТВО(*) > 1 // last\nУПОРЯДОЧИТЬ ПО А`],
  ['HAVING internal OR', `${head} СГРУППИРОВАТЬ ПО Т.Код ИМЕЮЩИЕ КОЛИЧЕСТВО(*) > 1 // OR\nИЛИ СУММА(1) > 0`],
  ['source subquery', `ВЫБРАТЬ П.А ИЗ (${head} ГДЕ Т.Код = &А // nested\n) КАК П`],
  ['structured condition subquery', `${head} ГДЕ НЕ Т.Ссылка В ИЕРАРХИИ (ВЫБРАТЬ Б.Ссылка ИЗ Справочник.Валюты КАК Б ГДЕ Б.Код = &А // inner\n) // outer`],
  ['duplicates across SELECT and source-subquery conditions', `// same\nВЫБРАТЬ П.А // same\nИЗ (${head} ГДЕ Т.Код = &А // same\n) КАК П`],
  ['UNION', `${head} ГДЕ Т.Код = &А // first\nОБЪЕДИНИТЬ ВСЕ ${head} ГДЕ Т.Код = &Б // second`],
];

for (const metadata of [false, true]) describe(`C17 WHERE/HAVING comments (metadata=${metadata})`, () => {
  const active = metadata ? resolver : undefined;
  it.each(cases)('%s survives open/store/Apply/reopen and strip mode', (_name, input) => {
    const opened = tryOpenDesignerBatch(input, active);
    expect(opened.ok).toBe(true);
    if (!opened.ok) throw new Error(opened.error);
    const state = reducer(initialState(), { type: 'LOAD_BATCH', doc: opened.doc });
    const preview = computeBatchTextSafe(state, true);
    expect(preview.error).toBeNull();
    expect(commentsOf(preview.text!)).toEqual(commentsOf(input));
    expect(decideApply(preview.text, preview.error, findStaticApplyBlocker(state), active)).toEqual({ ok: true });
    const reopened = tryOpenDesignerBatch(preview.text!, active);
    expect(reopened.ok).toBe(true);
    if (!reopened.ok) throw new Error(reopened.error);
    expect(generateBatch(reopened.doc)).toBe(preview.text);
    expect(commentsOf(computeBatchTextSafe(state, false).text!)).toEqual([]);
    expect(computeBatchTextSafe(state, true).text).toBe(preview.text);
    expect(commentsOf(generateBatch(parseBatch(input, active)))).toEqual([]);
  });
  it('retains standard parameter conditions and structured subqueries', () => {
    const doc = parseBatch(`${head} ГДЕ Т.Код = &А // parameter\nИ НЕ Т.Ссылка В ИЕРАРХИИ (ВЫБРАТЬ Б.Ссылка ИЗ Справочник.Валюты КАК Б ГДЕ Б.Код = &Б // inner\n)`, active, { preserveComments: true });
    const conditions = doc.members[0].members[0].model.conditions!;
    expect(conditions[0].custom).toBe(false);
    expect(conditions[1]).toMatchObject({ negated: true, hierarchy: true, subquery: expect.any(Object) });
  });
});

it('commented OR conjunct keeps precedence when another condition is added', () => {
  const input = `${head} ГДЕ Т.Код = 1 // OR\nИЛИ Т.Код = 2`;
  const state = reducer(reducer(initialState(), { type: 'LOAD_BATCH', doc: parseBatch(input, undefined, { preserveComments: true }) }),
    { type: 'ADD_CONDITION', tableId: 't0', path: 'Код' });
  const output = computeBatchTextSafe(state, true).text!;
  const reparsed = parseBatch(output, undefined, { preserveComments: true });
  expect(reparsed.members[0].members[0].model.conditions).toHaveLength(2);
  expect(commentsOf(output)).toEqual(['// OR']);
  expect(generateBatch(reparsed)).toBe(output);
});

it('comments never authorize malformed Apply', () => {
  const state = reducer(initialState(), { type: 'LOAD_BATCH', doc: parseBatch(`${head} ГДЕ Т.Код = = 1 // invalid`, undefined, { preserveComments: true }) });
  const preview = computeBatchTextSafe(state, true);
  expect(commentsOf(preview.text!)).toEqual(['// invalid']);
  expect(decideApply(preview.text, preview.error, findStaticApplyBlocker(state))).toMatchObject({ ok: false });
});

for (const slot of ['ГДЕ', 'ИМЕЮЩИЕ'] as const) {
  it(`${slot}: edge comment lines and code after leading comments keep the slot indent`, () => {
    const input = `${head} ${slot}\n// leading  \nТ.Код = &А // first\nИ Т.Код = &Б // last  `;
    const doc = parseBatch(input, undefined, { preserveComments: true });
    const output = generateBatch(doc);
    const separator = slot === 'ГДЕ' ? '\tИ Т.Код = &Б' : '\tИ\n\tТ.Код = &Б';
    expect(output).toContain(`${slot}\n\t// leading  \n\tТ.Код = &А\n\t// first\n${separator}\n\t// last  `);
    expect(commentsOf(output)).toEqual(commentsOf(input));
    expect(generateBatch(parseBatch(output, undefined, { preserveComments: true }))).toBe(output);
  });
  it(`${slot}: raw commented code and standalone comments keep the slot indent`, () => {
    const input = `${head} ${slot} Т.Код // first\n// second  \n= &А`;
    const output = generateBatch(parseBatch(input, undefined, { preserveComments: true }));
    expect(output).toContain(`${slot}\n\tТ.Код // first\n\t// second  \n\t= &А`);
    expect(commentsOf(output)).toEqual(commentsOf(input));
    expect(generateBatch(parseBatch(output, undefined, { preserveComments: true }))).toBe(output);
  });
  it(`${slot}: indentation does not change multiline string values`, () => {
    const literal = '"first\n// literal text\nlast"';
    const input = `${head} ${slot} Т.Код // actual\n= ${literal}`;
    const output = generateBatch(parseBatch(input, undefined, { preserveComments: true }));
    expect(output).toContain(`\tТ.Код // actual\n\t= ${literal}`);
    expect(output).toContain(literal);
    expect(commentsOf(output)).toEqual(['// actual']);
    expect(generateBatch(parseBatch(output, undefined, { preserveComments: true }))).toBe(output);
  });
}

it('source and IN subqueries add their own nesting indent to condition comment lines', () => {
  const inner = `${head} ГДЕ\n// leading\nТ.Код = &А // trailing`;
  const source = generateBatch(parseBatch(`ВЫБРАТЬ П.А ИЗ (${inner}\n) КАК П`, undefined, { preserveComments: true }));
  expect(source).toContain('ГДЕ\n\t\t// leading\n\t\tТ.Код = &А\n\t\t// trailing');
  const condition = generateBatch(parseBatch(`${head} ГДЕ Т.Код В (${inner}\n)`, undefined, { preserveComments: true }));
  expect(condition).toContain('ГДЕ\n\t\t\t\t// leading\n\t\t\t\tТ.Код = &А\n\t\t\t\t// trailing');
  for (const text of [source, condition]) expect(generateBatch(parseBatch(text, undefined, { preserveComments: true }))).toBe(text);
});
