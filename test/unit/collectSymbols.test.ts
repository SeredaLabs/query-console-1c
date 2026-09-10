/**
 * Phase 3a of the semantic-core roadmap (memory: project-semantic-core-roadmap).
 */
import { describe, it, expect } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { collectSourceAliasSymbols, resolveSymbolTable } from '../../src/core/semantic/collectSymbols';
import type { BatchDocument } from '../../src/core/query/batchModel';

describe('collectSourceAliasSymbols', () => {
  it('collects one symbol for a single source alias', () => {
    const batch = parseBatch('ВЫБРАТЬ Т.Код ИЗ Справочник.Номенклатура КАК Т');
    const symbols = collectSourceAliasSymbols(batch);
    expect(symbols).toHaveLength(1);
    expect(symbols[0].alias).toBe('Т');
    expect(symbols[0].ref.path).toEqual([
      { kind: 'batch', index: 0 },
      { kind: 'union', index: 0 },
      { kind: 'table', index: 0 },
    ]);
  });

  it('collects one symbol per joined source, with distinct ids and increasing table indices', () => {
    const batch = parseBatch(
      'ВЫБРАТЬ Т1.Код ИЗ Справочник.Номенклатура КАК Т1 ' +
        'ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Номенклатура КАК Т2 ПО Т1.Код = Т2.Код',
    );
    const symbols = collectSourceAliasSymbols(batch);
    expect(symbols.map((s) => s.alias)).toEqual(['Т1', 'Т2']);
    expect(new Set(symbols.map((s) => s.id)).size).toBe(2); // distinct ids
    expect(symbols[0].ref.path.at(-1)).toEqual({ kind: 'table', index: 0 });
    expect(symbols[1].ref.path.at(-1)).toEqual({ kind: 'table', index: 1 });
  });

  it('gives each UNION member its own union index in the symbol path, and its own alias namespace', () => {
    const batch = parseBatch(
      'ВЫБРАТЬ А.Код ИЗ Справочник.Номенклатура КАК А ' +
        'ОБЪЕДИНИТЬ ВСЕ ВЫБРАТЬ Б.Код ИЗ Справочник.Номенклатура КАК Б',
    );
    const symbols = collectSourceAliasSymbols(batch);
    expect(symbols).toHaveLength(2);
    expect(symbols[0].alias).toBe('А');
    expect(symbols[0].ref.path).toContainEqual({ kind: 'union', index: 0 });
    expect(symbols[1].alias).toBe('Б');
    expect(symbols[1].ref.path).toContainEqual({ kind: 'union', index: 1 });
  });

  it('recurses into a subquery source, producing a symbol for the outer alias AND the inner one(s), correctly nested', () => {
    const batch = parseBatch('ВЫБРАТЬ Т.Поле ИЗ (ВЫБРАТЬ Б.Поле ИЗ Справочник.Номенклатура КАК Б) КАК Т');
    const symbols = collectSourceAliasSymbols(batch);
    expect(symbols.map((s) => s.alias)).toEqual(['Т', 'Б']);
    // Outer "Т" symbol: batch/union/table(0).
    expect(symbols[0].ref.path).toEqual([
      { kind: 'batch', index: 0 },
      { kind: 'union', index: 0 },
      { kind: 'table', index: 0 },
    ]);
    // Inner "Б" symbol nests one more union/table level under the outer table.
    expect(symbols[1].ref.path).toEqual([
      { kind: 'batch', index: 0 },
      { kind: 'union', index: 0 },
      { kind: 'table', index: 0 },
      { kind: 'union', index: 0 },
      { kind: 'table', index: 0 },
    ]);
  });

  it('gives each batch statement its own batch index', () => {
    const SEP = '\n;\n\n' + '/'.repeat(80) + '\n';
    const batch = parseBatch(
      'ВЫБРАТЬ Т.Код ИЗ Справочник.Номенклатура КАК Т' +
        SEP +
        'ВЫБРАТЬ У.Код ИЗ Справочник.Номенклатура КАК У',
    );
    const symbols = collectSourceAliasSymbols(batch);
    expect(symbols.map((s) => s.ref.path[0])).toEqual([
      { kind: 'batch', index: 0 },
      { kind: 'batch', index: 1 },
    ]);
  });

  it('never produces a symbol for a table with no alias at all (defensive; real parses always synthesize one)', () => {
    const batch: BatchDocument = {
      members: [
        {
          members: [
            {
              model: {
                tables: [{ id: 't0', fullName: 'Справочник.Х' }], // no alias
                fields: [],
              },
            },
          ],
        },
      ],
    };
    expect(collectSourceAliasSymbols(batch)).toEqual([]);
  });
});

describe('resolveSymbolTable', () => {
  it('walks a top-level symbol\'s path back to its SelectedTable', () => {
    const batch = parseBatch('ВЫБРАТЬ Т.Код ИЗ Справочник.Номенклатура КАК Т');
    const [symbol] = collectSourceAliasSymbols(batch);
    const table = resolveSymbolTable(batch, symbol.ref.path);
    expect(table?.fullName).toBe('Справочник.Номенклатура');
    expect(table?.alias).toBe('Т');
  });

  it('walks a NESTED (subquery) symbol\'s path back to its own SelectedTable, not the outer one', () => {
    const batch = parseBatch('ВЫБРАТЬ Т.Поле ИЗ (ВЫБРАТЬ Б.Поле ИЗ Справочник.Номенклатура КАК Б) КАК Т');
    const symbols = collectSourceAliasSymbols(batch);
    const inner = symbols.find((s) => s.alias === 'Б')!;
    const table = resolveSymbolTable(batch, inner.ref.path);
    expect(table?.fullName).toBe('Справочник.Номенклатура');
    expect(table?.alias).toBe('Б');
  });

  it('returns undefined for a malformed/foreign path', () => {
    const batch = parseBatch('ВЫБРАТЬ Т.Код ИЗ Справочник.Номенклатура КАК Т');
    expect(resolveSymbolTable(batch, [{ kind: 'batch', index: 99 }])).toBeUndefined();
    expect(resolveSymbolTable(batch, [])).toBeUndefined();
  });
});
