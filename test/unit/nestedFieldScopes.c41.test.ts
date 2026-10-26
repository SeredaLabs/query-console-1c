import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseBatch } from '../../src/core/query/sdblParser';
import { buildResolverFromTables } from '../../src/core/metadata/buildModelResolver';
import { validateBatchSemantics } from '../../src/core/query/semanticValidator';
import { tryOpenBatch, validateBatchText } from '../../src/core/query/validateBatch';
import type { MetaTable } from '../../src/core/metadata/types';

// C41 stage 2: field paths in nested queries are checked in their own scope.
// 2a — a nested query with one source: validation parses without metadata, so a bare
//      outer field is bound to the local source. A path is checked only when its field
//      cannot belong to an enclosing query: its first segment is not an outer alias and
//      no outer source with known metadata has it; an outer source without metadata
//      (subquery, temporary table, parameter) leaves it unchecked. Structured ГДЕ/ИМЕЮЩИЕ
//      conditions of nested queries follow the same rule.
// 2b — a subquery kept as raw text is parsed (as for C48) and checked as a nested query.
// The platform refuses a missing local field in a subquery and accepts a correlated
// reference: test/fixtures/platform/c41-nested-scopes.json.

const ВАЛЮТЫ: MetaTable = {
  kind: 'Справочник', name: 'Валюты', fullName: 'Справочник.Валюты',
  fields: [
    { name: 'ОсновнаяВалюта', kind: 'attribute', types: [] },
    { name: 'Ссылка', kind: 'standard', types: [{ ref: { kind: 'Справочник', name: 'Валюты' } }] },
    { name: 'Наименование', kind: 'standard', types: [{ primitive: 'Строка' }] },
    { name: 'Код', kind: 'standard', types: [{ primitive: 'Строка' }] },
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
// As Apply and opening do: the text is parsed without metadata.
const errs = (text: string) => validateBatchSemantics(parseBatch(text), resolver, text).map(e => e.message);

const MISSING = 'Поле "Нет" не найдено в "Справочник.БанковскиеСчета"';
const T = 'ВЫБРАТЬ Т.Код КАК К ИЗ Справочник.Валюты КАК Т ';
const S = 'Справочник.БанковскиеСчета КАК Б';
const inSub = (where: string) => `${T}ГДЕ Т.Ссылка В (ВЫБРАТЬ Б.Валюта ИЗ ${S} ГДЕ ${where})`;
const rawSub = (where: string) => `${T}ГДЕ Т.Код = "1" ИЛИ Т.Ссылка В (ВЫБРАТЬ Б.Валюта ИЗ ${S} ГДЕ ${where})`;

describe('C41 2a: a nested query with one source', () => {
  it.each([
    ['raw condition', inSub('Б.Нет = 1')],
    ['structured condition', inSub('Б.Нет = &П')],
    ['bare field in a raw condition, missing everywhere', inSub('Нет = 1')],
    ['bare field in a structured condition, missing everywhere', inSub('Нет = &П')],
    ['ИМЕЮЩИЕ', `${T}ГДЕ Т.Ссылка В (ВЫБРАТЬ Б.Валюта ИЗ ${S} СГРУППИРОВАТЬ ПО Б.Валюта ИМЕЮЩИЕ МАКСИМУМ(Б.Нет) > 1)`],
    ['a source subquery (no enclosing query)', `ВЫБРАТЬ П.С КАК С ИЗ (ВЫБРАТЬ Б.Ссылка КАК С ИЗ ${S} ГДЕ Б.Нет = 1) КАК П`],
    ['an inner alias that shadows the outer one', `${T}ГДЕ Т.Ссылка В (ВЫБРАТЬ Т.Валюта ИЗ Справочник.БанковскиеСчета КАК Т ГДЕ Т.Нет = 1)`],
  ])('%s: a missing local field is refused', (_name, text) => {
    expect(errs(text)).toEqual([MISSING]);
  });

  it.each([
    ['correlated bare outer field, raw', inSub('ОсновнаяВалюта ИЛИ Б.Валюта = &В')],
    ['correlated bare outer field, structured', inSub('ОсновнаяВалюта = &О')],
    ['correlated qualified outer field', inSub('Б.Валюта = Т.Ссылка ИЛИ Т.ОсновнаяВалюта')],
    // Ambiguous: missing locally, present in the enclosing source. The platform refuses an
    // authored `Б.ОсновнаяВалюта`, but the parsed model cannot tell it from a bare outer field.
    ['a local path whose field only an outer source has (fail-open)', inSub('Б.ОсновнаяВалюта = 1')],
    ['an inner alias shadowing the outer one, field only outer (fail-open)', `${T}ГДЕ Т.Ссылка В (ВЫБРАТЬ Т.Валюта ИЗ Справочник.БанковскиеСчета КАК Т ГДЕ Т.ОсновнаяВалюта = 1)`],
    ['an outer source without metadata (parameter)', `ВЫБРАТЬ Т.Код КАК К ИЗ &Источник КАК Т ГДЕ Т.Ссылка В (ВЫБРАТЬ Б.Валюта ИЗ ${S} ГДЕ Нет = 1)`],
    ['an outer source without metadata (subquery)', `ВЫБРАТЬ Т.Код КАК К ИЗ (ВЫБРАТЬ В.Код КАК Код, В.Ссылка КАК Ссылка ИЗ Справочник.Валюты КАК В) КАК Т ГДЕ Т.Ссылка В (ВЫБРАТЬ Б.Валюта ИЗ ${S} ГДЕ Нет = 1)`],
    ['an outer source without metadata (temporary table)', `ВЫБРАТЬ В.Ссылка КАК Ссылка ПОМЕСТИТЬ ВТ ИЗ Справочник.Валюты КАК В;\nВЫБРАТЬ Т.Ссылка КАК С ИЗ НеизвестнаяВТ КАК Т ГДЕ Т.Ссылка В (ВЫБРАТЬ Б.Валюта ИЗ ${S} ГДЕ Нет = 1)`],
    // Golden-corpus shape: the outer alias inside a subquery over a temporary table.
    ['an outer alias inside a subquery over a temporary table',
      'ВЫБРАТЬ В.Ссылка КАК Ссылка ПОМЕСТИТЬ ВТ ИЗ Справочник.Валюты КАК В;\n'
      + `${T}ГДЕ ИСТИНА В (ВЫБРАТЬ ПЕРВЫЕ 1 ИСТИНА ИЗ ВТ КАК ВТ ГДЕ Т.Ссылка <> &С И Т.ОсновнаяВалюта)`],
    ['existing local fields', inSub('Б.Наименование = "а" ИЛИ Б.Валюта = &В')],
    ['ЗНАЧЕНИЕ and ССЫЛКА', inSub('Б.Валюта = ЗНАЧЕНИЕ(Справочник.Валюты.ПустаяСсылка) ИЛИ Б.Валюта ССЫЛКА Справочник.Валюты')],
  ])('%s: not refused', (_name, text) => {
    expect(errs(text)).toEqual([]);
  });
});

describe('C41 2b: a subquery kept as raw text', () => {
  it.each([
    ['in an ИЛИ condition', rawSub('Б.Нет = 1')],
    ['bare field missing everywhere', rawSub('Нет = 1')],
    ['in its select list', `${T}ГДЕ Т.Код = "1" ИЛИ Т.Ссылка В (ВЫБРАТЬ Б.Нет ИЗ ${S})`],
    ['two levels of raw text', `${T}ГДЕ Т.Код = "1" ИЛИ Т.Ссылка В (ВЫБРАТЬ Б.Валюта ИЗ ${S} ГДЕ Б.Наименование = "1" ИЛИ Б.Ссылка В `
      + '(ВЫБРАТЬ Ш.Ссылка ИЗ Справочник.БанковскиеСчета КАК Ш ГДЕ Ш.Нет = 1))'],
    ['in a field ВЫБОР', `ВЫБРАТЬ ВЫБОР КОГДА Т.Ссылка В (ВЫБРАТЬ Б.Валюта ИЗ ${S} ГДЕ Б.Нет = 1) ТОГДА 1 ИНАЧЕ 0 КОНЕЦ КАК Ф ИЗ Справочник.Валюты КАК Т`],
    ['in a join condition', `${T}ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Валюты КАК Д ПО Д.Ссылка = Т.Ссылка И Т.Ссылка В (ВЫБРАТЬ Б.Валюта ИЗ ${S} ГДЕ Б.Нет = 1)`],
  ])('%s: a missing local field is refused', (_name, text) => {
    expect(errs(text)).toEqual([MISSING]);
  });

  it.each([
    ['correlated qualified outer field', rawSub('Б.Валюта = Т.Ссылка')],
    ['correlated bare outer field', rawSub('ОсновнаяВалюта')],
    ['existing fields', rawSub('Б.Наименование = "а"')],
    // Broken raw text is refused by the C48 check; an existing field adds no field error.
    ['broken text with existing fields', rawSub('Б.Наименование = "а" И')],
  ])('%s: no field error', (_name, text) => {
    expect(errs(text)).toEqual([]);
  });
});

describe('C41 2: Apply, opening and metadata', () => {
  const fixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../fixtures/platform/c41-nested-scopes.json'), 'utf8'));
  const probe = (name: string) => fixture.cases.find((c: { name: string }) => c.name === name);
  it('agrees with the platform probes', () => {
    expect(probe('nested_local_missing').platform.valid).toBe(false);
    expect(errs(probe('nested_local_missing').query)).toEqual(['Поле "НетТакогоПоля" не найдено в "Справочник.Валюты"']);
    expect(probe('nested_correlated').platform.valid).toBe(true);
    expect(errs(probe('nested_correlated').query)).toEqual([]);
    // Refused by the platform; checked since stage 2c (unknownAlias.c41.test.ts).
    expect(errs(probe('unknown_alias').query)).toEqual(['Поле "Ъ.Код" не найдено']);
  });

  it('Apply and opening refuse a missing field in a nested query', () => {
    for (const text of [inSub('Б.Нет = 1'), rawSub('Б.Нет = 1')]) {
      expect(validateBatchText(text, resolver)).toEqual({ ok: false, error: MISSING });
      expect(tryOpenBatch(text, resolver)).toMatchObject({ ok: false, error: MISSING });
    }
  });

  it('without metadata nothing is checked', () => {
    for (const text of [inSub('Б.Нет = 1'), rawSub('Б.Нет = 1')]) {
      expect(validateBatchSemantics(parseBatch(text), undefined, text)).toEqual([]);
    }
  });

  it('a raw subquery parse is reused through the given cache; results follow the resolver', () => {
    const text = rawSub('Б.Нет = 1');
    const doc = parseBatch(text);
    const parses = new Map();
    expect(validateBatchSemantics(doc, resolver, text, { subqueryParses: parses }).map(e => e.message)).toEqual([MISSING]);
    expect(parses.size).toBe(1);
    const parsed = [...parses.values()][0];
    const withНет = buildResolverFromTables([ВАЛЮТЫ, { ...СЧЕТА, fields: [...СЧЕТА.fields, { name: 'Нет', kind: 'attribute', types: [] }] }]);
    expect(validateBatchSemantics(doc, withНет, text, { subqueryParses: parses })).toEqual([]);
    expect([...parses.values()][0]).toBe(parsed);
  });
});
