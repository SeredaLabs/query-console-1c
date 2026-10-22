import { describe, expect, it } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';

// C50: bare-field qualification of a subquery kept in raw text (`qualifySubquerySpan`)
// parsed the subquery and then walked the same text again, so every nested raw
// subquery was parsed twice per level — 2^depth parses (depth 14 took ~3 s on main,
// depth 18 ~45 s). Such parses are now shared within one outer `parseDocument`.

const S = 'Справочник.Валюты';
const leaf = `ВЫБРАТЬ Х.Код ИЗ ${S} КАК Х ГДЕ Х.Код = 1`;

/** Forms whose IN-subquery stays inside raw condition / field text. */
const forms: [string, (inner: string, level: number) => string][] = [
  ['top-level ИЛИ', (s, k) => `ВЫБРАТЬ Х.Код ИЗ ${S} КАК Х ГДЕ Х.Код = ${k} ИЛИ Х.Код В (${s})`],
  ['outer alias В', s => `ВЫБРАТЬ В.Код ИЗ ${S} КАК В ГДЕ В.Код В (${s})`],
  ['ВЫБОР in a field', s => `ВЫБРАТЬ ВЫБОР КОГДА Х.Код В (${s}) ТОГДА 1 ИНАЧЕ 0 КОНЕЦ КАК Код ИЗ ${S} КАК Х`],
];

const nest = (wrap: (inner: string, level: number) => string, depth: number, inner = leaf): string => {
  let s = inner;
  for (let k = 0; k < depth; k++) s = wrap(s, k);
  return s;
};

const parse = (text: string) => parseBatch(text, undefined, { preserveComments: true });

describe('C50: deeply nested raw-text subqueries no longer parse in exponential time', () => {
  for (const [name, wrap] of forms) {
    // The bound is generous (main needs tens of seconds here); it guards the class
    // of growth, not a benchmark.
    it(`${name}: depth 18`, () => {
      const text = nest(wrap, 18);
      const started = performance.now();
      const output = generateBatch(parse(text));
      expect(performance.now() - started).toBeLessThan(5000);
      expect(generateBatch(parse(output))).toBe(output);
    }, 120_000);
  }
});

describe('C50: bare-field qualification inside nested raw subqueries is unchanged', () => {
  // A bare field at every level is qualified by that level's sole source, the
  // same at every depth (the shared parse must not leak a source between levels).
  const bare = (s: string, k: number) => `ВЫБРАТЬ Код ИЗ ${S} КАК Л${k} ГДЕ Код = ${k} ИЛИ Код В (${s})`;
  it('qualifies each level with its own source', () => {
    const output = generateBatch(parse(nest(bare, 4, `ВЫБРАТЬ Код ИЗ ${S} КАК Л ГДЕ Код = 9`)))
      .replace(/\s+/g, ' ');
    expect(output).toContain('Л.Код = 9');
    for (let k = 0; k < 3; k++) expect(output).toContain(`Л${k}.Код = ${k} ИЛИ Л${k}.Код В`);
  });

  // The subquery recursion limit (32) depends on how deep the modelled subqueries
  // around a parse are; a result shared across depths would rethrow a deep limit
  // error at a shallow level and leave its bare fields unqualified.
  it('does not share a parse result across subquery recursion depths', () => {
    const modelled = (s: string, k: number) => `ВЫБРАТЬ Код ИЗ ${S} КАК Х${k} ГДЕ Код В (${s})`;
    const inner = nest(modelled, 4, `ВЫБРАТЬ Код ИЗ ${S} КАК Л ГДЕ Код = 9`);
    const text = nest(modelled, 29, `ВЫБРАТЬ Код ИЗ ${S} КАК Т ГДЕ Код = 0 ИЛИ Код В (${inner})`);
    let model = parse(text).members[0].members[0].model;
    while (model.conditions[0]?.subquery) model = model.conditions[0].subquery.members[0].model;
    expect(model.conditions[0].expression).toMatch(/^Т\.Код = 0 ИЛИ Т\.Код В \(ВЫБРАТЬ Х3\.Код /);
  });

  // The same subquery text in two places of one query: both are qualified.
  it('qualifies a repeated subquery text in both places', () => {
    const sub = `ВЫБРАТЬ Код ИЗ ${S} КАК Р ГДЕ Код = 1`;
    const text = `ВЫБРАТЬ Т.Код ИЗ ${S} КАК Т ГДЕ Т.Код = 1 ИЛИ Т.Код В (${sub}) ИЛИ Т.Код В (${sub})`;
    const output = generateBatch(parse(text)).replace(/\s+/g, ' ');
    expect(output.split('Р.Код = 1')).toHaveLength(3);
  });
});
