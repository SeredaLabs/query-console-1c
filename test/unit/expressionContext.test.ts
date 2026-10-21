import { describe, it, expect } from 'vitest';
import type { MetaTable } from '../../src/core/metadata/types';
import { buildResolverFromTables } from '../../src/core/metadata/buildModelResolver';
import { formatExpression } from '../../src/core/query/exprFormatter';
import {
  analyzeExpression, completionTargetFor, dedentContinuationLines, fieldReference, referenceTarget,
  type ExpressionContext,
} from '../../src/webview/expressionEditor/expressionContext';
import * as fieldChain from '../../src/core/query/fieldChain';
import * as hoverFieldInfo from '../../src/extension/hoverFieldInfo';
import { expressionSources } from '../../src/webview/expressionSources';

const N = (digits: number, fractionDigits: number) => ({ primitive: 'Число' as const, digits, fractionDigits });

const GOODS: MetaTable = {
  kind: 'Справочник', name: 'Товары', fullName: 'Справочник.Товары',
  fields: [
    { name: 'Ссылка', kind: 'standard', types: [{ ref: { kind: 'Справочник', name: 'Товары' } }] },
    { name: 'Наименование', kind: 'standard', types: [{ primitive: 'Строка', length: 150 }] },
  ],
};
const BALANCES: MetaTable = {
  kind: 'РегистрНакопления', name: 'Остатки', fullName: 'РегистрНакопления.Остатки',
  fields: [
    { name: 'Товар', kind: 'dimension', types: [{ ref: { kind: 'Справочник', name: 'Товары' } }] },
    { name: 'Склад', kind: 'dimension', types: [{ ref: { kind: 'Справочник', name: 'Склады' } }] },
    { name: 'КоличествоОстаток', kind: 'resource', types: [N(15, 3)] },
    { name: 'СуммаОстаток', kind: 'resource', types: [N(15, 2)] },
  ],
};
const TEMP_UNKNOWN_COLUMNS: MetaTable = { kind: 'ВременнаяТаблица', name: 'ВТ', fullName: 'ВТ', fields: [] };

const resolver = buildResolverFromTables([GOODS, BALANCES]);
const ctx: ExpressionContext = {
  sources: [{ alias: 'Остатки', meta: BALANCES }, { alias: 'Т', meta: GOODS }, { alias: 'ВТ', meta: TEMP_UNKNOWN_COLUMNS }],
  qualified: true,
  resolver,
};
const unqualified: ExpressionContext = { sources: [{ alias: 'Остатки', meta: BALANCES }], qualified: false, resolver };

describe('fieldChain move to core', () => {
  it('keeps a single implementation re-exported by hoverFieldInfo', () => {
    expect(hoverFieldInfo.findChainForCompletion).toBe(fieldChain.findChainForCompletion);
    expect(hoverFieldInfo.findChainAt).toBe(fieldChain.findChainAt);
  });
});

describe('fieldReference', () => {
  it('qualifies by alias in qualified mode and omits it otherwise', () => {
    expect(fieldReference(ctx, ctx.sources[0], ['Товар', 'Наименование'])).toBe('Остатки.Товар.Наименование');
    expect(fieldReference(unqualified, unqualified.sources[0], ['КоличествоОстаток'])).toBe('КоличествоОстаток');
  });
});

describe('completionTargetFor', () => {
  it('resolves the alias (case-insensitively) to its own table, not a global field search', () => {
    expect(completionTargetFor(ctx, ['остатки'])?.meta).toBe(BALANCES);
    expect(completionTargetFor(ctx, ['Т'])?.meta).toBe(GOODS);
  });

  it('follows reference fields through the metadata resolver', () => {
    expect(completionTargetFor(ctx, ['Остатки', 'Товар'])?.meta).toBe(GOODS);
  });

  it('fails open for unknown aliases, scalar fields and unresolved reference targets', () => {
    expect(completionTargetFor(ctx, ['Нет'])).toBeUndefined();
    expect(completionTargetFor(ctx, ['Остатки', 'КоличествоОстаток'])).toBeUndefined();
    expect(completionTargetFor(ctx, ['Остатки', 'Склад'])).toBeUndefined();
  });

  it('treats the whole chain as a field path in unqualified mode', () => {
    expect(completionTargetFor(unqualified, ['Товар'])?.meta).toBe(GOODS);
  });
});

describe('referenceTarget', () => {
  it('returns the target of a single reference type only', () => {
    expect(referenceTarget(BALANCES.fields[0], resolver)).toBe(GOODS);
    expect(referenceTarget(BALANCES.fields[2], resolver)).toBeUndefined();
    expect(referenceTarget(BALANCES.fields[0], undefined)).toBeUndefined();
  });
});

describe('analyzeExpression', () => {
  it('reports an empty expression without problems', () => {
    expect(analyzeExpression('  \n', ctx)).toEqual({ empty: true, syntaxValid: true, issues: [] });
  });

  it('accepts a complete ВЫБОР and nested expressions', () => {
    const a = analyzeExpression(
      'ВЫБОР КОГДА Остатки.КоличествоОстаток > 0 ТОГДА Остатки.СуммаОстаток / Остатки.КоличествоОстаток ИНАЧЕ 0 КОНЕЦ',
      ctx,
    );
    expect(a).toMatchObject({ empty: false, syntaxValid: true, issues: [] });
    expect(analyzeExpression('ЕСТЬNULL(ВЫБОР КОГДА (Остатки.СуммаОстаток > 0) ТОГДА 1 КОНЕЦ, 0) * 2', ctx).issues).toEqual([]);
  });

  it('reports incomplete ВЫБОР / function call as a structural error without crashing', () => {
    for (const text of ['ВЫБОР КОГДА Остатки.КоличествоОстаток > 0', 'СУММА(', 'ЕСТЬNULL(Остатки.СуммаОстаток,', 'Остатки.']) {
      const a = analyzeExpression(text, ctx);
      expect(a.syntaxValid, text).toBe(false);
      expect(a.issues.map(i => i.kind), text).toContain('syntax');
      expect(a.resultType, text).toBeUndefined();
    }
  });

  it('positions an unterminated string literal', () => {
    const a = analyzeExpression('Т.Наименование + "abc', ctx);
    expect(a.syntaxValid).toBe(false);
    expect(a.issues).toHaveLength(1);
    expect(a.issues[0]).toMatchObject({ kind: 'lexical', severity: 'error', from: 17, to: 18 });
  });

  it('warns about an unknown field of a known source with its exact range', () => {
    const text = 'Остатки.Количество + 1';
    const a = analyzeExpression(text, ctx);
    expect(a.syntaxValid).toBe(true);
    expect(a.issues).toEqual([{
      from: 8, to: 18, severity: 'warning', kind: 'fieldNotFound', field: 'Количество', table: 'РегистрНакопления.Остатки',
    }]);
  });

  it('warns about an unknown field behind a reference', () => {
    const a = analyzeExpression('Остатки.Товар.Артикул', ctx);
    expect(a.issues).toMatchObject([{ kind: 'fieldNotFound', field: 'Артикул', table: 'Справочник.Товары' }]);
  });

  it('stays silent where proof is missing: unknown alias, unresolved target, unknown columns, subquery, parameters', () => {
    expect(analyzeExpression('Нет.Поле + 1', ctx).issues).toEqual([]);
    expect(analyzeExpression('Остатки.Склад.Код', ctx).issues).toEqual([]);
    expect(analyzeExpression('ВТ.Колонка', ctx).issues).toEqual([]);
    expect(analyzeExpression('ЗНАЧЕНИЕ(Перечисление.Статусы.Закрыт)', ctx).issues).toEqual([]);
    expect(analyzeExpression('Остатки.Товар В (ВЫБРАТЬ Остатки.Нет ИЗ Справочник.Товары КАК Остатки)', ctx).issues
      .filter(i => i.kind === 'fieldNotFound')).toEqual([]);
    expect(analyzeExpression('ДОБАВИТЬКДАТЕ(&Дата, ДЕНЬ, &Дней)', ctx)).toMatchObject({ syntaxValid: true, issues: [] });
  });

  it('does not flag the name still being typed under the cursor', () => {
    const text = 'Остатки.Кол';
    expect(analyzeExpression(text, ctx, text.length).issues).toEqual([]);
    expect(analyzeExpression(text, ctx).issues).toHaveLength(1);
  });

  it.each([
    ['42', 'Число'], ['-1.25', 'Число'], ['+2', 'Число'],
    ['"текст"', 'Строка'], ['""', 'Строка'], ['"a""b"', 'Строка'],
    ['ИСТИНА', 'Булево'], ['ложь', 'Булево'], ['TRUE', 'Булево'], ['false', 'Булево'],
    [' // before\n - 1.25 // after', 'Число'],
  ])('shows the primitive type of literal %s without metadata', (text, resultType) => {
    expect(analyzeExpression(text, { sources: [], qualified: true })).toMatchObject({
      syntaxValid: true, issues: [], resultType,
    });
  });

  it.each(['1 + 2', '(10 - 3) * 2', '-6 / 4', '1 + 2 * 3',
    '((1.5))', '-(1 + 2)', '1 + // comment\n 2'])
  ('shows a numeric type for constant arithmetic %s', text => {
    expect(analyzeExpression(text, { sources: [], qualified: true })).toMatchObject({
      syntaxValid: true, issues: [], resultType: 'Число',
    });
  });

  it.each(['1 +', '(1 + 2', '1 2', '1 * / 2', '(1)(2)'])
  ('does not type structurally malformed arithmetic %s', text => {
    expect(analyzeExpression(text, ctx)).toMatchObject({ syntaxValid: false, resultType: undefined });
  });

  it.each(['()', '1 + ()', 'Остатки.КоличествоОстаток + 1', 'ВТ.Колонка + 1', '1 + NULL', '1 + &П',
    '1 = 2', '1 И 2', 'СУММА(1)', '"1 + 2" + 3', '"a" + "b"', '&Параметр', 'NULL', 'НЕОПРЕДЕЛЕНО',
    'ВЫБОР КОГДА ИСТИНА ТОГДА 1 ИНАЧЕ 2 КОНЕЦ', '1 +', '"незакрыто', '-'])
  ('does not guess a result type for %s', text => {
    expect(analyzeExpression(text, ctx).resultType).toBeUndefined();
  });

  it('keeps metadata qualifiers for a lone resolved field', () => {
    expect(analyzeExpression('Остатки.КоличествоОстаток', ctx).resultType).toBe('Число(15,3)');
    expect(analyzeExpression('Остатки.Товар.Наименование', ctx).resultType).toBe('Строка(150)');
    expect(analyzeExpression('СУММА(Остатки.СуммаОстаток)', ctx).resultType).toBeUndefined();
    expect(analyzeExpression('НАЧАЛОПЕРИОДА(&Дата, МЕСЯЦ)', ctx).resultType).toBeUndefined();
  });

  it.each(['ПОДСТРОКА("abcdef", 2, 3)', 'substring("a,b)", 1, 2)',
    'подстрока(// before\n "abc", 1, 0) // after'])
  ('types a complete substring call without metadata: %s', text => {
    expect(analyzeExpression(text, { sources: [], qualified: true })).toMatchObject({
      syntaxValid: true, issues: [], resultType: 'Строка',
    });
  });

  it('types substring of a direct string metadata field in both addressing modes', () => {
    const sources = expressionSources([{ id: 'g', fullName: GOODS.fullName, alias: 'Т' }], [GOODS]);
    expect(analyzeExpression('ПОДСТРОКА(Т.Наименование, 1, 3)', { ...ctx, sources }).resultType).toBe('Строка');
    expect(analyzeExpression('ПОДСТРОКА(Наименование, 1, 3)', { sources, qualified: false }).resultType).toBe('Строка');
    expect(analyzeExpression('Т.Наименование', { ...ctx, sources }).resultType).toBe('Строка(150)');
  });

  it.each(['ПОДСТРОКА()', 'ПОДСТРОКА("abc", 1)', 'ПОДСТРОКА("abc", 1, 2, 3)',
    'ПОДСТРОКА("abc", 1,)', 'ПОДСТРОКА("abc", 1, 2', 'ПОДСТРОКА(NULL, 1, 2)',
    'ПОДСТРОКА(&Текст, 1, 2)', 'ПОДСТРОКА("abc", &Начало, 2)', 'ПОДСТРОКА(1, 1, 2)',
    'ПОДСТРОКА(Т.Наименование, 1, 2)', 'ПОДСТРОКА(ВТ.Колонка, 1, 2)',
    'ПОДСТРОКА(ПОДСТРОКА("abc", 1, 2), 1, 1)', 'ПОДСТРОКА("abc", 1, 2) = "ab"',
    'ПОДСТРОКА("abc", 1, 2) + "d"', 'ДругаяПОДСТРОКА("abc", 1, 2)'])
  ('does not infer a substring type outside the attested shape: %s', text => {
    expect(analyzeExpression(text, ctx).resultType).toBeUndefined();
  });

  it('does not infer substring from derived, composite or reference-path types', () => {
    const mixed: MetaTable = { ...GOODS, fields: [{ name: 'Поле', kind: 'attribute',
      types: [{ primitive: 'Строка' }, { primitive: 'Число' }] }] };
    expect(analyzeExpression('ПОДСТРОКА(Т.Поле, 1, 2)', { ...ctx,
      sources: [{ alias: 'Т', meta: mixed, typeOrigin: 'metadata' }] }).resultType).toBeUndefined();
    expect(analyzeExpression('ПОДСТРОКА(Т.Наименование, 1, 2)', { ...ctx,
      sources: [{ alias: 'Т', meta: GOODS, typeOrigin: 'derived' }] }).resultType).toBeUndefined();
    expect(analyzeExpression('ПОДСТРОКА(Остатки.Товар.Наименование, 1, 2)', { ...ctx,
      sources: [{ alias: 'Остатки', meta: BALANCES, typeOrigin: 'metadata' }] }).resultType).toBeUndefined();
    expect(analyzeExpression('ПОДСТРОКА(Т.Нет, 1, 2)', ctx).issues).toMatchObject([{ kind: 'fieldNotFound', field: 'Нет' }]);
  });

  it.each(['Остатки.КоличествоОстаток + 1', '(Остатки.СуммаОстаток - Остатки.КоличествоОстаток) * 2',
    '-Остатки.КоличествоОстаток', 'Остатки.СуммаОстаток / 2'])
  ('types arithmetic over direct numeric metadata fields: %s', text => {
    const sources = expressionSources([{ id: 'r', fullName: BALANCES.fullName, alias: 'Остатки' }], [BALANCES]);
    expect(analyzeExpression(text, { ...ctx, sources })).toMatchObject({ resultType: 'Число', issues: [] });
  });

  it('supports unqualified metadata fields without changing their standalone qualifiers', () => {
    const sources = expressionSources([{ id: 'r', fullName: BALANCES.fullName }], [BALANCES]);
    const context = { ...unqualified, sources };
    expect(analyzeExpression('КоличествоОстаток / 2', context).resultType).toBe('Число');
    expect(analyzeExpression('КоличествоОстаток', context).resultType).toBe('Число(15,3)');
  });

  it('does not use union, unknown, reference, or synthetic types for arithmetic', () => {
    const meta: MetaTable = { ...BALANCES, fields: [
      { name: 'Смешанное', kind: 'attribute', types: [N(10, 0), { primitive: 'Строка' }] },
      { name: 'Неизвестное', kind: 'attribute', types: [] },
      ...BALANCES.fields,
    ] };
    const sources = expressionSources([{ id: 'r', fullName: meta.fullName, alias: 'Остатки' }], [meta]);
    for (const text of ['Остатки.Смешанное + 1', 'Остатки.Неизвестное + 1', 'Остатки.Товар + 1',
      'Остатки.Товар.Наименование + 1', 'СУММА(Остатки.КоличествоОстаток)', 'Остатки.КоличествоОстаток + &П']) {
      expect(analyzeExpression(text, { ...ctx, sources }).resultType, text).toBeUndefined();
    }
    const temp: MetaTable = { ...meta, kind: 'ВременнаяТаблица', fullName: 'ВТ' };
    const derived = expressionSources([{ id: 't', fullName: 'ВТ', alias: 'Остатки' }], [temp]);
    expect(analyzeExpression('Остатки.КоличествоОстаток + 1', { ...ctx, sources: derived }).resultType).toBeUndefined();
  });

  it('checks bare field paths in unqualified mode', () => {
    expect(analyzeExpression('КоличествоОстаток > 0', unqualified).issues).toEqual([]);
    expect(analyzeExpression('Товар.Нет = &П', unqualified).issues).toMatchObject([{ kind: 'fieldNotFound', field: 'Нет' }]);
  });
});

describe('dedentContinuationLines', () => {
  it('removes the query-position indent formatExpression adds to continuation lines', () => {
    const raw = 'ВЫБОР КОГДА Остатки.КоличествоОстаток > 0 ТОГДА Остатки.СуммаОстаток ИНАЧЕ 0 КОНЕЦ';
    expect(dedentContinuationLines(formatExpression(raw, 'select'))).toBe(
      'ВЫБОР\n\tКОГДА Остатки.КоличествоОстаток > 0\n\t\tТОГДА Остатки.СуммаОстаток\n\tИНАЧЕ 0\nКОНЕЦ',
    );
  });

  it('leaves single-line and unindented text unchanged', () => {
    expect(dedentContinuationLines('А + Б')).toBe('А + Б');
    expect(dedentContinuationLines('А\nБ')).toBe('А\nБ');
  });
});
