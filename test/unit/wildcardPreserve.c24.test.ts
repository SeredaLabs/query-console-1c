/**
 * C24 step 1a: Designer → Apply must not silently change what a wildcard selects.
 *
 * Platform evidence (СхемаЗапроса / `validate_query`, SL_kza 2026-10-12):
 *  - a wildcard over a batch temp table or a nested SELECT expands to that source's
 *    column names, in order; implicit names are deduplicated with a suffix (`Код`,
 *    `Код1`), a UNION takes the names of its first member;
 *  - column names: an explicit `КАК` is reserved up front, every other column is
 *    named left to right and takes the smallest free suffix — so in `*, ВТ.Б` the
 *    expanded `Б` keeps `Б` and the explicit field becomes `Б1`;
 *  - for a parameter source, an undefined temp table (it may come from a temp-table
 *    manager) or a mixed JOIN with one, the constructor drops columns or the whole
 *    statement; `Т.Реквизит.*` and `Т.*` over a parameter are platform errors.
 *
 * Defects on main before this change (all with Apply allowed):
 *  D1 `* ИЗ <undefined temp table>` deleted the statement;
 *  D2 `Т.*` over an inferred temp table became an incomplete column list;
 *  D3 parameter columns dropped, `П.*` / `ВТ.А.*` deleted;
 *  D4 the suffix landed on the wrong column (`*, ВТ.А` → `А1, А`);
 *  D5 an implicit neighbour of a kept wildcard got `КАК <name>`, which moves that
 *     name from a wildcard column to the neighbour.
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
import { buildYamlResolver } from '../../src/core/metadata/buildYamlResolver';
import { buildSemanticSnapshotFromText } from '../../src/core/semantic/buildSemanticSnapshot';
import { deriveTempTableLifetimes, visibleTempTableAt } from '../../src/core/query/tempTableSemantics';

function designer(text: string): { text: string; applyOk: boolean } {
  const open = tryOpenDesignerBatch(text);
  if (!open.ok) throw new Error(open.error);
  const state = reducer(initialState(), { type: 'LOAD_BATCH', doc: open.doc });
  const out = computeBatchTextSafe(state, true);
  return { text: out.text, applyOk: decideApply(out.text, out.error, findStaticApplyBlocker(state), undefined).ok };
}

/** The statements of a batch (generated text, or a test input split by `;`). */
const statements = (text: string): string[] => text.split(/\n;\n\n\/{10,}\n|;\n/u).map(s => s.trim());
const last = (text: string): string => statements(text).at(-1)!;

// ---------------------------------------------------------------------------
// Column naming by the platform rule (see the header). Only the select-list
// shapes used below: `*`, `Т.*`, `<expr> КАК <name>`, `<Т>.<Поле>` and other
// expressions. `sources` gives each source alias with its columns, in FROM order;
// for a source whose columns are not known, tests pass several hypothetical sets.

type Columns = Array<[name: string, expr: string]>;

function selectItems(statement: string): string[] {
  const body = statement.replace(/^ВЫБРАТЬ(?:\s+РАЗЛИЧНЫЕ)?/u, '').split(/\s(?:ИЗ|ПОМЕСТИТЬ)\s/u)[0];
  const items: string[] = [];
  let depth = 0, cur = '';
  for (const ch of body) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { items.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) items.push(cur.trim());
  return items.map(i => i.replace(/\s+/gu, ' '));
}

function platformColumns(statement: string, sources: Array<[alias: string, columns: string[]]>): Columns {
  const items = selectItems(statement);
  const explicit = (i: string) => / КАК ([^ ]+)$/u.exec(i)?.[1];
  const reserved = new Set(items.map(explicit).filter((a): a is string => a !== undefined).map(a => a.toUpperCase()));
  const used = new Set<string>();
  const name = (base: string): string => {
    let n = base, k = 0;
    while (used.has(n.toUpperCase()) || reserved.has(n.toUpperCase())) n = `${base}${++k}`;
    used.add(n.toUpperCase());
    return n;
  };
  const out: Columns = [];
  for (const item of items) {
    const star = /^(?:([^ .]+)\.)?\*$/u.exec(item);
    if (star) {
      for (const [alias, cols] of sources) {
        if (star[1] !== undefined && star[1].toUpperCase() !== alias.toUpperCase()) continue;
        for (const c of cols) out.push([name(c), `${alias}.${c}`]);
      }
      continue;
    }
    const a = explicit(item);
    if (a !== undefined) { used.add(a.toUpperCase()); out.push([a, item.slice(0, -(' КАК '.length + a.length))]); continue; }
    const pathField = /^[^ .()]+\.([^ .()]+)$/u.exec(item);
    out.push([pathField ? name(pathField[1]) : `?${item}`, item]);
  }
  return out;
}

/**
 * Designer → Apply keeps every column name bound to the same expression, for each
 * hypothetical content of the wildcard sources.
 */
function expectSameColumns(input: string, output: string, hypotheses: Array<Array<[string, string[]]>>): void {
  for (const sources of hypotheses) {
    expect(platformColumns(last(output), sources)).toEqual(platformColumns(last(input), sources));
  }
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

const TT = 'ВЫБРАТЬ 1 КАК А, 2 КАК Б ПОМЕСТИТЬ ВТ;\n';

describe('D1: a wildcard over a temp table not created in the batch is kept', () => {
  it.each([
    ['ВЫБРАТЬ 1 КАК А ПОМЕСТИТЬ ВТ1;\nВЫБРАТЬ * ИЗ ВТ2', 'ВЫБРАТЬ\n\t*\nИЗ\n\tВТ2 КАК ВТ2'],
    ['ВЫБРАТЬ 1 КАК А ПОМЕСТИТЬ ВТ1;\nВЫБРАТЬ Т.* ИЗ ВТ2 КАК Т', 'ВЫБРАТЬ\n\tТ.*\nИЗ\n\tВТ2 КАК Т'],
    ['ВЫБРАТЬ 1 КАК А ПОМЕСТИТЬ ВТ1;\nВЫБРАТЬ * ИЗ ВТ1 ЛЕВОЕ СОЕДИНЕНИЕ ВТ2 ПО ИСТИНА',
      'ВЫБРАТЬ\n\t*\nИЗ\n\tВТ1 КАК ВТ1\n\t\tЛЕВОЕ СОЕДИНЕНИЕ ВТ2 КАК ВТ2\n\t\tПО (ИСТИНА)'],
  ])('%j', (input, expected) => {
    const out = stable(input);
    expect(statements(out)).toHaveLength(2);
    expect(last(out)).toBe(expected);
  });
});

describe('D2: an inferred temp table is not a complete source', () => {
  it.each([
    ['ВЫБРАТЬ Т.А КАК А ИЗ ВТ2 КАК Т;\nВЫБРАТЬ Т.* ИЗ ВТ2 КАК Т', 'ВЫБРАТЬ\n\tТ.*\nИЗ\n\tВТ2 КАК Т'],
    ['ВЫБРАТЬ Т.А КАК А ИЗ ВТ2 КАК Т;\nВЫБРАТЬ * ИЗ ВТ2', 'ВЫБРАТЬ\n\t*\nИЗ\n\tВТ2 КАК ВТ2'],
  ])('%j', (input, expected) => {
    expect(last(stable(input))).toBe(expected);
  });
});

describe('D3: a wildcard with a parameter source or over an attribute is kept', () => {
  it.each([
    [`${TT}ВЫБРАТЬ * ИЗ ВТ ЛЕВОЕ СОЕДИНЕНИЕ &П КАК П ПО ИСТИНА`, 'ВЫБРАТЬ\n\t*\nИЗ\n\tВТ КАК ВТ\n\t\tЛЕВОЕ СОЕДИНЕНИЕ &П КАК П\n\t\tПО (ИСТИНА)'],
    [`${TT}ВЫБРАТЬ П.* ИЗ ВТ ЛЕВОЕ СОЕДИНЕНИЕ &П КАК П ПО ИСТИНА`, 'ВЫБРАТЬ\n\tП.*\nИЗ\n\tВТ КАК ВТ\n\t\tЛЕВОЕ СОЕДИНЕНИЕ &П КАК П\n\t\tПО (ИСТИНА)'],
    [`${TT}ВЫБРАТЬ ВТ.А.* ИЗ ВТ`, 'ВЫБРАТЬ\n\tВТ.А.*\nИЗ\n\tВТ КАК ВТ'],
    ['ВЫБРАТЬ * ИЗ &П КАК П', 'ВЫБРАТЬ\n\t*\nИЗ\n\t&П КАК П'],
  ])('%j', (input, expected) => {
    const out = stable(input);
    expect(last(out)).toBe(expected);
  });
});

describe('D4: column names follow the platform rule when a wildcard expands', () => {
  // Platform: dup_implicit_after / dup_implicit_before / dup_explicit_before /
  // dup_other_source (SL_kza 2026-10-12).
  it.each([
    [`${TT}ВЫБРАТЬ *, ВТ.Б ИЗ ВТ`, ['ВТ.А КАК А', 'ВТ.Б КАК Б', 'ВТ.Б КАК Б1']],
    [`${TT}ВЫБРАТЬ ВТ.Б, * ИЗ ВТ`, ['ВТ.Б КАК Б', 'ВТ.А КАК А', 'ВТ.Б КАК Б1']],
    [`${TT}ВЫБРАТЬ ВТ.А КАК Б, * ИЗ ВТ`, ['ВТ.А КАК Б', 'ВТ.А КАК А', 'ВТ.Б КАК Б1']],
    ['ВЫБРАТЬ 1 КАК А ПОМЕСТИТЬ ВТ;\nВЫБРАТЬ 7 КАК А ПОМЕСТИТЬ ВТ2;\nВЫБРАТЬ *, ВТ2.А ИЗ ВТ ЛЕВОЕ СОЕДИНЕНИЕ ВТ2 ПО ИСТИНА',
      ['ВТ.А КАК А', 'ВТ2.А КАК А1', 'ВТ2.А КАК А2']],
  ])('%j', (input, columns) => {
    const out = stable(input);
    expect(selectItems(last(out))).toEqual(columns);
    const sources: Array<[string, string[]]> = input.includes('ВТ2 ПО') ? [['ВТ', ['А']], ['ВТ2', ['А']]] : [['ВТ', ['А', 'Б']]];
    expectSameColumns(input, out, [sources]);
  });
});

describe('D5: a kept wildcard does not rename its neighbours', () => {
  // Platform: `А.*, Б.HSКод` names the field `HSКод1`; `А.*, Б.HSКод КАК HSКод`
  // gives `HSКод` to Б and `HSКод1` to А (SL_kza 2026-10-12, orig_implicit / with_alias).
  const F = 'ИЗ Справочник.Валюты КАК А, Справочник.Валюты КАК Б';
  const hypotheses = (names: string[][]): Array<Array<[string, string[]]>> => names.map(cols => [['А', cols]]);
  it.each([
    [`ВЫБРАТЬ А.*, Б.Код ${F}`, ['А.*', 'Б.Код']],
    [`ВЫБРАТЬ Б.Код, А.* ${F}`, ['Б.Код', 'А.*']],
    [`ВЫБРАТЬ А.*, Б.Код КАК Код ${F}`, ['А.*', 'Б.Код КАК Код']],
    [`ВЫБРАТЬ А.*, 1 + 1 ${F}`, ['А.*', '1 + 1']],
    [`ВЫБРАТЬ А.*, &Дата ${F}`, ['А.*', '&Дата']],
    [`ВЫБРАТЬ А.*, &Дата КАК Дата ${F}`, ['А.*', '&Дата КАК Дата']],
    [`ВЫБРАТЬ А.*, Б.Родитель.Код, СУММА(Б.Код) ${F}`, ['А.*', 'Б.Родитель.Код', 'СУММА(Б.Код)']],
  ])('%j', (input, items) => {
    const out = stable(input);
    expect(selectItems(last(out))).toEqual(items);
    expectSameColumns(input, out, hypotheses([['Код'], ['Х'], ['Код', 'Код1'], ['Поле1']]));
  });

  it('a parameter field renamed in the Designer keeps its new name', () => {
    const open = tryOpenDesignerBatch(`ВЫБРАТЬ А.*, &Дата ${F}`);
    if (!open.ok) throw new Error(open.error);
    const field = open.doc.members[0].members[0].model.fields[1];
    expect(field.paramAutoAlias).toBe(true);
    field.alias = 'Д';
    expect(generateBatch(open.doc)).toContain('\t&Дата КАК Д\n');
  });

  it('a tabular-section projection next to a kept wildcard keeps no added name', () => {
    const out = stable('ВЫБРАТЬ Т.*, Т.Товары.(Х) ИЗ Документ.Д КАК Т');
    expect(out).toContain('\tТ.Товары.(\n\t\tХ КАК Х\n\t)\nИЗ');
  });
});

describe('C24 step 1a: expansion over sources with proven columns', () => {
  it.each([
    // Platform tt_star / tt_join_meta / subq_bare / subq_qual / subq_dupcols / subq_union.
    [`${TT}ВЫБРАТЬ * ИЗ ВТ`, ['ВТ.А КАК А', 'ВТ.Б КАК Б']],
    [`${TT}ВЫБРАТЬ Т.* ИЗ ВТ КАК Т`, ['Т.А КАК А', 'Т.Б КАК Б']],
    [`${TT}ВЫБРАТЬ * ИЗ ВТ КАК Х ЛЕВОЕ СОЕДИНЕНИЕ ВТ КАК У ПО ИСТИНА`, ['Х.А КАК А', 'Х.Б КАК Б', 'У.А КАК А1', 'У.Б КАК Б1']],
    ['ВЫБРАТЬ * ИЗ (ВЫБРАТЬ Вл.Код КАК К, Вл.Наименование КАК Н ИЗ Справочник.Валюты КАК Вл) КАК П', ['П.К КАК К', 'П.Н КАК Н']],
    ['ВЫБРАТЬ П.* ИЗ (ВЫБРАТЬ Вл.Код КАК К ИЗ Справочник.Валюты КАК Вл) КАК П', ['П.К КАК К']],
    ['ВЫБРАТЬ П.* ИЗ (ВЫБРАТЬ Вл.Код, Вл.Код ИЗ Справочник.Валюты КАК Вл) КАК П', ['П.Код КАК Код', 'П.Код1 КАК Код1']],
    ['ВЫБРАТЬ П.* ИЗ (ВЫБРАТЬ Вл.Код КАК К ИЗ Справочник.Валюты КАК Вл ОБЪЕДИНИТЬ ВСЕ ВЫБРАТЬ Вл.Наименование ИЗ Справочник.Валюты КАК Вл) КАК П', ['П.К КАК К']],
    [`${TT}ВЫБРАТЬ П.* ИЗ (ВЫБРАТЬ * ИЗ ВТ) КАК П`, ['П.А КАК А', 'П.Б КАК Б']],
    ['ВЫБРАТЬ 1 КАК К ПОМЕСТИТЬ ВТ ОБЪЕДИНИТЬ ВСЕ ВЫБРАТЬ 2;\nВЫБРАТЬ * ИЗ ВТ', ['ВТ.К КАК К']],
    [`${TT}ВЫБРАТЬ 3 КАК Х ПОМЕСТИТЬ ВТ;\nВЫБРАТЬ * ИЗ ВТ`, ['ВТ.Х КАК Х']],
    // Platform subq_expr / subq_expr_repr / subq_mixed / subq_param / tt_expr.
    ['ВЫБРАТЬ П.* ИЗ (ВЫБРАТЬ 1 + 1 ИЗ Справочник.Валюты КАК Вл) КАК П', ['П.Поле1 КАК Поле1']],
    ['ВЫБРАТЬ П.* ИЗ (ВЫБРАТЬ ПРЕДСТАВЛЕНИЕ(Вл.Ссылка), Вл.Код ИЗ Справочник.Валюты КАК Вл) КАК П',
      ['П.СсылкаПредставление КАК СсылкаПредставление', 'П.Код КАК Код']],
    ['ВЫБРАТЬ П.* ИЗ (ВЫБРАТЬ Вл.Код КАК К, Вл.Код ИЗ Справочник.Валюты КАК Вл) КАК П', ['П.К КАК К', 'П.Код КАК Код']],
    ['ВЫБРАТЬ П.* ИЗ (ВЫБРАТЬ &Дата, Вл.Код ИЗ Справочник.Валюты КАК Вл) КАК П', ['П.Дата КАК Дата', 'П.Код КАК Код']],
    ['ВЫБРАТЬ 1, 2 КАК Х ПОМЕСТИТЬ ВТ;\nВЫБРАТЬ * ИЗ ВТ', ['ВТ.Поле1 КАК Поле1', 'ВТ.Х КАК Х']],
  ])('%j', (input, columns) => {
    expect(selectItems(last(stable(input)))).toEqual(columns);
  });

  it.each([
    // Not proven complete: kept as written.
    [`${TT}УНИЧТОЖИТЬ ВТ;\nВЫБРАТЬ * ИЗ ВТ`, ['*']],
    ['ВЫБРАТЬ *, 1 КАК Х ПОМЕСТИТЬ ВТ ИЗ Справочник.Валюты;\nВЫБРАТЬ * ИЗ ВТ', ['*']],
    [`${TT}ВЫБРАТЬ *, 1 КАК Х ПОМЕСТИТЬ ВТ ИЗ Справочник.Валюты;\nВЫБРАТЬ * ИЗ ВТ`, ['*']],
    [`${TT}ВЫБРАТЬ ВТ.*, Т.* ИЗ ВТ, Справочник.Валюты КАК Т`, ['ВТ.*', 'Т.*']],
    [`${TT}ВЫБРАТЬ * ИЗ ВТ, Справочник.Валюты КАК Т`, ['*']],
    ['ВЫБРАТЬ П.* ИЗ (ВЫБРАТЬ Д.Ссылка, Д.Товары.(Х) ИЗ Документ.Д КАК Д) КАК П', ['П.*']],
  ])('%j', (input, items) => {
    expect(selectItems(last(stable(input)))).toEqual(items);
  });
});

describe('complex scenarios: Designer text equals СхемаЗапроса (SL_kza 2026-10-12)', () => {
  it.each([
    ["c1_union_members_tt", "ВЫБРАТЬ 1 КАК А, 2 КАК Б ПОМЕСТИТЬ ВТ;\nВЫБРАТЬ * ИЗ ВТ ОБЪЕДИНИТЬ ВСЕ ВЫБРАТЬ * ИЗ ВТ",
      "ВЫБРАТЬ\n\t1 КАК А,\n\t2 КАК Б\nПОМЕСТИТЬ ВТ\n;\n\n////////////////////////////////////////////////////////////////////////////////\nВЫБРАТЬ\n\tВТ.А КАК А,\n\tВТ.Б КАК Б\nИЗ\n\tВТ КАК ВТ\n\nОБЪЕДИНИТЬ ВСЕ\n\nВЫБРАТЬ\n\tВТ.А,\n\tВТ.Б\nИЗ\n\tВТ КАК ВТ"],
    ["c2_union_mixed", "ВЫБРАТЬ 1 КАК А, 2 КАК Б ПОМЕСТИТЬ ВТ;\nВЫБРАТЬ ВТ.Б, ВТ.А ИЗ ВТ ОБЪЕДИНИТЬ ВСЕ ВЫБРАТЬ * ИЗ ВТ",
      "ВЫБРАТЬ\n\t1 КАК А,\n\t2 КАК Б\nПОМЕСТИТЬ ВТ\n;\n\n////////////////////////////////////////////////////////////////////////////////\nВЫБРАТЬ\n\tВТ.Б КАК Б,\n\tВТ.А КАК А\nИЗ\n\tВТ КАК ВТ\n\nОБЪЕДИНИТЬ ВСЕ\n\nВЫБРАТЬ\n\tВТ.А,\n\tВТ.Б\nИЗ\n\tВТ КАК ВТ"],
    ["c3_nested2", "ВЫБРАТЬ 1 КАК А, 2 КАК Б ПОМЕСТИТЬ ВТ;\nВЫБРАТЬ Х.* ИЗ (ВЫБРАТЬ П.*, П.А ИЗ (ВЫБРАТЬ * ИЗ ВТ) КАК П) КАК Х",
      "ВЫБРАТЬ\n\t1 КАК А,\n\t2 КАК Б\nПОМЕСТИТЬ ВТ\n;\n\n////////////////////////////////////////////////////////////////////////////////\nВЫБРАТЬ\n\tХ.А КАК А,\n\tХ.Б КАК Б,\n\tХ.А1 КАК А1\nИЗ\n\t(ВЫБРАТЬ\n\t\tП.А КАК А,\n\t\tП.Б КАК Б,\n\t\tП.А КАК А1\n\tИЗ\n\t\t(ВЫБРАТЬ\n\t\t\tВТ.А КАК А,\n\t\t\tВТ.Б КАК Б\n\t\tИЗ\n\t\t\tВТ КАК ВТ) КАК П) КАК Х"],
    ["c4_subq_union_star", "ВЫБРАТЬ 1 КАК А, 2 КАК Б ПОМЕСТИТЬ ВТ;\nВЫБРАТЬ П.* ИЗ (ВЫБРАТЬ * ИЗ ВТ ОБЪЕДИНИТЬ ВСЕ ВЫБРАТЬ ВТ.Б, ВТ.А ИЗ ВТ) КАК П",
      "ВЫБРАТЬ\n\t1 КАК А,\n\t2 КАК Б\nПОМЕСТИТЬ ВТ\n;\n\n////////////////////////////////////////////////////////////////////////////////\nВЫБРАТЬ\n\tП.А КАК А,\n\tП.Б КАК Б\nИЗ\n\t(ВЫБРАТЬ\n\t\tВТ.А КАК А,\n\t\tВТ.Б КАК Б\n\tИЗ\n\t\tВТ КАК ВТ\n\t\n\tОБЪЕДИНИТЬ ВСЕ\n\t\n\tВЫБРАТЬ\n\t\tВТ.Б,\n\t\tВТ.А\n\tИЗ\n\t\tВТ КАК ВТ) КАК П"],
    ["c5_join_tt_subq", "ВЫБРАТЬ 1 КАК А, 2 КАК Б ПОМЕСТИТЬ ВТ;\nВЫБРАТЬ *, П.А ИЗ ВТ ЛЕВОЕ СОЕДИНЕНИЕ (ВЫБРАТЬ ВТ.А КАК А ИЗ ВТ) КАК П ПО ВТ.А = П.А",
      "ВЫБРАТЬ\n\t1 КАК А,\n\t2 КАК Б\nПОМЕСТИТЬ ВТ\n;\n\n////////////////////////////////////////////////////////////////////////////////\nВЫБРАТЬ\n\tВТ.А КАК А,\n\tВТ.Б КАК Б,\n\tП.А КАК А1,\n\tП.А КАК А2\nИЗ\n\tВТ КАК ВТ\n\t\tЛЕВОЕ СОЕДИНЕНИЕ (ВЫБРАТЬ\n\t\t\tВТ.А КАК А\n\t\tИЗ\n\t\t\tВТ КАК ВТ) КАК П\n\t\tПО ВТ.А = П.А"],
    ["c6_tt_from_subq_star", "ВЫБРАТЬ 1 КАК А ПОМЕСТИТЬ ВТ;\nВЫБРАТЬ П.* ПОМЕСТИТЬ ВТ2 ИЗ (ВЫБРАТЬ ВТ.А, ВТ.А ИЗ ВТ) КАК П;\nВЫБРАТЬ * ИЗ ВТ2",
      "ВЫБРАТЬ\n\t1 КАК А\nПОМЕСТИТЬ ВТ\n;\n\n////////////////////////////////////////////////////////////////////////////////\nВЫБРАТЬ\n\tП.А КАК А,\n\tП.А1 КАК А1\nПОМЕСТИТЬ ВТ2\nИЗ\n\t(ВЫБРАТЬ\n\t\tВТ.А КАК А,\n\t\tВТ.А КАК А1\n\tИЗ\n\t\tВТ КАК ВТ) КАК П\n;\n\n////////////////////////////////////////////////////////////////////////////////\nВЫБРАТЬ\n\tВТ2.А КАК А,\n\tВТ2.А1 КАК А1\nИЗ\n\tВТ2 КАК ВТ2"],
    ["c7_outer_explicit_collision", "ВЫБРАТЬ 1 КАК А, 2 КАК Б ПОМЕСТИТЬ ВТ;\nВЫБРАТЬ ВТ.Б КАК А, *, ВТ.А ИЗ ВТ",
      "ВЫБРАТЬ\n\t1 КАК А,\n\t2 КАК Б\nПОМЕСТИТЬ ВТ\n;\n\n////////////////////////////////////////////////////////////////////////////////\nВЫБРАТЬ\n\tВТ.Б КАК А,\n\tВТ.А КАК А1,\n\tВТ.Б КАК Б,\n\tВТ.А КАК А2\nИЗ\n\tВТ КАК ВТ"],
    ["c8_distinct_top_order", "ВЫБРАТЬ 1 КАК А, 2 КАК Б ПОМЕСТИТЬ ВТ;\nВЫБРАТЬ РАЗЛИЧНЫЕ ПЕРВЫЕ 3 * ИЗ ВТ УПОРЯДОЧИТЬ ПО Б",
      "ВЫБРАТЬ\n\t1 КАК А,\n\t2 КАК Б\nПОМЕСТИТЬ ВТ\n;\n\n////////////////////////////////////////////////////////////////////////////////\nВЫБРАТЬ РАЗЛИЧНЫЕ ПЕРВЫЕ 3\n\tВТ.А КАК А,\n\tВТ.Б КАК Б\nИЗ\n\tВТ КАК ВТ\n\nУПОРЯДОЧИТЬ ПО\n\tВТ.Б"],
    ["c10_totals", "ВЫБРАТЬ 1 КАК А, 2 КАК Б ПОМЕСТИТЬ ВТ;\nВЫБРАТЬ * ИЗ ВТ ИТОГИ СУММА(Б) ПО А",
      "ВЫБРАТЬ\n\t1 КАК А,\n\t2 КАК Б\nПОМЕСТИТЬ ВТ\n;\n\n////////////////////////////////////////////////////////////////////////////////\nВЫБРАТЬ\n\tВТ.А КАК А,\n\tВТ.Б КАК Б\nИЗ\n\tВТ КАК ВТ\nИТОГИ\n\tСУММА(Б)\nПО\n\tА"],
  ])('%s', (_name, input, platform) => {
    expect(stable(input)).toBe(platform);
  });

  it('`В (ВЫБРАТЬ * …)`: expanded; the platform prints no name inside `В`, which changes nothing', () => {
    const out = stable('ВЫБРАТЬ 1 КАК А ПОМЕСТИТЬ ВТ;\nВЫБРАТЬ ВТ.А ИЗ ВТ ГДЕ ВТ.А В (ВЫБРАТЬ * ИЗ ВТ)');
    expect(out).toContain('(ВЫБРАТЬ\n\t\t\t\tВТ.А КАК А\n\t\t\tИЗ\n\t\t\t\tВТ)');
  });

  it('a nested SELECT over a kept wildcard stays as written, neighbours unnamed', () => {
    const out = stable('ВЫБРАТЬ П.*, П.Код ИЗ (ВЫБРАТЬ Т.*, Т.Код ИЗ Справочник.Валюты КАК Т) КАК П');
    expect(out).toBe('ВЫБРАТЬ\n\tП.*,\n\tП.Код\nИЗ\n\t(ВЫБРАТЬ\n\t\tТ.*,\n\t\tТ.Код\n\tИЗ\n\t\tСправочник.Валюты КАК Т) КАК П');
  });

  it('a kept wildcard in a UNION member is not applied (no silent change)', () => {
    const text = 'ВЫБРАТЬ Т.Код, Т.* ИЗ Справочник.Валюты КАК Т ОБЪЕДИНИТЬ ВСЕ ВЫБРАТЬ Т.Код, Т.Наименование ИЗ Справочник.Валюты КАК Т';
    expect(designer(text).applyOk).toBe(false);
  });
});

describe('the analysis policy (hover/completion model, never text)', () => {
  const resolver = buildYamlResolver(path.join(__dirname, '../fixtures/corpus/metadata/cf'));
  const tempColumns = (text: string): { complete: boolean; names: string[] } | undefined => {
    const snapshot = buildSemanticSnapshotFromText(1, text, resolver);
    const t = visibleTempTableAt(deriveTempTableLifetimes(snapshot.model), 1, 'ВТ');
    return t && { complete: t.complete, names: (t.table?.fields ?? []).map(f => f.name) };
  };

  it('a temp table made by a wildcard over known metadata keeps its columns', () => {
    const t = tempColumns('ВЫБРАТЬ * ПОМЕСТИТЬ ВТ ИЗ Справочник.Валюты;\nВЫБРАТЬ ВТ.Код ИЗ ВТ');
    expect(t?.complete).toBe(true);
    expect(t?.names.slice(0, 4)).toEqual(['Ссылка', 'ВерсияДанных', 'ПометкаУдаления', 'Код']);
  });

  it.each([
    'ВЫБРАТЬ * ИЗ &П КАК П',
    'ВЫБРАТЬ Т.* ИЗ Справочник.НетТакого КАК Т',
    'ВЫБРАТЬ Т.Ссылка.* ИЗ Справочник.Валюты КАК Т',
    'ВЫБРАТЬ * ИЗ Справочник.Валюты КАК Т, &П КАК П',
  ])('never removes a wildcard: %j', text => {
    expect(generateBatch(parseBatch(text, resolver, { wildcardPolicy: 'analysis' }))).toMatch(/\*/u);
    expect(generateBatch(parseBatch(text, resolver, { wildcardPolicy: 'constructor' }))).not.toMatch(/\*/u);
  });
});

describe('the constructor policy is not reachable from production code', () => {
  it('only the oracle/corpus tooling selects it; analysis only the semantic snapshot', () => {
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== 'cli') walk(p); continue; }
        if (!/\.tsx?$/u.test(e.name)) continue;
        const text = fs.readFileSync(p, 'utf8');
        if (/wildcardPolicy\s*:\s*'constructor'/u.test(text)) offenders.push(p);
        if (/wildcardPolicy\s*:\s*'analysis'/u.test(text) && !p.includes(`${path.sep}core${path.sep}semantic${path.sep}`)) offenders.push(p);
      }
    };
    walk(path.resolve(__dirname, '../../src'));
    expect(offenders).toEqual([]);
  });

  it('the analysis model cannot reach query text: snapshot consumers import no generator', () => {
    const src = path.resolve(__dirname, '../../src');
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.tsx?$/u.test(e.name)) files.push(p);
      }
    };
    walk(src);
    const imports = (p: string): string[] =>
      [...fs.readFileSync(p, 'utf8').matchAll(/^import[^;]*?from\s+'([^']+)'/gmu)].map(m => m[1]);
    const usesSnapshot = (p: string): boolean =>
      p.includes(`${path.sep}core${path.sep}semantic${path.sep}`) || imports(p).some(m => /(^|\/)semantic\//u.test(m) || /buildSemanticSnapshot/u.test(m));
    const offenders = files
      .filter(usesSnapshot)
      .flatMap(p => imports(p).filter(m => /sdblGenerator|computeBatchText|(^|\/)webview\//u.test(m)).map(m => `${path.relative(src, p)} → ${m}`));
    expect(offenders).toEqual([]);
    const webviewToSemantic = files
      .filter(p => p.includes(`${path.sep}webview${path.sep}`))
      .filter(p => imports(p).some(m => /(^|\/)semantic\//u.test(m)));
    expect(webviewToSemantic).toEqual([]);
  });
});
