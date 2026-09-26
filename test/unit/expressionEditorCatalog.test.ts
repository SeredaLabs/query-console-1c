import { afterEach, describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import type { MetaTable } from '../../src/core/metadata/types';
import { buildResolverFromTables } from '../../src/core/metadata/buildModelResolver';
import { setLocale } from '../../src/webview/i18n';
import {
  allCatalogLeaves, buildFunctionCategories, categoryOf, FREQUENT_LABELS, functionDescription, GROUP_CATEGORY,
  leafByLabel, TEMPLATE_LABELS, templateToSnippet,
} from '../../src/webview/expressionEditor/functionCatalogView';
import { expressionCompletionSource, positionCompletionInfo } from '../../src/webview/expressionEditor/expressionCompletion';
import type { ExpressionContext } from '../../src/webview/expressionEditor/expressionContext';

afterEach(() => setLocale('en'));

describe('function catalog view', () => {
  it('maps every catalog group to a category (no silent fallback)', () => {
    for (const e of allCatalogLeaves()) expect(GROUP_CATEGORY[e.group], e.group).toBeDefined();
  });

  it('places every catalog leaf into exactly one non-frequent category, keeping catalog order', () => {
    const categories = buildFunctionCategories().filter(c => c.id !== 'frequent');
    const placed = categories.flatMap(c => c.leaves);
    const leaves = allCatalogLeaves().map(e => e.leaf);
    expect(placed).toHaveLength(leaves.length);
    expect(new Set(placed)).toEqual(new Set(leaves));
    expect(categories.find(c => c.id === 'conditional')!.leaves.map(l => l.label)).toEqual(['ЕСТЬNULL', 'ВЫБОР']);
    expect(categories.find(c => c.id === 'aggregate')!.leaves.map(l => l.label)).toContain('СУММА');
    expect(categories.find(c => c.id === 'date')!.leaves.map(l => l.label)).toContain('ДАТАВРЕМЯ');
    expect(categoryOf(allCatalogLeaves().find(e => e.leaf.label === 'И')!)).toBe('logical');
  });

  it('references only existing catalog leaves from the frequent list and the templates menu', () => {
    for (const label of [...FREQUENT_LABELS, ...TEMPLATE_LABELS]) expect(leafByLabel(label), label).toBeDefined();
    expect(buildFunctionCategories()[0]).toMatchObject({ id: 'frequent' });
    expect(buildFunctionCategories()[0].leaves.map(l => l.label)).toEqual(FREQUENT_LABELS);
  });

  it('has a short description for every leaf in every UI locale', () => {
    for (const locale of ['en', 'uk', 'ru'] as const) {
      setLocale(locale);
      for (const { leaf } of allCatalogLeaves()) expect(functionDescription(leaf), `${locale} ${leaf.label}`).toBeTruthy();
    }
  });

  it('turns template placeholders into numbered snippet fields (no linked same-name fields)', () => {
    expect(templateToSnippet('ЕСТЬNULL(<Выражение>, <ЗначениеЗамены>)')).toBe('ЕСТЬNULL(${1:Выражение}, ${2:ЗначениеЗамены})');
    expect(templateToSnippet(leafByLabel('ВЫБОР')!.template)).toBe(
      'ВЫБОР\n\tКОГДА ${1:Условие} ТОГДА ${2:Значение}\n\tИНАЧЕ ${3:Значение}\nКОНЕЦ',
    );
    expect(templateToSnippet('<>')).toBe('<>');
    expect(templateToSnippet('a {b}')).toBe('a \\{b\\}');
  });
});

const GOODS: MetaTable = {
  kind: 'Справочник', name: 'Товары', fullName: 'Справочник.Товары',
  fields: [
    { name: 'Наименование', kind: 'standard', types: [{ primitive: 'Строка', length: 150 }] },
    { name: 'Артикул', kind: 'attribute', types: [{ primitive: 'Строка', length: 25 }] },
  ],
};
const BALANCES: MetaTable = {
  kind: 'РегистрНакопления', name: 'Остатки', fullName: 'РегистрНакопления.Остатки',
  fields: [
    { name: 'Товар', kind: 'dimension', types: [{ ref: { kind: 'Справочник', name: 'Товары' } }] },
    { name: 'КоличествоОстаток', kind: 'resource', types: [{ primitive: 'Число', digits: 15, fractionDigits: 3 }] },
  ],
};
const ctx: ExpressionContext = {
  sources: [{ alias: 'Остатки', meta: BALANCES }, { alias: 'Товары', meta: GOODS }],
  qualified: true,
  resolver: buildResolverFromTables([GOODS, BALANCES]),
};

function complete(doc: string, explicit = false, context: ExpressionContext = ctx, pos = doc.length): CompletionResult | null {
  const state = EditorState.create({ doc });
  const source = expressionCompletionSource(() => context);
  return source(new CompletionContext(state, pos, explicit)) as CompletionResult | null;
}

describe('expression completion source', () => {
  it('after `Alias.` offers only that source\'s fields, with types', () => {
    const r = complete('КОГДА Остатки.')!;
    expect(r.from).toBe('КОГДА Остатки.'.length);
    expect(r.options.map(o => [o.label, o.detail])).toEqual([
      ['Товар', 'Справочник.Товары'],
      ['КоличествоОстаток', 'Число(15,3)'],
    ]);
  });

  it('keeps the typed prefix as the replaced range and follows references', () => {
    const r = complete('Остатки.Товар.Арт')!;
    expect(r.from).toBe('Остатки.Товар.'.length);
    expect(r.options.map(o => o.label)).toEqual(['Наименование', 'Артикул']);
  });

  it('offers nothing for an unknown alias or a scalar path (fail-open, no guessing)', () => {
    expect(complete('Нет.')).toBeNull();
    expect(complete('Остатки.КоличествоОстаток.')).toBeNull();
  });

  it('offers aliases, functions (as snippets) and keywords for a typed word', () => {
    const r = complete('ВЫБОР КОГ')!;
    const labels = r.options.map(o => o.label);
    expect(labels).toEqual(expect.arrayContaining(['Остатки', 'Товары', 'КОГДА', 'ЕСТЬNULL', 'ДОБАВИТЬКДАТЕ']));
    const isnull = r.options.find(o => o.label === 'ЕСТЬNULL')!;
    expect(isnull.type).toBe('function');
    expect(typeof isnull.apply).toBe('function');
    expect(r.options.find(o => o.label === 'Остатки')!.detail).toBe('РегистрНакопления.Остатки');
  });

  it('does not pop up implicitly on an empty word, but does on Ctrl+Space', () => {
    expect(complete('Остатки.КоличествоОстаток > ')).toBeNull();
    expect(complete('Остатки.КоличествоОстаток > ', true)!.options.length).toBeGreaterThan(0);
  });

  it('stays quiet inside strings, comments and after `&`', () => {
    expect(complete('Товары.Наименование ПОДОБНО "Ост')).toBeNull();
    expect(complete('1 // Ост')).toBeNull();
    expect(complete('&Да')).toBeNull();
  });

  it('offers the single source\'s fields directly in unqualified mode', () => {
    const unq: ExpressionContext = { ...ctx, sources: [ctx.sources[0]], qualified: false };
    expect(complete('Кол', false, unq)!.options.map(o => o.label)).toEqual(expect.arrayContaining(['Товар', 'КоличествоОстаток']));
    expect(complete('Товар.', false, unq)!.options.map(o => o.label)).toEqual(['Наименование', 'Артикул']);
  });
});

describe('completion info card placement', () => {
  // Список майже на всю ширину: ні праворуч, ні ліворуч немає 220px для картки.
  const list = { left: 150, right: 1400, top: 165, bottom: 440 };
  const option = { left: 150, right: 1400, top: 165, bottom: 200 };
  const size = (r: { left: number; right: number; top: number; bottom: number }) => ({ offsetWidth: r.right - r.left, offsetHeight: r.bottom - r.top });
  const wideInfo = { left: 0, right: 820, top: 0, bottom: 180 };
  const space = { left: 0, right: 1580, top: 0, bottom: 900 };

  it('stacks the card below the list — never over it — when neither side has room', () => {
    const pos = positionCompletionInfo(null, list, option, wideInfo, space, size(list));
    expect(pos.class).toBe('qc-info-stacked');
    const top = Number(pos.style.match(/^top: ([\d.]+)px/)![1]);
    expect(top).toBeGreaterThanOrEqual(list.bottom - list.top);
  });

  it('stacks above the list when there is no room below', () => {
    const low = { ...list, top: 500, bottom: 775 };
    const pos = positionCompletionInfo(null, low, option, wideInfo, { ...space, bottom: 800 }, size(low));
    expect(pos.class).toBe('qc-info-stacked');
    expect(pos.style).toMatch(/^bottom: 279px/);
  });

  it('puts the card beside the list with a wrapped width when a side has enough room', () => {
    const narrowRight = { ...list, left: 100, right: 700 };
    const right = positionCompletionInfo(null, narrowRight, option, wideInfo, space, size(narrowRight));
    expect(right.class).toContain('cm-completionInfo-right');
    expect(right.style).toMatch(/max-width: 360px/);
    const narrowLeft = { ...list, left: 900, right: 1500 };
    const left = positionCompletionInfo(null, narrowLeft, option, wideInfo, space, size(narrowLeft));
    expect(left.class).toContain('cm-completionInfo-left');
  });
});

describe('function help highlighting', () => {
  it('colours tokens exactly like the expression editor (same tokenizer and palette)', async () => {
    const { highlightParts } = await import('../../src/webview/expressionEditor/highlightedCode');
    const { highlightSegments } = await import('../../src/webview/queryHighlight');
    const { HIGHLIGHT_TOKEN_STYLE } = await import('../../src/webview/cmHighlight');
    const text = leafByLabel('ВЫБОР')!.example!;
    const parts = highlightParts(text);
    const segs = highlightSegments(text);
    expect(parts.map(p => p.text).join('')).toBe(text);
    expect(parts.map(p => p.style)).toEqual(segs.map(s => (s.type === 'plain' ? undefined : HIGHLIGHT_TOKEN_STYLE[s.type])));
    expect(parts.find(p => p.text === 'КОГДА')!.style).toBe(HIGHLIGHT_TOKEN_STYLE.keyword);
    expect(parts.find(p => p.text === '0')!.style).toBe(HIGHLIGHT_TOKEN_STYLE.number);
  });
});

describe('placeholder highlighting in catalog templates', () => {
  it('colours every <…> placeholder the same way, never as a language token', async () => {
    const { highlightParts, PLACEHOLDER_STYLE } = await import('../../src/webview/expressionEditor/highlightedCode');
    const { HIGHLIGHT_TOKEN_STYLE } = await import('../../src/webview/cmHighlight');
    const template = leafByLabel('ВЫБОР')!.template;
    const parts = highlightParts(template, true);
    expect(parts.map(p => p.text).join('')).toBe(template);
    const placeholders = parts.filter(p => p.style === PLACEHOLDER_STYLE).map(p => p.text);
    expect(placeholders).toEqual(['<Условие>', '<Значение>', '<Значение>']);
    expect(parts.find(p => p.text === 'КОГДА')!.style).toBe(HIGHLIGHT_TOKEN_STYLE.keyword);
    // Без прапорця (приклади) `<`/`>` лишаються операторами, як у редакторі.
    expect(highlightParts('А <> Б', true).some(p => p.style === PLACEHOLDER_STYLE)).toBe(false);
    expect(highlightParts('ЕСТЬNULL(<Выражение>, 0)', false).some(p => p.style === PLACEHOLDER_STYLE)).toBe(false);
  });
});
