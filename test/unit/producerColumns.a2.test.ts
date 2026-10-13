import { describe, expect, it } from 'vitest';
import type { QueryModel, SelectedField } from '../../src/core/query/queryModel';
import { deriveProducerColumns } from '../../src/core/query/producerColumns';

const field = (alias: string): SelectedField => ({ tableId: '', path: '', expression: '1', alias });

describe('A2 shared producer columns: existing compatibility boundaries', () => {
  it('keeps registry duplicates but deduplicates Designer and semantic names case-insensitively', () => {
    const model: QueryModel = { tables: [], fields: [field('Код'), field('код'), field('код1')] };
    expect(deriveProducerColumns(model, 'parser-registry').columns.map(c => c.name)).toEqual(['Код', 'код', 'код1']);
    for (const policy of ['designer', 'semantic'] as const) {
      expect(deriveProducerColumns(model, policy).columns.map(c => c.name)).toEqual(['Код', 'код1', 'код11']);
    }
  });

  it('retains the Designer matching-key fallback for an unresolved qualified star', () => {
    const model: QueryModel = {
      tables: [], fields: [{ tableId: '', path: '', expression: 'Н.*' }, field('Код')],
    };
    expect(deriveProducerColumns(model, 'parser-registry').columns.map(c => c.name)).toEqual(['Код']);
    expect(deriveProducerColumns(model, 'designer').columns.map(c => c.name)).toEqual(['Н.*', 'Код']);
    const semantic = deriveProducerColumns(model, 'semantic');
    expect(semantic.columns.map(c => c.name)).toEqual(['Код']);
    expect(semantic.complete).toBe(false);
  });

  it('preserves scalar-head boundaries while reserving names across nested and trailing projections', () => {
    const model: QueryModel = {
      tables: [], fields: [{ tableId: '', path: '', expression: '1' }],
      tabSectionFields: [{ tableId: 't', tsName: 'Товары', tsFullName: 'Документ.Р.Товары', fields: ['Код'], alias: 'Поле1', selectOrder: 1 }],
      trailingFields: [{ tableId: '', path: '', expression: '2', selectOrder: 2 }],
    };
    const before = structuredClone(model);
    for (const policy of ['parser-registry', 'designer'] as const) {
      expect(deriveProducerColumns(model, policy).columns.map(c => c.name)).toEqual(['Поле2']);
    }
    const semantic = deriveProducerColumns(model, 'semantic');
    expect(semantic.columns.map(c => c.name)).toEqual(['Поле2', 'Поле1', 'Поле3']);
    expect(semantic.columns[1].element).toEqual({ kind: 'ts', tsf: model.tabSectionFields![0] });
    expect(model).toEqual(before);
  });

  it('retains named unfinished expressions without asserting completeness', () => {
    const model: QueryModel = { tables: [], fields: [{ tableId: '', path: '', expression: 'ВЫБОР КОГДА ИСТИНА', alias: 'Результат' }] };
    expect(deriveProducerColumns(model, 'semantic')).toMatchObject({
      complete: false, columns: [{ name: 'Результат' }],
    });
    expect(deriveProducerColumns({ tables: [], fields: [] }, 'semantic'))
      .toEqual({ complete: false, columns: [] });
  });

  it('keeps empty explicit registry names and the legacy path-star semantic exclusion', () => {
    const model: QueryModel = { tables: [], fields: [field(''), { tableId: '', path: '*', alias: 'Явное' }] };
    expect(deriveProducerColumns(model, 'parser-registry').columns.map(c => c.name)).toEqual(['', 'Явное']);
    expect(deriveProducerColumns(model, 'designer').columns.map(c => c.name)).toEqual(['Явное']);
    expect(deriveProducerColumns(model, 'semantic')).toEqual({ complete: false, columns: [] });
  });

  it('preserves object-identity name lookup when the same field occurs twice', () => {
    const shared: SelectedField = { tableId: '', path: '', expression: '1' };
    const model: QueryModel = { tables: [], fields: [shared, shared] };
    const registry = deriveProducerColumns(model, 'parser-registry');
    expect(registry.columns.map(c => c.name)).toEqual(['Поле2', 'Поле2']);
    expect(registry.columns[0].element.kind === 'field' && registry.columns[0].element.field).toBe(shared);
    expect(deriveProducerColumns(model, 'semantic').columns.map(c => c.name)).toEqual(['Поле2', 'Поле21']);
  });
});
