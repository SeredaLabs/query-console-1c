/**
 * Editor diagnostics cost (C41 stage 1b) — measures, decides nothing. Lives outside the
 * production runtime, like `metadataPerf.ts`.
 *
 * Workload: valid golden-corpus queries embedded as BSL string literals (`|` continuation
 * lines, doubled quotes), the 200 largest in one module (~700 KB) and the largest one
 * alone; metadata: the corpus YAML export (558 objects). Reports median and p95 of
 * alternating runs for the diagnostics pass (`computeQueryParseProblems`) per scenario,
 * and the share of each phase.
 *
 * Run: npx tsx --expose-gc bench/queryDiagnosticsPerf.ts [--runs N] (`--expose-gc` adds the
 * memory the cache keeps)
 * The same file runs on `main` (the pass there has no resolver or cache argument).
 */
import * as fs from 'fs';
import * as path from 'path';
import * as diagnostics from '../src/extension/queryDiagnostics';
import { findAllQueryLiterals, findQueryKeywordRange } from '../src/extension/queryAtCursor';
import { tryParseBatch } from '../src/core/query/validateBatch';
import { tokenize } from '../src/core/query/sdblLexer';
import { findMalformedCustomExpressions, validateBatchSemantics } from '../src/core/query/semanticValidator';
import { buildYamlResolver } from '../src/core/metadata/buildYamlResolver';
import type { MetadataResolver } from '../src/core/query/metadataResolver';

const CORPUS_DIR = path.resolve(__dirname, '../test/fixtures/corpus');
const runsArg = process.argv.indexOf('--runs');
const RUNS = runsArg > 0 ? Number(process.argv[runsArg + 1]) : 15;

interface Golden { file: string; valid: boolean; input: string }
const golden: Golden[] = fs.readFileSync(path.join(CORPUS_DIR, 'golden.jsonl'), 'utf8')
  .split('\n').filter(l => l.trim()).map(l => JSON.parse(l)).filter((g: Golden) => g.valid);
golden.sort((a, b) => b.input.length - a.input.length);
const resolver = buildYamlResolver(path.join(CORPUS_DIR, 'metadata', 'cf'));

const literal = (q: string, i: number) =>
  `// Запрос ${i}\nЗапрос${i}.Текст = "${q.replace(/"/g, '""').split('\n').join('\n|')}";`;
const moduleOf = (qs: Golden[]) => qs.map((g, i) => literal(g.input, i)).join('\n\n');

// Optional cache API of the optimized pass; absent on `main` and before the change.
type Pass = (source: string, r?: MetadataResolver, cache?: unknown) => unknown[];
const pass = diagnostics.computeQueryParseProblems as Pass;
const createCache = (diagnostics as { createQueryProblemsCache?: () => unknown }).createQueryProblemsCache;

function stats(xs: number[]): string {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return `median ${q(0.5).toFixed(1)} ms, p95 ${q(0.95).toFixed(1)} ms`;
}
const now = () => Number(process.hrtime.bigint()) / 1e6;
function time(fn: () => void): number { const t = now(); fn(); return now() - t; }

function phases(source: string): void {
  const hits = findAllQueryLiterals(source).filter(h => h.dialect === 'sdbl');
  const sums = { scan: 0, lexer: 0, parse: 0, malformed: 0, semantic: 0, semanticTokenize: 0, range: 0 };
  for (let run = 0; run < 5; run++) {
    sums.scan += time(() => findAllQueryLiterals(source));
    for (const h of hits) {
      sums.lexer += time(() => tokenize(h.text));
      let attempt!: ReturnType<typeof tryParseBatch>;
      sums.parse += time(() => { attempt = tryParseBatch(h.text); });
      if (!attempt.ok) continue;
      const doc = attempt.doc;
      sums.malformed += time(() => findMalformedCustomExpressions(doc));
      sums.semantic += time(() => validateBatchSemantics(doc, resolver, h.text));
      sums.semanticTokenize += time(() => tokenize(h.text));
      sums.range += time(() => findQueryKeywordRange(source, h));
    }
  }
  const total = sums.scan + sums.parse + sums.malformed + sums.semantic + sums.range;
  console.log(`  ${hits.length} literals, ${(source.length / 1024).toFixed(0)} KB; per pass (mean of 5):`);
  for (const [k, v] of Object.entries(sums)) {
    const note = k === 'lexer' ? ' (inside parse)' : k === 'semanticTokenize' ? ' (lexing the text again: inside semantic before C41 1b, now only for a table error)' : '';
    console.log(`    ${k.padEnd(17)} ${(v / 5).toFixed(1).padStart(7)} ms  ${((v / total) * 100).toFixed(0).padStart(3)}%${note}`);
  }
}

function scenarios(label: string, source: string): void {
  console.log(`\n== ${label}: ${(source.length / 1024).toFixed(0)} KB, cache API: ${createCache ? 'yes' : 'no'}`);
  // An edit inside one query (a field name) and outside every query (a comment).
  const firstQuery = source.indexOf('ВЫБРАТЬ');
  const inside = source.slice(0, firstQuery) + source.slice(firstQuery).replace(/КАК /u, 'КАК  ');
  // Built from `inside`, so the outside edit keeps the query edited the step before.
  const outside = inside.replace('// Запрос 0', '// Запрос 0 (правка)');
  const otherResolver = buildYamlResolver(path.join(CORPUS_DIR, 'metadata', 'cf'));
  const rows: Record<string, number[]> = {
    'first open, no metadata': [], 'first open, metadata': [], 'edit inside a query': [],
    'edit outside queries': [], 'repeat, no change': [], 'resolver update': [],
  };
  for (let run = 0; run < RUNS; run++) {
    rows['first open, no metadata'].push(time(() => pass(source, undefined, createCache?.())));
    const cache = createCache?.();
    rows['first open, metadata'].push(time(() => pass(source, resolver, cache)));
    rows['edit inside a query'].push(time(() => pass(inside, resolver, cache)));
    rows['edit outside queries'].push(time(() => pass(outside, resolver, cache)));
    rows['repeat, no change'].push(time(() => pass(outside, resolver, cache)));
    rows['resolver update'].push(time(() => pass(outside, otherResolver, cache)));
  }
  for (const [k, v] of Object.entries(rows)) console.log(`  ${k.padEnd(26)} ${stats(v)}`);
}

function cacheMemory(source: string): void {
  if (!createCache || !global.gc) return;
  global.gc();
  const before = process.memoryUsage().heapUsed;
  const cache = createCache();
  pass(source, resolver, cache);
  global.gc();
  console.log(`\nCache memory for ${(source.length / 1024).toFixed(0)} KB: ${((process.memoryUsage().heapUsed - before) / 1048576).toFixed(1)} MB retained`);
}

const big = moduleOf(golden.slice(0, 200));
const one = moduleOf(golden.slice(0, 1));
pass(big, resolver); // warm up
console.log('Phases, 200 largest queries (~700 KB):');
phases(big);
scenarios('200 largest queries', big);
scenarios('largest query alone', one);
cacheMemory(big);
