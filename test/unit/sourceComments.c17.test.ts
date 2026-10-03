/**
 * C17 FROM region: a comment after ИЗ that no section owns — on a source name or
 * alias line, a JOIN/comma source, a subquery alias, ИНДЕКСИРОВАТЬ, ДЛЯ ИЗМЕНЕНИЯ
 * or a UNION separator — is kept once, relocated after the ИЗ header, with Apply
 * allowed, a stable three-pass reopen and a comment-free strip view with
 * identical code. Comments inside a {ХАРАКТЕРИСТИКИ} block stay in the block.
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
const V = 'Справочник.Валюты';
const shapes = [
  `ВЫБРАТЬ Т.Код КАК А ИЗ ${V} // name\nКАК Т`,
  `ВЫБРАТЬ Т.Код КАК А ИЗ ${V} КАК Т // alias\nГДЕ Т.Код = "1"`,
  `ВЫБРАТЬ Т.Код КАК А ИЗ ${V} КАК Т // last`,
  `ВЫБРАТЬ Т.Код КАК А ИЗ ${V} КАК Т ЛЕВОЕ СОЕДИНЕНИЕ ${V} // join source\nКАК Б ПО Т.Код = Б.Код`,
  `ВЫБРАТЬ Т.Код КАК А ИЗ ${V} КАК Т, // comma\n${V} КАК Б`,
  `ВЫБРАТЬ П.А КАК А ИЗ (ВЫБРАТЬ Т.Код КАК А ИЗ ${V} КАК Т // inner\n) КАК П // outer`,
  `ВЫБРАТЬ Т.Период КАК П ИЗ РегистрСведений.ЦеныНоменклатуры.СрезПоследних(&Д) КАК Т // vt`,
  `ВЫБРАТЬ Т.Код КАК А ПОМЕСТИТЬ ВТ ИЗ ${V} КАК Т ИНДЕКСИРОВАТЬ ПО А // index`,
  `ВЫБРАТЬ Т.Код КАК А ИЗ ${V} КАК Т ДЛЯ ИЗМЕНЕНИЯ // lock`,
  `ВЫБРАТЬ Т.Код КАК А ИЗ ${V} КАК Т // first\nОБЪЕДИНИТЬ ВСЕ // separator\nВЫБРАТЬ Т.Код ИЗ ${V} КАК Т`,
  `ВЫБРАТЬ Т.Код КАК А ИЗ ${V} КАК Т {ХАРАКТЕРИСТИКИ ТИП(${V}) // block\nВИДЫХАРАКТЕРИСТИК ПланВидовХарактеристик.Виды}`,
  `ВЫБРАТЬ Т.Код КАК А ИЗ ${V} // same\nКАК Т ГДЕ Т.Код = "1" // same`,
];

for (const metadata of [false, true]) describe(`C17 FROM-region comments metadata=${metadata}`, () => {
  for (const input of shapes) it(input, () => {
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
      // The raw characteristics block is verbatim in both modes.
      if (!input.includes('ХАРАКТЕРИСТИКИ')) expect(comments(stripped)).toEqual([]);
      text = canonical;
    }
  });
});

it('relocates a source-name comment after the ИЗ header', () => {
  const opened = tryOpenDesignerBatch(`ВЫБРАТЬ Т.Код КАК А ИЗ ${V} // name\nКАК Т`);
  if (!opened.ok) throw new Error(opened.error);
  const text = computeBatchTextSafe(reducer(initialState(), { type: 'LOAD_BATCH', doc: opened.doc }), true).text;
  expect(text).toBe(`ВЫБРАТЬ\n\tТ.Код КАК А\nИЗ\n// name\n\t${V} КАК Т`);
});
