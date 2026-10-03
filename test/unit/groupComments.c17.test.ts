import { describe, expect, it } from 'vitest';
import { tokenize } from '../../src/core/query/sdblLexer';
import { buildYamlResolver } from '../../src/core/metadata/buildYamlResolver';
import { tryOpenDesignerBatch } from '../../src/webview/openDesignerBatch';
import { initialState, reducer } from '../../src/webview/state/queryStore';
import { computeBatchTextSafe } from '../../src/webview/computeBatchText';
import { decideApply, findStaticApplyBlocker } from '../../src/webview/applyGate';
const resolver = buildYamlResolver('test/fixtures/corpus/metadata/cf');
const comments = (text: string) => tokenize(text, { comments: true }).filter(t => t.type === 'comment').map(t => t.text).sort();
const head = 'ВЫБРАТЬ Т.Код КАК А ИЗ Справочник.Валюты КАК Т';
const cases = [
 `${head} СГРУППИРОВАТЬ // keyword\nПО // head\nТ.Код // tail`,
 `${head} СГРУППИРОВАТЬ ПО Т. // path\nКод`,
 `${head} СГРУППИРОВАТЬ ПО Т.Код // expression\n+ 1`,
 `${head} СГРУППИРОВАТЬ ПО Т.Код // same\n, Т.Код // same\n, Т.Код // same`,
 `${head} СГРУППИРОВАТЬ ПО // parameter\n&П // same\n, Т.Код // same`,
 'ВЫБРАТЬ 1 КАК А СГРУППИРОВАТЬ ПО &П // removed',
 `${head} СГРУППИРОВАТЬ ПО ГРУППИРУЮЩИМ // keyword\nНАБОРАМ ( // outer\n(Т.Код // first\n), // between\n(Т.Код // second\n)) // end`,
 `${head} СГРУППИРОВАТЬ ПО Т.Код // group\nИМЕЮЩИЕ 1 // having\n= 1 УПОРЯДОЧИТЬ ПО А`,
];
for (const metadata of [false, true]) describe(`C17 GROUP comments metadata=${metadata}`, () => {
 for (const source of cases) for (const input of [source, `ВЫБРАТЬ П.А ИЗ (${source}\n) КАК П`, `${source}\nОБЪЕДИНИТЬ ВСЕ ВЫБРАТЬ 1 КАК А`, `ВЫБРАТЬ 1 КАК А ГДЕ 1 В (${source}\n)`]) it(input, () => {
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
   const stripped = computeBatchTextSafe(state, false).text!;
   expect(comments(stripped)).toEqual([]);
   expect(tokenize(stripped).map(t => t.text)).toEqual(tokenize(canonical).map(t => t.text));
   expect(computeBatchTextSafe(state, true).text).toBe(canonical);
   text = canonical;
  }
 });
});

for (const metadata of [false, true]) describe(`C17 mixed subquery ownership metadata=${metadata}`, () => {
 for (const group of ['', '\nСГРУППИРОВАТЬ ПО Т.Код // same\n']) {
  for (const [from, tail] of [
   ['ИЗ Справочник.Валюты КАК Т', 'УПОРЯДОЧИТЬ ПО А // same\n'],
   ['ИЗ Справочник.Валюты КАК Т', 'ИТОГИ КОЛИЧЕСТВО(А) // same\nКАК Н ПО ОБЩИЕ'],
   ['ИЗ Справочник.Валюты // same\nКАК Т', ''],
  ]) it(`${from} ${group} ${tail}`, () => {
   const active = metadata ? resolver : undefined;
   const input = `ВЫБРАТЬ 1 КАК А ГДЕ 1 В (\nВЫБРАТЬ\nТ.Код КАК А\n${from}${group}\n${tail}\n)`;
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
 }
});
