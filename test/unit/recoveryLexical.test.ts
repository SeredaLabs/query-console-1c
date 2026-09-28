/**
 * S2: a lexical error while typing (bare `&`, unclosed string) must not make the
 * whole semantic snapshot unavailable when the text around it is usable. The
 * snapshot feeds hover/completion only; Apply never uses it.
 */
import { describe, it, expect } from 'vitest';
import { buildSemanticSnapshotFromText } from '../../src/core/semantic/buildSemanticSnapshot';
import { hasTrustworthyPositions } from '../../src/core/semantic/semanticSnapshot';
import { describeChain, resolveCompletionTarget } from '../../src/extension/hoverFieldInfo';
import { buildResolverFromTables } from '../../src/core/metadata/buildModelResolver';
import { collectQueryParameterOccurrences } from '../../src/core/query/queryParameters';
import type { MetaTable } from '../../src/core/metadata/types';

const T = (name: string, fields: string[]): MetaTable => ({
  kind: 'Справочник', name, fullName: `Справочник.${name}`,
  fields: fields.map(f => ({ name: f, kind: 'standard' as const, types: [{ primitive: 'Строка' as const }] })),
});
const resolver = buildResolverFromTables([T('Товары', ['Ссылка', 'Код']), T('Контрагенты', ['Ссылка', 'ИНН'])]);

/** Completion table right after `<alias>.` marked by `¦`. */
function completionAt(marked: string, alias: string): string | undefined {
  const pos = marked.indexOf('¦');
  return resolveCompletionTarget(marked.replace('¦', ''), resolver, [alias], pos - alias.length - 1)?.meta.fullName;
}

describe('S2: lexical errors while typing keep alias assistance', () => {
  it('bare `&` after a valid source', () => {
    const text = 'ВЫБРАТЬ Т.Ссылка ИЗ Справочник.Товары КАК Т ГДЕ Т.Код = &';
    const snapshot = buildSemanticSnapshotFromText(1, text, resolver);
    expect(snapshot.completeness).toBe('recovered');
    expect(hasTrustworthyPositions(snapshot)).toBe(true);
    expect(completionAt('ВЫБРАТЬ Т.¦Ссылка ИЗ Справочник.Товары КАК Т ГДЕ Т.Код = &', 'Т')).toBe('Справочник.Товары');
    expect(completionAt('ВЫБРАТЬ Т.Ссылка ИЗ Справочник.Товары КАК Т ГДЕ Т.¦Код = &', 'Т')).toBe('Справочник.Товары');
    expect(describeChain(text, resolver, ['Т', 'Код'], text.indexOf('Т.Код')).tableFullName).toBe('Справочник.Товары');
  });

  it('unclosed string literal after a valid source', () => {
    const marked = 'ВЫБРАТЬ Т.Ссылка ИЗ Справочник.Товары КАК Т ГДЕ Т.¦Код = "незакрыта';
    expect(completionAt(marked, 'Т')).toBe('Справочник.Товары');
    const snapshot = buildSemanticSnapshotFromText(1, marked.replace('¦', ''), resolver);
    expect(snapshot.completeness).toBe('recovered');
    expect(hasTrustworthyPositions(snapshot)).toBe(true);
  });

  it('a lexical error in one statement keeps the neighbouring statements', () => {
    const first = 'ВЫБРАТЬ К.Ссылка ИЗ Справочник.Контрагенты КАК К';
    const second = 'ВЫБРАТЬ Т.Ссылка ИЗ Справочник.Товары КАК Т ГДЕ Т.Код = &';
    // Error after a valid statement: the valid one keeps its own source.
    const after = `${first};\n${second}`;
    expect(completionAt(after.replace('К.Ссылка', 'К.¦Ссылка'), 'К')).toBe('Справочник.Контрагенты');
    expect(completionAt(after.replace('Т.Ссылка', 'Т.¦Ссылка'), 'Т')).toBe('Справочник.Товары');
    // Error before a valid statement: a bare `&` only affects itself.
    const before = `${second};\n${first}`;
    expect(completionAt(before.replace('К.Ссылка', 'К.¦Ссылка'), 'К')).toBe('Справочник.Контрагенты');
    expect(completionAt(before.replace('Т.Ссылка', 'Т.¦Ссылка'), 'Т')).toBe('Справочник.Товары');
    // The same alias in two statements still resolves per statement.
    const shadow = `ВЫБРАТЬ Т.Ссылка ИЗ Справочник.Контрагенты КАК Т;\n${second}`;
    expect(completionAt(shadow.replace('Т.Ссылка ИЗ Справочник.Контрагенты', 'Т.¦Ссылка ИЗ Справочник.Контрагенты'), 'Т')).toBe('Справочник.Контрагенты');
    expect(completionAt(shadow.replace('Т.Ссылка ИЗ Справочник.Товары', 'Т.¦Ссылка ИЗ Справочник.Товары'), 'Т')).toBe('Справочник.Товары');
    // An unclosed string swallows the rest lexically; the statement before it is kept.
    const open = `${first};\nВЫБРАТЬ Т.Ссылка ИЗ Справочник.Товары КАК Т ГДЕ Т.Код = "незакрыта`;
    expect(completionAt(open.replace('К.Ссылка', 'К.¦Ссылка'), 'К')).toBe('Справочник.Контрагенты');
  });

  it('lexical and structural damage together (bare `&` plus an unclosed `(`)', () => {
    const marked = 'ВЫБРАТЬ Т.Ссылка, ПОДСТРОКА(Т.¦ ИЗ Справочник.Товары КАК Т ГДЕ Т.Код = &';
    expect(completionAt(marked, 'Т')).toBe('Справочник.Товары');
  });

  it('parameter occurrences are unchanged by the shared recovery', () => {
    const text = 'ВЫБРАТЬ &А, &, ИЗ #, &Б, "не закрыта &В';
    expect(collectQueryParameterOccurrences(text).map(o => [o.name, o.range.start])).toEqual([
      ['А', text.indexOf('&А')], ['Б', text.indexOf('&Б')],
    ]);
  });
});
