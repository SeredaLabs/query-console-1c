/**
 * C24 completion. Platform evidence: test/fixtures/platform/c24-completion.json
 * (SL_kza 8.3.15.1489, 2026-10-18).
 *  1. A kept wildcard in a UNION gets no column alias (`Т.* КАК Т.*` is a syntax
 *     error); the other members get none either, and a nested source made of such a
 *     query has no fictitious `Т.*` column.
 *  2. D4 in the constructor-parity / analysis expansion: names follow the platform
 *     (C30) — explicit `КАК` reserved, the rest left to right (`*, Т.Б` → А, Б, Б1).
 *  3. Inside `В (ВЫБРАТЬ * …)` an expanded column has no `КАК`.
 */
import { describe, it, expect } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { buildResolverFromTables } from '../../src/core/metadata/buildModelResolver';
import type { MetaField, MetaTable } from '../../src/core/metadata/types';
import { tryOpenDesignerBatch } from '../../src/webview/openDesignerBatch';
import { allTables, initialState, reducer } from '../../src/webview/state/queryStore';
import { computeBatchTextSafe } from '../../src/webview/computeBatchText';
import { decideApply, findStaticApplyBlocker } from '../../src/webview/applyGate';
import { deriveUnionColumns } from '../../src/core/query/unionModel';
import { buildSemanticSnapshotFromText } from '../../src/core/semantic/buildSemanticSnapshot';
import { deriveTempTableLifetimes, visibleTempTableAt } from '../../src/core/query/tempTableSemantics';

const field = (name: string): MetaField => ({ name, kind: 'attribute', types: [] });
const resolver = buildResolverFromTables([
  { kind: 'Справочник', name: 'Т', fullName: 'Справочник.Т', fields: [field('А'), field('Б')] },
  { kind: 'Справочник', name: 'Т2', fullName: 'Справочник.Т2', fields: [field('А')] },
] as MetaTable[]);

/** The select items of the last statement, one per line, without layout. */
const items = (text: string): string[] => {
  const last = text.split(';').pop()!;
  const select = last.slice(last.indexOf('ВЫБРАТЬ') + 'ВЫБРАТЬ'.length, last.search(/\n(ИЗ|ПОМЕСТИТЬ)\n/u));
  return select.split(',\n').map(s => s.replace(/\s+/gu, ' ').trim());
};

function designer(text: string): { text: string; ok: boolean; state: ReturnType<typeof initialState> } {
  const open = tryOpenDesignerBatch(text);
  if (!open.ok) throw new Error(open.error);
  const state = reducer(initialState(), { type: 'LOAD_BATCH', doc: open.doc });
  const out = computeBatchTextSafe(state, true);
  return { text: out.text, ok: decideApply(out.text, out.error, findStaticApplyBlocker(state), undefined, text).ok, state };
}

describe('C24: a kept wildcard in a UNION', () => {
  const U = 'ВЫБРАТЬ Т.* ИЗ Справочник.Т КАК Т ОБЪЕДИНИТЬ ВСЕ ВЫБРАТЬ Т2.* ИЗ Справочник.Т КАК Т2';

  it('gets no column alias, in any member', () => {
    const doc = parseBatch(U, undefined, { wildcardPolicy: 'preserve' });
    expect(doc.members[0].members.map(m => m.model.fields.map(f => f.alias))).toEqual([[undefined], [undefined]]);
    const text = generateBatch(doc);
    expect(text).not.toMatch(/КАК Т2?\.\*/u);
    expect(text).toContain('\tТ.*\n');
  });

  it.each([
    U,
    'ВЫБРАТЬ Т.*, 1 КАК Х ИЗ Справочник.Т КАК Т ОБЪЕДИНИТЬ ВСЕ ВЫБРАТЬ Т2.*, 2 ИЗ Справочник.Т КАК Т2',
    'ВЫБРАТЬ * ИЗ Справочник.Т КАК Т ОБЪЕДИНИТЬ ВЫБРАТЬ * ИЗ Справочник.Т КАК Т2',
  ])('opens in the Designer, applies, and is stable: %s', input => {
    const first = designer(input);
    expect(first.ok).toBe(true);
    const second = designer(first.text);
    expect(second.text).toBe(first.text);
    // parse → generate → parse → generate
    const g1 = generateBatch(parseBatch(input, undefined, { wildcardPolicy: 'preserve' }));
    expect(generateBatch(parseBatch(g1, undefined, { wildcardPolicy: 'preserve' }))).toBe(g1);
  });

  it('the explicit names of the other columns stay with member 0', () => {
    const { text } = designer('ВЫБРАТЬ Т.*, 1 КАК Х ИЗ Справочник.Т КАК Т ОБЪЕДИНИТЬ ВСЕ ВЫБРАТЬ Т2.*, 2 ИЗ Справочник.Т КАК Т2');
    const [m0, m1] = text.split('ОБЪЕДИНИТЬ ВСЕ');
    expect(items(m0)).toEqual(['Т.*', '1 КАК Х']);
    expect(items(m1)).toEqual(['Т2.*', '2']);
  });

  it('parser, generator and UI see the same columns', () => {
    const doc = parseBatch('ВЫБРАТЬ Т.*, 1 КАК Х ИЗ Справочник.Т КАК Т ОБЪЕДИНИТЬ ВСЕ ВЫБРАТЬ Т2.*, 2 ИЗ Справочник.Т КАК Т2');
    const columns = deriveUnionColumns(doc.members[0].members);
    expect(columns.map(c => c.cells)).toEqual([['Т.*', 'Т2.*'], ['1', '2']]);
  });
});

describe('C24: a nested source with a kept wildcard has no fictitious column', () => {
  it.each([
    ['UNION', 'ВЫБРАТЬ П.Ссылка ИЗ (ВЫБРАТЬ Т.* ИЗ Справочник.Т КАК Т ОБЪЕДИНИТЬ ВСЕ ВЫБРАТЬ Т2.* ИЗ Справочник.Т КАК Т2) КАК П'],
    ['single member', 'ВЫБРАТЬ П.Ссылка ИЗ (ВЫБРАТЬ Т.* ИЗ Справочник.Т КАК Т) КАК П'],
    ['bare star with a named column', 'ВЫБРАТЬ П.Х ИЗ (ВЫБРАТЬ *, 1 КАК Х ИЗ Справочник.Т КАК Т) КАК П'],
  ])('%s', (_name, input) => {
    const { state, ok } = designer(input);
    expect(ok).toBe(true);
    const source = allTables(state).find(t => t.fullName === 'П')!;
    expect(source.fields.map(f => f.name).filter(n => n.includes('*'))).toEqual([]);
  });
});

describe('C24 D4: names when the constructor / analysis expansion runs (platform rule C30)', () => {
  it.each([
    ['ВЫБРАТЬ *, Т.Б ИЗ Справочник.Т КАК Т', ['Т.А КАК А', 'Т.Б КАК Б', 'Т.Б КАК Б1']],
    ['ВЫБРАТЬ Т.Б, * ИЗ Справочник.Т КАК Т', ['Т.Б КАК Б', 'Т.А КАК А', 'Т.Б КАК Б1']],
    ['ВЫБРАТЬ Т.А КАК Б, * ИЗ Справочник.Т КАК Т', ['Т.А КАК Б', 'Т.А КАК А', 'Т.Б КАК Б1']],
    ['ВЫБРАТЬ *, Т2.А ИЗ Справочник.Т КАК Т ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Т2 КАК Т2 ПО ИСТИНА',
      ['Т.А КАК А', 'Т.Б КАК Б', 'Т2.А КАК А1', 'Т2.А КАК А2']],
  ])('constructor: %s', (input, expected) => {
    const text = generateBatch(parseBatch(input, resolver, { wildcardPolicy: 'constructor' }), { wildcardPolicy: 'constructor' });
    expect(items(text)).toEqual(expected);
  });

  it('analysis: a temp table made by `*, Т.Б` has the platform column names', () => {
    const snapshot = buildSemanticSnapshotFromText(1, 'ВЫБРАТЬ *, Т.Б ПОМЕСТИТЬ ВТ ИЗ Справочник.Т КАК Т;\nВЫБРАТЬ ВТ.А ИЗ ВТ', resolver);
    const t = visibleTempTableAt(deriveTempTableLifetimes(snapshot.model), 1, 'ВТ');
    expect((t?.table?.fields ?? []).map(f => f.name)).toEqual(['А', 'Б', 'Б1']);
  });
});

describe('C24: an expanded column inside `В (ВЫБРАТЬ * …)` has no `КАК`', () => {
  it.each(['preserve', 'constructor'] as const)('%s', policy => {
    const input = 'ВЫБРАТЬ 1 КАК А ПОМЕСТИТЬ ВТ;\nВЫБРАТЬ Т.А ИЗ Справочник.Т КАК Т ГДЕ Т.А В (ВЫБРАТЬ * ИЗ ВТ)';
    const text = generateBatch(parseBatch(input, resolver, { wildcardPolicy: policy }), { wildcardPolicy: policy });
    expect(text).toMatch(/\(ВЫБРАТЬ\n\t+ВТ\.А\n/u);
  });
});

describe('platform evidence (SL_kza): the changed outputs', () => {
  const evidence = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'fixtures', 'platform', 'c24-completion.json'), 'utf8'));
  const catalog: MetaTable[] = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'fixtures', 'platform', 'c24-expand-command.json'), 'utf8')).tables;
  const ours = (c: { mode: string; input: string }): string => {
    const r = buildResolverFromTables(catalog);
    if (c.mode === 'constructor') return generateBatch(parseBatch(c.input, r, { wildcardPolicy: 'constructor' }), { wildcardPolicy: 'constructor' });
    const open = tryOpenDesignerBatch(c.input, r);
    if (!open.ok) throw new Error(open.error);
    return computeBatchTextSafe(reducer(reducer(initialState(), { type: 'SET_METADATA', tables: catalog }), { type: 'LOAD_BATCH', doc: open.doc }), true).text;
  };
  it.each(evidence.changed.map((c: { name: string }) => [c.name, c]))('%s', (_name, c: any) => {
    // What we write now is the text the platform accepted with the input's columns.
    expect(ours(c)).toBe(c.ours);
    expect(c.platform).toMatchObject({ inputValid: true, oursValid: true, sameColumns: true });
    if (c.mode === 'constructor') expect(c.platform.oursEqualsCanonical).toBe(true);
  });

  it('PQ-C24: the wildcard forms and the rewritten forms', () => {
    const byName = Object.fromEntries(evidence.probes.map((p: any) => [p.name, p.platform.accepted]));
    expect([byName.pq_star, byName.pq_source_star, byName.pq_star_alias, byName.pq_source_star_alias]).toEqual([true, true, false, false]);
    expect(byName.u_ours_now).toBe(false); // the former `Т.* КАК Т.*`
  });
});
