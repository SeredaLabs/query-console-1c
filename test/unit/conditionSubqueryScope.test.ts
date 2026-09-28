/**
 * S1: source aliases declared inside a condition subquery (`ГДЕ … В (ВЫБРАТЬ …)`,
 * `ИМЕЮЩИЕ … В (ВЫБРАТЬ …)`) are indexed and resolvable at their position, the
 * same way source subqueries already are. Stage 0 probes C21 (valid text) and C12.
 */
import { describe, it, expect } from 'vitest';
import { buildSemanticSnapshotFromText } from '../../src/core/semantic/buildSemanticSnapshot';
import { resolveAliasAt, findModelAt } from '../../src/core/semantic/resolveAliasAt';
import { resolveSymbolTable } from '../../src/core/semantic/collectSymbols';
import { describeChain, resolveCompletionTarget } from '../../src/extension/hoverFieldInfo';
import { buildResolverFromTables } from '../../src/core/metadata/buildModelResolver';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import type { MetaTable } from '../../src/core/metadata/types';

const T = (name: string, fields: string[]): MetaTable => ({
  kind: 'Справочник', name, fullName: `Справочник.${name}`,
  fields: fields.map(f => ({ name: f, kind: 'standard' as const, types: [{ primitive: 'Строка' as const }] })),
});
const resolver = buildResolverFromTables([T('Товары', ['Ссылка', 'Контрагент']), T('Контрагенты', ['Ссылка', 'ИНН'])]);

function tableAt(text: string, marker: string, alias: string, offset = 0): string | undefined {
  const snapshot = buildSemanticSnapshotFromText(1, text, resolver);
  const pos = text.indexOf(marker) + offset;
  const r = resolveAliasAt(snapshot, pos, alias);
  if (r.kind !== 'resolved') return r.kind;
  return resolveSymbolTable(snapshot.model, r.value.ref.path)?.fullName;
}

const C21 = 'ВЫБРАТЬ\n\tТ.Ссылка\nИЗ\n\tСправочник.Товары КАК Т\nГДЕ\n\tТ.Контрагент В (ВЫБРАТЬ К.Ссылка ИЗ Справочник.Контрагенты КАК К)';

describe('S1: condition subquery scope', () => {
  it('C21: resolves the inner alias inside a WHERE subquery', () => {
    expect(tableAt(C21, 'К.Ссылка', 'К')).toBe('Справочник.Контрагенты');
  });

  it('C21: the outer alias stays visible inside it (correlation)', () => {
    expect(tableAt(C21, 'К.Ссылка', 'Т')).toBe('Справочник.Товары');
  });

  it('the inner alias is not visible in the outer query', () => {
    expect(tableAt(C21, 'Т.Ссылка', 'К')).toBe('unknown');
  });

  it('findModelAt returns the subquery model inside it', () => {
    const snapshot = buildSemanticSnapshotFromText(1, C21, resolver);
    expect(findModelAt(snapshot, C21.indexOf('К.Ссылка'))?.tables[0].alias).toBe('К');
    expect(findModelAt(snapshot, C21.indexOf('Т.Ссылка'))?.tables[0].alias).toBe('Т');
  });

  it('hover and completion see the inner source metadata', () => {
    const pos = C21.indexOf('К.Ссылка');
    const hover = describeChain(C21, resolver, ['К', 'ИНН'], pos);
    expect(hover.tableFullName).toBe('Справочник.Контрагенты');
    expect(hover.resolution?.unresolvedTail).toEqual([]);
    expect(resolveCompletionTarget(C21, resolver, ['К'], pos)?.meta.fullName).toBe('Справочник.Контрагенты');
  });

  it('works under НЕ and for ИМЕЮЩИЕ subqueries', () => {
    const not = 'ВЫБРАТЬ Т.Ссылка ИЗ Справочник.Товары КАК Т ГДЕ НЕ Т.Контрагент В (ВЫБРАТЬ К.Ссылка ИЗ Справочник.Контрагенты КАК К)';
    expect(tableAt(not, 'К.Ссылка', 'К')).toBe('Справочник.Контрагенты');
    const having = 'ВЫБРАТЬ Т.Контрагент КАК Контрагент, КОЛИЧЕСТВО(Т.Ссылка) КАК Ч ИЗ Справочник.Товары КАК Т ' +
      'СГРУППИРОВАТЬ ПО Т.Контрагент ИМЕЮЩИЕ Т.Контрагент В (ВЫБРАТЬ К.Ссылка ИЗ Справочник.Контрагенты КАК К)';
    expect(tableAt(having, 'К.Ссылка', 'К')).toBe('Справочник.Контрагенты');
  });

  it('a second condition subquery with the same alias resolves to its own source', () => {
    const r2 = buildResolverFromTables([T('Товары', ['Ссылка', 'Контрагент', 'Склад']), T('Контрагенты', ['Ссылка']), T('Склады', ['Ссылка'])]);
    const text = 'ВЫБРАТЬ Т.Ссылка ИЗ Справочник.Товары КАК Т ГДЕ Т.Контрагент В (ВЫБРАТЬ К.Ссылка ИЗ Справочник.Контрагенты КАК К) ' +
      'И Т.Склад В (ВЫБРАТЬ К.Ссылка ИЗ Справочник.Склады КАК К)';
    const snapshot = buildSemanticSnapshotFromText(1, text, r2);
    const at = (pos: number) => {
      const r = resolveAliasAt(snapshot, pos, 'К');
      return r.kind === 'resolved' ? resolveSymbolTable(snapshot.model, r.value.ref.path)?.fullName : r.kind;
    };
    expect(at(text.indexOf('К.Ссылка'))).toBe('Справочник.Контрагенты');
    expect(at(text.lastIndexOf('К.Ссылка'))).toBe('Справочник.Склады');
  });

  it('nested: condition subquery inside a source subquery, and vice versa', () => {
    const a = 'ВЫБРАТЬ П.Ссылка ИЗ (ВЫБРАТЬ Т.Ссылка КАК Ссылка ИЗ Справочник.Товары КАК Т ' +
      'ГДЕ Т.Контрагент В (ВЫБРАТЬ К.Ссылка ИЗ Справочник.Контрагенты КАК К)) КАК П';
    expect(tableAt(a, 'К.Ссылка', 'К')).toBe('Справочник.Контрагенты');
    expect(tableAt(a, 'К.Ссылка', 'Т')).toBe('Справочник.Товары');
    const b = 'ВЫБРАТЬ Т.Ссылка ИЗ Справочник.Товары КАК Т ГДЕ Т.Контрагент В ' +
      '(ВЫБРАТЬ П.Ссылка ИЗ (ВЫБРАТЬ К.Ссылка КАК Ссылка ИЗ Справочник.Контрагенты КАК К) КАК П)';
    expect(tableAt(b, 'К.Ссылка', 'К')).toBe('Справочник.Контрагенты');
    expect(tableAt(b, 'П.Ссылка', 'П')).toBe('');
  });

  it('a source subquery next to a condition subquery does not capture its positions', () => {
    // Both inner queries start their own table list at index 0 (same kind + index).
    const text = 'ВЫБРАТЬ П.Ссылка ИЗ (ВЫБРАТЬ Т.Ссылка КАК Ссылка ИЗ Справочник.Товары КАК Т) КАК П ' +
      'ГДЕ П.Ссылка В (ВЫБРАТЬ К.Ссылка ИЗ Справочник.Контрагенты КАК К)';
    const snapshot = buildSemanticSnapshotFromText(1, text, resolver);
    const inTable = text.indexOf('Справочник.Контрагенты') + 3;
    expect(findModelAt(snapshot, inTable)?.tables[0].alias).toBe('К');
    expect(tableAt(text, 'Справочник.Контрагенты', 'К', 3)).toBe('Справочник.Контрагенты');
  });

  it('C12: completion target while typing `К.` in a condition subquery', () => {
    const text = 'ВЫБРАТЬ Т.Ссылка ИЗ Справочник.Товары КАК Т ГДЕ Т.Контрагент В (ВЫБРАТЬ К. ИЗ Справочник.Контрагенты КАК К)';
    const pos = text.indexOf('К. ИЗ');
    expect(resolveCompletionTarget(text, resolver, ['К'], pos)?.meta.fullName).toBe('Справочник.Контрагенты');
  });

  it('picks the UNION member that contains the position inside a source subquery', () => {
    // Before depth-aware events, the outer statement's member 0 matched here and
    // the inner member 0's alias was returned for every inner member.
    const r3 = buildResolverFromTables([T('А', ['Ссылка']), T('Б', ['Ссылка'])]);
    const text = 'ВЫБРАТЬ П.Ссылка ИЗ (ВЫБРАТЬ Х.Ссылка КАК Ссылка ИЗ Справочник.А КАК Х ' +
      'ОБЪЕДИНИТЬ ВСЕ ВЫБРАТЬ Х.Ссылка ИЗ Справочник.Б КАК Х) КАК П';
    const snapshot = buildSemanticSnapshotFromText(1, text, r3);
    const at = (pos: number) => {
      const r = resolveAliasAt(snapshot, pos, 'Х');
      return r.kind === 'resolved' ? resolveSymbolTable(snapshot.model, r.value.ref.path)?.fullName : r.kind;
    };
    expect(at(text.indexOf('Х.Ссылка'))).toBe('Справочник.А');
    expect(at(text.lastIndexOf('Х.Ссылка'))).toBe('Справочник.Б');
  });

  it('recording positions does not change the parsed model or generated text', () => {
    for (const text of [C21, 'ВЫБРАТЬ Т.Ссылка ИЗ Справочник.Товары КАК Т ГДЕ Т.Контрагент В (ВЫБРАТЬ К.Ссылка ИЗ Справочник.Контрагенты КАК К ГДЕ К.ИНН В (ВЫБРАТЬ Н.ИНН ИЗ Справочник.Контрагенты КАК Н))']) {
      const plain = parseBatch(text, resolver);
      const withMap = parseBatch(text, resolver, { batchSourceMap: { record: () => {} } });
      expect(withMap).toEqual(plain);
      expect(generateBatch(withMap)).toBe(generateBatch(plain));
    }
  });
});
