/**
 * C58: `УНИКАЛЬНО` after the fields of a single index (`ИНДЕКСИРОВАТЬ ПО Код
 * УНИКАЛЬНО`) is accepted by 8.5.1.1529 (refused by 8.3.15.1489). The parser read
 * `УНИКАЛЬНО` only after a set of `ПО НАБОРАМ`, and the generator dropped the
 * «Уникальный» flag of a single index, so the checkbox did nothing.
 * Evidence: test/fixtures/platform/c58-index-unique.json.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { tryOpenDesignerBatch } from '../../src/webview/openDesignerBatch';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { initialState, reducer } from '../../src/webview/state/queryStore';
import { computeBatchTextSafe } from '../../src/webview/computeBatchText';
import { decideApply, findStaticApplyBlocker } from '../../src/webview/applyGate';
import { computeQueryParseProblems } from '../../src/extension/queryDiagnostics';

type Case = { name: string; query: string; platform: { valid: boolean; query_text: string } };
const cases: Case[] = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'fixtures', 'platform', 'c58-index-unique.json'), 'utf8')).cases;

function load(query: string) {
  const open = tryOpenDesignerBatch(query);
  if (!open.ok) throw new Error(open.error);
  return reducer(initialState(), { type: 'LOAD_BATCH', doc: open.doc });
}

describe('C58: УНИКАЛЬНО in every index form, as printed by 8.5.1.1529', () => {
  it.each(cases.map(c => [c.name, c] as const))('%s', (_name, c) => {
    const open = tryOpenDesignerBatch(c.query);
    expect(open.ok).toBe(true);
    if (!open.ok) return;
    const generated = generateBatch(open.doc);
    expect(generated).toBe(c.platform.query_text);
    const reopened = tryOpenDesignerBatch(generated);
    expect(reopened.ok && generateBatch(reopened.doc)).toBe(generated);
    const state = load(c.query);
    const out = computeBatchTextSafe(state, true);
    expect(decideApply(out.text, out.error, findStaticApplyBlocker(state), undefined, c.query)).toEqual({ ok: true });
  });

  it('editor diagnostics accept a single unique index', () => {
    const q = cases.find(c => c.name === 'two-fields-unique')!.query;
    expect(computeQueryParseProblems(`Запрос.Текст = "${q}";`)).toEqual([]);
  });
});

describe('C58: the «Уникальный» checkbox of a single index', () => {
  const plain = 'ВЫБРАТЬ Вал.Код КАК Код ПОМЕСТИТЬ ВТ ИЗ Справочник.Валюты КАК Вал ИНДЕКСИРОВАТЬ ПО Код';

  it('writes УНИКАЛЬНО after the last field', () => {
    const s = reducer(load(plain), { type: 'SET_INDEX_UNIQUE', index: 0, unique: true });
    expect(computeBatchTextSafe(s, true).text).toMatch(/ИНДЕКСИРОВАТЬ ПО\n\tКод УНИКАЛЬНО$/);
  });

  it('clearing it removes УНИКАЛЬНО', () => {
    const s = reducer(load(`${plain} УНИКАЛЬНО`), { type: 'SET_INDEX_UNIQUE', index: 0, unique: false });
    expect(computeBatchTextSafe(s, true).text).toMatch(/ИНДЕКСИРОВАТЬ ПО\n\tКод$/);
  });

  it('a non-unique single index is printed as before', () => {
    expect(computeBatchTextSafe(load(plain), true).text).toMatch(/ИНДЕКСИРОВАТЬ ПО\n\tКод$/);
  });
});
