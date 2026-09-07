/**
 * Semantic-core hardening, hover- та completion-кроки: юнит-тести для чистого
 * модуля `hoverFieldInfo.ts` — `findChainAt` (пошук ланцюжка ідентифікаторів
 * навколо позиції курсора в сирому тексті), `describeChain` (розбір
 * реконструйованого тексту запиту + резолюція ланцюжка через спільне ядро
 * `resolveFieldPath`), `findChainForCompletion` (ланцюжок ПЕРЕД курсором для
 * автодоповнення) та `resolveCompletionTarget` (резолюція того ланцюжка до
 * таблиці метаданих, чиї поля треба запропонувати).
 */
import { describe, it, expect } from 'vitest';
import {
  findChainAt, describeChain, findChainForCompletion, resolveCompletionTarget,
} from '../../src/extension/hoverFieldInfo';
import { buildResolverFromTables } from '../../src/core/metadata/buildModelResolver';
import type { MetaTable } from '../../src/core/metadata/types';

describe('findChainAt', () => {
  it('находит одиночный идентификатор (курсор внутри слова)', () => {
    const r = findChainAt('Товары', 2);
    expect(r).not.toBeNull();
    expect(r!.segments.map(s => s.text)).toEqual(['Товары']);
    expect(r!.hoveredIndex).toBe(0);
  });

  it('находит цепочку из двух сегментов, курсор на первом', () => {
    const text = 'Товары.Контрагент';
    const r = findChainAt(text, 2);
    expect(r!.segments.map(s => s.text)).toEqual(['Товары', 'Контрагент']);
    expect(r!.hoveredIndex).toBe(0);
  });

  it('находит цепочку из двух сегментов, курсор на втором', () => {
    const text = 'Товары.Контрагент';
    const r = findChainAt(text, text.indexOf('Контрагент') + 2);
    expect(r!.segments.map(s => s.text)).toEqual(['Товары', 'Контрагент']);
    expect(r!.hoveredIndex).toBe(1);
  });

  it('находит цепочку из трёх сегментов, курсор в середине', () => {
    const text = 'Т.Контрагент.Наименование';
    const r = findChainAt(text, text.indexOf('Контрагент') + 1);
    expect(r!.segments.map(s => s.text)).toEqual(['Т', 'Контрагент', 'Наименование']);
    expect(r!.hoveredIndex).toBe(1);
  });

  it('позиция сразу ПОСЛЕ слова (типичная граница токена в VS Code) всё равно находит слово', () => {
    const text = 'Товары';
    const r = findChainAt(text, text.length);
    expect(r!.segments.map(s => s.text)).toEqual(['Товары']);
  });

  it('возвращает null, если позиция не на идентификаторе (пробел, не на границе слова)', () => {
    const text = 'Товары  Контрагент'; // два пробела: середина — не граница ни одного слова
    const r = findChainAt(text, text.indexOf('  ') + 1);
    expect(r).toBeNull();
  });

  it('возвращает null для offset за пределами строки', () => {
    expect(findChainAt('abc', -1)).toBeNull();
    expect(findChainAt('abc', 10)).toBeNull();
  });

  it('сегменты несут корректные символьные смещения [start, end)', () => {
    const text = 'Т.Наименование';
    const r = findChainAt(text, 3)!;
    const second = r.segments[1];
    expect(text.slice(second.start, second.end)).toBe('Наименование');
  });

  it('не пересекает границу цепочки на операторе (не `.`)', () => {
    const text = 'Товары = Контрагент';
    const r = findChainAt(text, 1);
    expect(r!.segments.map(s => s.text)).toEqual(['Товары']);
  });
});

// ── Fixture: Справочник.Товары.Контрагент → Справочник.Контрагенты.Наименование ──
const KONTRAGENTY: MetaTable = {
  kind: 'Справочник',
  name: 'Контрагенты',
  fullName: 'Справочник.Контрагенты',
  fields: [
    { name: 'Наименование', kind: 'standard', types: [{ primitive: 'Строка' }] },
  ],
};

const TOVARY: MetaTable = {
  kind: 'Справочник',
  name: 'Товары',
  fullName: 'Справочник.Товары',
  fields: [
    { name: 'Наименование', kind: 'standard', types: [{ primitive: 'Строка' }] },
    { name: 'Контрагент', kind: 'standard', types: [{ ref: { kind: 'Справочник', name: 'Контрагенты' } }] },
  ],
};

const resolver = buildResolverFromTables([TOVARY, KONTRAGENTY]);

describe('describeChain', () => {
  it('описывает голову цепочки (просто псевдоним источника)', () => {
    const text = 'ВЫБРАТЬ Т.Наименование ИЗ Справочник.Товары КАК Т';
    const r = describeChain(text, resolver, ['Т']);
    expect(r.tableFullName).toBe('Справочник.Товары');
    expect(r.resolution).toBeUndefined();
  });

  it('резолвит простой скалярный сегмент', () => {
    const text = 'ВЫБРАТЬ Т.Наименование ИЗ Справочник.Товары КАК Т';
    const r = describeChain(text, resolver, ['Т', 'Наименование']);
    expect(r.tableFullName).toBe('Справочник.Товары');
    expect(r.resolution!.kind).toBe('scalar');
    expect(r.resolution!.resolved[0].field.name).toBe('Наименование');
  });

  it('резолвит цепочку через ссылочное поле', () => {
    const text = 'ВЫБРАТЬ Т.Наименование ИЗ Справочник.Товары КАК Т';
    const r = describeChain(text, resolver, ['Т', 'Контрагент', 'Наименование']);
    expect(r.resolution!.kind).toBe('scalar');
    expect(r.resolution!.resolved.map(s => s.field.name)).toEqual(['Контрагент', 'Наименование']);
  });

  it('регистронезависимо находит псевдоним', () => {
    const text = 'ВЫБРАТЬ Т.Наименование ИЗ Справочник.Товары КАК Т';
    const r = describeChain(text, resolver, ['т', 'наименование']);
    expect(r.tableFullName).toBe('Справочник.Товары');
    expect(r.resolution!.kind).toBe('scalar');
  });

  it('источник использует псевдоним по умолчанию, когда КАК не указан', () => {
    const text = 'ВЫБРАТЬ Товары.Наименование ИЗ Справочник.Товары';
    const r = describeChain(text, resolver, ['Товары']);
    expect(r.tableFullName).toBe('Справочник.Товары');
  });

  it('неизвестный псевдоним — пустой результат (unknown != invalid, не ошибка)', () => {
    const text = 'ВЫБРАТЬ Т.Наименование ИЗ Справочник.Товары КАК Т';
    const r = describeChain(text, resolver, ['НетТакогоПсевдонима']);
    expect(r.tableFullName).toBeUndefined();
    expect(r.resolution).toBeUndefined();
  });

  it('параметр-источник (&Имя) — пустой результат, а не сбой', () => {
    const text = 'ВЫБРАТЬ Т.Наименование ИЗ &ВнешнийИсточник КАК Т';
    const r = describeChain(text, resolver, ['Т', 'ЧтоУгодно']);
    expect(r.tableFullName).toBeUndefined();
  });

  it('таблица без метаданных в резолвере — сообщает fullName, но без resolution', () => {
    const text = 'ВЫБРАТЬ Т.Наименование ИЗ Справочник.НетВМетаданных КАК Т';
    const r = describeChain(text, resolver, ['Т', 'ЧтоУгодно']);
    expect(r.tableFullName).toBe('Справочник.НетВМетаданных');
    expect(r.resolution).toBeUndefined();
  });

  it('пустой ланцюжок сегментов — пустий результат', () => {
    const text = 'ВЫБРАТЬ Т.Наименование ИЗ Справочник.Товары КАК Т';
    expect(describeChain(text, resolver, [])).toEqual({});
  });

  it('невалідний текст запиту — пустий результат, а не виняток', () => {
    const r = describeChain('ЦЕ НЕ ЗАПИТ ((((', resolver, ['Т']);
    expect(r).toEqual({});
  });
});

describe('findChainForCompletion', () => {
  it('курсор одразу після крапки, попереду один сегмент', () => {
    const text = 'Т.';
    expect(findChainForCompletion(text, text.length)).toEqual(['Т']);
  });

  it('курсор посеред частково набраного сегмента ("Т.Контр|агент") — префікс без нього', () => {
    const text = 'Т.Контрагент';
    expect(findChainForCompletion(text, text.indexOf('Контр') + 'Контр'.length)).toEqual(['Т']);
  });

  it('ланцюжок із кількох крапок ("Т.Контрагент.")', () => {
    const text = 'Т.Контрагент.';
    expect(findChainForCompletion(text, text.length)).toEqual(['Т', 'Контрагент']);
  });

  it('null, якщо перед курсором немає крапки взагалі', () => {
    expect(findChainForCompletion('Товары', 6)).toBeNull();
  });

  it('null, якщо крапка є, але перед нею немає ідентифікатора (наприклад, на початку тексту)', () => {
    expect(findChainForCompletion('.Поле', 5)).toBeNull();
  });

  it('null для offset за межами рядка', () => {
    expect(findChainForCompletion('Т.', -1)).toBeNull();
    expect(findChainForCompletion('Т.', 10)).toBeNull();
  });
});

describe('resolveCompletionTarget', () => {
  const QUERY = 'ВЫБРАТЬ Т.Наименование ИЗ Справочник.Товары КАК Т';

  it('односегментний префікс — таблиця самого псевдоніма', () => {
    const target = resolveCompletionTarget(QUERY, resolver, ['Т']);
    expect(target?.meta.fullName).toBe('Справочник.Товары');
  });

  it('резолвить крізь посилальне поле до таблиці цілі', () => {
    const target = resolveCompletionTarget(QUERY, resolver, ['Т', 'Контрагент']);
    expect(target?.meta.fullName).toBe('Справочник.Контрагенты');
  });

  it('регістронезалежно', () => {
    const target = resolveCompletionTarget(QUERY, resolver, ['т', 'контрагент']);
    expect(target?.meta.fullName).toBe('Справочник.Контрагенты');
  });

  it('undefined для невідомого псевдоніма (unknown != invalid, не помилка)', () => {
    expect(resolveCompletionTarget(QUERY, resolver, ['НетТакогоПсевдонима'])).toBeUndefined();
  });

  it('undefined, якщо префікс проходить через СКАЛЯРНЕ поле (нема куди йти далі)', () => {
    expect(resolveCompletionTarget(QUERY, resolver, ['Т', 'Наименование'])).toBeUndefined();
  });

  it('undefined, якщо префікс містить невідомий сегмент', () => {
    expect(resolveCompletionTarget(QUERY, resolver, ['Т', 'НетТакогоПоля'])).toBeUndefined();
  });

  it('undefined для порожнього префіксу', () => {
    expect(resolveCompletionTarget(QUERY, resolver, [])).toBeUndefined();
  });

  it('undefined, якщо метаданих таблиці немає в резолвері', () => {
    const text = 'ВЫБРАТЬ Т.Код ИЗ Справочник.НетВМетаданных КАК Т';
    expect(resolveCompletionTarget(text, resolver, ['Т'])).toBeUndefined();
  });

  it('undefined для невалідного тексту запиту, а не виняток', () => {
    expect(resolveCompletionTarget('ЦЕ НЕ ЗАПИТ ((((', resolver, ['Т'])).toBeUndefined();
  });
});
