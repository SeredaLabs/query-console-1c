/**
 * C17 ORDER: section comments are kept once, after the УПОРЯДОЧИТЬ ПО header
 * (as own lines when the section is АВТОУПОРЯДОЧИВАНИЕ only), with Apply allowed,
 * a stable three-pass reopen and a comment-free strip view with identical code.
 * Comments of a following ИТОГИ section stay owned by TOTALS.
 */
import { describe, expect, it } from 'vitest';
import { tokenize } from '../../src/core/query/sdblLexer';
import { buildYamlResolver } from '../../src/core/metadata/buildYamlResolver';
import { tryOpenDesignerBatch } from '../../src/webview/openDesignerBatch';
import { initialState, reducer } from '../../src/webview/state/queryStore';
import { computeBatchTextSafe } from '../../src/webview/computeBatchText';
import { decideApply, findStaticApplyBlocker } from '../../src/webview/applyGate';

const resolver = buildYamlResolver('test/fixtures/corpus/metadata/cf');
const comments = (text: string) => tokenize(text, { comments: true }).filter(t => t.type === 'comment').map(t => t.text).sort();
// ПЕРВЫЕ keeps ORDER valid inside nested queries as well.
const head = 'ВЫБРАТЬ ПЕРВЫЕ 5 Т.Код КАК А ИЗ Справочник.Валюты КАК Т';
const tails = [
  'УПОРЯДОЧИТЬ ПО // header\nА // key\n, Т.Наименование УБЫВ // direction',
  'УПОРЯДОЧИТЬ ПО Т.Код // expression\n+ 1 УБЫВ',
  'УПОРЯДОЧИТЬ ПО А // modifier\nУБЫВ',
  'УПОРЯДОЧИТЬ ПО ВЫБОР КОГДА Т.Код = "1" // case\nТОГДА 1 ИНАЧЕ 2 КОНЕЦ',
  'УПОРЯДОЧИТЬ ПО А // before auto\nАВТОУПОРЯДОЧИВАНИЕ',
  'АВТОУПОРЯДОЧИВАНИЕ // auto only',
  'УПОРЯДОЧИТЬ ПО А // same\nИТОГИ КОЛИЧЕСТВО(А) // same\nКАК Н ПО ОБЩИЕ',
];

for (const metadata of [false, true]) describe(`C17 ORDER metadata=${metadata}`, () => {
  for (const tail of tails) {
    const source = `${head} ${tail}`;
    // ИТОГИ is not nested (see C22); keep the nested wrappers to ORDER-only shapes.
    const nested = tail.includes('ИТОГИ') ? [] : [`ВЫБРАТЬ П.А ИЗ (${source}\n) КАК П`, `ВЫБРАТЬ 1 КАК А ГДЕ 1 В (${source}\n)`];
    for (const input of [source, `${head} ОБЪЕДИНИТЬ ВСЕ ${head} ${tail}`, ...nested]) it(input, () => {
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
        expect(comments(preview.text)).toEqual(comments(input));
        expect(decideApply(preview.text, preview.error, findStaticApplyBlocker(state), active)).toEqual({ ok: true });
        if (canonical !== undefined) expect(preview.text).toBe(canonical);
        canonical = preview.text;
        const stripped = computeBatchTextSafe(state, false).text;
        expect(comments(stripped)).toEqual([]);
        expect(tokenize(stripped).map(t => t.text)).toEqual(tokenize(canonical).map(t => t.text));
        expect(computeBatchTextSafe(state, true).text).toBe(canonical);
        text = canonical;
      }
    });
  }
});

it('places ORDER comments after the header and keeps TOTALS comments in TOTALS', () => {
  const opened = tryOpenDesignerBatch(`${head} УПОРЯДОЧИТЬ ПО // o1\nА // o2\nИТОГИ // t1\nКОЛИЧЕСТВО(А) КАК Н ПО ОБЩИЕ`);
  if (!opened.ok) throw new Error(opened.error);
  const text = computeBatchTextSafe(reducer(initialState(), { type: 'LOAD_BATCH', doc: opened.doc }), true).text;
  expect(text).toContain('УПОРЯДОЧИТЬ ПО\n\t// o1\n\t// o2\n\tА');
  expect(text).toContain('ИТОГИ\n\t// t1\n');
});
