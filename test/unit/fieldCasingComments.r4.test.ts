/**
 * R4: `canonicalizeFieldCasing.canonExprText` (metadata casing of field paths in
 * expression text) had its own string toggle and no comment rule, so with metadata
 * and preserved comments `ЕСТЬNULL(Т.Код, // Т.наименование⏎0)` became
 * `// Т.Наименование`. Casing now applies only to code ranges; literals and comments
 * stay byte for byte, code is still canonicalized. Reachable with a resolver (oracle
 * tooling, semantic snapshot); the Designer refuses to open this comment placement.
 */
import * as path from 'path';
import { describe, it, expect } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { buildYamlResolver } from '../../src/core/metadata/buildYamlResolver';

const resolver = buildYamlResolver(path.join(__dirname, '../fixtures/corpus/metadata/cf'));
const gen = (text: string): string => generateBatch(parseBatch(text, resolver, { preserveComments: true }));
const F = 'ИЗ Справочник.Валюты КАК Т';

describe('R4: field casing never rewrites comments or literals', () => {
  it('comment inside a WHERE call keeps its text; the code path is canonicalized', () => {
    const out = gen(`ВЫБРАТЬ Т.Код КАК К ${F} ГДЕ ЕСТЬNULL(Т.код, // Т.наименование\n0) = 1`);
    expect(out).toContain('ЕСТЬNULL(Т.Код, // Т.наименование');
  });

  it('literal keeps its text; the code path is canonicalized', () => {
    const out = gen(`ВЫБРАТЬ Т.Код КАК К ${F} ГДЕ ЕСТЬNULL(Т.наименование, "Т.наименование") = "x"`);
    expect(out).toContain('ЕСТЬNULL(Т.Наименование, "Т.наименование")');
  });

  it('reopen is stable', () => {
    const out = gen(`ВЫБРАТЬ Т.Код КАК К ${F} ГДЕ ЕСТЬNULL(Т.код, // Т.наименование\n0) = 1`);
    expect(gen(out)).toBe(out);
  });
});
