import { describe, expect, it } from 'vitest';
import type { MetaTable } from '../../src/core/metadata/types';
import type { SelectedTable } from '../../src/core/query/queryModel';
import { expressionSources } from '../../src/webview/expressionSources';

describe('shared Classic/Canvas expression sources', () => {
  const meta: MetaTable = { kind: 'РегистрНакопления', name: 'Продажи', fullName: 'РегистрНакопления.Продажи.Обороты',
    virtual: { baseFullName: 'РегистрНакопления.Продажи', slice: 'Обороты' },
    fields: [{ name: 'СуммаОборот', kind: 'attribute', types: [{ primitive: 'Число' }] }] };
  const selected: SelectedTable = { id: 'vt', fullName: meta.fullName, alias: 'П', virtual: { periodicity: 'Запись' } };
  it('retains selected aliases and period fields without mutating metadata', () => {
    const before = structuredClone(meta);
    const sources = expressionSources([selected], [meta]);
    expect(sources[0].alias).toBe('П');
    expect(sources[0].meta.fields.map(f => f.name)).toEqual(['Период', 'Регистратор', 'НомерСтроки', 'СуммаОборот']);
    expect(meta).toEqual(before);
  });
  it('keeps the ordinary metadata identity and skips unavailable sources', () => {
    expect(expressionSources([{ ...selected, virtual: undefined }, { id: 'missing', fullName: 'Missing' }], [meta]))
      .toEqual([{ alias: 'П', meta }]);
    expect(expressionSources([selected], [])).toEqual([]);
  });
});
