/**
 * Stage 1A regression (docs/development/audits/stage-0.md, RP01-RP03): a bare
 * dotted path whose leading segments are the owner table's full name
 * (`Справочник.Валюты.ПометкаУдаления` over `ИЗ Справочник.Валюты`) is a
 * reference TO the table, not part of the field path. Every place that binds a
 * bare path to its owner must drop that prefix before prefixing the owner
 * alias; otherwise the model stores `Валюты.Справочник.Валюты.Поле` and Apply
 * writes it back. Platform canonical texts below were captured from a live 1C
 * 8.3 query wizard (platform-reprobe-results.jsonl, RP01/RP02).
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { buildYamlResolver } from '../../src/core/metadata/buildYamlResolver';
import type { MetadataResolver } from '../../src/core/query/metadataResolver';

const resolver = buildYamlResolver(path.resolve(__dirname, '../fixtures/corpus/metadata/cf'));
const MODES: Array<[string, MetadataResolver | undefined]> = [['without resolver', undefined], ['with resolver', resolver]];

const gen = (text: string, r?: MetadataResolver): string => generateBatch(parseBatch(text, r));
const fixture = (name: string): { input: string; expected: string } =>
  JSON.parse(fs.readFileSync(path.resolve(__dirname, '../fixtures/oracle', name), 'utf8'));

const DOUBLED = /(^|[^\p{L}\p{N}_])([\p{L}_][\p{L}\p{N}_]*)\.(Справочник\.)/iu;
const expectNoDoubleQualification = (text: string): void => {
  expect(text).not.toMatch(DOUBLED);
  expect(text).not.toMatch(/Справочник\.([\p{L}\p{N}_]+)\.Справочник\.\1\./iu);
};

describe.each(MODES)('full-name-qualified bare paths (%s)', (_mode, r) => {
  it('RP01: top-level boolean condition matches the platform canonical text', () => {
    const input = 'ВЫБРАТЬ\n\tСправочник.Валюты.Код\nИЗ\n\tСправочник.Валюты\nГДЕ\n\tСправочник.Валюты.ПометкаУдаления';
    const platform = 'ВЫБРАТЬ\n\tВалюты.Код КАК Код\nИЗ\n\tСправочник.Валюты КАК Валюты\nГДЕ\n\tВалюты.ПометкаУдаления';
    expect(gen(input, r)).toBe(platform);
    expect(gen(platform, r)).toBe(platform);
  });

  it('RP01 variant: negated boolean condition', () => {
    const out = gen('ВЫБРАТЬ Справочник.Валюты.Код ИЗ Справочник.Валюты ГДЕ НЕ Справочник.Валюты.ПометкаУдаления', r);
    expect(out).toContain('ГДЕ\n\tНЕ Валюты.ПометкаУдаления');
    expectNoDoubleQualification(out);
  });

  it('RP02: condition subquery without alias keeps the full-name qualification (platform canonical)', () => {
    const platform =
      'ВЫБРАТЬ\n\tВал.Код КАК Код\nИЗ\n\tСправочник.Валюты КАК Вал\nГДЕ\n\tВал.Ссылка В\n\t\t\t(ВЫБРАТЬ\n\t\t\t\tСправочник.Валюты.Ссылка\n\t\t\tИЗ\n\t\t\t\tСправочник.Валюты\n\t\t\tГДЕ\n\t\t\t\tСправочник.Валюты.ПометкаУдаления)';
    expect(gen(platform, r)).toBe(platform);
  });

  it.each([
    '0163-where-subquery-bare-source-qualifies-fields.json',
    '0164-negated-where-hierarchy-subquery-qualifies.json',
  ])('RP03 / fixture %s: canonical text survives a second parse/generate pass', (name) => {
    const f = fixture(name);
    expect(gen(f.input, r)).toBe(f.expected);
    expect(gen(f.expected, r)).toBe(f.expected);
  });

  it('comparison control: `Справочник.X.Код = &p` stays unaffected', () => {
    const out = gen('ВЫБРАТЬ Справочник.Валюты.Код ИЗ Справочник.Валюты ГДЕ Справочник.Валюты.Код = &Код', r);
    expect(out).toContain('ГДЕ\n\tВалюты.Код = &Код');
    expect(gen(out, r)).toBe(out);
  });

  it('alias control: an alias-qualified boolean condition gets no extra qualifier', () => {
    const text = 'ВЫБРАТЬ\n\tВалюты.Код КАК Код\nИЗ\n\tСправочник.Валюты КАК Валюты\nГДЕ\n\tВалюты.ПометкаУдаления';
    expect(gen(text, r)).toBe(text);
  });

  it('multi-segment navigation after the full name is kept, not truncated', () => {
    const out = gen('ВЫБРАТЬ Справочник.Валюты.Код ИЗ Справочник.Валюты ГДЕ Справочник.Валюты.ОсновнаяВалюта.ПометкаУдаления', r);
    expect(out).toContain('ГДЕ\n\tВалюты.ОсновнаяВалюта.ПометкаУдаления');
    expect(gen(out, r)).toBe(out);
    const aliased = 'ВЫБРАТЬ\n\tВалюты.Код КАК Код\nИЗ\n\tСправочник.Валюты КАК Валюты\nГДЕ\n\tВалюты.ОсновнаяВалюта.ПометкаУдаления';
    expect(gen(aliased, r)).toBe(aliased);
  });

  it('bare single-segment field is still qualified with the sole source alias', () => {
    const out = gen('ВЫБРАТЬ Код ИЗ Справочник.Валюты ГДЕ ПометкаУдаления', r);
    expect(out).toContain('ГДЕ\n\tВалюты.ПометкаУдаления');
  });

  // Same root cause in the other owner-binding sites (blast-radius analysis):
  // the full-name form must generate exactly what the implicit-alias form does.
  it.each([
    ['ORDER BY', 'УПОРЯДОЧИТЬ ПО Справочник.Валюты.Код', 'УПОРЯДОЧИТЬ ПО Валюты.Код'],
    ['GROUP BY', 'СГРУППИРОВАТЬ ПО Справочник.Валюты.Код', 'СГРУППИРОВАТЬ ПО Валюты.Код'],
    ['TOTALS', 'ИТОГИ СУММА(Наценка) ПО Справочник.Валюты.Наименование', 'ИТОГИ СУММА(Наценка) ПО Валюты.Наименование'],
  ])('%s: full-name path equals the implicit-alias form', (_section, fullTail, aliasTail) => {
    const head = 'ВЫБРАТЬ Справочник.Валюты.Код, Справочник.Валюты.Наценка ИЗ Справочник.Валюты ';
    const out = gen(head + fullTail, r);
    expectNoDoubleQualification(out);
    expect(out).toBe(gen(head + aliasTail, r));
    expect(gen(out, r)).toBe(out);
  });

  it('TOTALS over a SELECT column: platform prints the column alias', () => {
    // Live 1C 8.3 query wizard output for the full-name input below.
    const platform =
      'ВЫБРАТЬ\n\tКурсыВалют.Валюта КАК Валюта,\n\tКурсыВалют.Курс КАК Курс\nИЗ\n\tРегистрСведений.КурсыВалют КАК КурсыВалют\nИТОГИ\n\tСУММА(Курс)\nПО\n\tВалюта';
    const input =
      'ВЫБРАТЬ РегистрСведений.КурсыВалют.Валюта, РегистрСведений.КурсыВалют.Курс ИЗ РегистрСведений.КурсыВалют ИТОГИ СУММА(Курс) ПО РегистрСведений.КурсыВалют.Валюта';
    expect(gen(input, r)).toBe(platform);
    expect(gen(platform, r)).toBe(platform);
  });

  it('ORDER BY and GROUP BY: live platform canonical texts', () => {
    expect(gen('ВЫБРАТЬ Справочник.Валюты.Код ИЗ Справочник.Валюты УПОРЯДОЧИТЬ ПО Справочник.Валюты.Наименование', r)).toBe(
      'ВЫБРАТЬ\n\tВалюты.Код КАК Код\nИЗ\n\tСправочник.Валюты КАК Валюты\n\nУПОРЯДОЧИТЬ ПО\n\tВалюты.Наименование',
    );
    expect(gen('ВЫБРАТЬ Справочник.Валюты.Код, КОЛИЧЕСТВО(*) КАК К ИЗ Справочник.Валюты СГРУППИРОВАТЬ ПО Справочник.Валюты.Код', r)).toBe(
      'ВЫБРАТЬ\n\tВалюты.Код КАК Код,\n\tКОЛИЧЕСТВО(*) КАК К\nИЗ\n\tСправочник.Валюты КАК Валюты\n\nСГРУППИРОВАТЬ ПО\n\tВалюты.Код',
    );
  });

  it('HAVING: full-name boolean condition', () => {
    const out = gen(
      'ВЫБРАТЬ Справочник.Валюты.ПометкаУдаления, КОЛИЧЕСТВО(*) КАК К ИЗ Справочник.Валюты СГРУППИРОВАТЬ ПО Справочник.Валюты.ПометкаУдаления ИМЕЮЩИЕ Справочник.Валюты.ПометкаУдаления',
      r,
    );
    expectNoDoubleQualification(out);
    expect(gen(out, r)).toBe(out);
  });

  it('UNION member and temp-table statement: full-name boolean condition', () => {
    for (const text of [
      'ВЫБРАТЬ Вал.Код ИЗ Справочник.Валюты КАК Вал ОБЪЕДИНИТЬ ВСЕ ВЫБРАТЬ Справочник.Валюты.Код ИЗ Справочник.Валюты ГДЕ Справочник.Валюты.ПометкаУдаления',
      'ВЫБРАТЬ Справочник.Валюты.Код ПОМЕСТИТЬ ВТ ИЗ Справочник.Валюты ГДЕ Справочник.Валюты.ПометкаУдаления',
    ]) {
      const out = gen(text, r);
      expectNoDoubleQualification(out);
      expect(out).toContain('Валюты.ПометкаУдаления');
      expect(gen(out, r)).toBe(out);
    }
  });

  it('full-name prefix match is case-insensitive', () => {
    const out = gen('ВЫБРАТЬ справочник.валюты.Код ИЗ Справочник.Валюты ГДЕ справочник.валюты.ПометкаУдаления', r);
    expect(out).toContain('ГДЕ\n\tВалюты.ПометкаУдаления');
  });
});
