import { describe, it, expect } from 'vitest';
import { stripBatchComments } from '../../src/webview/state/queryStore';
import type { BatchDocument } from '../../src/core/query/batchModel';
import type { QueryModel, SelectedField, SelectedTable } from '../../src/core/query/queryModel';
import type { UnionMember } from '../../src/core/query/unionModel';

const валюты: SelectedTable = { id: 't0', fullName: 'Справочник.Валюты' };

function field(overrides: Partial<SelectedField> = {}): SelectedField {
  return { tableId: 't0', path: 'Код', ...overrides };
}

function model(overrides: Partial<QueryModel> = {}): QueryModel {
  return { tables: [валюты], fields: [field()], ...overrides };
}

function member(overrides: Partial<UnionMember> = {}): UnionMember {
  return { name: 'Запрос 1', distinct: false, model: model(), ...overrides };
}

function batch(members: UnionMember[][]): BatchDocument {
  return { members: members.map(m => ({ members: m })) };
}

describe('Фаза 8.1 — stripBatchComments', () => {
  it('очищает commentLeading и commentTrailing у полей, не трогая поля без комментариев', () => {
    const withBoth = field({ path: 'Код', commentLeading: ['// ведущий'], commentTrailing: '// хвост' });
    const withLeadingOnly = field({ path: 'Наименование', commentLeading: ['// только ведущий'] });
    const withTrailingOnly = field({ path: 'Артикул', commentTrailing: '// только хвост' });
    const withNone = field({ path: 'Ссылка' });

    const doc = batch([[member({ model: model({ fields: [withBoth, withLeadingOnly, withTrailingOnly, withNone] }) })]]);
    const result = stripBatchComments(doc);
    const fields = result.members[0].members[0].model.fields;

    expect(fields).toHaveLength(4);

    expect(fields[0].commentLeading).toBeUndefined();
    expect(fields[0].commentTrailing).toBeUndefined();
    expect('commentLeading' in fields[0]).toBe(false);
    expect('commentTrailing' in fields[0]).toBe(false);
    expect(fields[0].path).toBe('Код');

    expect('commentLeading' in fields[1]).toBe(false);
    expect(fields[1].path).toBe('Наименование');

    expect('commentTrailing' in fields[2]).toBe(false);
    expect(fields[2].path).toBe('Артикул');

    // Поле без комментариев не клонируется — возвращается тот же объект.
    expect(fields[3]).toBe(withNone);
  });

  it('снимает comments у QueryModel, сохраняя остальные поля модели и name/distinct участника', () => {
    const groupedField = field({ path: 'Наименование' });
    const m = model({
      fields: [groupedField],
      grouping: { multiple: false, groupFields: [{ tableId: 't0', path: 'Наименование' }], groupSets: [], aggregates: [] },
      tempTableName: 'ВТ1',
      queryType: 'createTemp',
      comments: { beforeSelect: ['// перед ВЫБРАТЬ'], afterFrom: ['// после ИЗ'] },
    });
    const doc = batch([[member({ name: 'Пакет 1', distinct: true, model: m })]]);

    const result = stripBatchComments(doc);
    const resultMember = result.members[0].members[0];
    const resultModel = resultMember.model;

    expect(resultMember.name).toBe('Пакет 1');
    expect(resultMember.distinct).toBe(true);

    expect('comments' in resultModel).toBe(false);
    expect(resultModel.tables).toEqual([валюты]);
    expect(resultModel.tempTableName).toBe('ВТ1');
    expect(resultModel.queryType).toBe('createTemp');
    expect(resultModel.grouping).toEqual(m.grouping);
  });

  it('пустой batch (без запросов) возвращает пустой batch', () => {
    const doc: BatchDocument = { members: [] };
    const result = stripBatchComments(doc);
    expect(result).toEqual({ members: [] });
  });

  it('запрос без каких-либо comment-полей возвращается структурно без изменений', () => {
    const plainField = field({ path: 'Код', alias: 'КодВалюты' });
    const m = model({ fields: [plainField] });
    const doc = batch([
      [member({ model: m }), member({ name: 'Запрос 2', model: model({ fields: [field({ path: 'Наименование' })] }) })],
      [member({ name: 'Пакет 2', model: model() })],
    ]);

    const result = stripBatchComments(doc);

    // Структура (кол-во запросов пакета и участников объединения) сохранена.
    expect(result.members).toHaveLength(2);
    expect(result.members[0].members).toHaveLength(2);
    expect(result.members[1].members).toHaveLength(1);

    const resultField = result.members[0].members[0].model.fields[0];
    expect(resultField.alias).toBe('КодВалюты');
    expect(resultField.tableId).toBe('t0');
    expect('commentLeading' in resultField).toBe(false);
    expect('commentTrailing' in resultField).toBe(false);
    expect('comments' in result.members[0].members[0].model).toBe(false);
  });
});
