import { describe, expect, it } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { buildSemanticSnapshotFromText } from '../../src/core/semantic/buildSemanticSnapshot';
import { tryOpenDesignerBatch } from '../../src/webview/openDesignerBatch';
import { initialState, reducer } from '../../src/webview/state/queryStore';
import { computeBatchTextSafe } from '../../src/webview/computeBatchText';
import { decideApply, findStaticApplyBlocker } from '../../src/webview/applyGate';
import type { MetadataResolver } from '../../src/core/query/metadataResolver';

const redefine = 'ВЫБРАТЬ 1 КАК Старое ПОМЕСТИТЬ ВТ; '
  + 'ВЫБРАТЬ Н.* ПОМЕСТИТЬ вт ИЗ Неизвестная КАК Н; ';
const child = 'ВЫБРАТЬ ВТ.Старое {ВЫБРАТЬ ВТ.Старое.*} ИЗ ВТ';

describe('A2 temp redefinition with unknown columns', () => {
  it.each(['preserve', 'analysis'] as const)('%s keeps the unresolved wildcard instead of using old columns', wildcardPolicy => {
    const batch = parseBatch(redefine + 'ВЫБРАТЬ ВТ.* ИЗ ВТ', undefined, { wildcardPolicy });
    expect(batch.members.at(-1)!.members[0].model.fields).toMatchObject([{ expression: 'ВТ.*' }]);
  });

  it.each(['preserve', 'analysis', 'constructor'] as const)('%s does not reuse the old literal non-reference marker', wildcardPolicy => {
    const batch = parseBatch(redefine + child, undefined, { wildcardPolicy });
    expect(generateBatch(batch, { wildcardPolicy })).toContain('ВТ.Старое.*');
  });

  it('also shadows old columns in the undefined-temp second parse pass', () => {
    const text = 'ВЫБРАТЬ У.Код ИЗ Неопределенная КАК У; ' + redefine + child;
    expect(generateBatch(parseBatch(text))).toContain('ВТ.Старое.*');
  });

  it('does not fall through to external metadata for the redefined name', () => {
    const resolver: MetadataResolver = {
      tableByFullName: name => name.toUpperCase() === 'ВТ' ? {
        kind: 'ВременнаяТаблица', name: 'ВТ', fullName: 'ВТ',
        fields: [{ name: 'Внешнее', kind: 'attribute', types: [] }],
      } : undefined,
    };
    const batch = parseBatch(redefine + 'ВЫБРАТЬ ВТ.* ИЗ ВТ', resolver, { wildcardPolicy: 'analysis' });
    expect(batch.members.at(-1)!.members[0].model.fields).toMatchObject([{ expression: 'ВТ.*' }]);
  });

  it('shadows inferred pre-create columns when the first definition has unknown columns', () => {
    const text = 'ВЫБРАТЬ ВТ.Внешнее ИЗ ВТ; '
      + 'ВЫБРАТЬ Н.* ПОМЕСТИТЬ ВТ ИЗ Неизвестная КАК Н; ВЫБРАТЬ ВТ.* ИЗ ВТ';
    const batch = parseBatch(text, undefined, { wildcardPolicy: 'analysis' });
    expect(batch.members.at(-1)!.members[0].model.fields).toMatchObject([{ expression: 'ВТ.*' }]);
  });

  it('append with unknown columns does not replace the creator schema', () => {
    const text = 'ВЫБРАТЬ 1 КАК Код ПОМЕСТИТЬ ВТ; '
      + 'ВЫБРАТЬ Н.* ДОБАВИТЬ ВТ ИЗ Неизвестная КАК Н; ВЫБРАТЬ ВТ.* ИЗ ВТ';
    const batch = parseBatch(text);
    expect(batch.members.at(-1)!.members[0].model.fields.map(f => f.path)).toEqual(['Код']);
  });

  it('keeps the unknown shape in the IDE semantic snapshot', () => {
    const snapshot = buildSemanticSnapshotFromText(1, redefine + 'ВЫБРАТЬ ВТ.* ИЗ ВТ');
    expect(snapshot.model?.members.at(-1)!.members[0].model.fields).toMatchObject([{ expression: 'ВТ.*' }]);
  });

  it('preserves the builder child marker through Designer, Apply and reopen', () => {
    let text = redefine + child;
    for (let cycle = 0; cycle < 3; cycle++) {
      const open = tryOpenDesignerBatch(text);
      expect(open.ok).toBe(true);
      if (!open.ok) throw new Error(open.error);
      const state = reducer(initialState(), { type: 'LOAD_BATCH', doc: open.doc });
      const output = computeBatchTextSafe(state, true);
      expect(output.text).toContain('ВТ.Старое.*');
      expect(decideApply(output.text, output.error, findStaticApplyBlocker(state), undefined)).toEqual({ ok: true });
      text = output.text;
    }
  });

  it('still uses a known literal schema and a later known recreation', () => {
    expect(generateBatch(parseBatch('ВЫБРАТЬ 1 КАК Старое ПОМЕСТИТЬ ВТ; ' + child)))
      .not.toContain('ВТ.Старое.*');
    const recreated = parseBatch(redefine + 'УНИЧТОЖИТЬ ВТ; ВЫБРАТЬ 2 КАК Новое ПОМЕСТИТЬ ВТ; ВЫБРАТЬ ВТ.* ИЗ ВТ');
    expect(recreated.members.at(-1)!.members[0].model.fields.map(f => f.path)).toEqual(['Новое']);
  });
});
