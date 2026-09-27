/**
 * Stage 1B.2 regression (docs/development/audits/stage-0.md, RP13): a parameter
 * name is an arbitrary identifier and may coincide with a keyword (`&И`, `&ИЛИ`,
 * `&В`, `&КАК`, `&ВЫБРАТЬ`, `&SELECT`, `&AND` — all accepted by live 1C 8.3).
 * The lexer already emits `&И` as one `param` token, but the generator's raw-text
 * scanners detected keywords by "previous char is not a letter/digit/_", and `&`
 * passed that test: `И`/`ИЛИ` inside `&И`/`&ИЛИ` split virtual-table and JOIN
 * conditions (`Валюта = &\n И`, `И (К.Курс = &) И ()`), and `&МЕЖДУ`/`&ВЫБОР`
 * silently changed the layout. A keyword-named parameter must render exactly
 * like a neutral one (`&Изм`) in the same position.
 */
import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { validateBatchText } from '../../src/core/query/validateBatch';
import { buildYamlResolver } from '../../src/core/metadata/buildYamlResolver';
import type { MetadataResolver } from '../../src/core/query/metadataResolver';

const resolver = buildYamlResolver(path.resolve(__dirname, '../fixtures/corpus/metadata/cf'));
const MODES: Array<[string, MetadataResolver | undefined]> = [['without resolver', undefined], ['with resolver', resolver]];

const gen = (text: string, r?: MetadataResolver): string => generateBatch(parseBatch(text, r));

const RS = 'РегистрСведений.КурсыВалют';
const VT = (cond: string): string => `ВЫБРАТЬ К.Валюта КАК Валюта ИЗ ${RS}.СрезПоследних(, ${cond}) КАК К`;
const JOIN = (cond: string): string =>
  `ВЫБРАТЬ Вал.Код КАК Код ИЗ Справочник.Валюты КАК Вал ЛЕВОЕ СОЕДИНЕНИЕ ${RS} КАК К ПО ${cond}`;
const WHERE = (cond: string): string => `ВЫБРАТЬ К.Валюта КАК Валюта ИЗ ${RS} КАК К ГДЕ ${cond}`;

const CONTEXTS: Array<[string, (p: string) => string]> = [
  ['VT: single condition', p => VT(`Валюта = &${p}`)],
  ['VT: И-chain', p => VT(`Валюта = &${p} И Кратность = &${p}`)],
  ['VT: ИЛИ group under И', p => VT(`(Валюта = &${p} ИЛИ Кратность = &${p}) И Курс > 0`)],
  ['VT: nested parentheses', p => VT(`((Валюта = &${p}) И (Кратность = &${p} ИЛИ (Курс < &${p} И Курс > 0)))`)],
  ['VT: МЕЖДУ … И …', p => VT(`Курс МЕЖДУ &${p} И &${p}`)],
  ['VT: period parameter + condition', p => `ВЫБРАТЬ К.Валюта КАК Валюта ИЗ ${RS}.СрезПоследних(&${p}, Валюта = &${p}) КАК К`],
  ['VT: multi-line condition', p => VT(`Валюта = &${p}\n\t\tИ Кратность = 1`)],
  ['JOIN: one real И', p => JOIN(`Вал.Ссылка = К.Валюта И К.Курс = &${p}`)],
  ['JOIN: several parenthesized conjuncts', p => JOIN(`(Вал.Ссылка = К.Валюта) И (К.Курс = &${p}) И (К.Кратность = &${p} ИЛИ К.Кратность = &${p})`)],
  ['JOIN: ИЛИ group', p => JOIN(`Вал.Ссылка = К.Валюта И (К.Курс = &${p} ИЛИ К.Кратность = &${p})`)],
  ['JOIN: МЕЖДУ … И …', p => JOIN(`Вал.Ссылка = К.Валюта И К.Курс МЕЖДУ &${p} И &${p}`)],
  ['JOIN: multi-line condition', p => JOIN(`Вал.Ссылка = К.Валюта\n\t\t\tИ К.Курс = &${p}\n\t\t\tИ К.Кратность = 1`)],
  ['WHERE: И-chain', p => WHERE(`К.Курс = &${p} И К.Кратность = &${p}`)],
  ['WHERE: ИЛИ group', p => WHERE(`(К.Курс = &${p} ИЛИ К.Кратность = &${p}) И К.Курс > 0`)],
];

// Required names (RP13 task) plus `&МЕЖДУ`/`&ВЫБОР`, which the same scanners misread.
const NAMES = ['И', 'ИЛИ', 'В', 'КАК', 'ВЫБРАТЬ', 'SELECT', 'AND', 'МЕЖДУ', 'ВЫБОР', 'и', 'или'];
const NEUTRAL = 'Изм';

describe.each(MODES)('keyword-named parameters (%s)', (_mode, r) => {
  describe.each(CONTEXTS)('%s', (_ctx, build) => {
    const neutral = gen(build(NEUTRAL), r);

    it.each(NAMES)('&%s renders like a neutral parameter and survives a second pass', (name) => {
      const out = gen(build(name), r);
      expect(out).toBe(neutral.split(`&${NEUTRAL}`).join(`&${name}`));
      expect(gen(out, r)).toBe(out);
      expect(validateBatchText(out, r).ok).toBe(true);
    });
  });

  it('VT: real И/ИЛИ split the condition, `&И`/`&ИЛИ`/`&AND` stay whole', () => {
    expect(gen(VT('Валюта = &И И Кратность = &ИЛИ'), r)).toBe(
      'ВЫБРАТЬ\n\tК.Валюта КАК Валюта\nИЗ\n\tРегистрСведений.КурсыВалют.СрезПоследних(\n\t\t\t,\n\t\t\tВалюта = &И\n\t\t\t\tИ Кратность = &ИЛИ) КАК К',
    );
    // Live 1C 8.3 query wizard canonical (the OR group keeps its parentheses; Stage 1B.3).
    expect(gen(VT('(Валюта = &И ИЛИ Кратность = &ИЛИ) И Курс > &AND'), r)).toBe(
      'ВЫБРАТЬ\n\tК.Валюта КАК Валюта\nИЗ\n\tРегистрСведений.КурсыВалют.СрезПоследних(\n\t\t\t,\n\t\t\t(Валюта = &И\n\t\t\t\tИЛИ Кратность = &ИЛИ)\n\t\t\t\tИ Курс > &AND) КАК К',
    );
  });

  it('JOIN: `Поле = &И И ДругоеПоле = &ИЛИ` keeps both parameters', () => {
    expect(gen(JOIN('Вал.Ссылка = К.Валюта И К.Курс = &И И К.Кратность = &ИЛИ'), r)).toBe(
      'ВЫБРАТЬ\n\tВал.Код КАК Код\nИЗ\n\tСправочник.Валюты КАК Вал\n\t\tЛЕВОЕ СОЕДИНЕНИЕ РегистрСведений.КурсыВалют КАК К\n\t\tПО Вал.Ссылка = К.Валюта\n\t\t\tИ (К.Курс = &И)\n\t\t\tИ (К.Кратность = &ИЛИ)',
    );
  });

  it('WHERE control: `Поле = &И И ДругоеПоле = &ИЛИ` (already correct before the fix)', () => {
    expect(gen(WHERE('К.Курс = &И И К.Кратность = &ИЛИ'), r)).toBe(
      'ВЫБРАТЬ\n\tК.Валюта КАК Валюта\nИЗ\n\tРегистрСведений.КурсыВалют КАК К\nГДЕ\n\tК.Курс = &И\n\tИ К.Кратность = &ИЛИ',
    );
  });
});
