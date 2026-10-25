import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { computeQueryParseProblems, createQueryProblemsCache } from '../../src/extension/queryDiagnostics';
import { buildResolverFromTables } from '../../src/core/metadata/buildModelResolver';
import { buildYamlResolver } from '../../src/core/metadata/buildYamlResolver';
import type { MetadataResolver } from '../../src/core/query/metadataResolver';
import type { MetaTable } from '../../src/core/metadata/types';

// C41 1b performance: the diagnostics pass reuses the result of each query literal by its
// exact text, and the field check by the resolver object. Changed text or another
// resolver is checked again; the result is always the one of a pass without the cache.

const table = (fields: string[]): MetaTable => ({
  kind: 'Справочник', name: 'Тест', fullName: 'Справочник.Тест',
  fields: fields.map(name => ({ name, kind: 'standard' as const, types: [{ primitive: 'Строка' as const }] })),
});
const withoutНет = buildResolverFromTables([table(['Код'])]);
const withНет = buildResolverFromTables([table(['Код', 'Нет'])]);

const lit = (query: string) => `Запрос.Текст = "${query}";`;
const A = lit('ВЫБРАТЬ Т.Нет КАК Х ИЗ Справочник.Тест КАК Т');
const B = lit('ВЫБРАТЬ Т.Код КАК Х ИЗ Справочник.Тест КАК Т');
const BROKEN = lit('ВЫБРАТЬ ИЗ Справочник.Тест КАК Т');

function counting(base: MetadataResolver): { resolver: MetadataResolver; lookups: () => number } {
  let n = 0;
  return { resolver: { ...base, tableByFullName: (name: string) => { n++; return base.tableByFullName(name); } }, lookups: () => n };
}

describe('C41 1b: the diagnostics cache gives the uncached result', () => {
  it('over a sequence of edits, resolver changes and metadata loss', () => {
    const cache = createQueryProblemsCache();
    const steps: [string, MetadataResolver | undefined][] = [
      [`${A}\n${B}`, undefined],
      [`${A}\n${B}`, withoutНет],
      [`// правка\n${A}\n${B}`, withoutНет],
      [`${A}\n${B.replace('Т.Код', 'Т.Нет')}`, withoutНет],
      [`${A}\n${BROKEN}`, withoutНет],
      [`${A}\n${BROKEN}`, withНет],
      [`${A}\n${B}`, undefined],
      [`${A}\n${A}`, withoutНет],
      ['Запрос.Текст = "ВЫБРАТЬ Т.Нет КАК Х ИЗ', withoutНет], // unclosed literal
      [`${A}`, withoutНет],
    ];
    for (const [source, resolver] of steps) {
      expect(computeQueryParseProblems(source, resolver, cache)).toEqual(computeQueryParseProblems(source, resolver));
    }
  });

  it('over the 200 largest golden queries, before and after edits', () => {
    const dir = path.resolve(__dirname, '../fixtures/corpus');
    const resolver = buildYamlResolver(path.join(dir, 'metadata', 'cf'));
    const golden = fs.readFileSync(path.join(dir, 'golden.jsonl'), 'utf8').split('\n').filter(l => l.trim())
      .map(l => JSON.parse(l)).filter((g: { valid: boolean }) => g.valid)
      .sort((a: { input: string }, b: { input: string }) => b.input.length - a.input.length).slice(0, 200);
    const source = golden.map((g: { input: string }, i: number) =>
      `// ${i}\nЗ${i}.Текст = "${g.input.replace(/"/g, '""').split('\n').join('\n|')}";`).join('\n');
    // An added query with a missing field, and a comment edit outside every query.
    const edited = `${source}\nЗ.Текст = "ВЫБРАТЬ Т.НетТакогоПоля КАК Х ИЗ Справочник.Валюты КАК Т";`;
    const cache = createQueryProblemsCache();
    for (const [text, r] of [[source, resolver], [edited, resolver], [edited.replace('// 0', '// 0!'), resolver], [source, undefined]] as const) {
      expect(computeQueryParseProblems(text, r, cache)).toEqual(computeQueryParseProblems(text, r));
    }
    expect(computeQueryParseProblems(edited, resolver).map(p => p.kind)).toContain('fieldNotFound');
  });
});

describe('C41 1b: what the cache reuses and what it checks again', () => {
  it('an edit outside the queries reuses every literal result', () => {
    const cache = createQueryProblemsCache();
    computeQueryParseProblems(`${A}\n${B}`, withoutНет, cache);
    const before = new Map(cache.entries);
    computeQueryParseProblems(`// правка\n${A}\n${B}`, withoutНет, cache);
    expect(cache.entries.size).toBe(2);
    for (const [text, entry] of cache.entries) expect(entry).toBe(before.get(text));
  });

  it('a changed query is checked again, the unchanged one is reused, a removed one is dropped', () => {
    const cache = createQueryProblemsCache();
    computeQueryParseProblems(`${A}\n${B}`, withoutНет, cache);
    const keepB = [...cache.entries.entries()].find(([t]) => t.includes('Т.Код'))![1];
    const changed = B.replace('Т.Код КАК Х', 'Т.Нет КАК Y'); // a new text, not A
    const problems = computeQueryParseProblems(`${B}\n${changed}`, withoutНет, cache);
    expect(problems.map(p => p.kind)).toEqual(['fieldNotFound']);
    expect([...cache.entries.values()]).toContain(keepB);
    expect([...cache.entries.keys()].some(t => t.includes('КАК Y'))).toBe(true);
    expect([...cache.entries.keys()].some(t => t.includes('Т.Нет КАК Х'))).toBe(false); // A is gone
    expect(cache.entries.size).toBe(2);
  });

  it('the same resolver does not run the field check again; another resolver does', () => {
    const cache = createQueryProblemsCache();
    const first = counting(withoutНет);
    computeQueryParseProblems(A, first.resolver, cache);
    const n = first.lookups();
    expect(n).toBeGreaterThan(0);
    computeQueryParseProblems(`// правка\n${A}`, first.resolver, cache);
    expect(first.lookups()).toBe(n);
    const second = counting(withНет);
    expect(computeQueryParseProblems(A, second.resolver, cache)).toEqual([]);
    expect(second.lookups()).toBeGreaterThan(0);
  });

  it('losing metadata drops field problems without parsing again', () => {
    const cache = createQueryProblemsCache();
    computeQueryParseProblems(A, withoutНет, cache);
    const entry = [...cache.entries.values()][0];
    expect(computeQueryParseProblems(A, undefined, cache)).toEqual([]);
    expect([...cache.entries.values()][0]).toBe(entry);
  });
});
