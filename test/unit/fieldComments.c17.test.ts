import { describe, expect, it } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { tokenize } from '../../src/core/query/sdblLexer';
import { buildYamlResolver } from '../../src/core/metadata/buildYamlResolver';
import { tryOpenDesignerBatch } from '../../src/webview/openDesignerBatch';
import { initialState, reducer } from '../../src/webview/state/queryStore';
import { computeBatchTextSafe } from '../../src/webview/computeBatchText';
import { decideApply, findStaticApplyBlocker } from '../../src/webview/applyGate';
const comments = (text: string) => tokenize(text, { comments: true }).filter(t => t.type === 'comment').map(t => t.text).sort();
const resolver = buildYamlResolver('test/fixtures/corpus/metadata/cf');
const scalar = [
 'ВЫБРАТЬ Т.Код // inner\n+ 1 КАК А ИЗ Справочник.Валюты КАК Т',
 'ВЫБРАТЬ Т. // path\nКод КАК А ИЗ Справочник.Валюты КАК Т',
 'ВЫБРАТЬ СУММА(// aggregate\n1) КАК А',
 'ВЫБРАТЬ 1 КАК // alias\nА',
 'ВЫБРАТЬ 1 КАК А\n// end\n',
 'ВЫБРАТЬ ВЫБОР КОГДА ИСТИНА // branch\nТОГДА "a\nb" ИНАЧЕ "x" КОНЕЦ КАК А',
];
const tabular = [
 'ВЫБРАТЬ Т.Товары.(1 // inner\n+ 2 КАК А) КАК ТЧ, 3 // tail\n+ 4 КАК Б ИЗ Документ.ЗаказКлиента КАК Т',
 'ВЫБРАТЬ // head\n1 КАК А, Т.Товары.(1 КАК Б) КАК ТЧ, // tail\n2 КАК В ИЗ Документ.ЗаказКлиента КАК Т',
];
for (const metadata of [false, true]) describe(`C17 SELECT comments metadata=${metadata}`, () => {
 for (const source of scalar) for (const input of [source, `ВЫБРАТЬ П.А ИЗ (${source}\n) КАК П`, `${source}\nОБЪЕДИНИТЬ ВСЕ ВЫБРАТЬ 1 КАК А`]) it(input, () => {
  const active = metadata ? resolver : undefined;
  const opened = tryOpenDesignerBatch(input, active);
  expect(opened.ok).toBe(true);
  if (!opened.ok) throw new Error(opened.error);
  const state = reducer(initialState(), { type: 'LOAD_BATCH', doc: opened.doc });
  const preview = computeBatchTextSafe(state, true);
  expect(preview.error).toBeNull();
  expect(comments(preview.text!)).toEqual(comments(input));
  expect(decideApply(preview.text, preview.error, findStaticApplyBlocker(state), active)).toEqual({ ok: true });
  expect(generateBatch(parseBatch(preview.text!, active, { preserveComments: true }))).toBe(preview.text);
  expect(comments(computeBatchTextSafe(state, false).text!)).toEqual([]);
  expect(computeBatchTextSafe(state, true).text).toBe(preview.text);
 });
});
for (const input of tabular) it(input, () => {
 const opened = tryOpenDesignerBatch(input);
 expect(opened.ok).toBe(true);
 if (!opened.ok) throw new Error(opened.error);
 const state = reducer(initialState(), { type: 'LOAD_BATCH', doc: opened.doc });
 const output = computeBatchTextSafe(state, true).text!;
 expect(comments(output)).toEqual(comments(input));
 expect(generateBatch(parseBatch(output, undefined, { preserveComments: true }))).toBe(output);
 expect(comments(computeBatchTextSafe(state, false).text!)).toEqual([]);
});
it('interior path comments do not turn a structured field into a custom expression', () => {
 const batch = parseBatch(scalar[1], resolver, { preserveComments: true });
 expect(batch.members[0].members[0].model.fields[0]).toMatchObject({ path: 'Код' });
 expect(batch.members[0].members[0].model.fields[0].expression).toBeUndefined();
});

it('nested headers and repeated field comments are owned once and stripping is non-mutating', () => {
 const input = 'ВЫБРАТЬ П.А ИЗ (\n// same\nВЫБРАТЬ 1 // same\n+ 2 КАК А\n) КАК П';
 const doc = parseBatch(input, undefined, { preserveComments: true });
 const state = reducer(initialState(), { type: 'LOAD_BATCH', doc });
 const output = computeBatchTextSafe(state, true).text!;
 expect(comments(output)).toEqual(comments(input));
 expect(comments(computeBatchTextSafe(state, false).text!)).toEqual([]);
 expect(computeBatchTextSafe(state, true).text).toBe(output);
 expect(generateBatch(parseBatch(output, undefined, { preserveComments: true }))).toBe(output);
});
it('source-less WHERE comments stay out of SELECT anchors', () => {
 const input = 'ВЫБРАТЬ 1 // field\n+ 2 КАК А ГДЕ 1 // condition\n= 1';
 const doc = parseBatch(input, undefined, { preserveComments: true });
 expect(doc.members[0].members[0].model.fields[0].commentLeading).toEqual(['// field']);
 expect(comments(generateBatch(doc))).toEqual(comments(input));
});

it('SELECT comments inside a condition subquery have one owner', () => {
 const input = 'ВЫБРАТЬ Т.Код ИЗ Справочник.Валюты КАК Т ГДЕ Т.Код В (ВЫБРАТЬ 1 // field\n+ 2 КАК А)';
 const opened = tryOpenDesignerBatch(input, resolver);
 expect(opened.ok).toBe(true);
 if (!opened.ok) throw new Error(opened.error);
 const output = generateBatch(opened.doc);
 expect(comments(output)).toEqual(comments(input));
 expect(generateBatch(parseBatch(output, resolver, { preserveComments: true }))).toBe(output);
});

it('tabular UNION members and trailing fields retain their own comments', () => {
 const input = `${tabular[0]}\nОБЪЕДИНИТЬ ВСЕ\n${tabular[0].replace('// inner', '// second inner').replace('// tail', '// second tail')}`;
 const doc = parseBatch(input, undefined, { preserveComments: true });
 const output = generateBatch(doc);
 expect(comments(output)).toEqual(comments(input));
 expect(generateBatch(parseBatch(output, undefined, { preserveComments: true }))).toBe(output);
});

for (const metadata of [false, true]) describe(`C17 SELECT review regressions metadata=${metadata}`, () => {
 const inputs = [
  'ВЫБРАТЬ Т.Код КАК А ИЗ Справочник.Валюты КАК Т ГДЕ Т.Код В ( // same\nВЫБРАТЬ 1 КАК А)',
  'ВЫБРАТЬ Т.Код КАК А ИЗ Справочник.Валюты КАК Т ГДЕ // same\nТ.Код // same\nВ ( // same\nВЫБРАТЬ 1 // same\nКАК А)',
  'ВЫБРАТЬ 1 КАК А ИМЕЮЩИЕ 1 В ( // header\nВЫБРАТЬ 1 КАК А)',
  ...['ИЗ', 'ПОМЕСТИТЬ', 'ДОБАВИТЬ'].flatMap(alias => [
   `ВЫБРАТЬ 1 КАК // alias\n${alias}, 2 КАК Б`,
   `ВЫБРАТЬ 1 КАК ${alias} // tail\n, 2 КАК Б`,
   `ВЫБРАТЬ 1 КАК ${alias}, 2 // second\nКАК Б`,
   `ВЫБРАТЬ Т.Код КАК ${alias}, Т.Код // second\nКАК Б ИЗ Справочник.Валюты КАК Т`,
  ]),
  'ВЫБРАТЬ 1 // field\nКАК А ПОМЕСТИТЬ ВТ',
 ];
 for (const input of inputs) it(input, () => {
  const active = metadata ? resolver : undefined;
  let text = input;
  let canonical: string | undefined;
  for (let pass = 0; pass < 3; pass++) {
   const opened = tryOpenDesignerBatch(text, active);
   expect(opened.ok).toBe(true);
   if (!opened.ok) throw new Error(opened.error);
   const state = reducer(initialState(), { type: 'LOAD_BATCH', doc: opened.doc });
   const preview = computeBatchTextSafe(state, true);
   expect(preview.error).toBeNull();
   expect(comments(preview.text!)).toEqual(comments(input));
   expect(decideApply(preview.text, preview.error, findStaticApplyBlocker(state), active)).toEqual({ ok: true });
   if (canonical !== undefined) expect(preview.text).toBe(canonical);
   canonical = preview.text!;
   expect(comments(computeBatchTextSafe(state, false).text!)).toEqual([]);
   expect(computeBatchTextSafe(state, true).text).toBe(canonical);
   text = canonical;
  }
 });
});
