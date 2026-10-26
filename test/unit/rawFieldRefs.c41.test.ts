import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseBatch } from '../../src/core/query/sdblParser';
import { buildResolverFromTables } from '../../src/core/metadata/buildModelResolver';
import { validateBatchSemantics } from '../../src/core/query/semanticValidator';
import { tryOpenBatch, validateBatchText } from '../../src/core/query/validateBatch';
import { decideApply } from '../../src/webview/applyGate';
import type { MetaTable } from '../../src/core/metadata/types';

// C41 stage 1: a field path `Псевдоним.Путь` kept in raw expression text (arithmetic,
// functions, ВЫБОР, a `Поле{n}` alias, WHERE/HAVING/JOIN/ORDER text) is checked against
// metadata like a structured field, when its head is a source of the same query. The
// platform refuses such a query: test/fixtures/platform/c41-raw-field-refs.json.
// Nested queries with one source and subqueries kept as raw text are checked since
// stage 2 (nestedFieldScopes.c41.test.ts), an unknown alias head since stage 2c
// (unknownAlias.c41.test.ts).

const ВАЛЮТЫ: MetaTable = {
  kind: 'Справочник', name: 'Валюты', fullName: 'Справочник.Валюты',
  fields: [
    { name: 'ОсновнаяВалюта', kind: 'attribute', types: [] },
    { name: 'Ссылка', kind: 'standard', types: [{ ref: { kind: 'Справочник', name: 'Валюты' } }] },
    { name: 'Наименование', kind: 'standard', types: [{ primitive: 'Строка' }] },
    { name: 'Код', kind: 'standard', types: [{ primitive: 'Строка' }] },
    { name: 'ПометкаУдаления', kind: 'standard', types: [{ primitive: 'Булево' }] },
    { name: 'Счет', kind: 'attribute', types: [{ ref: { kind: 'Справочник', name: 'НетВРезолвере' } }] },
  ],
  tabularSections: [
    { kind: 'ТабличнаяЧасть', name: 'Курсы', fullName: 'Справочник.Валюты.Курсы', fields: [{ name: 'Курс', kind: 'attribute', types: [] }] },
  ],
};
const СЧЕТА: MetaTable = {
  kind: 'Справочник', name: 'БанковскиеСчета', fullName: 'Справочник.БанковскиеСчета',
  fields: [
    { name: 'Ссылка', kind: 'standard', types: [{ ref: { kind: 'Справочник', name: 'БанковскиеСчета' } }] },
    { name: 'Наименование', kind: 'standard', types: [{ primitive: 'Строка' }] },
    { name: 'Валюта', kind: 'attribute', types: [{ ref: { kind: 'Справочник', name: 'Валюты' } }] },
  ],
};
const resolver = buildResolverFromTables([ВАЛЮТЫ, СЧЕТА]);

const errs = (text: string) => validateBatchSemantics(parseBatch(text), resolver, text).map(e => e.message);
const MISSING = 'Поле "Нет" не найдено в "Справочник.Валюты"';

const S = 'Справочник.Валюты КАК Х';
const W = `ВЫБРАТЬ Х.Код КАК К ИЗ ${S} `;

describe('C41: a missing field in raw expression text is refused', () => {
  const cases: [string, string, string?][] = [
    ['select arithmetic', `ВЫБРАТЬ Х.Код + Х.Нет КАК П ИЗ ${S}`],
    ['select with a Поле1 alias', `ВЫБРАТЬ Х.Нет КАК Поле1 ИЗ ${S}`],
    ['select function', `ВЫБРАТЬ ЕСТЬNULL(Х.Нет, 0) КАК П ИЗ ${S}`],
    ['select ВЫБОР', `ВЫБРАТЬ ВЫБОР КОГДА Х.Нет = 1 ТОГДА 1 ИНАЧЕ 0 КОНЕЦ КАК П ИЗ ${S}`],
    ['where with a literal', `${W}ГДЕ Х.Нет = 1`],
    ['where Boolean field', `${W}ГДЕ Х.Нет`],
    ['where ИЛИ', `${W}ГДЕ Х.Код = "1" ИЛИ Х.Нет = 2`],
    ['where bare field (qualified by the sole source)', `${W}ГДЕ Нет = 1`],
    ['having', `${W}СГРУППИРОВАТЬ ПО Х.Код ИМЕЮЩИЕ СУММА(Х.Нет) > 1`],
    ['order expression', `${W}УПОРЯДОЧИТЬ ПО Х.Код + Х.Нет`],
    ['join condition', `${W}ЛЕВОЕ СОЕДИНЕНИЕ Справочник.БанковскиеСчета КАК Б ПО Б.Валюта = Х.Ссылка И Х.Нет = 1`],
    ['through a reference', `ВЫБРАТЬ Х.Ссылка.Нет + 1 КАК П ИЗ ${S}`],
    ['tabular section through a dot', `${W}ГДЕ Х.Курсы.Нет = 1 ИЛИ Х.Код = "1"`, 'Поле "Нет" не найдено в "Справочник.Валюты.Курсы"'],
    ['English', `SELECT Х.Код + Х.Нет AS П FROM Catalog.Валюты AS Х`],
    ['nested query with two sources, local alias', `${W}ГДЕ Х.Ссылка В (ВЫБРАТЬ Б.Валюта ИЗ Справочник.БанковскиеСчета КАК Б, ${S.replace('Х', 'Ю')} ГДЕ Ю.Нет = 1 ИЛИ Б.Валюта = Ю.Ссылка)`],
  ];
  it.each(cases)('%s', (_name, text, message = MISSING) => {
    expect(errs(text)).toEqual([message]);
  });

  const fixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../fixtures/platform/c41-raw-field-refs.json'), 'utf8'));
  it.each(fixture.cases.map((c: { name: string }) => [c.name, c]))('platform probe %s: refused like the platform', (_name, c) => {
    expect(c.platform.valid).toBe(false);
    expect(errs(c.query)).toEqual(['Поле "НетТакогоПоля" не найдено в "Справочник.Валюты"']);
  });

  it('is refused by Apply and when opened', () => {
    const text = `ВЫБРАТЬ Х.Код + Х.Нет КАК П ИЗ ${S}`;
    expect(validateBatchText(text, resolver)).toEqual({ ok: false, error: MISSING });
    expect(decideApply(text, null, null, resolver)).toMatchObject({ ok: false, kind: 'invalid', error: MISSING });
    expect(tryOpenBatch(text, resolver)).toMatchObject({ ok: false, error: MISSING });
  });
});

describe('C41: existing fields and non-field words are not refused', () => {
  const ok: [string, string][] = [
    ['existing fields', `ВЫБРАТЬ Х.Код + Х.Наименование КАК П ИЗ ${S} ГДЕ Х.Код = "1" ИЛИ Х.ОсновнаяВалюта`],
    ['ЗНАЧЕНИЕ', `${W}ГДЕ Х.Ссылка = ЗНАЧЕНИЕ(Справочник.Валюты.ПустаяСсылка) ИЛИ Х.Код = "1"`],
    ['ТИП and ССЫЛКА', `${W}ГДЕ ТИПЗНАЧЕНИЯ(Х.Ссылка) = ТИП(Справочник.Валюты) ИЛИ Х.Ссылка ССЫЛКА Справочник.Валюты`],
    ['ВЫРАЗИТЬ to a type', `ВЫБРАТЬ ВЫРАЗИТЬ(Х.Ссылка КАК Справочник.Валюты).Код КАК П ИЗ ${S}`],
    ['pseudo-field', `ВЫБРАТЬ Х.Ссылка.Представление + "" КАК П ИЗ ${S}`],
    ['ПРЕДСТАВЛЕНИЕ', `ВЫБРАТЬ ПРЕДСТАВЛЕНИЕ(Х.Ссылка) КАК П ИЗ ${S}`],
    ['tabular section field', `${W}ГДЕ Х.Курсы.Курс = 1 ИЛИ Х.Код = "1"`],
    ['target table without metadata', `ВЫБРАТЬ Х.Счет.Что + 1 КАК П ИЗ ${S}`],
    ['string literal and comment', `${W}ГДЕ Х.Наименование = "Х.Нет" // Х.Нет\n ИЛИ Х.Код = "1"`],
    ['unknown table: no second error', 'ВЫБРАТЬ Х.Что + 1 КАК П ИЗ Справочник.НетТакого КАК Х'],
  ];
  it.each(ok)('%s', (name, text) => {
    expect(errs(text)).toEqual(name === 'unknown table: no second error' ? ['{(1, 28)}: Таблица не найдена "Справочник.НетТакого"'] : []);
  });

  it('without metadata nothing is checked', () => {
    const text = `ВЫБРАТЬ Х.Код + Х.Нет КАК П ИЗ ${S}`;
    expect(validateBatchSemantics(parseBatch(text), undefined, text)).toEqual([]);
  });
});

describe('C41: correlated subqueries stay conservative', () => {
  const sub = (body: string) => `${W}ГДЕ Х.Ссылка В (${body})`;
  const ok: [string, string][] = [
    // One source: validation parses without metadata, so a bare outer field is bound to Б.
    ['one source, bare outer field', sub('ВЫБРАТЬ Б.Валюта ИЗ Справочник.БанковскиеСчета КАК Б ГДЕ ОсновнаяВалюта ИЛИ Б.Валюта = &В')],
    ['one source, qualified outer field', sub('ВЫБРАТЬ Б.Валюта ИЗ Справочник.БанковскиеСчета КАК Б ГДЕ Х.ОсновнаяВалюта ИЛИ Б.Валюта = &В')],
    ['two sources, existing outer field', sub(`ВЫБРАТЬ Б.Валюта ИЗ Справочник.БанковскиеСчета КАК Б, ${S.replace('Х', 'Ю')} ГДЕ Х.ОсновнаяВалюта ИЛИ Б.Валюта = Ю.Ссылка`)],
    ['two sources, missing outer field (an outer alias is not checked)', sub(`ВЫБРАТЬ Б.Валюта ИЗ Справочник.БанковскиеСчета КАК Б, ${S.replace('Х', 'Ю')} ГДЕ Х.Нет = 1 ИЛИ Б.Валюта = Ю.Ссылка`)],
  ];
  it.each(ok)('%s', (_name, text) => {
    expect(errs(text)).toEqual([]);
  });

  // Stage 2 (C41 2a/2b): both were left unchecked by stage 1.
  it('one source, missing local field: refused since stage 2', () => {
    expect(errs(sub('ВЫБРАТЬ Б.Валюта ИЗ Справочник.БанковскиеСчета КАК Б ГДЕ Б.Нет = 1 ИЛИ Б.Валюта = &В')))
      .toEqual(['Поле "Нет" не найдено в "Справочник.БанковскиеСчета"']);
  });
  it('raw-text subquery in a raw condition: refused since stage 2', () => {
    expect(errs(`${W}ГДЕ Х.Код = "1" ИЛИ Х.Ссылка В (ВЫБРАТЬ Ю.Ссылка ИЗ ${S.replace('Х', 'Ю')} ГДЕ Ю.Нет = 1)`)).toEqual([MISSING]);
  });

  it('an inner alias that shadows an outer one is checked as local', () => {
    expect(errs(sub(`ВЫБРАТЬ Б.Валюта ИЗ Справочник.БанковскиеСчета КАК Б, ${S} ГДЕ Х.Нет = 1 ИЛИ Б.Валюта = Х.Ссылка`))).toEqual([MISSING]);
  });
});

describe('C41: a path the parser made up is not reported as a missing field', () => {
  // Source alias `В` is platform-invalid (RP11, grammar-parity source.alias-reserved-word-v).
  // The parser reads `НЕ В.ПометкаУдаления` as `В.НЕ В .ПометкаУдаления`; `В.НЕ` is its
  // artefact, not a field the user wrote, so it is not reported as `Поле "НЕ"`.
  it('operator word as a path segment', () => {
    expect(errs('ВЫБРАТЬ В.Код КАК Код ИЗ Справочник.Валюты КАК В ГДЕ НЕ В.ПометкаУдаления')).toEqual([]);
  });
});
