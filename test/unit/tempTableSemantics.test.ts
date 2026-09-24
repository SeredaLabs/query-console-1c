import { describe, expect, it } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import {
  deriveTempTableLifetimes,
  visibleTempTableAt,
} from '../../src/core/query/tempTableSemantics';

function visible(text: string, statementIndex: number, name = 'ВТ_Данные') {
  const batch = parseBatch(text);
  return visibleTempTableAt(deriveTempTableLifetimes(batch), statementIndex, name);
}

describe('temp-table semantic lifetimes', () => {
  it('producer is not visible to itself, but its inferred columns are visible later', () => {
    const text =
      'ВЫБРАТЬ 1 КАК Код, 2 КАК Код ПОМЕСТИТЬ ВТ_Данные; ' +
      'ВЫБРАТЬ ВТ.Код ИЗ ВТ_Данные КАК ВТ';
    const lifetimes = deriveTempTableLifetimes(parseBatch(text));

    expect(visibleTempTableAt(lifetimes, 0, 'ВТ_Данные')).toBeUndefined();
    expect(visibleTempTableAt(lifetimes, 1, 'вт_данные')).toMatchObject({
      complete: true,
      table: {
        kind: 'ВременнаяТаблица',
        fields: [{ name: 'Код' }, { name: 'Код1' }],
      },
    });
  });

  it('append keeps the creator schema, drop closes it, recreate opens a new schema', () => {
    const text = [
      'ВЫБРАТЬ 1 КАК Старое ПОМЕСТИТЬ ВТ_Данные',
      'ВЫБРАТЬ 2 КАК Старое ДОБАВИТЬ ВТ_Данные',
      'УНИЧТОЖИТЬ ВТ_Данные',
      'ВЫБРАТЬ 3 КАК Новое ПОМЕСТИТЬ ВТ_Данные',
      'ВЫБРАТЬ ВТ.Новое ИЗ ВТ_Данные КАК ВТ',
    ].join('; ');
    const lifetimes = deriveTempTableLifetimes(parseBatch(text));

    expect(visibleTempTableAt(lifetimes, 1, 'ВТ_Данные')?.table.fields.map(f => f.name)).toEqual(['Старое']);
    expect(visibleTempTableAt(lifetimes, 2, 'ВТ_Данные')?.table.fields.map(f => f.name)).toEqual(['Старое']);
    expect(visibleTempTableAt(lifetimes, 3, 'ВТ_Данные')).toBeUndefined();
    expect(visibleTempTableAt(lifetimes, 4, 'ВТ_Данные')?.table.fields.map(f => f.name)).toEqual(['Новое']);
  });

  it('uses the first UNION member output names', () => {
    const schema = visible(
      'ВЫБРАТЬ 1 КАК Первая ПОМЕСТИТЬ ВТ_Данные ОБЪЕДИНИТЬ ВСЕ ВЫБРАТЬ 2 КАК Другая; ' +
      'ВЫБРАТЬ ВТ.Первая ИЗ ВТ_Данные КАК ВТ',
      1,
    );
    expect(schema?.table.fields.map(f => f.name)).toEqual(['Первая']);
  });

  it('marks an unresolved star schema incomplete instead of claiming missing fields', () => {
    const schema = visible(
      'ВЫБРАТЬ Н.* ПОМЕСТИТЬ ВТ_Данные ИЗ НеизвестнаяТаблица КАК Н; ' +
      'ВЫБРАТЬ ВТ.ЧтоУгодно ИЗ ВТ_Данные КАК ВТ',
      1,
    );
    expect(schema).toMatchObject({ complete: false, table: { fields: [] } });
  });
});
