/**
 * C31: a query parameter used by BSL code as a text placeholder (the code replaces
 * `&ПоляГруппировки`, `&ВыбираемыеКолонки`, `&Условие` with query text before running
 * the query) must survive Designer → Apply as written. The 1C query constructor
 * (СхемаЗапроса) treats every parameter as a value and rewrites three forms, and the
 * Designer copied it:
 *  - a bare parameter in the select list got `КАК <имя>` — a substituted column list
 *    then fails to parse (`… КАК Имя КАК ВыбираемыеКолонки`) or renames its last column;
 *  - `СГРУППИРОВАТЬ ПО &ПоляГруппировки` was removed — the grouping is lost (2 groups → 1);
 *  - `И (&Условие)` / `НЕ (&Условие)` lost the parentheses — a substituted `А ИЛИ Б`
 *    changes precedence (0 rows → 1, 9 → 10).
 * Platform evidence (СхемаЗапроса + execute_query, SL_kza 2026-10-12):
 * `test/fixtures/platform/c31-template-params.json`. Keeping the forms is neutral for
 * an ordinary parameter value (same rows there).
 *
 * The Designer (`preserve`) keeps all three; the constructor-parity mode (oracle/corpus)
 * still prints what СхемаЗапроса prints. Checks read the output with the shared lexer,
 * not with the parser.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { tryOpenDesignerBatch } from '../../src/webview/openDesignerBatch';
import { initialState, reducer } from '../../src/webview/state/queryStore';
import { computeBatchTextSafe } from '../../src/webview/computeBatchText';
import { decideApply, findStaticApplyBlocker } from '../../src/webview/applyGate';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { tokenize } from '../../src/core/query/sdblLexer';

function designer(text: string): { text: string; applyOk: boolean } {
  const open = tryOpenDesignerBatch(text);
  if (!open.ok) throw new Error(open.error);
  const state = reducer(initialState(), { type: 'LOAD_BATCH', doc: open.doc });
  const out = computeBatchTextSafe(state, true);
  return { text: out.text, applyOk: decideApply(out.text, out.error, findStaticApplyBlocker(state), undefined).ok };
}

/** Designer → Apply → reopen, three cycles: Apply allowed and the text stable. */
function stable(text: string): string {
  const first = designer(text);
  expect(first.applyOk).toBe(true);
  let cur = first.text;
  for (let i = 0; i < 3; i++) {
    const next = designer(cur);
    expect(next.applyOk).toBe(true);
    expect(next.text).toBe(cur);
    cur = next.text;
  }
  return first.text;
}

/** Code tokens joined by one space (comments and layout ignored; literals kept). */
const lexed = (text: string): string =>
  tokenize(text).filter(t => t.type !== 'eof').map(t => t.text).join(' ');
const has = (text: string, sequence: string): boolean => ` ${lexed(text)} `.includes(` ${sequence} `);

/** BSL-style text substitution of placeholders. */
const substitute = (text: string, values: Record<string, string>): string =>
  Object.entries(values).reduce((t, [k, v]) => t.split(k).join(v), text);

const F = 'ИЗ Справочник.Валюты КАК Т';

describe('C31: placeholder forms survive Designer → Apply → reopen', () => {
  it('a bare parameter in the select list gets no `КАК`', () => {
    const out = stable(`ВЫБРАТЬ Т.Код, &ВыбираемыеКолонки ${F}`);
    expect(has(out, '&ВыбираемыеКолонки ИЗ')).toBe(true);
    expect(lexed(out)).not.toContain('КАК ВыбираемыеКолонки');
    // After substitution the column list is the one the code wrote.
    const subst = substitute(out, { '&ВыбираемыеКолонки': 'Т.Код КАК Код2, Т.Наименование КАК Имя' });
    expect(has(subst, 'Т . Наименование КАК Имя ИЗ')).toBe(true);
  });

  it('a corpus shape: the placeholder before ПОМЕСТИТЬ, next to explicit columns', () => {
    const out = stable(`ВЫБРАТЬ Т.Код КАК Код, &ВыбираемыеКолонки ПОМЕСТИТЬ ВТПроверки ${F}`);
    expect(has(out, '&ВыбираемыеКолонки ПОМЕСТИТЬ')).toBe(true);
  });

  it.each([
    [`ВЫБРАТЬ КОЛИЧЕСТВО(*) КАК К ${F} СГРУППИРОВАТЬ ПО &ПоляГруппировки`, 'ПО &ПоляГруппировки'],
    [`ВЫБРАТЬ Т.Код, КОЛИЧЕСТВО(*) КАК К ${F} СГРУППИРОВАТЬ ПО Т.Код, &ПоляГруппировки`, ', &ПоляГруппировки'],
    [`ВЫБРАТЬ КОЛИЧЕСТВО(*) КАК К ${F} СГРУППИРОВАТЬ ПО &ПоляГруппировки ИМЕЮЩИЕ КОЛИЧЕСТВО(*) > 1`, 'ПО &ПоляГруппировки ИМЕЮЩИЕ'],
  ])('GROUP BY keeps the placeholder: %j', (input, sequence) => {
    expect(has(stable(input), sequence)).toBe(true);
  });

  it.each([
    [`ВЫБРАТЬ Т.Код ${F} ГДЕ Т.Код = "1" И (&Условие)`, 'И ( &Условие )'],
    [`ВЫБРАТЬ Т.Код ${F} ГДЕ НЕ (&Условие)`, 'НЕ ( &Условие )'],
    [`ВЫБРАТЬ Т.Код ${F} ГДЕ (&Условие)`, 'ГДЕ ( &Условие )'],
    [`ВЫБРАТЬ Т.Код, КОЛИЧЕСТВО(*) КАК К ${F} СГРУППИРОВАТЬ ПО Т.Код ИМЕЮЩИЕ КОЛИЧЕСТВО(*) > 1 И (&Условие)`, 'И ( &Условие )'],
    [`ВЫБРАТЬ Т.Код ${F} ГДЕ Т.Код = "1" И НЕ (&Условие) И Т.Наименование = "x"`, 'НЕ ( &Условие )'],
  ])('parentheses around a condition placeholder are kept: %j', (input, sequence) => {
    expect(has(stable(input), sequence)).toBe(true);
  });

  it('a substituted condition keeps the original precedence', () => {
    const input = `ВЫБРАТЬ Т.Код ${F} ГДЕ Т.Код = "999" И (&Условие)`;
    const value = { '&Условие': 'Т.Код = "980" ИЛИ Т.Код = "840"' };
    expect(has(substitute(stable(input), value), 'И ( Т . Код = "980" ИЛИ Т . Код = "840" )')).toBe(true);
  });
});

describe('C31: nested SELECT, UNION, temp tables', () => {
  it('nested SELECT: the placeholder stays bare inside', () => {
    const out = stable(`ВЫБРАТЬ П.Код ИЗ (ВЫБРАТЬ Т.Код КАК Код, &ВыбираемыеКолонки ${F} СГРУППИРОВАТЬ ПО Т.Код, &ПоляГруппировки) КАК П`);
    expect(has(out, '&ВыбираемыеКолонки ИЗ')).toBe(true);
    expect(has(out, ', &ПоляГруппировки )')).toBe(true);
  });

  it('UNION: member 0 keeps the placeholder bare', () => {
    const out = stable(`ВЫБРАТЬ &Поля ${F} ОБЪЕДИНИТЬ ВСЕ ВЫБРАТЬ &Поля ${F}`);
    expect(lexed(out)).not.toContain('КАК Поля');
  });

  it('a temp table filled by a placeholder is not a proven source for `*`', () => {
    const out = stable(`ВЫБРАТЬ &ВыбираемыеКолонки ПОМЕСТИТЬ ВТ ${F};\nВЫБРАТЬ * ИЗ ВТ`);
    expect(has(out, 'ВЫБРАТЬ * ИЗ ВТ КАК ВТ')).toBe(true);
    expect(has(out, '&ВыбираемыеКолонки ПОМЕСТИТЬ')).toBe(true);
  });

  it('a temp-table column read by name keeps its reference', () => {
    const out = stable(`ВЫБРАТЬ Т.Код КАК Код, &Дата ПОМЕСТИТЬ ВТ ${F};\nВЫБРАТЬ ВТ.Дата ИЗ ВТ`);
    expect(has(out, 'ВТ . Дата')).toBe(true);
  });
});

describe('C31: ordinary parameters and explicit names', () => {
  it.each([
    [`ВЫБРАТЬ &Дата КАК Дата ${F}`, '&Дата КАК Дата'],
    [`ВЫБРАТЬ &Дата КАК Д, Т.Код ${F}`, '&Дата КАК Д'],
    [`ВЫБРАТЬ Т.Код ${F} ГДЕ Т.Код = &Код`, 'Т . Код = &Код'],
    [`ВЫБРАТЬ Т.Код ${F} ГДЕ Т.Код В (&Коды)`, '( &Коды )'],
  ])('%j', (input, sequence) => {
    expect(has(stable(input), sequence)).toBe(true);
  });

  it('a bare parameter keeps the name the platform gives it (C30): `&Дата, &Дата`', () => {
    const out = stable(`ВЫБРАТЬ &Дата, &Дата ${F}`);
    expect(has(out, 'ВЫБРАТЬ &Дата , &Дата ИЗ')).toBe(true);
  });
});

describe('C31: the grouping tab keeps the placeholder after an edit', () => {
  it('adding a group field does not drop `&ПоляГруппировки`', () => {
    const open = tryOpenDesignerBatch(`ВЫБРАТЬ Т.Код, Т.Наименование, КОЛИЧЕСТВО(*) КАК К ${F} СГРУППИРОВАТЬ ПО Т.Код, &ПоляГруппировки`);
    if (!open.ok) throw new Error(open.error);
    let state = reducer(initialState(), { type: 'LOAD_BATCH', doc: open.doc });
    const tableId = state.selectedTables[0].id;
    state = reducer(state, { type: 'ADD_GROUP_FIELD', tableId, path: 'Наименование' });
    const text = computeBatchTextSafe(state, true).text;
    expect(has(text, '&ПоляГруппировки')).toBe(true);
    expect(has(text, 'Т . Наименование')).toBe(true);
  });
});

describe('C31: the constructor-parity mode keeps the platform text', () => {
  const constructor = (text: string): string =>
    generateBatch(parseBatch(text, undefined, { wildcardPolicy: 'constructor' }), { wildcardPolicy: 'constructor' });
  it.each([
    [`ВЫБРАТЬ Т.Код, &Поля ${F}`, '&Поля КАК Поля'],
    [`ВЫБРАТЬ КОЛИЧЕСТВО(*) КАК К ${F} СГРУППИРОВАТЬ ПО &ПоляГруппировки`, 'К ИЗ Справочник . Валюты КАК Т'],
    [`ВЫБРАТЬ Т.Код ${F} ГДЕ Т.Код = "1" И (&Условие)`, 'И &Условие'],
    [`ВЫБРАТЬ Т.Код ${F} ГДЕ НЕ (&Условие)`, 'НЕ &Условие'],
  ])('%j', (input, sequence) => {
    const out = constructor(input);
    expect(has(out, sequence)).toBe(true);
    expect(lexed(out)).not.toContain('СГРУППИРОВАТЬ ПО &');
  });
});

describe('C31: the Designer text is the one verified on the platform', () => {
  // `test/fixtures/platform/c31-template-params.json`: each template and its Designer →
  // Apply text, run on the platform after the same BSL substitution (or with the same
  // parameter values) — identical rows and columns for all cases.
  const evidence = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'platform', 'c31-template-params.json'), 'utf8'));
  it.each(evidence.cases.map((c: { name: string }) => [c.name, c]))('%s', (_name, c: any) => {
    expect(c.platform.sameData).toBe(true);
    expect(stable(c.template)).toBe(c.designerApplied);
  });
});
