import { describe, expect, it } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { assembleBatch, buildModelFromFlat, initialState, modelToFlat, reducer, restoreSaved, snapshotActive } from '../../src/webview/state/queryStore';
import { computeBatchTextSafe } from '../../src/webview/computeBatchText';
import { decideApply, findStaticApplyBlocker } from '../../src/webview/applyGate';

const cases = [
  ['trailingFields', 'ВЫБРАТЬ З.Ссылка КАК Ссылка, З.Товары.(Номенклатура, Количество) КАК Товары, З.Предопределенный КАК Хвост ИЗ Справочник.Заказы КАК З'],
  // A parser preservation fixture, not a live 1C validity claim.
  ['characteristics', 'ВЫБРАТЬ 1 КАК Число {ХАРАКТЕРИСТИКИ\n  ТИП(Справочник.Валюты)\n}'],
] as const;
const load = (text: string) => reducer(initialState(), { type: 'LOAD_BATCH', doc: parseBatch(text) });

for (const [property, input] of cases) {
  describe(`C10: preserve ${property}`, () => {
    it('converts and serializes the populated property without changing its contents', () => {
      const model = parseBatch(input).members[0].members[0].model;
      expect(model[property]).toBeDefined();
      const saved = JSON.parse(JSON.stringify(modelToFlat(model)));
      expect(buildModelFromFlat(saved)[property]).toEqual(model[property]);
      const state = load(input);
      const snapshot = JSON.parse(JSON.stringify(snapshotActive(state)));
      const restored = { ...initialState(), ...restoreSaved(initialState(), snapshot) };
      expect(assembleBatch(restored).members[0].members[0].model[property]).toEqual(model[property]);
    });

    it('load/assemble/reopen preserves direct core output', () => {
      const output = generateBatch(assembleBatch(load(input)));
      expect(output).toBe(generateBatch(parseBatch(input)));
      expect(generateBatch(assembleBatch(load(output)))).toBe(output);
    });

    it('preserves the property while editing another field and applying the result', () => {
      const expected = parseBatch(input);
      expected.members[0].members[0].model.fields[0].alias = 'НовоеИмя';
      const state = reducer(load(input), { type: 'SET_FIELD_ALIAS', fieldIdx: 0, alias: 'НовоеИмя' });
      const preview = computeBatchTextSafe(state, true);
      expect(preview.text).toBe(generateBatch(expected));
      expect(decideApply(preview.text, preview.error, findStaticApplyBlocker(state), undefined)).toEqual({ ok: true });
    });

    it('keeps distinct values through UNION and batch snapshot switches', () => {
      const doc = parseBatch(`${input} ОБЪЕДИНИТЬ ВСЕ ${input}; ${input}`);
      // Distinguish every preserved value, so restoring the wrong member fails.
      doc.members.forEach((batch, i) => batch.members.forEach((member, j) => {
        if (member.model.trailingFields) member.model.trailingFields[0].alias = `Хвост${i}${j}`;
        if (member.model.characteristics) member.model.characteristics += `\n${' '.repeat(i + j + 1)}`;
      }));
      const expected = generateBatch(doc);
      let state = reducer(initialState(), { type: 'LOAD_BATCH', doc });
      for (const action of [
        { type: 'SET_ACTIVE_QUERY', index: 1 },
        { type: 'SET_ACTIVE_BATCH', index: 1 },
        { type: 'SET_ACTIVE_BATCH', index: 0 },
        { type: 'SET_ACTIVE_QUERY', index: 0 },
      ] as const) {
        state = reducer(state, action);
        expect(generateBatch(assembleBatch(state))).toBe(expected);
        expect(assembleBatch(state).members.map(b => b.members.map(m => m.model[property])))
          .toEqual(doc.members.map(b => b.members.map(m => m.model[property])));
      }
    });

    it.each(['ADD_QUERY', 'ADD_BATCH_QUERY'] as const)('%s clears the new active value and preserves the old query', type => {
      const state = reducer(load(input), { type });
      const assembled = assembleBatch(state);
      expect(assembled.members[0].members[0].model[property]).toEqual(parseBatch(input).members[0].members[0].model[property]);
      const active = type === 'ADD_QUERY' ? assembled.members[0].members[1] : assembled.members[1].members[0];
      expect(active.model[property]).toBeUndefined();
    });

    it('loading a plain or empty batch clears the previous value', () => {
      for (const doc of [parseBatch('ВЫБРАТЬ 1 КАК Число'), { members: [] }]) {
        const state = reducer(load(input), { type: 'LOAD_BATCH', doc });
        expect(assembleBatch(state).members[0].members[0].model[property]).toBeUndefined();
      }
    });

    it('restores an older snapshot with neither optional property, clearing previous values', () => {
      const older = modelToFlat(parseBatch(input).members[0].members[0].model);
      delete older.trailingFields;
      delete older.characteristics;
      const state = load(input);
      const restored = { ...state, ...restoreSaved(state, JSON.parse(JSON.stringify(older))) };
      const model = assembleBatch(restored).members[0].members[0].model;
      expect(model.trailingFields).toBeUndefined();
      expect(model.characteristics).toBeUndefined();
    });
  });
}

it('preserves malformed trailing expressions so the existing static Apply guard can reject them', () => {
  const doc = parseBatch(cases[0][1]);
  doc.members[0].members[0].model.trailingFields![0] = { tableId: 't0', path: '', alias: 'Хвост', expression: 'З.Количество + &' };
  const state = reducer(initialState(), { type: 'LOAD_BATCH', doc });
  const preview = computeBatchTextSafe(state, true);
  expect(preview.text).toContain('З.Количество + &');
  expect(findStaticApplyBlocker(state)).toEqual({ kind: 'malformedCustom' });
  expect(decideApply(preview.text, preview.error, findStaticApplyBlocker(state), undefined)).toEqual({ ok: false, kind: 'blocked' });
});
