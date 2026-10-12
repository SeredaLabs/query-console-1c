/**
 * C30: result-column names after Designer → Apply must be the names the platform
 * gives the original text. Platform evidence: `test/fixtures/platform/c30-column-names.json`
 * (СхемаЗапроса via `validate_query`, SL_kza 2026-10-12). Rules confirmed there:
 *  - an explicit `КАК` (any case, also `Поле{n}`) is reserved first; every other column
 *    is named left to right and takes the smallest free suffix;
 *  - a field path: the qualified path joined (`Т.Ссылка.Код` → `СсылкаКод`), a bare one
 *    its last segment; an aggregate is named by its operand the same way;
 *  - a bare parameter: its name; `ПРЕДСТАВЛЕНИЕ(…)` / `ПРЕДСТАВЛЕНИЕССЫЛКИ(…)`: the path
 *    after the source alias joined + `Представление` (a tabular-section source drops a
 *    leading `Ссылка`), without taking a `Поле{n}` number;
 *  - any other expression: the next free `Поле{n}`;
 *  - a UNION is named by its first member; a temp table and a nested SELECT expose
 *    these names to later references.
 *
 * Before the fix the parser stored `Поле{n}` for `ПРЕДСТАВЛЕНИЕ(…)` too (so later
 * numbers shifted and UNION / temp-table / hover consumers used `Поле1` for it), did not
 * skip taken names, and the generator did not reserve explicit names: Apply renamed
 * columns silently (outer `ВТ.Поле1` / `П.Поле1` then failed) or refused valid queries.
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
import { deriveUnionColumns, selectColumnAliases } from '../../src/core/query/unionModel';
import type { QueryModel } from '../../src/core/query/queryModel';
import { resolveAliases } from '../../src/core/query/queryModelUtils';
import { tokenize } from '../../src/core/query/sdblLexer';
import { deriveTempTableLifetimes, visibleTempTableAt } from '../../src/core/query/tempTableSemantics';

interface PlatformCase { name: string; query: string; platform: string }
const evidence: { cases: PlatformCase[] } = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'platform', 'c30-column-names.json'), 'utf8'),
);

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

// P01: the platform also qualifies the bare argument of `ПРЕДСТАВЛЕНИЕ(Ссылка.Код)`
// (`Валюты.Ссылка.Код`); the Designer keeps it as written. The column name is the same,
// so the texts differ only there (argument qualification is not a naming rule).
const TEXT_ONLY: Record<string, (platform: string) => string> = {
  P01_repr_bare_dotted: t => t.replace('ПРЕДСТАВЛЕНИЕ(Валюты.Ссылка.Код)', 'ПРЕДСТАВЛЕНИЕ(Ссылка.Код)'),
};

// C31: the Designer keeps a bare parameter of the select list without `КАК` (it may be
// a BSL placeholder); the platform gives the column the same name either way, so the
// platform's `КАК <имя>` after a parameter that was bare in the input is not expected.
function withoutBareParamNames(platform: string, query: string): string {
  const toks = tokenize(query).filter(t => t.type !== 'eof');
  const bare = toks.filter((t, i) => t.type === 'param' && toks[i + 1]?.text.toUpperCase() !== 'КАК').map(t => t.text);
  return bare.reduce((text, p) => text.replace(new RegExp(`(\\t${p.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}) КАК [^,\\n]+`, 'u'), '$1'), platform);
}

describe('C30: Designer text equals СхемаЗапроса for every probed naming case', () => {
  it.each(evidence.cases.map(c => [c.name, c] as const))('%s', (_name, c) => {
    const out = stable(c.query);
    const expected = withoutBareParamNames(TEXT_ONLY[c.name]?.(c.platform) ?? c.platform, c.query);
    expect(out).toBe(expected);
  });
});

/** Column names a consumer other than the single-SELECT generator sees. */
const names = {
  select: (text: string, statement = 0): string[] => {
    const m = parseBatch(text).members[statement].members[0].model;
    return selectColumnAliases(m.fields, m);
  },
  union: (text: string): string[] => deriveUnionColumns(parseBatch(text).members[0].members).map(c => c.alias),
  temp: (text: string, name: string): string[] => {
    const t = visibleTempTableAt(deriveTempTableLifetimes(parseBatch(text)), 1, name);
    return (t?.table?.fields ?? []).map(f => f.name);
  },
};

describe('C30: every consumer uses the platform names', () => {
  const F = 'ИЗ Справочник.Валюты КАК Т';

  it('single select, UNION header, temp table and the star over it agree', () => {
    expect(names.select(`ВЫБРАТЬ ПРЕДСТАВЛЕНИЕ(Т.Ссылка), 1 + 1 ${F}`)).toEqual(['СсылкаПредставление', 'Поле1']);
    expect(names.union(`ВЫБРАТЬ ПРЕДСТАВЛЕНИЕ(Т.Ссылка), 1 + 1 ${F} ОБЪЕДИНИТЬ ВСЕ ВЫБРАТЬ "x", 2 ${F}`))
      .toEqual(['СсылкаПредставление', 'Поле1']);
    const tt = `ВЫБРАТЬ ПРЕДСТАВЛЕНИЕ(Т.Ссылка), 1 + 1 ПОМЕСТИТЬ ВТ ${F};\nВЫБРАТЬ * ИЗ ВТ`;
    expect(names.temp(tt, 'ВТ')).toEqual(['СсылкаПредставление', 'Поле1']);
    // Platform P12: the star over that temp table.
    expect(stable(tt)).toContain('\tВТ.СсылкаПредставление КАК СсылкаПредставление,\n\tВТ.Поле1 КАК Поле1\n');
  });

  it('outer references keep pointing at the same expression', () => {
    // Platform R21 / R24: `ВТ.Поле1` and `П.Поле1` are `1 + 1`.
    const tt = stable(`ВЫБРАТЬ ПРЕДСТАВЛЕНИЕ(Т.Ссылка), 1 + 1 ПОМЕСТИТЬ ВТ ${F};\nВЫБРАТЬ ВТ.Поле1 ИЗ ВТ`);
    expect(tt).toContain('\t1 + 1 КАК Поле1\n');
    expect(tt).toContain('\tВТ.Поле1 КАК Поле1\n');
    const nested = stable(`ВЫБРАТЬ П.Поле1 КАК Х ИЗ (ВЫБРАТЬ ПРЕДСТАВЛЕНИЕ(Т.Ссылка), 1 + 1 ${F}) КАК П`);
    expect(nested).toContain('\t\t1 + 1 КАК Поле1\n');
  });

  it('duplicates get the platform suffix in every consumer', () => {
    expect(names.select(`ВЫБРАТЬ Т.Код, Т.Наименование КАК Код ${F}`)).toEqual(['Код1', 'Код']);
    expect(names.select(`ВЫБРАТЬ 1 + 1, 2 КАК Поле1 ${F}`)).toEqual(['Поле2', 'Поле1']);
    expect(names.select(`ВЫБРАТЬ &Дата, &Дата ${F}`)).toEqual(['Дата', 'Дата1']);
    expect(names.union(`ВЫБРАТЬ 1 + 1, 2 КАК Поле1 ${F} ОБЪЕДИНИТЬ ВСЕ ВЫБРАТЬ 3, 4 ${F}`)).toEqual(['Поле2', 'Поле1']);
  });
});

describe('C30: explicit and synthesized names', () => {
  const F = 'ИЗ Справочник.Валюты КАК Т';
  const open = (text: string) => {
    const r = tryOpenDesignerBatch(text);
    if (!r.ok) throw new Error(r.error);
    return reducer(initialState(), { type: 'LOAD_BATCH', doc: r.doc });
  };

  it('a column renamed in the Designer keeps its name; the other columns keep theirs', () => {
    let state = open(`ВЫБРАТЬ ПРЕДСТАВЛЕНИЕ(Т.Ссылка), 1 + 1, 2 + 2 ${F}`);
    state = reducer(state, { type: 'SET_FIELD_ALIAS', fieldIdx: 1, alias: 'Х' });
    const text = computeBatchTextSafe(state, true).text;
    // A rename does not renumber untouched columns (names are fixed when the text is opened).
    expect(text).toContain('\tПРЕДСТАВЛЕНИЕ(Т.Ссылка) КАК СсылкаПредставление,\n\t1 + 1 КАК Х,\n\t2 + 2 КАК Поле2\n');
    expect(designer(text).text).toBe(text);
  });

  it('a column renamed to a synthesized-looking name is explicit', () => {
    let state = open(`ВЫБРАТЬ 1 + 1, Т.Код ${F}`);
    state = reducer(state, { type: 'SET_FIELD_ALIAS', fieldIdx: 1, alias: 'Поле2' });
    const text = computeBatchTextSafe(state, true).text;
    expect(text).toContain('\t1 + 1 КАК Поле1,\n\tТ.Код КАК Поле2\n');
    expect(designer(text).text).toBe(text);
  });

  it('a renamed UNION column keeps its name', () => {
    let state = open(`ВЫБРАТЬ ПРЕДСТАВЛЕНИЕ(Т.Ссылка), 1 + 1 ${F} ОБЪЕДИНИТЬ ВСЕ ВЫБРАТЬ "x", 2 ${F}`);
    state = reducer(state, { type: 'SET_COLUMN_ALIAS', alias: 'Поле1', newAlias: 'Сумма' });
    expect(computeBatchTextSafe(state, true).text).toContain('\t1 + 1 КАК Сумма\n');
  });

  it('next to a kept wildcard no synthesized name is printed (C24 D5)', () => {
    const out = stable('ВЫБРАТЬ А.*, ПРЕДСТАВЛЕНИЕ(Б.Ссылка), 1 + 1, &Дата, Б.Код ИЗ Справочник.Валюты КАК А, Справочник.Валюты КАК Б');
    expect(out).toContain('\tА.*,\n\tПРЕДСТАВЛЕНИЕ(Б.Ссылка),\n\t1 + 1,\n\t&Дата,\n\tБ.Код\n');
  });

  it('an explicit `&П КАК Поле1` is explicit', () => {
    expect(names.select(`ВЫБРАТЬ 1 + 1, &П КАК Поле1 ${F}`)).toEqual(['Поле2', 'Поле1']);
  });

  it('generateBatch alone (no Designer) prints the same names', () => {
    expect(generateBatch(parseBatch(`ВЫБРАТЬ ПРЕДСТАВЛЕНИЕ(Т.Ссылка), 1 + 1 ${F}`)))
      .toContain('\tПРЕДСТАВЛЕНИЕ(Т.Ссылка) КАК СсылкаПредставление,\n\t1 + 1 КАК Поле1\n');
  });
});

// ---------------------------------------------------------------------------
// Name → expression: the text Designer → Apply writes and the platform's text of the
// original must bind every column name of a producer (UNION member 0, temp table,
// nested SELECT) to the same expression, and an outer reference must reach the same
// expression. Both texts carry an explicit `КАК` on every producer column, so their
// names are read from the text, not computed by the code under test.

const exprOf = (m: QueryModel, f: QueryModel['fields'][number]): string =>
  (f.expression ?? `${resolveAliases(m.tables).get(f.tableId) ?? f.tableId}.${f.path}`).replace(/\s+/gu, ' ');
/** `name → expression` of member 0 of each statement, and of each nested SELECT (by its alias). */
function producers(text: string): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  const add = (key: string, m: QueryModel): void => {
    out[key] = Object.fromEntries(m.fields.map(f => [f.alias!, exprOf(m, f)]));
    for (const t of m.tables) if (t.subquery) add(`${key}/${t.alias}`, t.subquery.members[0].model);
  };
  parseBatch(text).members.forEach((d, i) => add(`#${i}${d.members[0].model.tempTableName ? `:${d.members[0].model.tempTableName}` : ''}`, d.members[0].model));
  return out;
}
/** The expression an outer `<Источник>.<Колонка>` of statement `i`, field `k` resolves to. */
function reference(text: string, i: number, k: number): string | undefined {
  const all = producers(text);
  const m = parseBatch(text).members[i].members[0].model;
  const f = m.fields[k];
  // A column named `Поле{n}` is kept by the parser as an expression `<Источник>.<Колонка>`.
  const [sourceAlias, column] = f.expression !== undefined
    ? (/^([^.\s]+)\.([^.\s]+)$/u.exec(f.expression.trim()) ?? []).slice(1)
    : [resolveAliases(m.tables).get(f.tableId), f.path];
  const t = m.tables.find(x => x.alias === sourceAlias);
  if (!t || column === undefined) return undefined;
  const producer = t.subquery ? all[`#${i}/${t.alias}`] : Object.entries(all).find(([key]) => key.endsWith(`:${t.fullName}`))?.[1];
  return producer?.[column];
}

describe('C30: column names bind the same expressions as on the platform', () => {
  const cases = Object.fromEntries(evidence.cases.map(c => [c.name, c]));
  it.each(['R19_union', 'R20_union_m2_names', 'P11_union_m0_dupes', 'R21_tt', 'P12_repr_in_tt_then_star', 'R24_nested', 'P05_agg_bare_then_path', 'P15_agg_bare_dotted_dup', 'R11_impl_then_later_expl'])(
    '%s', name => {
      const c = cases[name];
      expect(producers(stable(c.query))).toEqual(producers(c.platform));
    },
  );

  it('outer references reach the same expression (temp table, nested SELECT)', () => {
    const tt = cases.R21_tt;
    expect(reference(stable(tt.query), 1, 0)).toBe('1 + 1');
    expect(reference(tt.platform, 1, 0)).toBe('1 + 1');
    const nested = cases.R24_nested;
    expect(reference(stable(nested.query), 0, 0)).toBe('1 + 1');
    expect(reference(nested.platform, 0, 0)).toBe('1 + 1');
  });
});
