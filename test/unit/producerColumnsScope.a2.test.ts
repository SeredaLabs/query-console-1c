import { describe, expect, it } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { buildSemanticSnapshotFromText } from '../../src/core/semantic/buildSemanticSnapshot';
import { tryOpenDesignerBatch } from '../../src/webview/openDesignerBatch';
import { availableTempTables, initialState, reducer } from '../../src/webview/state/queryStore';
import { computeBatchTextSafe } from '../../src/webview/computeBatchText';
import { decideApply, findStaticApplyBlocker } from '../../src/webview/applyGate';
import type { MetadataResolver } from '../../src/core/query/metadataResolver';

const resolver: MetadataResolver = {
  tableByFullName: name => name === 'Справочник.Источник' ? {
    kind: 'Справочник', name: 'Источник', fullName: name,
    fields: [{ name: 'Код', kind: 'attribute', types: [] }],
  } : undefined,
};
const producer = 'ВЫБРАТЬ Н.*, 1 КАК Маркер ПОМЕСТИТЬ ВТ ИЗ Справочник.Источник КАК Н';
const consumer = 'ВЫБРАТЬ * ИЗ ВТ КАК Б';

// Known defects are characterized, not endorsed: change the loss assertions when
// fixing A2, while keeping the production Designer preservation controls.
describe('A2 audit: production reach of column-policy differences', () => {
  it.each(['analysis', 'constructor'] as const)('%s loses the scalar suffix in a downstream star', wildcardPolicy => {
    const batch = parseBatch(producer + '; ' + consumer, resolver, { wildcardPolicy });
    expect(batch.members[0].members[0].model.trailingFields?.map(f => f.alias)).toEqual(['Маркер']);
    expect(batch.members[1].members[0].model.fields.map(f => f.path)).toEqual(['Код']);
    const output = generateBatch({ members: [batch.members[1]] }, { wildcardPolicy });
    expect(output).toContain('Б.Код');
    expect(output).not.toContain('Маркер');
  });

  it('exposes the same downstream loss in the actual semantic snapshot', () => {
    const snapshot = buildSemanticSnapshotFromText(1, producer + '; ' + consumer, resolver);
    expect(snapshot.model?.members[1].members[0].model.fields.map(f => f.path)).toEqual(['Код']);
  });

  it.each([
    'ВЫБРАТЬ 1 КАК Код ПОМЕСТИТЬ Исходная; ВЫБРАТЬ Н.*, 1 КАК Маркер ПОМЕСТИТЬ ВТ ИЗ Исходная КАК Н',
    'ВЫБРАТЬ Н.*, 1 КАК Маркер ПОМЕСТИТЬ ВТ ИЗ (ВЫБРАТЬ 1 КАК Код) КАК Н',
  ])('preserves the scalar suffix through real Designer open/Apply/reopen: %s', source => {
    let text = source + '; ' + consumer;
    for (let cycle = 0; cycle < 3; cycle++) {
      const open = tryOpenDesignerBatch(text);
      expect(open.ok).toBe(true);
      if (!open.ok) throw new Error(open.error);
      const index = open.doc.members.length - 1;
      const state = reducer(reducer(initialState(), { type: 'LOAD_BATCH', doc: open.doc }),
        { type: 'SET_ACTIVE_BATCH', index });
      expect(availableTempTables(state).find(t => t.fullName === 'ВТ')?.fields.map(f => f.name))
        .toEqual(['Код', 'Маркер']);
      const output = computeBatchTextSafe(state, true);
      expect(output.text).toContain('Б.Код');
      expect(output.text).toContain('Б.Маркер');
      expect(decideApply(output.text, output.error, findStaticApplyBlocker(state), undefined)).toEqual({ ok: true });
      text = output.text;
    }
  });

  it('offers the unresolved catalog star as a fake column in the production Designer table list', () => {
    const open = tryOpenDesignerBatch(producer + '; ' + consumer, resolver);
    expect(open.ok).toBe(true);
    if (!open.ok) throw new Error(open.error);
    const state = reducer(reducer(initialState(), { type: 'LOAD_BATCH', doc: open.doc }),
      { type: 'SET_ACTIVE_BATCH', index: 1 });
    expect(availableTempTables(state).find(t => t.fullName === 'ВТ')?.fields.map(f => f.name))
      .toEqual(['Н.*', 'Маркер']);
    expect(computeBatchTextSafe(state, true).text).toContain('Н.*');
  });
});
