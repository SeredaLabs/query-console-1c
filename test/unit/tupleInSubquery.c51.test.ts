import { describe, expect, it } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { buildResolverFromTables } from '../../src/core/metadata/buildModelResolver';
import type { MetaTable } from '../../src/core/metadata/types';
import type { MetadataResolver } from '../../src/core/query/metadataResolver';

// C51: a non-reference left side of `В (ВЫБРАТЬ …)` (a tuple) whose subquery is
// written compactly is parsed as `leftExpr` + `subquery`. The generated text is
// multi-line, so the next parse keeps it as a raw leaf; the `leftExpr` path now
// prints what the raw leaf path prints (subquery base in ИМЕЮЩИЕ, `НЕ В` of a
// tuple, bare fields), so the second Save no longer changes the text.

const S = 'Справочник.Валюты';
const SUB = `(ВЫБРАТЬ Х.Код, Х.Наименование ИЗ ${S} КАК Х)`;
const H = `ВЫБРАТЬ Т.Код, Т.Наименование ИЗ ${S} КАК Т СГРУППИРОВАТЬ ПО Т.Код, Т.Наименование ИМЕЮЩИЕ `;
const W = `ВЫБРАТЬ Т.Код ИЗ ${S} КАК Т ГДЕ `;

const parse = (text: string, resolver?: MetadataResolver) =>
  parseBatch(text, resolver, { preserveComments: true });
const save = (text: string, resolver?: MetadataResolver) => generateBatch(parse(text, resolver));
const firstModel = (text: string, resolver?: MetadataResolver) => parse(text, resolver).members[0].members[0].model;

/** The subquery block as printed after `… В` (`(ВЫБРАТЬ` on `tabs` tabs). */
const block = (tabs: number, x = 'Х') => {
  const t = '\t'.repeat(tabs);
  return `${t}(ВЫБРАТЬ\n${t}\t${x}.Код,\n${t}\t${x}.Наименование\n${t}ИЗ\n${t}\t${S} КАК ${x})`;
};
const HAVING_HEAD = 'ВЫБРАТЬ\n\tТ.Код КАК Код,\n\tТ.Наименование КАК Наименование\nИЗ\n\t' +
  `${S} КАК Т\n\nСГРУППИРОВАТЬ ПО\n\tТ.Код,\n\tТ.Наименование\n\nИМЕЮЩИЕ\n\t`;
const WHERE_HEAD = `ВЫБРАТЬ\n\tТ.Код КАК Код\nИЗ\n\t${S} КАК Т\nГДЕ\n\t`;

describe('C51: the first Save prints the fixed point (was unstable on main)', () => {
  const cases: [string, string, string][] = [
    ['ИМЕЮЩИЕ tuple', H + `(Т.Код, Т.Наименование) В ${SUB}`,
      `${HAVING_HEAD}(Т.Код, Т.Наименование) В\n${block(2)}`],
    ['ИМЕЮЩИЕ НЕ tuple', H + `НЕ (Т.Код, Т.Наименование) В ${SUB}`,
      `${HAVING_HEAD}НЕ (Т.Код, Т.Наименование) В\n${block(3)}`],
    ['ИМЕЮЩИЕ tuple НЕ В', H + `(Т.Код, Т.Наименование) НЕ В ${SUB}`,
      `${HAVING_HEAD}НЕ (Т.Код, Т.Наименование) В\n${block(3)}`],
    ['ИМЕЮЩИЕ conjunct', H + `КОЛИЧЕСТВО(Т.Код) > 1 И (Т.Код, Т.Наименование) В ${SUB}`,
      `${HAVING_HEAD}КОЛИЧЕСТВО(Т.Код) > 1 И\n\t(Т.Код, Т.Наименование) В\n${block(2)}`],
    ['ИМЕЮЩИЕ literal tuple', H + `(1, 2) В ${SUB}`,
      `${HAVING_HEAD}(1, 2) В\n${block(2)}`],
    ['ИМЕЮЩИЕ bare tuple',
      `ВЫБРАТЬ Код ИЗ ${S} СГРУППИРОВАТЬ ПО Код, Наименование ИМЕЮЩИЕ (Код, Наименование) В ${SUB}`,
      `ВЫБРАТЬ\n\tВалюты.Код КАК Код\nИЗ\n\t${S} КАК Валюты\n\nСГРУППИРОВАТЬ ПО\n\tВалюты.Код,\n\tВалюты.Наименование\n\n` +
      `ИМЕЮЩИЕ\n\t(Валюты.Код, Валюты.Наименование) В\n${block(2)}`],
    ['ГДЕ tuple НЕ В', W + `(Т.Код, Т.Наименование) НЕ В ${SUB}`,
      `${WHERE_HEAD}НЕ (Т.Код, Т.Наименование) В\n${block(4)}`],
    ['ГДЕ bare tuple', `ВЫБРАТЬ Код ИЗ ${S} ГДЕ (Код, Наименование) В ${SUB}`,
      `ВЫБРАТЬ\n\tВалюты.Код КАК Код\nИЗ\n\t${S} КАК Валюты\nГДЕ\n\t(Валюты.Код, Валюты.Наименование) В\n${block(3)}`],
    ['ГДЕ НЕ bare tuple', `ВЫБРАТЬ Код ИЗ ${S} ГДЕ НЕ (Код, Наименование) В ${SUB}`,
      `ВЫБРАТЬ\n\tВалюты.Код КАК Код\nИЗ\n\t${S} КАК Валюты\nГДЕ\n\tНЕ (Валюты.Код, Валюты.Наименование) В\n${block(4)}`],
  ];
  it.each(cases)('%s', (_name, input, expected) => {
    const once = save(input);
    expect(once).toBe(expected);
    expect(save(once)).toBe(once);
  });

  it('ИМЕЮЩИЕ tuple nested in an ИМЕЮЩИЕ subquery (depth 2)', () => {
    const inner = `ВЫБРАТЬ Т.Код, Т.Наименование ИЗ ${S} КАК Т СГРУППИРОВАТЬ ПО Т.Код, Т.Наименование ` +
      `ИМЕЮЩИЕ (Т.Код, Т.Наименование) В ${SUB}`;
    const once = save(H + `(Т.Код, Т.Наименование) В (${inner})`);
    expect(once).toContain(`ИМЕЮЩИЕ\n\t(Т.Код, Т.Наименование) В\n\t\t(ВЫБРАТЬ`);
    expect(save(once)).toBe(once);
  });
});

describe('C51: other forms on the `leftExpr` path print the same fixed point', () => {
  // A non-tuple left side in ИМЕЮЩИЕ took the same base 3 → 2 drift on main.
  it.each([
    ['aggregate', 'КОЛИЧЕСТВО(Т.Код)'],
    ['literal', '1'],
  ])('ИМЕЮЩИЕ %s left side', (_name, lhs) => {
    const once = save(`ВЫБРАТЬ Т.Код ИЗ ${S} КАК Т СГРУППИРОВАТЬ ПО Т.Код ИМЕЮЩИЕ ${lhs} В (ВЫБРАТЬ Х.Код ИЗ ${S} КАК Х)`);
    expect(once).toContain(`ИМЕЮЩИЕ\n\t${lhs} В\n\t\t(ВЫБРАТЬ\n\t\t\tХ.Код\n\t\tИЗ\n`);
    expect(save(once)).toBe(once);
  });

  // A subquery with a line comment stays on the `leftExpr` path on every Save, so
  // main was stable here, but in a layout that differs from the uncommented form.
  // It now prints the uncommented form's layout (behaviour change, same meaning).
  const commented = `(ВЫБРАТЬ Х.Код, Х.Наименование // c5\n ИЗ ${S} КАК Х)`;
  const withoutComment = (text: string) => text.replace(' // c5', '');
  const oneLine = (text: string) => text.replace(' // c5\n', '');
  it.each([
    ['ГДЕ tuple НЕ В', W + `(Т.Код, Т.Наименование) НЕ В ${commented}`, `\tНЕ (Т.Код, Т.Наименование) В\n\t\t\t\t(ВЫБРАТЬ`],
    ['ИМЕЮЩИЕ tuple', H + `(Т.Код, Т.Наименование) В ${commented}`, `\t(Т.Код, Т.Наименование) В\n\t\t(ВЫБРАТЬ`],
    ['ГДЕ bare tuple', `ВЫБРАТЬ Код ИЗ ${S} ГДЕ (Код, Наименование) В ${commented}`, `\t(Валюты.Код, Валюты.Наименование) В\n\t\t\t(ВЫБРАТЬ`],
  ])('commented subquery: %s', (_name, input, head) => {
    const once = save(input);
    expect(once).toContain(head);
    expect(once).toContain('Х.Наименование // c5\n');
    expect(withoutComment(once)).toBe(save(oneLine(input)));
    expect(save(once)).toBe(once);
  });
});

describe('C51: `(a, b) НЕ В` keeps its meaning', () => {
  it('is modelled as the negation of the tuple membership, like `НЕ (a, b) В`', () => {
    const suffix = firstModel(W + `(Т.Код, Т.Наименование) НЕ В ${SUB}`).conditions![0];
    const prefix = firstModel(W + `НЕ (Т.Код, Т.Наименование) В ${SUB}`).conditions![0];
    expect(suffix).toMatchObject({ custom: true, leftExpr: '(Т.Код, Т.Наименование)', negated: true });
    expect(suffix).toEqual(prefix);
  });

  it.each([
    ['ГДЕ', W, 4],
    ['ИМЕЮЩИЕ', `ВЫБРАТЬ Т.Код ИЗ ${S} КАК Т СГРУППИРОВАТЬ ПО Т.Код ИМЕЮЩИЕ `, 3],
  ])('a double negation in %s keeps both НЕ', (_slot, head, tabs) => {
    const once = save(head + `НЕ (Т.Код, Т.Наименование) НЕ В ${SUB}`);
    expect(once).toContain(`\tНЕ (Т.Код, Т.Наименование) НЕ В\n${block(tabs)}`);
    expect(save(once)).toBe(once);
  });

  it.each([
    ['grouped expression', '(Т.Код + 1)'],
    ['literal', '1'],
    ['one-element parentheses', '(Т.Код)'],
  ])('a non-tuple left side (%s) keeps `НЕ В` as written', (_name, lhs) => {
    const text = `${W}${lhs} НЕ В (ВЫБРАТЬ Х.Код ИЗ ${S} КАК Х)`;
    const cond = firstModel(text).conditions![0];
    expect(cond.negated).toBeUndefined();
    const once = save(text);
    expect(once).toContain(`\t${lhs} НЕ В\n`);
    expect(save(once)).toBe(once);
  });
});

describe('C51: bare tuple fields are qualified only by an unambiguous owner', () => {
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
  const sub = '(ВЫБРАТЬ Х.ТолькоА, Х.Общее ИЗ Справочник.А КАК Х)';

  it('two sources without metadata: stays bare', () => {
    const once = save(`${TWO}(ТолькоА, Общее) В ${sub}`);
    expect(once).toContain('\t(ТолькоА, Общее) В\n');
    expect(save(once)).toBe(once);
  });

  it('two sources with metadata: only the field with one owner is qualified', () => {
    const once = save(`${TWO}(ТолькоА, Общее) В ${sub}`, resolver);
    expect(once).toContain('\t(Т.ТолькоА, Общее) В\n');
    expect(save(once, resolver)).toBe(once);
  });

  it('an outer alias in a condition subquery is left as written', () => {
    const text = `ВЫБРАТЬ Т.Код ИЗ ${S} КАК Т ГДЕ Т.Код В (ВЫБРАТЬ Р.Код ИЗ ${S} КАК Р ` +
      `ГДЕ (Т.Код, Наименование) В ${SUB})`;
    const once = save(text);
    expect(once).toContain('(Т.Код, Р.Наименование) В\n');
    expect(save(once)).toBe(once);
  });
});

describe('C51: unchanged controls', () => {
  it('a qualified ГДЕ tuple (the form in the review) prints as before', () => {
    const once = save(W + `(Т.Код, Т.Наименование) В ${SUB}`);
    expect(once).toBe(`${WHERE_HEAD}(Т.Код, Т.Наименование) В\n${block(3)}`);
  });

  it('a single-field ИМЕЮЩИЕ IN-subquery keeps base 3 (no platform evidence to change it)', () => {
    const once = save(`ВЫБРАТЬ Т.Код ИЗ ${S} КАК Т СГРУППИРОВАТЬ ПО Т.Код ИМЕЮЩИЕ Т.Код В (ВЫБРАТЬ Х.Код ИЗ ${S} КАК Х)`);
    expect(once).toContain('ИМЕЮЩИЕ\n\tТ.Код В\n\t\t\t(ВЫБРАТЬ\n');
    expect(save(once)).toBe(once);
  });
});
