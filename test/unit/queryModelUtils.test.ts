import { describe, it, expect } from 'vitest';
import {
  resolveAliases,
  isTabularSectionSource,
  qualifiedAutoAlias,
  synthesizedFieldAlias,
  joinKeyword,
} from '../../src/core/query/queryModelUtils';
import type { QueryModel, SelectedField, SelectedTable } from '../../src/core/query/queryModel';

// Целевые тесты извлечённых из sdblGenerator.ts model-level utilities (dependency
// refactoring: unionModel/qualifyBareFields/queryAnalysisService больше не зависят
// от sdblGenerator ради них). Поведение НЕ менялось — это те же тела функций,
// защищённые раньше только косвенно (round-trip/golden generator-тесты). Здесь —
// прямая, точечная защита самих правил.

describe('resolveAliases', () => {
  it('явный alias источника используется как есть', () => {
    const tables: SelectedTable[] = [{ id: 't1', fullName: 'Справочник.Валюты', alias: 'МойАлиас' }];
    expect(resolveAliases(tables)).toEqual(new Map([['t1', 'МойАлиас']]));
  });

  it('без явного alias — дефолтный псевдоним по имени таблицы', () => {
    const tables: SelectedTable[] = [{ id: 't1', fullName: 'Справочник.Валюты' }];
    expect(resolveAliases(tables)).toEqual(new Map([['t1', 'Валюты']]));
  });

  it('коллизия дефолтных псевдонимов дедуплицируется числовым суффиксом (по порядку таблиц)', () => {
    const tables: SelectedTable[] = [
      { id: 't1', fullName: 'Справочник.Валюты' },
      { id: 't2', fullName: 'Справочник.Валюты' },
      { id: 't3', fullName: 'Справочник.Валюты' },
    ];
    expect(resolveAliases(tables)).toEqual(new Map([
      ['t1', 'Валюты'],
      ['t2', 'Валюты1'],
      ['t3', 'Валюты2'],
    ]));
  });

  it('явный alias одной таблицы участвует в дедупликации дефолтных псевдонимов следующих', () => {
    const tables: SelectedTable[] = [
      { id: 't1', fullName: 'Справочник.Прочее', alias: 'Валюты' },
      { id: 't2', fullName: 'Справочник.Валюты' },
    ];
    // t1 занял "Валюты" явным alias — дефолтный псевдоним t2 получает суффикс.
    expect(resolveAliases(tables)).toEqual(new Map([
      ['t1', 'Валюты'],
      ['t2', 'Валюты1'],
    ]));
  });
});

describe('isTabularSectionSource / qualifiedAutoAlias', () => {
  it('3+-сегментный источник (не подзапрос/виртуальная таблица) — табличная часть', () => {
    expect(isTabularSectionSource({ id: 't1', fullName: 'Справочник.Заказ.Товары' })).toBe(true);
  });

  it('2-сегментный источник — не табличная часть', () => {
    expect(isTabularSectionSource({ id: 't1', fullName: 'Справочник.Валюты' })).toBe(false);
  });

  it('виртуальная таблица регистра (3+ сегмента, virtual) — не табличная часть', () => {
    expect(isTabularSectionSource({ id: 't1', fullName: 'РегистрНакопления.X.Остатки', virtual: {} } as SelectedTable)).toBe(false);
  });

  it('подзапрос — не табличная часть', () => {
    expect(isTabularSectionSource({ id: 't1', fullName: 'Справочник.Заказ.Товары', subquery: {} } as SelectedTable)).toBe(false);
  });

  it('undefined источник — не табличная часть', () => {
    expect(isTabularSectionSource(undefined)).toBe(false);
  });

  it('qualifiedAutoAlias: склейка сегментов пути', () => {
    expect(qualifiedAutoAlias('Родитель.Имя', false)).toBe('РодительИмя');
  });

  it('qualifiedAutoAlias: ведущий Ссылка отбрасывается только для источника-ТЧ', () => {
    expect(qualifiedAutoAlias('Ссылка.Контрагент', true)).toBe('Контрагент');
    expect(qualifiedAutoAlias('Ссылка.Наименование', false)).toBe('СсылкаНаименование');
  });
});

describe('synthesizedFieldAlias', () => {
  const model: QueryModel = {
    tables: [
      { id: 't1', fullName: 'Справочник.Контрагенты' },
      { id: 'ts1', fullName: 'Документ.Заказ.Товары' },
    ],
    fields: [],
  };

  it('голое поле (не qualified) — последний сегмент пути', () => {
    const field: SelectedField = { tableId: 't1', path: 'Владелец.Наименование', qualified: false };
    expect(synthesizedFieldAlias(model, field)).toBe('Наименование');
  });

  it('квалифицированное поле обычного источника — склейка сегментов, Ссылка сохраняется', () => {
    const field: SelectedField = { tableId: 't1', path: 'Ссылка.Наименование', qualified: true };
    expect(synthesizedFieldAlias(model, field)).toBe('СсылкаНаименование');
  });

  it('квалифицированное поле источника-ТЧ — ведущий Ссылка отбрасывается', () => {
    const field: SelectedField = { tableId: 'ts1', path: 'Ссылка.Контрагент', qualified: true };
    expect(synthesizedFieldAlias(model, field)).toBe('Контрагент');
  });

  it('autoAliasDotted — полный путь дословно, без склейки', () => {
    const field: SelectedField = { tableId: 't1', path: 'СтавкаНДС.Перечисление', qualified: true, autoAliasDotted: true };
    expect(synthesizedFieldAlias(model, field)).toBe('СтавкаНДС.Перечисление');
  });
});

describe('joinKeyword', () => {
  it('leftAll && rightAll → ПОЛНОЕ', () => {
    expect(joinKeyword(true, true)).toBe('ПОЛНОЕ');
  });

  it('leftAll && !rightAll → ЛЕВОЕ', () => {
    expect(joinKeyword(true, false)).toBe('ЛЕВОЕ');
  });

  it('!leftAll && rightAll → ПРАВОЕ', () => {
    expect(joinKeyword(false, true)).toBe('ПРАВОЕ');
  });

  it('!leftAll && !rightAll → ВНУТРЕННЕЕ', () => {
    expect(joinKeyword(false, false)).toBe('ВНУТРЕННЕЕ');
  });
});
