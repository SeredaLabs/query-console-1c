/**
 * Guard for the `src/core` layer rule in docs/development/architecture.md:
 * core runs without VS Code or a browser, and never reaches up into its
 * adapters. `semanticArchitectureBoundary.test.ts` covers the query ↔ semantic
 * split inside core; this file covers core as a whole against the outside.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SRC = path.resolve(__dirname, '../../src');
const CORE = path.join(SRC, 'core');
const METADATA = path.join(CORE, 'metadata');

function listTsFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listTsFiles(full);
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

/** Matches `from '...'`, `require('...')` and `import('...')` module specifiers. */
const IMPORT_SPECIFIER_RE = /(?:from\s+|require\(|import\()\s*['"]([^'"]+)['"]/g;

const coreImports = listTsFiles(CORE).flatMap((file) =>
  [...fs.readFileSync(file, 'utf8').matchAll(IMPORT_SPECIFIER_RE)].map((m) => ({ file, specifier: m[1] })),
);

const rel = (file: string): string => path.relative(SRC, file);

describe('src/core layer boundary', () => {
  it('never imports vscode or a UI framework', () => {
    const offending = coreImports
      .filter(({ specifier }) => /^(vscode|react|react-dom)(\/|$)/.test(specifier))
      .map(({ file, specifier }) => `${rel(file)} imports '${specifier}'`);
    expect(offending).toEqual([]);
  });

  it('never imports from the adapters or developer tools (extension, webviews, cli, tooling)', () => {
    const forbidden = ['extension', 'webview', 'webview-canvas', 'cli'].map((d) => path.join(SRC, d));
    const tooling = path.resolve(SRC, '../tooling');
    const offending = coreImports
      .filter(({ specifier }) => specifier.startsWith('.'))
      .map(({ file, specifier }) => ({ file, specifier, target: path.resolve(path.dirname(file), specifier) }))
      .filter(({ target }) => [...forbidden, tooling].some((dir) => target === dir || target.startsWith(dir + path.sep)))
      .map(({ file, specifier }) => `${rel(file)} imports '${specifier}'`);
    expect(offending).toEqual([]);
  });

  it('uses Node built-ins (filesystem etc.) only in src/core/metadata', () => {
    const offending = coreImports
      .filter(({ specifier }) => /^(node:)?(fs|path|os|crypto|child_process|worker_threads)$/.test(specifier))
      .filter(({ file }) => !file.startsWith(METADATA + path.sep))
      .map(({ file, specifier }) => `${rel(file)} imports '${specifier}'`);
    expect(offending).toEqual([]);
  });
});
