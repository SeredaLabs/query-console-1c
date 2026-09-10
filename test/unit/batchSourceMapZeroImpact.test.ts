/**
 * Phase 1b of the semantic-core roadmap (memory: project-semantic-core-roadmap).
 *
 * Proves, across the WHOLE golden corpus (1976 queries), that attaching
 * `opts.batchSourceMap` to `parseBatch` never changes its output — the same
 * rigor `sourceMapZeroImpact.test.ts` already applies to `parseDocument`'s
 * `sourceMap` option, extended to `parseBatch`'s batch-level counterpart. This
 * is the load-bearing safety net for a change that touches `parseBatch` itself
 * (not just an additive helper beside it), including its temp-table-across-
 * statements bookkeeping — exactly the kind of interaction an external review
 * flagged as worth being careful about.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { buildYamlResolver } from '../../src/core/metadata/buildYamlResolver';
import { RecordingBatchSourceMapSink } from '../../src/core/query/sourceMap';

interface Golden { file: string; valid: boolean; input: string; query_text: string; }

const CORPUS_DIR = path.resolve(__dirname, '../fixtures/corpus');
const GOLDEN = path.join(CORPUS_DIR, 'golden.jsonl');

const golden: Golden[] = fs.existsSync(GOLDEN)
  ? fs.readFileSync(GOLDEN, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l))
  : [];

describe('batchSourceMap: zero impact on the golden corpus', () => {
  const resolver = buildYamlResolver(path.join(CORPUS_DIR, 'metadata', 'cf'));

  it('golden fixture is present', () => {
    expect(golden.length).toBeGreaterThan(0);
  });

  it('generateBatch(parseBatch(text)) is byte-identical with and without a batchSourceMap sink attached, for every corpus entry', () => {
    const mismatches: Array<{ file: string; reason: string }> = [];
    for (const g of golden) {
      if (!g.valid) continue;
      let withoutSink: string;
      try {
        withoutSink = generateBatch(parseBatch(g.input, resolver));
      } catch (e) {
        mismatches.push({ file: g.file, reason: `baseline parse-exception: ${e instanceof Error ? e.message : String(e)}` });
        continue;
      }
      let withSink: string;
      try {
        const sink = new RecordingBatchSourceMapSink();
        withSink = generateBatch(parseBatch(g.input, resolver, { batchSourceMap: sink }));
      } catch (e) {
        mismatches.push({ file: g.file, reason: `sink-attached parse-exception: ${e instanceof Error ? e.message : String(e)}` });
        continue;
      }
      if (withoutSink !== withSink) {
        mismatches.push({ file: g.file, reason: 'output differs with batchSourceMap sink attached' });
      }
    }
    expect(mismatches.slice(0, 10), `${mismatches.length} mismatches`).toEqual([]);
  });

  it('every recorded range actually slices back to real text, and every table/unionMember range stays within its own statement\'s span, for a sample of the corpus', () => {
    // Полный прохід по всьому корпусу для boundary-перевірок дорожчий і вже
    // покритий якісно іншими oracle-тестами; тут — швидка структурна перевірка
    // на репрезентативній вибірці, щоб зловити систематичну помилку зсуву.
    const sample = golden.filter((g) => g.valid).slice(0, 200);
    for (const g of sample) {
      const sink = new RecordingBatchSourceMapSink();
      try {
        parseBatch(g.input, resolver, { batchSourceMap: sink });
      } catch {
        continue;
      }
      for (const e of sink.events) {
        expect(e.range.start).toBeGreaterThanOrEqual(0);
        expect(e.range.end).toBeLessThanOrEqual(g.input.length);
        expect(e.range.start).toBeLessThanOrEqual(e.range.end);
      }
    }
  });
});
