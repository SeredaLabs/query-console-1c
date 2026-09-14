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
  describeVirtualTableConditionFieldChain, virtualTableArgKeywordValues,
} from '../../src/extension/hoverFieldInfo';
import { buildResolverFromTables } from '../../src/core/metadata/buildModelResolver';
import { parseBatch } from '../../src/core/query/sdblParser';
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

  it('BUG FIX: `&Параметр` — курсор на буквах після `&` НЕ повертає ланцюжок (це ім\'я параметра, не ідентифікатор)', () => {
    const text = 'ГДЕ Товар.Наименование = &Товар';
    const r = findChainAt(text, text.lastIndexOf('Товар') + 1);
    expect(r).toBeNull();
  });

  it('BUG FIX: те саме для дереференс-подібного вигляду `&Параметр.Щось` — жодного ланцюжка з голови-параметра', () => {
    const text = 'ГДЕ &Параметр.Поле = 1';
    const r = findChainAt(text, text.indexOf('Параметр') + 1);
    expect(r).toBeNull();
  });

  it('звичайний ланцюжок ОДРАЗУ ПІСЛЯ параметра (не всередині його імені) резолвиться як завжди', () => {
    const text = '&Параметр = Товар.Наименование';
    const r = findChainAt(text, text.indexOf('Товар') + 1);
    expect(r!.segments.map(s => s.text)).toEqual(['Товар', 'Наименование']);
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

/**
 * Phase 3d: `describeChain`'s head-alias resolution is position-aware
 * (`resolveAliasAt`), but none of these fixtures have JOINs/subqueries — a
 * SINGLE scope covers the whole query, so any in-range position (here: right
 * at `ИЗ`, always present and always inside the query's own recorded
 * `unionMember` range) resolves identically to every other. `headPosition`
 * only needs to pick the right SCOPE; the alias NAME itself is `chain[0]`,
 * passed separately — the two don't need to coincide textually.
 */
function headPos(text: string): number {
  return text.indexOf('ИЗ');
}

describe('describeChain', () => {
  it('описывает голову цепочки (просто псевдоним источника)', () => {
    const text = 'ВЫБРАТЬ Т.Наименование ИЗ Справочник.Товары КАК Т';
    const r = describeChain(text, resolver, ['Т'], headPos(text));
    expect(r.tableFullName).toBe('Справочник.Товары');
    expect(r.resolution).toBeUndefined();
  });

  it('резолвит простой скалярный сегмент', () => {
    const text = 'ВЫБРАТЬ Т.Наименование ИЗ Справочник.Товары КАК Т';
    const r = describeChain(text, resolver, ['Т', 'Наименование'], headPos(text));
    expect(r.tableFullName).toBe('Справочник.Товары');
    expect(r.resolution!.kind).toBe('scalar');
    expect(r.resolution!.resolved[0].field.name).toBe('Наименование');
  });

  it('резолвит цепочку через ссылочное поле', () => {
    const text = 'ВЫБРАТЬ Т.Наименование ИЗ Справочник.Товары КАК Т';
    const r = describeChain(text, resolver, ['Т', 'Контрагент', 'Наименование'], headPos(text));
    expect(r.resolution!.kind).toBe('scalar');
    expect(r.resolution!.resolved.map(s => s.field.name)).toEqual(['Контрагент', 'Наименование']);
  });

  it('регистронезависимо находит псевдоним', () => {
    const text = 'ВЫБРАТЬ Т.Наименование ИЗ Справочник.Товары КАК Т';
    const r = describeChain(text, resolver, ['т', 'наименование'], headPos(text));
    expect(r.tableFullName).toBe('Справочник.Товары');
    expect(r.resolution!.kind).toBe('scalar');
  });

  it('источник использует псевдоним по умолчанию, когда КАК не указан', () => {
    const text = 'ВЫБРАТЬ Товары.Наименование ИЗ Справочник.Товары';
    const r = describeChain(text, resolver, ['Товары'], headPos(text));
    expect(r.tableFullName).toBe('Справочник.Товары');
  });

  it('неизвестный псевдоним — пустой результат (unknown != invalid, не ошибка)', () => {
    const text = 'ВЫБРАТЬ Т.Наименование ИЗ Справочник.Товары КАК Т';
    const r = describeChain(text, resolver, ['НетТакогоПсевдонима'], headPos(text));
    expect(r.tableFullName).toBeUndefined();
    expect(r.resolution).toBeUndefined();
  });

  it('параметр-источник (&Имя) — пустой результат, а не сбой', () => {
    const text = 'ВЫБРАТЬ Т.Наименование ИЗ &ВнешнийИсточник КАК Т';
    const r = describeChain(text, resolver, ['Т', 'ЧтоУгодно'], headPos(text));
    expect(r.tableFullName).toBeUndefined();
  });

  it('таблица без метаданных в резолвере — сообщает fullName, но без resolution', () => {
    const text = 'ВЫБРАТЬ Т.Наименование ИЗ Справочник.НетВМетаданных КАК Т';
    const r = describeChain(text, resolver, ['Т', 'ЧтоУгодно'], headPos(text));
    expect(r.tableFullName).toBe('Справочник.НетВМетаданных');
    expect(r.resolution).toBeUndefined();
  });

  it('пустой ланцюжок сегментов — пустий результат', () => {
    const text = 'ВЫБРАТЬ Т.Наименование ИЗ Справочник.Товары КАК Т';
    expect(describeChain(text, resolver, [], headPos(text))).toEqual({});
  });

  it('невалідний текст запиту — пустий результат, а не виняток', () => {
    const r = describeChain('ЦЕ НЕ ЗАПИТ ((((', resolver, ['Т'], 0);
    expect(r).toEqual({});
  });

  it("'unknown' від resolveAliasAt НЕ падає назад на старий плоский пошук (продуктове рішення: unknown != invalid, але і не привід ризикувати перевіреною неправильною відповіддю)", () => {
    // Право-вкладений JOIN: Т1 НЕ видимий з внутрішньої умови ПО Т2-Т3 (Phase 2a,
    // live-verified) — стара findAliasTable про це не знає (позиційно-сліпа) і
    // впевнено "знайшла" б Т1; новий шлях коректно нічого не показує.
    const text =
      'ВЫБРАТЬ Т1.Наименование ИЗ Справочник.Товары КАК Т1 ' +
      'ЛЕВОЕ СОЕДИНЕНИЕ (ВЫБРАТЬ 1 КАК Знач) КАК Т2 ' +
      'ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Товары КАК Т3 ПО Т1.Наименование = Т3.Наименование ' +
      'ПО Т1.Наименование = Т2.Знач';
    const posInInnerCond = text.indexOf('Т1.Наименование = Т3.Наименование');
    const r = describeChain(text, resolver, ['Т1', 'Наименование'], posInInnerCond);
    expect(r).toEqual({});
  });

  it("Phase 2x-1: a bare УПОРЯДОЧИТЬ reference that COLLIDES with a real table alias resolves to NOTHING (it names the SELECT-output column, not that table)", () => {
    const text =
      'ВЫБРАТЬ Т.Наименование КАК Х ИЗ Справочник.Товары КАК Т ' +
      'ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Контрагенты КАК Х ПО Т.Контрагент = Х.Ссылка ' +
      'УПОРЯДОЧИТЬ ПО Х';
    const posInOrder = text.lastIndexOf('Х');
    const r = describeChain(text, resolver, ['Х'], posInOrder);
    expect(r).toEqual({});
  });

  it('Phase 2x-1: a genuine Alias.Field reference INSIDE УПОРЯДОЧИТЬ still resolves normally (not suppressed just because it is in that section)', () => {
    const text = 'ВЫБРАТЬ Т.Наименование ИЗ Справочник.Товары КАК Т УПОРЯДОЧИТЬ ПО Т.Наименование';
    const posInOrder = text.lastIndexOf('Т.Наименование');
    const r = describeChain(text, resolver, ['Т', 'Наименование'], posInOrder);
    expect(r.tableFullName).toBe('Справочник.Товары');
  });

  it('BUG FIX: `&Параметр` whose name COLLIDES with a real table alias must NOT resolve to that alias (was a confidently-wrong hover before the findChainAt guard)', () => {
    const text = 'ВЫБРАТЬ Товар.Наименование ИЗ Справочник.Товары КАК Товар ГДЕ Товар.Наименование = &Товар';
    const paramPos = text.lastIndexOf('&Товар') + 1;
    // findChainAt itself must already refuse — describeChain has no separate
    // guard of its own, it only ever sees what findChainAt hands it.
    expect(findChainAt(text, paramPos)).toBeNull();
  });
});

describe('findChainForCompletion', () => {
  it('курсор одразу після крапки, попереду один сегмент', () => {
    const text = 'Т.';
    const r = findChainForCompletion(text, text.length);
    expect(r?.map((s) => s.text)).toEqual(['Т']);
    expect(r?.[0]).toEqual({ text: 'Т', start: 0, end: 1 });
  });

  it('курсор посеред частково набраного сегмента ("Т.Контр|агент") — префікс без нього', () => {
    const text = 'Т.Контрагент';
    const r = findChainForCompletion(text, text.indexOf('Контр') + 'Контр'.length);
    expect(r?.map((s) => s.text)).toEqual(['Т']);
  });

  it('ланцюжок із кількох крапок ("Т.Контрагент.")', () => {
    const text = 'Т.Контрагент.';
    const r = findChainForCompletion(text, text.length);
    expect(r?.map((s) => s.text)).toEqual(['Т', 'Контрагент']);
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

  it('BUG FIX: `&Параметр.|` — жодного доповнення, це не псевдонім таблиці', () => {
    const text = 'ГДЕ Товар.Наименование = &Товар.';
    const r = findChainForCompletion(text, text.length);
    expect(r).toBeNull();
  });
});

describe('resolveCompletionTarget', () => {
  const QUERY = 'ВЫБРАТЬ Т.Наименование ИЗ Справочник.Товары КАК Т';

  it('односегментний префікс — таблиця самого псевдоніма', () => {
    const target = resolveCompletionTarget(QUERY, resolver, ['Т'], headPos(QUERY));
    expect(target?.meta.fullName).toBe('Справочник.Товары');
  });

  it('резолвить крізь посилальне поле до таблиці цілі', () => {
    const target = resolveCompletionTarget(QUERY, resolver, ['Т', 'Контрагент'], headPos(QUERY));
    expect(target?.meta.fullName).toBe('Справочник.Контрагенты');
  });

  it('регістронезалежно', () => {
    const target = resolveCompletionTarget(QUERY, resolver, ['т', 'контрагент'], headPos(QUERY));
    expect(target?.meta.fullName).toBe('Справочник.Контрагенты');
  });

  it('undefined для невідомого псевдоніма (unknown != invalid, не помилка)', () => {
    expect(resolveCompletionTarget(QUERY, resolver, ['НетТакогоПсевдонима'], headPos(QUERY))).toBeUndefined();
  });

  it('undefined, якщо префікс проходить через СКАЛЯРНЕ поле (нема куди йти далі)', () => {
    expect(resolveCompletionTarget(QUERY, resolver, ['Т', 'Наименование'], headPos(QUERY))).toBeUndefined();
  });

  it('undefined, якщо префікс містить невідомий сегмент', () => {
    expect(resolveCompletionTarget(QUERY, resolver, ['Т', 'НетТакогоПоля'], headPos(QUERY))).toBeUndefined();
  });

  it('undefined для порожнього префіксу', () => {
    expect(resolveCompletionTarget(QUERY, resolver, [], headPos(QUERY))).toBeUndefined();
  });

  it('undefined, якщо метаданих таблиці немає в резолвері', () => {
    const text = 'ВЫБРАТЬ Т.Код ИЗ Справочник.НетВМетаданных КАК Т';
    expect(resolveCompletionTarget(text, resolver, ['Т'], headPos(text))).toBeUndefined();
  });

  it('undefined для невалідного тексту запиту, а не виняток', () => {
    expect(resolveCompletionTarget('ЦЕ НЕ ЗАПИТ ((((', resolver, ['Т'], 0)).toBeUndefined();
  });

  it("'unknown' від resolveAliasAt НЕ падає назад на старий плоский пошук (той самий продуктовий принцип, що й для hover)", () => {
    const text =
      'ВЫБРАТЬ Т1.Наименование ИЗ Справочник.Товары КАК Т1 ' +
      'ЛЕВОЕ СОЕДИНЕНИЕ (ВЫБРАТЬ 1 КАК Знач) КАК Т2 ' +
      'ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Товары КАК Т3 ПО Т1.Наименование = Т3.Наименование ' +
      'ПО Т1.Наименование = Т2.Знач';
    const posInInnerCond = text.indexOf('Т1.Наименование = Т3.Наименование');
    expect(resolveCompletionTarget(text, resolver, ['Т1', 'Наименование'], posInInnerCond)).toBeUndefined();
  });
});

describe('відновлення після зламаного SELECT-списку (реальний репро: пропущена кома)', () => {
  // Точний випадок з реальної сесії: нове поле на новому рядку, кома до
  // попереднього ("Артикул") ще не додана — parseBatch кидає виняток на
  // ВСЬОМУ тексті, хоча ИЗ-блок (де насправді псевдонім) синтаксично цілий.
  const table: MetaTable = {
    kind: 'Справочник', name: 'Номенклатура', fullName: 'Справочник.Номенклатура',
    fields: [
      { name: 'Ссылка', kind: 'standard', types: [] },
      { name: 'Наименование', kind: 'standard', types: [] },
      { name: 'Код', kind: 'standard', types: [] },
      { name: 'Артикул', kind: 'standard', types: [] },
    ],
  };
  const nomenklaturaResolver = buildResolverFromTables([table]);
  const BROKEN_TEXT =
    'ВЫБРАТЬ\n' +
    '\tНоменклатура.Ссылка КАК Ссылка,\n' +
    '\tНоменклатура.Наименование КАК Наименование,\n' +
    '\tНоменклатура.Код КАК Код,\n' +
    '\tНоменклатура.Артикул КАК Артикул\n' +
    '\tНоменклатура.\n' + // <- немає коми перед цим рядком
    'ИЗ\n' +
    '\tСправочник.Номенклатура КАК Номенклатура';

  it('переконуємось, що звичайний розбір ДІЙСНО падає на цьому тексті (передумова тесту)', () => {
    expect(() => parseBatch(BROKEN_TEXT)).toThrow();
  });

  it('describeChain усе одно резолвить псевдонім через ИЗ, попри зламаний SELECT', () => {
    const desc = describeChain(BROKEN_TEXT, nomenklaturaResolver, ['Номенклатура'], 0);
    expect(desc.tableFullName).toBe('Справочник.Номенклатура');
  });

  it('resolveCompletionTarget усе одно повертає поля таблиці, попри зламаний SELECT', () => {
    const target = resolveCompletionTarget(BROKEN_TEXT, nomenklaturaResolver, ['Номенклатура'], 0);
    expect(target?.meta.fullName).toBe('Справочник.Номенклатура');
    expect(target?.meta.fields.map(f => f.name)).toEqual(['Ссылка', 'Наименование', 'Код', 'Артикул']);
  });

  it('undefined (не виняток), якщо запит зламаний настільки, що відновлення теж не рятує (немає ИЗ узагалі)', () => {
    const text = 'ВЫБРАТЬ Номенклатура.Ссылка, Номенклатура.';
    expect(describeChain(text, nomenklaturaResolver, ['Номенклатура'], 0)).toEqual({});
    expect(resolveCompletionTarget(text, nomenklaturaResolver, ['Номенклатура'], 0)).toBeUndefined();
  });

  it('відновлення застосовується до КОЖНОЇ гілки ОБЪЕДИНЕНИЯ на верхньому рівні', () => {
    const text =
      'ВЫБРАТЬ Номенклатура.Ссылка КАК Ссылка ИЗ Справочник.Номенклатура КАК Номенклатура\n' +
      'ОБЪЕДИНИТЬ ВСЕ\n' +
      'ВЫБРАТЬ\n' +
      '\tНоменклатура.Ссылка КАК Ссылка\n' + // <- немає коми перед наступним рядком
      '\tНоменклатура.\n' + // <- та сама помилка, у ДРУГІЙ гілці
      'ИЗ Справочник.Номенклатура КАК Номенклатура';
    expect(() => parseBatch(text)).toThrow();
    const target = resolveCompletionTarget(text, nomenklaturaResolver, ['Номенклатура'], 0);
    expect(target?.meta.fullName).toBe('Справочник.Номенклатура');
  });
});

describe('describeVirtualTableConditionFieldChain (Phase 2x-2, increment 2)', () => {
  const NOMENKLATURA: MetaTable = {
    kind: 'Справочник', name: 'Номенклатура', fullName: 'Справочник.Номенклатура',
    fields: [{ name: 'Наименование', kind: 'standard', types: [{ primitive: 'Строка' }] }],
  };
  const PRODAZHI: MetaTable = {
    kind: 'РегистрНакопления', name: 'Продажи', fullName: 'РегистрНакопления.Продажи',
    fields: [
      { name: 'Товар', kind: 'dimension', types: [{ ref: { kind: 'Справочник', name: 'Номенклатура' } }] },
      { name: 'Склад', kind: 'dimension', types: [{ primitive: 'Строка' }] },
      { name: 'Количество', kind: 'resource', types: [{ primitive: 'Число' }] },
    ],
  };
  // Слепок «Остатки»: измерения без изменений + развёрнутый ресурс
  // (КоличествоОстаток) — те же имена, что реально строит `buildAccumRegSlices`
  // в `yamlLoader.ts`. Условие резолвится против БАЗОВОГО регистра (raw
  // "Количество"/"Товар"), а не против ЭТИХ развёрнутых полей.
  const PRODAZHI_OSTATKI: MetaTable = {
    kind: 'РегистрНакопления', name: 'Продажи.Остатки', fullName: 'РегистрНакопления.Продажи.Остатки',
    fields: [
      { name: 'Товар', kind: 'dimension', types: PRODAZHI.fields[0].types },
      { name: 'Склад', kind: 'dimension', types: [{ primitive: 'Строка' }] },
      { name: 'КоличествоОстаток', kind: 'resource', types: [{ primitive: 'Число' }] },
    ],
    virtual: { slice: 'Остатки', baseFullName: 'РегистрНакопления.Продажи' },
  };
  const resolver = buildResolverFromTables([PRODAZHI, PRODAZHI_OSTATKI, NOMENKLATURA]);

  it('resolves a bare dimension field inside Условие against the REAL register, not the slice', () => {
    const text = 'ВЫБРАТЬ Т.Количество ИЗ РегистрНакопления.Продажи.Остатки(&Дата, Товар = &Товар) КАК Т';
    const headPos = text.indexOf('Товар');
    const r = describeVirtualTableConditionFieldChain(text, resolver, ['Товар'], headPos);
    expect(r?.registerFullName).toBe('РегистрНакопления.Продажи');
    expect(r?.resolution.resolved.map(s => s.field.name)).toEqual(['Товар']);
    expect(r?.resolution.resolved[0].kind).toBe('reference');
  });

  it('resolves a chain through a reference dimension (Товар.Наименование)', () => {
    const text = 'ВЫБРАТЬ Т.Количество ИЗ РегистрНакопления.Продажи.Остатки(&Дата, Товар.Наименование = &Имя) КАК Т';
    const headPos = text.indexOf('Товар');
    const r = describeVirtualTableConditionFieldChain(text, resolver, ['Товар', 'Наименование'], headPos);
    expect(r?.resolution.resolved.map(s => s.field.name)).toEqual(['Товар', 'Наименование']);
  });

  it('a bare resource field ("Количество", raw — not "КоличествоОстаток") resolves too', () => {
    const text = 'ВЫБРАТЬ Т.Количество ИЗ РегистрНакопления.Продажи.Остатки(&Дата, Количество > 0) КАК Т';
    const headPos = text.indexOf('Количество >');
    const r = describeVirtualTableConditionFieldChain(text, resolver, ['Количество'], headPos);
    expect(r?.resolution.resolved.map(s => s.field.name)).toEqual(['Количество']);
  });

  it('undefined for a position inside a NON-condition argument (Период, argIndex 0)', () => {
    const text = 'ВЫБРАТЬ Т.Количество ИЗ РегистрНакопления.Продажи.Остатки(&Дата, Товар = &Товар) КАК Т';
    const headPos = text.indexOf('&Дата') + 1;
    expect(describeVirtualTableConditionFieldChain(text, resolver, ['Дата'], headPos)).toBeUndefined();
  });

  it('undefined outside any virtual-table argument entirely (regular table source)', () => {
    const text = 'ВЫБРАТЬ Т.Наименование ИЗ Справочник.Номенклатура КАК Т';
    const headPos = text.indexOf('Номенклатура');
    expect(describeVirtualTableConditionFieldChain(text, resolver, ['ЧтоУгодно'], headPos)).toBeUndefined();
  });

  it('fieldNotFound is reported (not silently swallowed) for an unknown identifier inside Условие', () => {
    const text = 'ВЫБРАТЬ Т.Количество ИЗ РегистрНакопления.Продажи.Остатки(&Дата, НетТакогоПоля = 1) КАК Т';
    const headPos = text.indexOf('НетТакогоПоля');
    const r = describeVirtualTableConditionFieldChain(text, resolver, ['НетТакогоПоля'], headPos);
    expect(r?.resolution.stoppedReason).toBe('fieldNotFound');
  });

  it('undefined when the base register has no metadata in the resolver (unknown != invalid)', () => {
    const noBaseResolver = buildResolverFromTables([PRODAZHI_OSTATKI]); // base register itself missing
    const text = 'ВЫБРАТЬ Т.Количество ИЗ РегистрНакопления.Продажи.Остатки(&Дата, Товар = &Товар) КАК Т';
    const headPos = text.indexOf('Товар');
    expect(describeVirtualTableConditionFieldChain(text, noBaseResolver, ['Товар'], headPos)).toBeUndefined();
  });

  it('undefined for headPosition === undefined (translation failure upstream)', () => {
    const text = 'ВЫБРАТЬ Т.Количество ИЗ РегистрНакопления.Продажи.Остатки(&Дата, Товар = &Товар) КАК Т';
    expect(describeVirtualTableConditionFieldChain(text, resolver, ['Товар'], undefined)).toBeUndefined();
  });

  it('BUG FIX end-to-end: a `&Товар` PARAMETER whose name collides with the real field "Товар" must not surface a chain at all (real entry point: findChainAt first, same as queryHoverProvider.ts)', () => {
    const text = 'ВЫБРАТЬ Т.Количество ИЗ РегистрНакопления.Продажи.Остатки(&Дата, Товар = &Товар) КАК Т';
    const paramPos = text.lastIndexOf('&Товар') + 1;
    // The real hover provider ALWAYS calls findChainAt first and only passes
    // its segments into describeVirtualTableConditionFieldChain — before the
    // fix, findChainAt returned {segments: ['Товар'], ...} here (indistinguishable
    // from the real bare field "Товар" a few tokens earlier), which this
    // function would then have confidently (and wrongly) resolved as a
    // reference to Справочник.Номенклатура.
    expect(findChainAt(text, paramPos)).toBeNull();
  });

  it('УсловиеСчета (regs бухгалтерии) is ALSO treated as a condition role', () => {
    const chart = { kind: 'ПланСчетов' as const, name: 'Хозрасчетный', fullName: 'ПланСчетов.Хозрасчетный', fields: [] };
    const hozOperacii: MetaTable = {
      kind: 'РегистрБухгалтерии', name: 'ХозОперации', fullName: 'РегистрБухгалтерии.ХозОперации',
      fields: [{ name: 'Счет', kind: 'standard', types: [{ ref: { kind: 'ПланСчетов', name: 'Хозрасчетный' } }] }],
    };
    const hozOperaciiOstatki: MetaTable = {
      kind: 'РегистрБухгалтерии', name: 'ХозОперации.Остатки', fullName: 'РегистрБухгалтерии.ХозОперации.Остатки',
      fields: [{ name: 'Счет', kind: 'standard', types: hozOperacii.fields[0].types }],
      virtual: { slice: 'Остатки', baseFullName: 'РегистрБухгалтерии.ХозОперации' },
    };
    const r2 = buildResolverFromTables([hozOperacii, hozOperaciiOstatki, chart]);
    const text = 'ВЫБРАТЬ Т.Период ИЗ РегистрБухгалтерии.ХозОперации.Остатки(&Дата, Счет = &Счет, ИСТИНА, &Условие) КАК Т';
    const headPos = text.indexOf('Счет =');
    const r = describeVirtualTableConditionFieldChain(text, r2, ['Счет'], headPos);
    expect(r?.registerFullName).toBe('РегистрБухгалтерии.ХозОперации');
    expect(r?.resolution.resolved.map(s => s.field.name)).toEqual(['Счет']);
  });
});

describe('virtualTableArgKeywordValues (Phase 2x-2, increment 3)', () => {
  it('returns the Периодичность enum for that argument slot (РегистрНакопления.Обороты)', () => {
    const text = 'ВЫБРАТЬ Т.Период ИЗ РегистрНакопления.Продажи.Обороты(&Начало, &Конец, Месяц, ИСТИНА) КАК Т';
    const pos = text.indexOf('Месяц');
    const values = virtualTableArgKeywordValues(text, resolver, pos);
    expect(values).toContain('Месяц');
    expect(values).toContain('Регистратор');
    expect(values).toContain('Авто');
  });

  it('returns the МетодДополнения enum for that argument slot (ОстаткиИОбороты)', () => {
    const text = 'ВЫБРАТЬ Т.Период ИЗ РегистрНакопления.Продажи.ОстаткиИОбороты(&Начало, &Конец, Месяц, Движения, ИСТИНА) КАК Т';
    const pos = text.indexOf('Движения');
    expect(virtualTableArgKeywordValues(text, resolver, pos)).toEqual(['Движения', 'ДвиженияИГраницыПериода']);
  });

  it('also applies to РегистрБухгалтерии forms sharing the same Периодичность role', () => {
    const text = 'ВЫБРАТЬ Т.Период ИЗ РегистрБухгалтерии.ХозОперации.Обороты(&Начало, &Конец, Квартал, &УсловиеСчета, ИСТИНА, &Условие, &УсловиеКорСчета, ЛОЖЬ) КАК Т';
    const pos = text.indexOf('Квартал');
    const values = virtualTableArgKeywordValues(text, resolver, pos);
    expect(values).toContain('Квартал');
  });

  it('undefined for a condition-shaped argument (not a keyword enum)', () => {
    const text = 'ВЫБРАТЬ Т.Период ИЗ РегистрНакопления.Продажи.Остатки(&Дата, ИСТИНА) КАК Т';
    const pos = text.indexOf('ИСТИНА');
    expect(virtualTableArgKeywordValues(text, resolver, pos)).toBeUndefined();
  });

  it('undefined for Порядок (order-by field expression, deliberately NOT a keyword enum)', () => {
    const text = 'ВЫБРАТЬ Т.Период ИЗ РегистрБухгалтерии.ХозОперации.ДвиженияССубконто(&Начало, &Конец, &Условие, Регистратор, &Первые) КАК Т';
    const pos = text.indexOf('Регистратор');
    expect(virtualTableArgKeywordValues(text, resolver, pos)).toBeUndefined();
  });

  it('undefined outside any virtual-table argument entirely', () => {
    const text = 'ВЫБРАТЬ Т.Наименование ИЗ Справочник.Товары КАК Т';
    expect(virtualTableArgKeywordValues(text, resolver, text.indexOf('Товары'))).toBeUndefined();
  });
});

describe('describeChain: virtual-table OUTPUT field hover (fixes a long-standing gap, not a Phase 2x-2 regression)', () => {
  // Той самий реєстр/слайс, що і в блоці describeVirtualTableConditionFieldChain
  // вище, але тут нас цікавить ІНША позиція — не аргумент Условие, а звичайне
  // поле-вивід ВТ у SELECT/ГДЕ/тощо (`Остатки.КоличествоОстаток`).
  const PRODAZHI: MetaTable = {
    kind: 'РегистрНакопления', name: 'Продажи', fullName: 'РегистрНакопления.Продажи',
    fields: [
      { name: 'Товар', kind: 'dimension', types: [{ ref: { kind: 'Справочник', name: 'Номенклатура' } }] },
      { name: 'Количество', kind: 'resource', types: [{ primitive: 'Число' }] },
    ],
  };
  const PRODAZHI_OSTATKI: MetaTable = {
    kind: 'РегистрНакопления', name: 'Продажи.Остатки', fullName: 'РегистрНакопления.Продажи.Остатки',
    fields: [
      { name: 'Товар', kind: 'dimension', types: PRODAZHI.fields[0].types },
      { name: 'КоличествоОстаток', kind: 'resource', types: [{ primitive: 'Число' }] },
    ],
    virtual: { slice: 'Остатки', baseFullName: 'РегистрНакопления.Продажи' },
  };
  const NOMENKLATURA: MetaTable = {
    kind: 'Справочник', name: 'Номенклатура', fullName: 'Справочник.Номенклатура',
    fields: [{ name: 'Наименование', kind: 'standard', types: [{ primitive: 'Строка' }] }],
  };
  const vtResolver = buildResolverFromTables([PRODAZHI, PRODAZHI_OSTATKI, NOMENKLATURA]);

  it('resolves a resource output field (КоличествоОстаток) on a virtual-table alias — was undefined before the fix', () => {
    const text = 'ВЫБРАТЬ Т.КоличествоОстаток ИЗ РегистрНакопления.Продажи.Остатки(&Дата, ИСТИНА) КАК Т';
    const headPos = text.indexOf('ИЗ');
    const r = describeChain(text, vtResolver, ['Т', 'КоличествоОстаток'], headPos);
    expect(r.tableFullName).toBe('РегистрНакопления.Продажи.Остатки');
    expect(r.resolution).toBeDefined();
    expect(r.resolution!.resolved.map(s => s.field.name)).toEqual(['КоличествоОстаток']);
    expect(r.resolution!.resolved[0].kind).toBe('scalar');
    // Stage B enrichment: knows this came from the base register's own "Количество".
    expect(r.virtualTableField).toEqual({ outputName: 'КоличествоОстаток', baseFieldName: 'Количество', suffix: 'Остаток' });
  });

  it('enrichment only applies to the FIRST segment after the head — a further dereference does not carry it', () => {
    const text = 'ВЫБРАТЬ Т.Товар ИЗ РегистрНакопления.Продажи.Остатки(&Дата, ИСТИНА) КАК Т';
    const headPos = text.indexOf('ИЗ');
    const r = describeChain(text, vtResolver, ['Т', 'Товар', 'Наименование'], headPos);
    // "Товар" itself has no suffix (a dimension, passes through unchanged) — no enrichment.
    expect(r.virtualTableField).toBeUndefined();
  });

  it('resolves a dimension output field that passes through unchanged (Товар) and dereferences its reference', () => {
    const text = 'ВЫБРАТЬ Т.Товар ИЗ РегистрНакопления.Продажи.Остатки(&Дата, ИСТИНА) КАК Т';
    const headPos = text.indexOf('ИЗ');
    const r = describeChain(text, vtResolver, ['Т', 'Товар', 'Наименование'], headPos);
    expect(r.resolution!.resolved.map(s => s.field.name)).toEqual(['Товар', 'Наименование']);
  });

  it('the head alone (chain.length === 1) still reports just the VT fullName, as before', () => {
    const text = 'ВЫБРАТЬ Т.Товар ИЗ РегистрНакопления.Продажи.Остатки(&Дата, ИСТИНА) КАК Т';
    const headPos = text.indexOf('ИЗ');
    const r = describeChain(text, vtResolver, ['Т'], headPos);
    expect(r.tableFullName).toBe('РегистрНакопления.Продажи.Остатки');
    expect(r.resolution).toBeUndefined();
  });

  it('an unknown field on the virtual table still correctly reports fieldNotFound (not silently swallowed by the fallback)', () => {
    const text = 'ВЫБРАТЬ Т.НетТакогоПоля ИЗ РегистрНакопления.Продажи.Остатки(&Дата, ИСТИНА) КАК Т';
    const headPos = text.indexOf('ИЗ');
    const r = describeChain(text, vtResolver, ['Т', 'НетТакогоПоля'], headPos);
    expect(r.resolution!.stoppedReason).toBe('fieldNotFound');
  });

  it('a REAL (non-virtual) table alias is unaffected by the fallback — still resolves via tableByFullName as before', () => {
    const text = 'ВЫБРАТЬ Т.Наименование ИЗ Справочник.Номенклатура КАК Т';
    const headPos = text.indexOf('ИЗ');
    const r = describeChain(text, vtResolver, ['Т', 'Наименование'], headPos);
    expect(r.tableFullName).toBe('Справочник.Номенклатура');
    expect(r.resolution!.resolved.map(s => s.field.name)).toEqual(['Наименование']);
  });
});

describe('describeChain: VT output field hover — broader register-kind/slice matrix', () => {
  it('РегистрСведений СрезПоследних: fields pass through unchanged, no enrichment expected, but hover still works', () => {
    const base: MetaTable = {
      kind: 'РегистрСведений', name: 'Цены', fullName: 'РегистрСведений.Цены',
      fields: [{ name: 'Цена', kind: 'resource', types: [{ primitive: 'Число' }] }],
    };
    const slice: MetaTable = {
      kind: 'РегистрСведений', name: 'Цены.СрезПоследних', fullName: 'РегистрСведений.Цены.СрезПоследних',
      fields: [{ name: 'Цена', kind: 'resource', types: [{ primitive: 'Число' }] }],
      virtual: { slice: 'СрезПоследних', baseFullName: 'РегистрСведений.Цены' },
    };
    const resolver = buildResolverFromTables([base, slice]);
    const text = 'ВЫБРАТЬ Т.Цена ИЗ РегистрСведений.Цены.СрезПоследних(&Дата) КАК Т';
    const headPos = text.indexOf('ИЗ');
    const r = describeChain(text, resolver, ['Т', 'Цена'], headPos);
    expect(r.tableFullName).toBe('РегистрСведений.Цены.СрезПоследних');
    expect(r.resolution!.resolved.map(s => s.field.name)).toEqual(['Цена']);
    expect(r.virtualTableField).toBeUndefined(); // РегистрСведений has no suffix table at all
  });

  it('reviewed concern (safe, not a bug): describeVirtualTableOutputField tries накопления\'s FULL suffix union, not scoped to one slice — but a Turnovers-only "Обороты" VT never even HAS a Приход/Расход-suffixed field, so resolveFieldPath gates it before enrichment is ever reached', () => {
    const base: MetaTable = {
      kind: 'РегистрНакопления', name: 'Продажи', fullName: 'РегистрНакопления.Продажи',
      fields: [{ name: 'Сумма', kind: 'resource', types: [{ primitive: 'Число' }] }],
    };
    // Turnovers-only Обороты (buildAccumRegSlices' isBalance=false path):
    // expandResources(resources, ['Оборот']) ONLY — "СуммаПриход"/"СуммаРасход"
    // are never generated as fields on THIS slice's own metadata at all.
    const oborotyTurnoversOnly: MetaTable = {
      kind: 'РегистрНакопления', name: 'Продажи.Обороты', fullName: 'РегистрНакопления.Продажи.Обороты',
      fields: [{ name: 'СуммаОборот', kind: 'resource', types: [{ primitive: 'Число' }] }],
      virtual: { slice: 'Обороты', baseFullName: 'РегистрНакопления.Продажи' },
    };
    const resolver = buildResolverFromTables([base, oborotyTurnoversOnly]);
    const text = 'ВЫБРАТЬ Т.СуммаПриход ИЗ РегистрНакопления.Продажи.Обороты(&Начало, &Конец, ИСТИНА) КАК Т';
    const headPos = text.indexOf('ИЗ');
    const r = describeChain(text, resolver, ['Т', 'СуммаПриход'], headPos);
    // Not found on THIS slice's metadata — proven fieldNotFound, never a
    // guessed/enriched answer, even though "СуммаПриход" textually reverse-maps
    // to a real base resource ("Сумма" + suffix "Приход") in the general case.
    expect(r.resolution!.stoppedReason).toBe('fieldNotFound');
    expect(r.virtualTableField).toBeUndefined();
  });

  it('РегистрБухгалтерии Остатки: resource-suffix field DOES get enrichment (own, different suffix set from накопления)', () => {
    const base: MetaTable = {
      kind: 'РегистрБухгалтерии', name: 'ХозОперации', fullName: 'РегистрБухгалтерии.ХозОперации',
      fields: [{ name: 'Сумма', kind: 'resource', types: [{ primitive: 'Число' }] }],
    };
    const slice: MetaTable = {
      kind: 'РегистрБухгалтерии', name: 'ХозОперации.Остатки', fullName: 'РегистрБухгалтерии.ХозОперации.Остатки',
      fields: [{ name: 'СуммаОстатокДт', kind: 'resource', types: [{ primitive: 'Число' }] }],
      virtual: { slice: 'Остатки', baseFullName: 'РегистрБухгалтерии.ХозОперации' },
    };
    const resolver = buildResolverFromTables([base, slice]);
    const text = 'ВЫБРАТЬ Т.СуммаОстатокДт ИЗ РегистрБухгалтерии.ХозОперации.Остатки(&Дата) КАК Т';
    const headPos = text.indexOf('ИЗ');
    const r = describeChain(text, resolver, ['Т', 'СуммаОстатокДт'], headPos);
    expect(r.virtualTableField).toEqual({ outputName: 'СуммаОстатокДт', baseFieldName: 'Сумма', suffix: 'ОстатокДт' });
  });

  it('РегистрБухгалтерии synthesized field (Счет): resolves correctly via the VT\'s own metadata (Stage A), no false enrichment', () => {
    const base: MetaTable = {
      kind: 'РегистрБухгалтерии', name: 'ХозОперации', fullName: 'РегистрБухгалтерии.ХозОперации',
      fields: [{ name: 'Сумма', kind: 'resource', types: [{ primitive: 'Число' }] }],
    };
    const chart: MetaTable = { kind: 'ПланСчетов', name: 'Хозрасчетный', fullName: 'ПланСчетов.Хозрасчетный', fields: [] };
    const slice: MetaTable = {
      kind: 'РегистрБухгалтерии', name: 'ХозОперации.Остатки', fullName: 'РегистрБухгалтерии.ХозОперации.Остатки',
      fields: [{ name: 'Счет', kind: 'standard', types: [{ ref: { kind: 'ПланСчетов', name: 'Хозрасчетный' } }] }],
      virtual: { slice: 'Остатки', baseFullName: 'РегистрБухгалтерии.ХозОперации' },
    };
    const resolver = buildResolverFromTables([base, chart, slice]);
    const text = 'ВЫБРАТЬ Т.Счет ИЗ РегистрБухгалтерии.ХозОперации.Остатки(&Дата) КАК Т';
    const headPos = text.indexOf('ИЗ');
    const r = describeChain(text, resolver, ['Т', 'Счет'], headPos);
    expect(r.resolution!.resolved[0].kind).toBe('reference');
    expect(r.resolution!.resolved[0].refTarget?.fullName).toBe('ПланСчетов.Хозрасчетный');
    expect(r.virtualTableField).toBeUndefined(); // no base-register equivalent — correctly not reverse-mapped
  });
});
