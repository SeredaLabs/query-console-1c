import { describe, it, expect } from 'vitest';
import { isIdentifierName } from '../../src/core/query/sdblLexer';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generate, generateBatch } from '../../src/core/query/sdblGenerator';
import { bareParamName, representationArgPath } from '../../src/core/query/exprAutoAlias';
import { deriveUnionColumns } from '../../src/core/query/unionModel';
import type { QueryModel } from '../../src/core/query/queryModel';

/**
 * A1: алфавит идентификатора принадлежит лексеру (`\p{L}`/`\p{N}`/`_`). Автопсевдонимы
 * и проверка псевдонима читают лексические факты, а не держат свои копии
 * `[A-Za-zА-Яа-яЁё_]` (из-за них `&Ціна`/`&Gültig` получали `Поле1`).
 *
 * Эталон — 1С (SL_kza, 2026-10-09/10): `execute_query` даёт колонки `Ціна`, `Gültig`,
 * `ЦінаПредставление`, `GültigПредставление`; штатный конструктор печатает тексты ниже
 * (ОК → текст; для `&Gültig` повторное открытие из консоли → ОК → тот же текст).
 */
const NATIVE_PARAM: Array<[string, string]> = [
  ['Цена', 'ВЫБРАТЬ\n\t&Цена КАК Цена'],
  ['Ціна', 'ВЫБРАТЬ\n\t&Ціна КАК Ціна'],
  ['Gültig', 'ВЫБРАТЬ\n\t&Gültig КАК Gültig'],
];

const NATIVE_REPRESENTATION = [
  'ВЫБРАТЬ',
  '\t"x" КАК Ціна',
  'ПОМЕСТИТЬ ВТ',
  ';',
  '',
  '////////////////////////////////////////////////////////////////////////////////',
  'ВЫБРАТЬ',
  '\tПРЕДСТАВЛЕНИЕ(ВТ.Ціна) КАК ЦінаПредставление',
  'ИЗ',
  '\tВТ КАК ВТ',
].join('\n');

function firstModel(text: string): QueryModel {
  const b = parseBatch(text) as unknown as { members: Array<{ members: Array<{ model: QueryModel }> }> };
  return b.members[0].members[0].model;
}

describe('isIdentifierName — алфавит идентификатора из лексера', () => {
  it('принимает идентификаторы любого алфавита и слова-ключевые (как прежний ALIAS_RE)', () => {
    for (const s of ['Цена', 'Ціна', 'Gültig', 'Straße', 'Ёлка', '_x', 'Поле1', 'Выбрать']) {
      expect(isIdentifierName(s), s).toBe(true);
    }
  });
  it('отвергает всё, что не один токен-идентификатор', () => {
    for (const s of ['', ' ', '1а', '123', 'а б', 'Т.А', '#Имя', '&А', '"x"', 'А // к', 'А-Б']) {
      expect(isIdentifierName(s), JSON.stringify(s)).toBe(false);
    }
  });
});

describe('bareParamName — голый параметр по токену лексера', () => {
  it('имя единственного param-токена', () => {
    expect(bareParamName('&Цена')).toBe('Цена');
    expect(bareParamName('  &Ціна\n')).toBe('Ціна');
    expect(bareParamName('&Gültig')).toBe('Gültig');
  });
  it('не голый параметр / имя не идентификатор → undefined', () => {
    for (const s of ['&123', '&Ціна + 1', '&Ціна // к', '&А.Б', 'Ціна', '"&Ціна"', '&', '']) {
      expect(bareParamName(s), JSON.stringify(s)).toBeUndefined();
    }
  });
});

describe('голый параметр: автопсевдоним = имя параметра (эталон конструктора)', () => {
  for (const [name, native] of NATIVE_PARAM) {
    it(`&${name}: модель, текст конструктора и стабильность повторного открытия`, () => {
      const text = `ВЫБРАТЬ &${name}`;
      expect(firstModel(text).fields[0].alias).toBe(name);
      const g1 = generateBatch(parseBatch(text));
      expect(g1).toBe(native);
      expect(generateBatch(parseBatch(g1))).toBe(g1);
    });

    it(`&${name}: генератор без псевдонима в модели (поле из UI) и колонка объединения`, () => {
      const model = { tables: [], fields: [{ tableId: '', path: '', expression: `&${name}` }] } as unknown as QueryModel;
      expect(generate(model)).toBe(native);
      expect(deriveUnionColumns([{ name: 'Запрос 1', distinct: false, model }]).map(c => c.alias)).toEqual([name]);
    });
  }

  it('явный псевдоним сохраняется', () => {
    expect(generateBatch(parseBatch('ВЫБРАТЬ &Ціна КАК Х'))).toBe('ВЫБРАТЬ\n\t&Ціна КАК Х');
    expect(generateBatch(parseBatch('ВЫБРАТЬ &Gültig КАК Х'))).toBe('ВЫБРАТЬ\n\t&Gültig КАК Х');
  });

  it('имя параметра, не являющееся идентификатором, по-прежнему даёт Поле{n}', () => {
    expect(generateBatch(parseBatch('ВЫБРАТЬ &123'))).toBe('ВЫБРАТЬ\n\t&123 КАК Поле1');
  });
});

describe('ПРЕДСТАВЛЕНИЕ(<поле>) без КАК → <Сегмент>Представление', () => {
  // C30: the argument path is a lexical fact; the name is built by `columnNames`.
  it('сегменты любого алфавита', () => {
    expect(representationArgPath('ПРЕДСТАВЛЕНИЕ(ВТ.Ціна)')).toEqual(['ВТ', 'Ціна']);
    expect(representationArgPath('представлениессылки( Т.Gültig )')).toEqual(['Т', 'Gültig']);
    expect(representationArgPath('ПРЕДСТАВЛЕНИЕ(Т.Номенклатура)')).toEqual(['Т', 'Номенклатура']);
  });
  it('не путь из имён → undefined', () => {
    for (const s of ['ПРЕДСТАВЛЕНИЕ(Т.А + 1)', 'ПРЕДСТАВЛЕНИЕ("Т.А")', 'ПРЕДСТАВЛЕНИЕ(Т.)', 'ПРЕДСТАВЛЕНИЕ(Т.А) + 1',
      'ПРЕДСТАВЛЕНИЕ(Т.А // к\n)', 'ПРЕДСТАВЛЕНИЕ(&П)', 'ПРЕДСТАВЛЕНИЕ()', 'ДРУГОЕ(Т.А)']) {
      expect(representationArgPath(s), JSON.stringify(s)).toBeUndefined();
    }
  });
  it('пакет: текст конструктора и стабильность повторного открытия', () => {
    const g1 = generateBatch(parseBatch('ВЫБРАТЬ "x" КАК Ціна ПОМЕСТИТЬ ВТ; ВЫБРАТЬ ПРЕДСТАВЛЕНИЕ(ВТ.Ціна) ИЗ ВТ КАК ВТ'));
    expect(g1).toBe(NATIVE_REPRESENTATION);
    expect(generateBatch(parseBatch(g1))).toBe(g1);
  });
});
