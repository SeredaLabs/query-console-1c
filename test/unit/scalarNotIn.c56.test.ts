import { describe, expect, it } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { tryOpenBatch } from '../../src/core/query/validateBatch';
import { findMalformedCustomExpressions } from '../../src/core/query/semanticValidator';
import { tryOpenDesignerBatch } from '../../src/webview/openDesignerBatch';
import { initialState, reducer, type QueryState } from '../../src/webview/state/queryStore';
import { findStaticApplyBlocker } from '../../src/webview/applyGate';
import { computeBatchTextSafe } from '../../src/webview/computeBatchText';
import { buildResolverFromTables } from '../../src/core/metadata/buildModelResolver';
import type { MetaTable } from '../../src/core/metadata/types';
import type { MetadataResolver } from '../../src/core/query/metadataResolver';

// C56: a compact `X НЕ В (ВЫБРАТЬ …)` with a non-tuple left side kept `НЕ` in
// `leftExpr` (`Т.Ссылка НЕ`), which the acceptor refuses, so OK / Save refused a
// platform-valid query; the multi-line form passed. C51 moved that `НЕ` into
// `negated` for a tuple only. The platform reads `X НЕ В (…)` as `НЕ X В (…)` and
// prints it so (`НЕ Т.Ссылка В`, `НЕ НЕ Т.Ссылка В` for a double negation), so the
// infix form must give the same text and model as the prefix one.

const S = 'Справочник.Валюты';
const SUB = `(ВЫБРАТЬ Ш.Ссылка ИЗ ${S} КАК Ш)`;
const SUB1 = `(ВЫБРАТЬ 1 ИЗ ${S} КАК Ш)`;
const SUB2 = `(ВЫБРАТЬ Ш.Код, Ш.Наименование ИЗ ${S} КАК Ш)`;
const W = `ВЫБРАТЬ Т.Код ИЗ ${S} КАК Т ГДЕ `;
const H = `ВЫБРАТЬ Т.Код ИЗ ${S} КАК Т СГРУППИРОВАТЬ ПО Т.Код, Т.Ссылка ИМЕЮЩИЕ `;
const BARE = `ВЫБРАТЬ Код ИЗ ${S} ГДЕ `;

const parse = (text: string, resolver?: MetadataResolver) => parseBatch(text, resolver, { preserveComments: true });
const save = (text: string, resolver?: MetadataResolver) => generateBatch(parse(text, resolver));
const conditionOf = (text: string) => {
  const m = parse(text).members[0].members[0].model;
  return (m.conditions ?? m.having ?? [])[0];
};
const block = (tabs: number) => {
  const t = '\t'.repeat(tabs);
  return `${t}(ВЫБРАТЬ\n${t}\tШ.Ссылка\n${t}ИЗ\n${t}\t${S} КАК Ш)`;
};
const WHERE_HEAD = `ВЫБРАТЬ\n\tТ.Код КАК Код\nИЗ\n\t${S} КАК Т\nГДЕ\n\t`;

function load(text: string): QueryState {
  const r = tryOpenDesignerBatch(text);
  if (!r.ok) throw new Error(`does not open: ${r.error}`);
  return reducer(initialState(), { type: 'LOAD_BATCH', doc: r.doc });
}

/** OK / Save is allowed on the opened text and on two reopens of the shown text. */
function expectAppliedThreeTimes(input: string): string[] {
  const texts: string[] = [];
  let text = input;
  for (let pass = 0; pass < 3; pass++) {
    const state = load(text);
    expect(findStaticApplyBlocker(state), `pass ${pass + 1}`).toBeNull();
    const { text: shown, error } = computeBatchTextSafe(state, true);
    expect(error).toBeNull();
    const reopened = tryOpenDesignerBatch(shown);
    expect(reopened.ok).toBe(true);
    if (reopened.ok) expect(findMalformedCustomExpressions(reopened.doc)).toEqual([]);
    texts.push(shown);
    text = shown;
  }
  return texts;
}

describe('C56: a compact `X НЕ В (ВЫБРАТЬ …)` is the prefix form', () => {
  const cases: [string, string, string][] = [
    ['field', `${W}Т.Ссылка НЕ В ${SUB}`, `${W}НЕ Т.Ссылка В ${SUB}`],
    ['field, alias in another case', `${W}т.Ссылка НЕ В ${SUB}`, `${W}НЕ Т.Ссылка В ${SUB}`],
    ['bare field of the sole source', `${BARE}Ссылка НЕ В ${SUB}`, `${BARE}НЕ Ссылка В ${SUB}`],
    ['literal', `${W}1 НЕ В ${SUB1}`, `${W}НЕ 1 В ${SUB1}`],
    ['after a conjunct', `${W}Т.Код = 1 И Т.Ссылка НЕ В ${SUB}`, `${W}Т.Код = 1 И НЕ Т.Ссылка В ${SUB}`],
    ['ИМЕЮЩИЕ field', `${H}Т.Ссылка НЕ В ${SUB}`, `${H}НЕ Т.Ссылка В ${SUB}`],
    ['double negation, field', `${W}НЕ Т.Ссылка НЕ В ${SUB}`, `${W}НЕ НЕ Т.Ссылка В ${SUB}`],
    ['double negation, literal', `${W}НЕ 1 НЕ В ${SUB1}`, `${W}НЕ НЕ 1 В ${SUB1}`],
    ['double negation, tuple', `${W}НЕ (Т.Код, Т.Наименование) НЕ В ${SUB2}`, `${W}НЕ НЕ (Т.Код, Т.Наименование) В ${SUB2}`],
    ['ИМЕЮЩИЕ double negation', `${H}НЕ Т.Ссылка НЕ В ${SUB}`, `${H}НЕ НЕ Т.Ссылка В ${SUB}`],
  ];
  it.each(cases)('%s', (_name, infix, prefix) => {
    expect(save(infix)).toBe(save(prefix));
    const texts = expectAppliedThreeTimes(infix);
    expect(texts[1]).toBe(texts[0]);
    expect(texts[2]).toBe(texts[0]);
  });

  it('a field gets the model of `НЕ <поле> В`, not a `leftExpr`', () => {
    const infix = conditionOf(`${W}Т.Ссылка НЕ В ${SUB}`);
    const prefix = conditionOf(`${W}НЕ Т.Ссылка В ${SUB}`);
    expect(infix).toMatchObject({ tableId: prefix.tableId, path: 'Ссылка', operator: 'В', negated: true });
    expect(infix.leftExpr).toBeUndefined();
    expect(generateBatch(parse(`${W}Т.Ссылка НЕ В ${SUB}`))).toBe(`${WHERE_HEAD}НЕ Т.Ссылка В\n${block(4)}`);
  });

  it('a double negation keeps both НЕ (platform text `НЕ НЕ Т.Ссылка В`)', () => {
    expect(save(`${W}НЕ Т.Ссылка НЕ В ${SUB}`)).toBe(`${WHERE_HEAD}НЕ НЕ Т.Ссылка В\n${block(5)}`);
  });

  it('a subquery nested in a modelled and in a raw-text condition', () => {
    for (const text of [
      `${W}Т.Ссылка В (ВЫБРАТЬ Х.Ссылка ИЗ ${S} КАК Х ГДЕ Х.Ссылка НЕ В ${SUB})`,
      `${W}Т.Код = &К ИЛИ Т.Ссылка В (ВЫБРАТЬ Х.Ссылка ИЗ ${S} КАК Х ГДЕ Х.Ссылка НЕ В ${SUB})`,
    ]) {
      const texts = expectAppliedThreeTimes(text);
      expect(texts[0]).toContain('НЕ Х.Ссылка В');
      expect(texts[1]).toBe(texts[0]);
    }
  });

  // Known R2 instability, not changed here: `НЕ (выражение) В (…)` typed in the prefix
  // form drifts on the second Save too; the infix form now takes the same path.
  it.each([['(Т.Код + 1)'], ['(Т.Код)']])('expression %s: allowed, the first Save equals the prefix form', lhs => {
    expect(save(`${W}${lhs} НЕ В ${SUB1}`)).toBe(save(`${W}НЕ ${lhs} В ${SUB1}`));
    const texts = expectAppliedThreeTimes(`${W}${lhs} НЕ В ${SUB1}`);
    for (const t of texts) expect(t).toMatch(/\tНЕ ?\(?Т\.Код/);
  });
});

describe('C56: unchanged forms', () => {
  it.each([
    ['IN-subquery', `${W}Т.Ссылка В ${SUB}`],
    ['prefix NOT IN', `${W}НЕ Т.Ссылка В ${SUB}`],
    ['tuple NOT IN (C51)', `${W}(Т.Код, Т.Наименование) НЕ В ${SUB2}`],
    ['NOT IN a parameter list', `${W}Т.Код НЕ В (&С)`],
    ['IN ИЕРАРХИИ', `${W}Т.Ссылка В ИЕРАРХИИ ${SUB}`],
    // R2, not changed here: a compact `НЕ В ИЕРАРХИИ` stays raw text until the second Save.
    ['NOT IN ИЕРАРХИИ', `${W}Т.Ссылка НЕ В ИЕРАРХИИ ${SUB}`],
    ['multi-line NOT IN (raw text, as before)',
      `${W}Т.Ссылка НЕ В\n\t\t\t(ВЫБРАТЬ\n\t\t\t\tШ.Ссылка\n\t\t\tИЗ\n\t\t\t\t${S} КАК Ш)`],
  ])('%s is still applied', (_name, text) => {
    const state = load(text);
    expect(findStaticApplyBlocker(state)).toBeNull();
  });

  it('a multi-line NOT IN keeps its raw text (the compact gate is unchanged)', () => {
    const text = `${W}Т.Ссылка НЕ В\n\t\t\t(ВЫБРАТЬ\n\t\t\t\tШ.Ссылка\n\t\t\tИЗ\n\t\t\t\t${S} КАК Ш)`;
    expect(conditionOf(text)).toMatchObject({ custom: true });
    expect(conditionOf(text).subquery).toBeUndefined();
    expect(save(text)).toContain('\tТ.Ссылка НЕ В\n');
  });

  it('source alias `В` (platform-invalid, RP11) behaves as before', () => {
    const text = `ВЫБРАТЬ В.Код КАК Код ИЗ ${S} КАК В ГДЕ В.Ссылка НЕ В ${SUB}`;
    expect(conditionOf(text).subquery).toBeUndefined();
  });
});

describe('C56: owners and metadata', () => {
  const A: MetaTable = {
    kind: 'Справочник', name: 'А', fullName: 'Справочник.А',
    fields: [{ name: 'ТолькоА', kind: 'standard', types: [] }, { name: 'Общее', kind: 'standard', types: [] }],
  };
  const B: MetaTable = {
    kind: 'Справочник', name: 'Б', fullName: 'Справочник.Б',
    fields: [{ name: 'Общее', kind: 'standard', types: [] }],
  };
  const resolver = buildResolverFromTables([A, B]);
  const TWO = 'ВЫБРАТЬ Т.Ссылка ИЗ Справочник.А КАК Т ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Б КАК Р ПО ИСТИНА ГДЕ ';
  const sub = '(ВЫБРАТЬ Х.ТолькоА ИЗ Справочник.А КАК Х)';

  it('an ambiguous bare field stays bare; one owner is qualified with metadata', () => {
    expect(save(`${TWO}Общее НЕ В ${sub}`, resolver)).toContain('\tНЕ Общее В\n');
    expect(save(`${TWO}ТолькоА НЕ В ${sub}`, resolver)).toContain('\tНЕ Т.ТолькоА В\n');
    expect(save(`${TWO}ТолькоА НЕ В ${sub}`)).toContain('\tНЕ ТолькоА В\n');
  });

  it('a missing field is refused on open like in the prefix form', () => {
    const infix = tryOpenBatch(`ВЫБРАТЬ Т.Ссылка ИЗ Справочник.А КАК Т ГДЕ Т.Нет НЕ В ${sub}`, resolver);
    const prefix = tryOpenBatch(`ВЫБРАТЬ Т.Ссылка ИЗ Справочник.А КАК Т ГДЕ НЕ Т.Нет В ${sub}`, resolver);
    expect(prefix.ok).toBe(false);
    expect(infix.ok).toBe(false);
    if (!infix.ok && !prefix.ok) expect(infix.error).toBe(prefix.error);
  });
});
