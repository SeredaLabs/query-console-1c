/**
 * C17 TOTALS: section comments (outside ПЕРИОДАМИ arguments, which C16 keeps in
 * place) are kept once, after the ИТОГИ header, with Apply allowed, a stable
 * three-pass reopen and a comment-free strip view with identical code tokens.
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
const head = 'ВЫБРАТЬ Т.Код КАК А ИЗ Справочник.Валюты КАК Т';
const tails = [
 'ИТОГИ // header\nКОЛИЧЕСТВО(А) // aggregate\nКАК Н ПО // by\nОБЩИЕ // end',
 'ИТОГИ КОЛИЧЕСТВО( // same\nА) ПО А // same',
 'ИТОГИ ПО // head\nОБЩИЕ, // separator\nА // key',
 'ИТОГИ ПО А // modifier\nТОЛЬКО // hierarchy\nИЕРАРХИЯ',
 'ИТОГИ ПО А ПЕРИОДАМИ(Месяц, 1 // same\n, 2) // same',
 'ИТОГИ // same\nПО А ПЕРИОДАМИ(Месяц // same\n, 1, 2 // same\n)',
 'ИТОГИ СУММА(1 // expression\n+ 2) ПО ОБЩИЕ',
];
for (const metadata of [false, true]) describe(`C17 TOTALS metadata=${metadata}`, () => {
 for (const tail of tails) {
  const source = `${head} ${tail}`;
  const nested = [`ВЫБРАТЬ П.А ИЗ (${source}\n) КАК П`, `ВЫБРАТЬ 1 КАК А ГДЕ 1 В (${source}\n)`];
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
 }
});
