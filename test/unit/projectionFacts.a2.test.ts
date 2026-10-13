import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { QueryModel, SelectedTabSectionField } from '../../src/core/query/queryModel';
import { deriveProjectionFacts, deriveUnionColumns, selectColumnAliases } from '../../src/core/query/unionModel';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { inferCreatedTempTableSchema } from '../../src/core/query/tempTableSemantics';
import { availableTempTables, initialState, reducer } from '../../src/webview/state/queryStore';

function tabular(selectOrder?: number): SelectedTabSectionField {
  return {
    tableId: 't', tsName: 'Товары', tsFullName: 'Документ.Р.Товары',
    fields: ['Номенклатура'], alias: 'Строки', selectOrder,
  };
}

describe('A2 derived projection facts (no schema switch)', () => {
  it('keeps mixed print order, nested identity and the unchanged source model', () => {
    const nested = tabular(2);
    const model: QueryModel = {
      tables: [], fields: [{ tableId: '', path: 'ID' }],
      tabSectionFields: [nested],
      trailingFields: [
        { tableId: '', path: '', expression: '2', selectOrder: 3 },
        { tableId: '', path: '', expression: '1', selectOrder: 1 },
      ],
    };
    const before = structuredClone(model);
    const facts = deriveProjectionFacts(model);
    expect(facts.map(f => f.outputName)).toEqual(['ID', 'Поле1', 'Строки', 'Поле2']);
    expect(facts.map(f => f.element.kind)).toEqual(['field', 'field', 'ts', 'field']);
    expect(facts[2].element).toEqual({ kind: 'ts', tsf: nested });
    expect(facts[2].element.kind === 'ts' && facts[2].element.tsf).toBe(nested);
    expect(model).toEqual(before);
  });

  it('retains bucket order if any selectOrder is absent', () => {
    const model: QueryModel = {
      tables: [], fields: [], tabSectionFields: [tabular()],
      trailingFields: [{ tableId: '', path: 'Хвост', selectOrder: 0 }],
    };
    expect(deriveProjectionFacts(model).map(f => f.outputName)).toEqual(['Строки', 'Хвост']);
  });

  it('reserves names across the whole projection, even for scalar-head consumers', () => {
    const model: QueryModel = {
      tables: [], fields: [{ tableId: '', path: '', expression: '1' }],
      tabSectionFields: [{ ...tabular(), alias: 'Поле1' }],
      trailingFields: [{ tableId: '', path: '', expression: '2' }],
    };
    expect(deriveProjectionFacts(model).map(f => f.outputName)).toEqual(['Поле2', 'Поле1', 'Поле3']);
    expect(selectColumnAliases(model.fields, model)).toEqual(['Поле2']);
  });

  it('does not convert a kept wildcard into a column or claim schema completeness', () => {
    const batch = parseBatch('ВЫБРАТЬ Н.*, 1 КАК Код ПОМЕСТИТЬ ВТ ИЗ Неизвестная КАК Н');
    const facts = deriveProjectionFacts(batch.members[0].members[0].model);
    expect(facts.map(f => f.outputName)).toEqual([undefined, 'Код']);
    expect(inferCreatedTempTableSchema(batch.members[0])).toMatchObject({ complete: false });
  });

  it('known output names do not make unfinished expressions a complete schema', () => {
    const batch = parseBatch('ВЫБРАТЬ 1 КАК Код, ВЫБОР КОГДА ИСТИНА ПОМЕСТИТЬ ВТ');
    expect(deriveProjectionFacts(batch.members[0].members[0].model).map(f => f.outputName))
      .toEqual(['Код', 'Поле1']);
    expect(inferCreatedTempTableSchema(batch.members[0])).toMatchObject({ complete: false });
  });

  it('leaves UNION names owned by the first member', () => {
    const batch = parseBatch('ВЫБРАТЬ 1 КАК Первая ПОМЕСТИТЬ ВТ ОБЪЕДИНИТЬ ВСЕ ВЫБРАТЬ 2 КАК Другая');
    // parseDocument already aligns later member aliases with member 0.
    expect(batch.members[0].members.map(m => deriveProjectionFacts(m.model).map(f => f.outputName)))
      .toEqual([['Первая'], ['Первая']]);
    expect(deriveUnionColumns(batch.members[0].members).map(c => c.alias)).toEqual(['Первая']);
    expect(inferCreatedTempTableSchema(batch.members[0])?.table.fields.map(f => f.name)).toEqual(['Первая']);
  });

  it('preserves the current semantic/Designer boundary for a platform-invalid producer', () => {
    // The platform rejects this nested INTO shape (a2-nested-projection-temp.json).
    // Pin current internal behavior until diagnostics/schema changes are scoped separately.
    const text = 'ВЫБРАТЬ Т.Ссылка КАК ID, Т.Товары.(Номенклатура КАК Номенклатура) КАК Строки, '
      + '1 КАК Хвост ПОМЕСТИТЬ ВТ_Аудит ИЗ Документ.Р КАК Т; '
      + 'ВЫБРАТЬ ВТ.ID ИЗ ВТ_Аудит КАК ВТ';
    const batch = parseBatch(text);
    const producer = batch.members[0];
    expect(deriveProjectionFacts(producer.members[0].model).map(f => f.outputName))
      .toEqual(['ID', 'Строки', 'Хвост']);
    expect(inferCreatedTempTableSchema(producer)?.table.fields.map(f => f.name))
      .toEqual(['ID', 'Строки', 'Хвост']);
    expect(deriveUnionColumns(producer.members).map(c => c.alias)).toEqual(['ID']);
    let state = reducer(initialState(), { type: 'LOAD_BATCH', doc: batch });
    state = reducer(state, { type: 'SET_ACTIVE_BATCH', index: 1 });
    expect(availableTempTables(state).find(t => t.fullName === 'ВТ_Аудит')?.fields.map(f => f.name))
      .toEqual(['ID']);
    const output = generateBatch(batch);
    expect(output.indexOf('КАК ID')).toBeLessThan(output.indexOf('КАК Строки'));
    expect(output.indexOf('КАК Строки')).toBeLessThan(output.indexOf('КАК Хвост'));
  });

  it('has no columns for an empty projection', () => {
    expect(deriveProjectionFacts({ tables: [], fields: [] })).toEqual([]);
  });

  it('leaves duplicate explicit names for schema adapters to handle', () => {
    const batch = parseBatch('ВЫБРАТЬ 1 КАК Код, 2 КАК Код ПОМЕСТИТЬ ВТ');
    expect(deriveProjectionFacts(batch.members[0].members[0].model).map(f => f.outputName))
      .toEqual(['Код', 'Код']);
    expect(inferCreatedTempTableSchema(batch.members[0])?.table.fields.map(f => f.name))
      .toEqual(['Код', 'Код1']);
  });
});

// Recorded platform results, not live validation or a claim of local rejection.
const platform = JSON.parse(readFileSync(resolve(__dirname,
  '../fixtures/platform/a2-nested-projection-temp.json'), 'utf8')) as {
  cases: Array<{ name: string; query: string; valid: boolean; executeColumns?: string[] }>;
};
describe('A2 platform-valid projection controls', () => {
  it.each(platform.cases.filter(c => c.valid))('$name keeps result column names', entry => {
    const batch = parseBatch(entry.query);
    const result = batch.members[batch.members.length - 1].members[0].model;
    expect(deriveProjectionFacts(result).map(f => f.outputName)).toEqual(entry.executeColumns);
  });
});
