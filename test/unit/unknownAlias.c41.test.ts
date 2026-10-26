import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseBatch } from '../../src/core/query/sdblParser';
import { buildYamlResolver } from '../../src/core/metadata/buildYamlResolver';
import { validateBatchSemantics } from '../../src/core/query/semanticValidator';
import { tryOpenBatch, validateBatchText } from '../../src/core/query/validateBatch';
import { computeQueryParseProblems } from '../../src/extension/queryDiagnostics';

// C41 stage 2c: the head of `Голова.Путь` that names no source of the query or of an
// enclosing one, no metadata type and no field or tabular section of a visible source
// is an unknown alias; the platform refuses it (`Field not found "Ъ.Код"`). Checked with
// metadata only, in raw expression text, in a select field the parser bound as a bare
// dotted path and in an unbound УПОРЯДОЧИТЬ path. A visible source without known
// columns leaves the head unchecked (fail-open). Evidence and verdicts:
// test/fixtures/platform/c41-unknown-alias.json (all 25 probes on the platform).

const resolver = buildYamlResolver(path.resolve(__dirname, '../fixtures/corpus/metadata/cf'));
interface Probe { name: string; ours: 'unknownAlias' | 'refusedBefore' | 'knownLimitation' | 'valid'; path?: string; query: string; platform: { valid: boolean; error?: string } }
const fixture: { cases: Probe[] } = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../fixtures/platform/c41-unknown-alias.json'), 'utf8'));
const probes = (ours: Probe['ours']) => fixture.cases.filter(c => c.ours === ours).map(c => [c.name, c] as const);

describe('C41 2c: platform probes', () => {
  it('cover 25 cases: 10 newly refused, 2 refused before, 3 known limitations, 10 valid', () => {
    expect(fixture.cases).toHaveLength(25);
    expect(['unknownAlias', 'refusedBefore', 'knownLimitation', 'valid'].map(k => probes(k as Probe['ours']).length)).toEqual([10, 2, 3, 10]);
  });

  it.each(probes('unknownAlias'))('%s: refused as an unknown alias, with the platform\'s path', (_name, c) => {
    expect(c.platform.valid).toBe(false);
    expect(c.platform.error).toContain(`Field not found "${c.path}"`);
    const message = `Поле "${c.path}" не найдено`;
    expect(validateBatchText(c.query, resolver)).toEqual({ ok: false, error: message });
    expect(tryOpenBatch(c.query, resolver)).toMatchObject({ ok: false, error: message });
    const errors = validateBatchSemantics(parseBatch(c.query), resolver, c.query);
    expect(errors.map(e => e.details?.kind)).toEqual(['unknownAlias']);
  });

  it.each(probes('refusedBefore'))('%s: still refused as before (bound to the only source)', (_name, c) => {
    expect(c.platform.valid).toBe(false);
    expect(validateBatchText(c.query, resolver)).toEqual({ ok: false, error: 'Поле "Ъ" не найдено в "Справочник.Валюты"' });
  });

  // Known limitations, not refused: a metadata-type head is never taken as an alias, and the
  // parser takes the short name of a source without КАК as its alias (it writes `КАК <имя>`,
  // so the applied text is valid).
  it.each(probes('knownLimitation'))('%s: accepted although the platform refuses it (documented)', (_name, c) => {
    expect(c.platform.valid).toBe(false);
    expect(validateBatchText(c.query, resolver)).toEqual({ ok: true });
  });

  it.each(probes('valid'))('%s: valid on the platform, accepted', (_name, c) => {
    expect(c.platform.valid).toBe(true);
    expect(validateBatchText(c.query, resolver)).toEqual({ ok: true });
    expect(tryOpenBatch(c.query, resolver).ok).toBe(true);
  });
});

describe('C41 2c: fail-open and scopes', () => {
  const V = 'Справочник.Валюты';
  it.each([
    ['a parameter source has no known columns', `ВЫБРАТЬ Т.Код + Ъ.Код КАК Х ИЗ &Источник КАК Т`],
    ['a source subquery with a wildcard', `ВЫБРАТЬ П.Код + Ъ.Код КАК Х ИЗ (ВЫБРАТЬ * ИЗ ${V} КАК В) КАК П`],
    ['a temporary table without a schema', `ВЫБРАТЬ Т.Код + Ъ.Код КАК Х ИЗ НеизвестнаяВТ КАК Т`],
    ['an enclosing source has no known columns', `ВЫБРАТЬ Т.Код КАК К ИЗ &Источник КАК Т ГДЕ Т.Ссылка В (ВЫБРАТЬ Б.Ссылка ИЗ ${V} КАК Б ГДЕ Ъ.Код = 1)`],
    ['a head that is a field of a source (bare path)', `ВЫБРАТЬ Ссылка.Код + "" КАК Х ИЗ ${V} КАК Т`],
    ['correlated outer alias in a raw-text subquery', `ВЫБРАТЬ Т.Код КАК К ИЗ ${V} КАК Т ГДЕ Т.Код = "1" ИЛИ Т.Ссылка В (ВЫБРАТЬ Б.Ссылка ИЗ ${V} КАК Б ГДЕ Б.Код = Т.Код)`],
    ['a derived column of a source subquery', `ВЫБРАТЬ П.Код КАК К ИЗ (ВЫБРАТЬ В.Ссылка КАК Код ИЗ ${V} КАК В) КАК П ГДЕ Код.Код = "1" ИЛИ П.Код = &К`],
    ['metadata names in ЗНАЧЕНИЕ, ТИП, ССЫЛКА, ВЫРАЗИТЬ', `ВЫБРАТЬ Т.Код КАК К ИЗ ${V} КАК Т ГДЕ ТИПЗНАЧЕНИЯ(Т.Ссылка) = ТИП(Справочник.Валюты) ИЛИ Т.Ссылка ССЫЛКА Документ.Нет ИЛИ Т.Ссылка = ЗНАЧЕНИЕ(Перечисление.Нет.Нет)`],
    ['a string literal and a comment', `ВЫБРАТЬ Т.Код КАК К ИЗ ${V} КАК Т ГДЕ Т.Наименование = "Ъ.Код" // Ъ.Код\n ИЛИ Т.Код = "1"`],
  ])('%s: no unknown alias', (_name, text) => {
    expect(validateBatchSemantics(parseBatch(text), resolver, text).filter(e => e.details?.kind === 'unknownAlias')).toEqual([]);
  });

  it('without metadata nothing is checked', () => {
    const text = `ВЫБРАТЬ Т.Код + Ъ.Код КАК Х ИЗ ${V} КАК Т`;
    expect(validateBatchSemantics(parseBatch(text), undefined, text)).toEqual([]);
  });

  it('one unknown head is reported once per query', () => {
    const text = `ВЫБРАТЬ Т.Код + Ъ.Код КАК Х, Ъ.Код + 1 КАК У ИЗ ${V} КАК Т ГДЕ Ъ.Код = 1`;
    expect(validateBatchSemantics(parseBatch(text), resolver, text).map(e => e.message)).toEqual(['Поле "Ъ.Код" не найдено']);
  });
});

describe('C41 2c: editor diagnostics', () => {
  it('report an unknown alias with loaded metadata, on the query keyword', () => {
    const source = 'Запрос.Текст = "ВЫБРАТЬ Т.Код + Ъ.Код КАК Х ИЗ Справочник.Валюты КАК Т";';
    const start = source.indexOf('ВЫБРАТЬ');
    expect(computeQueryParseProblems(source, resolver)).toEqual([
      { kind: 'fieldNotFound', message: 'Поле "Ъ.Код" не найдено', start, end: start + 'ВЫБРАТЬ'.length },
    ]);
    expect(computeQueryParseProblems(source)).toEqual([]);
  });
});
