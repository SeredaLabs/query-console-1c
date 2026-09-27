/**
 * Stage 1B.4 regression (docs/development/audits/stage-0.md, RP14): the
 * select-list construct `ПУСТАЯТАБЛИЦА.(<columns>)`. Live 1C 8.3 (query console +
 * query wizard) established:
 *  - the parentheses hold a list of COLUMN NAMES, not expressions: `Имя` or the
 *    canonical ` КАК Имя`; an empty list is allowed;
 *  - the wizard canonical is `ПУСТАЯТАБЛИЦА.( КАК A,  КАК B)` (empty value +
 *    alias per item, items joined with `, `), `()` becomes `( КАК Поле1)` for
 *    every empty list, any spelling of the head becomes `ПУСТАЯТАБЛИЦА`;
 *  - invalid: `Вал.Код` ("Invalid alias"), `Код КАК К1`, `&Парам`, `Код + 1`,
 *    `ПОДСТРОКА(Код, 1, 2)`, a reserved word (`В`), and the construct inside a
 *    condition (`ГДЕ (…) В (ПУСТАЯТАБЛИЦА.(…))`).
 * Previously the column names were qualified with the source alias and the Apply
 * checker rejected every `.(`, so no query with this construct could be applied.
 */
import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { findMalformedCustomExpressions } from '../../src/core/query/semanticValidator';
import { decideApply } from '../../src/webview/applyGate';
import { buildYamlResolver } from '../../src/core/metadata/buildYamlResolver';
import type { MetadataResolver } from '../../src/core/query/metadataResolver';

const resolver = buildYamlResolver(path.resolve(__dirname, '../fixtures/corpus/metadata/cf'));
const MODES: Array<[string, MetadataResolver | undefined]> = [['without resolver', undefined], ['with resolver', resolver]];

const gen = (text: string, r?: MetadataResolver): string => generateBatch(parseBatch(text, r));
/** Same order as the UI: static blocker on the parsed batch, then the final check on the generated text. */
const applyWrites = (text: string, r?: MetadataResolver): boolean => {
  const batch = parseBatch(text, r);
  const blocker = findMalformedCustomExpressions(batch).length > 0 ? { kind: 'malformedCustom' as const } : null;
  return decideApply(generateBatch(batch), null, blocker, r).ok;
};

// [name, input, live 1C query-wizard canonical]
const VALID: Array<[string, string, string]> = [
  ['two columns, sole source',
    'ВЫБРАТЬ Вал.Ссылка КАК Ссылка, ПУСТАЯТАБЛИЦА.(Код, Наименование) КАК Таблица ИЗ Справочник.Валюты КАК Вал',
    'ВЫБРАТЬ\n\tВал.Ссылка КАК Ссылка,\n\tПУСТАЯТАБЛИЦА.( КАК Код,  КАК Наименование) КАК Таблица\nИЗ\n\tСправочник.Валюты КАК Вал'],
  ['three columns',
    'ВЫБРАТЬ Вал.Ссылка КАК Ссылка, ПУСТАЯТАБЛИЦА.(Код, Наименование, Ссылка) КАК Таблица ИЗ Справочник.Валюты КАК Вал',
    'ВЫБРАТЬ\n\tВал.Ссылка КАК Ссылка,\n\tПУСТАЯТАБЛИЦА.( КАК Код,  КАК Наименование,  КАК Ссылка) КАК Таблица\nИЗ\n\tСправочник.Валюты КАК Вал'],
  ['empty list → ( КАК Поле1)',
    'ВЫБРАТЬ Вал.Ссылка КАК Ссылка, ПУСТАЯТАБЛИЦА.() КАК Таблица ИЗ Справочник.Валюты КАК Вал',
    'ВЫБРАТЬ\n\tВал.Ссылка КАК Ссылка,\n\tПУСТАЯТАБЛИЦА.( КАК Поле1) КАК Таблица\nИЗ\n\tСправочник.Валюты КАК Вал'],
  ['lower/mixed case head, one column, two constructs in one SELECT',
    'ВЫБРАТЬ Вал.Ссылка КАК Ссылка, пустаятаблица.(Код) КАК Т1, ПустаяТаблица.(Код, Наименование) КАК Т2 ИЗ Справочник.Валюты КАК Вал',
    'ВЫБРАТЬ\n\tВал.Ссылка КАК Ссылка,\n\tПУСТАЯТАБЛИЦА.( КАК Код) КАК Т1,\n\tПУСТАЯТАБЛИЦА.( КАК Код,  КАК Наименование) КАК Т2\nИЗ\n\tСправочник.Валюты КАК Вал'],
  ['no ИЗ, several constructs next to an ordinary expression',
    'ВЫБРАТЬ ПУСТАЯТАБЛИЦА.(_Поле1, Поле2) КАК Т1, ПУСТАЯТАБЛИЦА.() КАК Т2, ПУСТАЯТАБЛИЦА.() КАК Т3, 1 + 2 КАК Число',
    'ВЫБРАТЬ\n\tПУСТАЯТАБЛИЦА.( КАК _Поле1,  КАК Поле2) КАК Т1,\n\tПУСТАЯТАБЛИЦА.( КАК Поле1) КАК Т2,\n\tПУСТАЯТАБЛИЦА.( КАК Поле1) КАК Т3,\n\t1 + 2 КАК Число'],
  ['canonical input (second pass)',
    'ВЫБРАТЬ\n\tВал.Ссылка КАК Ссылка,\n\tПУСТАЯТАБЛИЦА.( КАК Код,  КАК Наименование) КАК Таблица\nИЗ\n\tСправочник.Валюты КАК Вал',
    'ВЫБРАТЬ\n\tВал.Ссылка КАК Ссылка,\n\tПУСТАЯТАБЛИЦА.( КАК Код,  КАК Наименование) КАК Таблица\nИЗ\n\tСправочник.Валюты КАК Вал'],
];

// Platform-rejected (live 1C) — Apply must stay blocked.
const INVALID: Array<[string, string]> = [
  ['qualified name', 'ВЫБРАТЬ Вал.Ссылка КАК Ссылка, ПУСТАЯТАБЛИЦА.(Вал.Код, Вал.Наименование) КАК Т ИЗ Справочник.Валюты КАК Вал'],
  ['name with alias', 'ВЫБРАТЬ Вал.Ссылка КАК Ссылка, ПУСТАЯТАБЛИЦА.(Код КАК К1, Наименование) КАК Т ИЗ Справочник.Валюты КАК Вал'],
  ['parameter', 'ВЫБРАТЬ Вал.Ссылка КАК Ссылка, ПУСТАЯТАБЛИЦА.(&Парам) КАК Т ИЗ Справочник.Валюты КАК Вал'],
  ['arithmetic', 'ВЫБРАТЬ Вал.Ссылка КАК Ссылка, ПУСТАЯТАБЛИЦА.(Код + 1) КАК Т ИЗ Справочник.Валюты КАК Вал'],
  ['function call', 'ВЫБРАТЬ Вал.Ссылка КАК Ссылка, ПУСТАЯТАБЛИЦА.(ПОДСТРОКА(Код, 1, 2)) КАК Т ИЗ Справочник.Валюты КАК Вал'],
  ['reserved word as a column name', 'ВЫБРАТЬ ПУСТАЯТАБЛИЦА.(В) КАК Т'],
  ['construct inside a WHERE condition', 'ВЫБРАТЬ Вал.Ссылка КАК Ссылка ИЗ Справочник.Валюты КАК Вал ГДЕ (Вал.Код, Вал.Наименование) В (ПУСТАЯТАБЛИЦА.(Код, Наименование))'],
];

describe.each(MODES)('ПУСТАЯТАБЛИЦА.(…) (%s)', (_mode, r) => {
  it.each(VALID)('%s: generates the query-wizard canonical text', (_name, input, canonical) => {
    expect(gen(input, r)).toBe(canonical);
    expect(gen(canonical, r)).toBe(canonical);
  });

  it.each(VALID)('%s: Apply writes it', (_name, input) => {
    expect(applyWrites(input, r)).toBe(true);
  });

  it('several sources: column names are not qualified', () => {
    const out = gen('ВЫБРАТЬ Вал.Ссылка КАК Ссылка, ПУСТАЯТАБЛИЦА.(Код, Наименование) КАК Таблица ИЗ Справочник.Валюты КАК Вал, РегистрСведений.КурсыВалют КАК К', r);
    expect(out).toContain('\tПУСТАЯТАБЛИЦА.( КАК Код,  КАК Наименование) КАК Таблица\n');
    expect(gen(out, r)).toBe(out);
  });

  it.each(INVALID)('platform-invalid %s stays blocked', (_name, input) => {
    expect(applyWrites(input, r)).toBe(false);
  });

  it('`.(` is not accepted after an arbitrary head', () => {
    expect(applyWrites('ВЫБРАТЬ Вал.Ссылка КАК Ссылка, ПРОИЗВОЛЬНОЕ.(Код) КАК Т ИЗ Справочник.Валюты КАК Вал', r)).toBe(false);
  });
});
