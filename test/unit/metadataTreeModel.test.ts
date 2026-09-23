import { afterEach, describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import type { MetaTable } from '../../src/core/metadata/types';
import { setLocale } from '../../src/webview/i18n';
import {
  buildRenderModel, collectMatchKeys, groupLabel, highlightRanges, tokenizeSearch,
} from '../../src/webview/metadataTreeModel';

afterEach(() => setLocale('en'));

const field = (name: string) => ({ name, kind: 'attribute' as const, types: [] });
const ТОВАРЫ: MetaTable = {
  kind: 'Справочник', name: 'Товары', fullName: 'Справочник.Товары',
  fields: [field('Артикул'), field('Цена')],
  tabularSections: [{ kind: 'ТабличнаяЧасть', name: 'Штрихкоды', fullName: 'Справочник.Товары.Штрихкоды', fields: [field('Штрихкод')] }],
};
const ЗАКАЗ: MetaTable = { kind: 'Документ', name: 'ЗаказКлиента', fullName: 'Документ.ЗаказКлиента', fields: [field('Клиент')] };

describe('metadataTreeModel (shared by Classic DbTreePanel and Canvas MetadataTree)', () => {
  it('without a search, groups every table by kind in the fixed group order', () => {
    const groups = buildRenderModel([ЗАКАЗ, ТОВАРЫ], [], false).filter(g => g.tables.length > 0);
    expect(groups.map(g => g.kind)).toEqual(['Справочник', 'Документ']);
    expect(groups[0].tables[0].fields.map(f => f.field.name)).toEqual(['Артикул', 'Цена']);
  });

  it('every search word must match somewhere in the table (name, fields or tabular sections)', () => {
    const tokens = tokenizeSearch('  товар  штрих ');
    expect(tokens).toEqual(['товар', 'штрих']);
    expect(collectMatchKeys(buildRenderModel([ЗАКАЗ, ТОВАРЫ], tokens, true))).toEqual(['Справочник.Товары']);
    expect(collectMatchKeys(buildRenderModel([ЗАКАЗ, ТОВАРЫ], tokenizeSearch('товар клиент'), true))).toEqual([]);
  });

  it('a field-only match keeps just the matching fields; a name match keeps them all', () => {
    const byField = buildRenderModel([ТОВАРЫ], tokenizeSearch('цена'), true)[0].tables[0];
    expect(byField.fields.map(f => f.field.name)).toEqual(['Цена']);
    expect(byField.tabularSections).toEqual([]);
    const byName = buildRenderModel([ТОВАРЫ], tokenizeSearch('товары'), true)[0].tables[0];
    expect(byName.fields.map(f => f.field.name)).toEqual(['Артикул', 'Цена']);
    expect(byName.tabularSections.map(ts => ts.ts.name)).toEqual(['Штрихкоды']);
  });

  it('highlight ranges are case-insensitive, sorted and merged', () => {
    expect(highlightRanges('Штрихкод и ШТРИХ', ['штрих', 'код'])).toEqual([[0, 8], [11, 16]]);
    expect(highlightRanges('Цена', [])).toEqual([]);
  });

  it('group labels come from the Classic dictionary, and fall back to the kind itself', () => {
    setLocale('en');
    expect(groupLabel('ПланВидовХарактеристик')).toBe('Charts of characteristic types');
    setLocale('uk');
    expect(groupLabel('Справочник')).toBe('Довідники');
    expect(groupLabel('ТабличнаяЧасть')).toBe('ТабличнаяЧасть');
  });
});

describe('both metadata trees use the shared model instead of their own copy', () => {
  for (const rel of ['../../src/webview/components/DbTreePanel.tsx', '../../src/webview-canvas/components/MetadataTree.tsx']) {
    const src = fs.readFileSync(path.resolve(__dirname, rel), 'utf8');
    it(`${rel.replace('../../', '')} imports metadataTreeModel and defines no local search model`, () => {
      expect(src).toMatch(/from '(\.\.\/|\.\.\/\.\.\/webview\/)metadataTreeModel'/);
      expect(src).not.toMatch(/function (tokenize|buildRenderModel|tableCorpus|tableMatchesQuery)\b|const GROUP_KINDS\b/);
    });
  }
});
