import { describe, expect, it } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { orderedSelectElements } from '../../src/core/query/unionModel';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { validateBatchSemantics } from '../../src/core/query/semanticValidator';
import { tryOpenDesignerBatch } from '../../src/webview/openDesignerBatch';
import { initialState, reducer } from '../../src/webview/state/queryStore';
import { computeBatchTextSafe } from '../../src/webview/computeBatchText';
import { decideApply, findStaticApplyBlocker } from '../../src/webview/applyGate';
import { buildResolverFromTables } from '../../src/core/metadata/buildModelResolver';
import evidence from '../fixtures/platform/c24-completion.json';
import catalog from '../fixtures/platform/c24-expand-command.json';
import type { MetaTable } from '../../src/core/metadata/types';

const resolver = buildResolverFromTables(catalog.tables as MetaTable[]);
const platformCase = evidence.probes.find(p => p.name === 'u_star_vs_explicit')!;
const mixed = 'ВЫБРАТЬ Т.* ИЗ Справочник.Валюты КАК Т ОБЪЕДИНИТЬ ВСЕ ВЫБРАТЬ Б.Код, Б.Наименование ИЗ Справочник.Валюты КАК Б';
const expected = 'ВЫБРАТЬ\n\tТ.*\nИЗ\n\tСправочник.Валюты КАК Т\n\nОБЪЕДИНИТЬ ВСЕ\n\nВЫБРАТЬ\n\tБ.Код,\n\tБ.Наименование\nИЗ\n\tСправочник.Валюты КАК Б';

describe('C35: unknown UNION width', () => {
  it('preserves the original lists instead of inserting NULL', () => {
    expect(generateBatch(parseBatch(mixed))).toBe(expected);
  });
  it.each([false, true])('platform-accepted mixed UNION opens / applies / reopens (metadata %s)', withMetadata => {
    expect(platformCase.platform.accepted).toBe(true);
    const r = withMetadata ? resolver : undefined;
    const open = tryOpenDesignerBatch(platformCase.query, r);
    expect(open.ok).toBe(true);
    if (!open.ok) throw new Error(open.error);
    const state = reducer(initialState(), { type: 'LOAD_BATCH', doc: open.doc });
    const out = computeBatchTextSafe(state, true);
    expect(out.text).toContain('*');
    expect(out.text).not.toContain('NULL');
    expect(out.text).toContain('Пе2.Ссылка,\n\tПе2.Порядок');
    expect(decideApply(out.text, out.error, findStaticApplyBlocker(state), r, platformCase.query)).toEqual({ ok: true });
    const reopened = tryOpenDesignerBatch(out.text, r);
    if (!reopened.ok) throw new Error(reopened.error);
    expect(computeBatchTextSafe(reducer(initialState(), { type: 'LOAD_BATCH', doc: reopened.doc }), true).text).toBe(out.text);
  });
  it.each([
    'ВЫБРАТЬ 1 КАК А, 2 КАК Б ОБЪЕДИНИТЬ ВСЕ ВЫБРАТЬ Т.* ИЗ Неизвестная КАК Т',
    'ВЫБРАТЬ Т.*, 1 КАК Доп ИЗ Неизвестная КАК Т ОБЪЕДИНИТЬ ВСЕ ВЫБРАТЬ 1, 2, 3',
    'ВЫБРАТЬ * ИЗ Неизвестная ОБЪЕДИНИТЬ ВСЕ ВЫБРАТЬ 1, 2',
    'ВЫБРАТЬ Т.Товары.(Код) КАК Строки, Т.* ИЗ Неизвестная КАК Т ОБЪЕДИНИТЬ ВСЕ ВЫБРАТЬ 1, 2, 3',
    'ВЫБРАТЬ П.Ссылка ИЗ (ВЫБРАТЬ * ИЗ Неизвестная ОБЪЕДИНИТЬ ВСЕ ВЫБРАТЬ 1, 2) КАК П',
  ])('does not pad either member, including nested/projection lists: %s', text => {
    const doc = parseBatch(text);
    expect(validateBatchSemantics(doc, undefined, text)).toEqual([]);
    const output = generateBatch(doc);
    expect(output).not.toContain('NULL');
    expect(output).toContain('*');
    const reopened = parseBatch(output);
    expect(reopened.members[0].members.map(m => orderedSelectElements(m.model).length))
      .toEqual(doc.members[0].members.map(m => orderedSelectElements(m.model).length));
    expect(generateBatch(reopened)).toBe(output);
  });
  it('unknown width does not hide two proven unequal widths', () => {
    const text = 'ВЫБРАТЬ * ИЗ Неизвестная ОБЪЕДИНИТЬ ВСЕ ВЫБРАТЬ 1 ОБЪЕДИНИТЬ ВСЕ ВЫБРАТЬ 1, 2';
    expect(validateBatchSemantics(parseBatch(text), undefined, text)).toEqual([
      { message: 'Количество столбцов в результате запроса с объединением не совпадает (?, 1, 2)' },
    ]);
  });
  it('still rejects a proven batch-temp expansion mismatch', () => {
    const text = 'ВЫБРАТЬ 1 КАК А, 2 КАК Б ПОМЕСТИТЬ ВТ; ВЫБРАТЬ * ИЗ ВТ ОБЪЕДИНИТЬ ВСЕ ВЫБРАТЬ 1';
    expect(tryOpenDesignerBatch(text)).toMatchObject({ ok: false, error: expect.stringContaining('(2, 1)') });
  });
});
