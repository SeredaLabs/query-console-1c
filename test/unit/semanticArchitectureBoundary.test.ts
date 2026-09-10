/**
 * Phase 1a of the semantic-core roadmap (memory: project-semantic-core-roadmap).
 *
 * Negative architecture tests, written BEFORE any real semantic analysis exists,
 * so the isolation they guard can never silently erode as later phases add code:
 * `src/core/semantic` is a read-only, one-way consumer of `src/core/query` — it may
 * import query-layer types, but `src/core/query` (the corpus-proven round-trip
 * engine: parser + generator) must never import anything back from it, and the
 * generator/parser's public signatures must never grow a `SemanticIndex` parameter.
 * Without tests like these, a future "convenient shortcut" (e.g.
 * `generateBatch(model, semanticIndex)`) could erode the isolation this whole
 * design exists to guarantee.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { parseBatch } from '../../src/core/query/sdblParser';

const QUERY_DIR = path.resolve(__dirname, '../../src/core/query');
const SEMANTIC_DIR = path.resolve(__dirname, '../../src/core/semantic');

function listTsFiles(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return listTsFiles(full);
      return entry.name.endsWith('.ts') ? [full] : [];
    });
}

/** Matches `from '...'`, `require('...')` and `import('...')` module specifiers. */
const IMPORT_SPECIFIER_RE = /(?:from\s+|require\(|import\()\s*['"]([^'"]+)['"]/g;

function importedModulePaths(fileContents: string): string[] {
  return [...fileContents.matchAll(IMPORT_SPECIFIER_RE)].map((m) => m[1]);
}

describe('semantic layer architecture boundary', () => {
  it('src/core/query never imports from src/core/semantic', () => {
    const offendingImports: string[] = [];
    for (const file of listTsFiles(QUERY_DIR)) {
      const contents = fs.readFileSync(file, 'utf8');
      for (const specifier of importedModulePaths(contents)) {
        if (!specifier.startsWith('.')) continue; // only local imports can reach src/core/semantic
        const resolved = path.resolve(path.dirname(file), specifier);
        if (resolved === SEMANTIC_DIR || resolved.startsWith(SEMANTIC_DIR + path.sep)) {
          offendingImports.push(`${path.relative(QUERY_DIR, file)} imports '${specifier}'`);
        }
      }
    }
    expect(offendingImports).toEqual([]);
  });

  it("generateBatch's signature never gains a SemanticIndex parameter", () => {
    expect(generateBatch.length).toBe(1);
    const source = fs.readFileSync(path.join(QUERY_DIR, 'sdblGenerator.ts'), 'utf8');
    expect(source).not.toContain('SemanticIndex');
    expect(source).not.toContain('SemanticSnapshot');
  });

  it('parseBatch never takes a SemanticIndex/SemanticSnapshot parameter', () => {
    const source = fs.readFileSync(path.join(QUERY_DIR, 'sdblParser.ts'), 'utf8');
    expect(source).not.toContain('SemanticIndex');
    expect(source).not.toContain('SemanticSnapshot');
  });

  it('a semantic-layer failure can never affect parseBatch/generateBatch: neither module references src/core/semantic at all', () => {
    for (const name of ['sdblParser.ts', 'sdblGenerator.ts']) {
      const source = fs.readFileSync(path.join(QUERY_DIR, name), 'utf8');
      const specifiers = importedModulePaths(source).filter((s) => s.startsWith('.'));
      const reachesSemantic = specifiers.some((s) => {
        const resolved = path.resolve(QUERY_DIR, s);
        return resolved === SEMANTIC_DIR || resolved.startsWith(SEMANTIC_DIR + path.sep);
      });
      expect(reachesSemantic).toBe(false);
    }
  });

  // Phase 1b: SourceMapSink must be strictly write-only from the parser's
  // perspective (Refinement 5) — the parser may call `.record(...)` on it, but
  // never any other method, and must never branch on what it returns.
  it("sdblParser.ts only ever calls .record(...) on a sourceMap sink, never anything else", () => {
    const source = fs.readFileSync(path.join(QUERY_DIR, 'sdblParser.ts'), 'utf8');
    const calls = [...source.matchAll(/sourceMap\?\.(\w+)\(/g)].map((m) => m[1]);
    expect(calls.length).toBeGreaterThan(0); // guards against the check silently matching nothing
    expect(new Set(calls)).toEqual(new Set(['record']));
  });
});
