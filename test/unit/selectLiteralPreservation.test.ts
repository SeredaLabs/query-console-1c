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
const literals = (text: string) => tokenize(text).filter(t => t.type === 'string').map(t => t.text);
const values = ['"a\nb"', '"a\n\t\tb"', '"a\n \t\n// literal\n;\nb"', '"a""quoted\nb"'];
const shapes: Array<[string, (s: string) => string]> = [
  ['SELECT', s => `ВЫБРАТЬ ${s} КАК А`],
  ['source', s => `ВЫБРАТЬ П.А ИЗ (ВЫБРАТЬ ${s} КАК А) КАК П`],
  ['nested source', s => `ВЫБРАТЬ П.А ИЗ (ВЫБРАТЬ Р.А ИЗ (ВЫБРАТЬ ${s} КАК А) КАК Р) КАК П`],
  ['UNION', s => `ВЫБРАТЬ ${s} КАК А ОБЪЕДИНИТЬ ВСЕ ВЫБРАТЬ ${s} КАК А`],
  ['function', s => `ВЫБРАТЬ ЕСТЬNULL(NULL, ${s}) КАК А`],
  ['CASE', s => `ВЫБРАТЬ ВЫБОР КОГДА ИСТИНА ТОГДА ${s} ИНАЧЕ ${s} КОНЕЦ КАК А`],
  ['condition subquery', s => `ВЫБРАТЬ Т.Код ИЗ Справочник.Валюты КАК Т ГДЕ Т.Код В (ВЫБРАТЬ ${s} КАК А)`],
];

// Runtime equality evidence: docs/development/audits/c17-literal-runtime-2026-10-02.json.
// Constructor canonical padding changes values, so literal bytes take precedence.
for (const metadata of [false, true]) for (const preserveComments of [false, true]) {
  describe(`SELECT literal values metadata=${metadata} comments=${preserveComments}`, () => {
    for (const [name, wrap] of shapes) it.each(values)(`${name}: %s`, literal => {
      const input = `// retained header\n${wrap(literal)}`;
      const active = metadata ? resolver : undefined;
      const output = generateBatch(parseBatch(input, active, { preserveComments }));
      expect(literals(output)).toEqual(literals(input));
      expect(output.includes('// retained header')).toBe(preserveComments);
      expect(generateBatch(parseBatch(output, active, { preserveComments }))).toBe(output);
    });
  });
}

it('designer load, preview, Apply and reopen preserve the executed source-SELECT value', () => {
  const input = 'ВЫБРАТЬ П.А ИЗ (ВЫБРАТЬ "a\nb" КАК А) КАК П';
  const opened = tryOpenDesignerBatch(input);
  expect(opened.ok).toBe(true);
  if (!opened.ok) throw new Error(opened.error);
  const state = reducer(initialState(), { type: 'LOAD_BATCH', doc: opened.doc });
  for (const preserveComments of [false, true]) {
    const preview = computeBatchTextSafe(state, preserveComments);
    expect(preview.error).toBeNull();
    expect(literals(preview.text!)).toEqual(literals(input));
    expect(decideApply(preview.text, preview.error, findStaticApplyBlocker(state))).toEqual({ ok: true });
    expect(generateBatch(parseBatch(preview.text!))).toBe(preview.text);
  }
});

// Review regressions: CASE inside calls and tabular projections have their own layout paths.
for (const preserveComments of [false, true]) describe(`review literal paths comments=${preserveComments}`, () => {
  const reviewValues = [...values, '"a\r\nb"', '"\na\n"', '"a\nКОГДА\nКОНЕЦ\n"'];
  for (const literal of reviewValues) for (const expression of [literal, `ЕСТЬNULL(ВЫБОР КОГДА ИСТИНА ТОГДА ${literal} КОНЕЦ, "x")`]) {
    for (const input of [
      `ВЫБРАТЬ ${expression} КАК А`,
      `ВЫБРАТЬ Т.Товары.(${expression} КАК А) ИЗ Документ.ЗаказКлиента КАК Т`,
      `ВЫБРАТЬ П.Товары ИЗ (ВЫБРАТЬ Т.Товары.(${expression} КАК А) ИЗ Документ.ЗаказКлиента КАК Т) КАК П`,
    ]) it(input, () => {
      let output = generateBatch(parseBatch(input, undefined, { preserveComments }));
      expect(literals(output)).toEqual(literals(input));
      for (let pass = 0; pass < 3; pass++) {
        const next = generateBatch(parseBatch(output, undefined, { preserveComments }));
        expect(literals(next)).toEqual(literals(input));
        expect(next).toBe(output);
        output = next;
      }
    });
  }
});

it('CASE literal protection cannot collide with authored marker-looking strings', () => {
  const input = 'ВЫБРАТЬ ЕСТЬNULL(ВЫБОР КОГДА ИСТИНА ТОГДА "a\nb" ИНАЧЕ "__case_literal_0" КОНЕЦ, "__case_literal__0") КАК А';
  const output = generateBatch(parseBatch(input));
  expect(literals(output)).toEqual(literals(input));
  expect(generateBatch(parseBatch(output))).toBe(output);
});
