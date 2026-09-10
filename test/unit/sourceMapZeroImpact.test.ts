/**
 * Phase 1b of the semantic-core roadmap (memory: project-semantic-core-roadmap).
 *
 * Proves, on the ENTIRE golden corpus (not just a handful of hand-picked
 * fixtures), that attaching a `sourceMap` sink to `parseDocument` never changes
 * what it produces: `generateBatch({members:[parseDocument(text, resolver)]})`
 * must be byte-identical whether or not a sink is supplied, and attaching a sink
 * must never turn an otherwise-successful parse into a throw. This is the
 * corpus-level half of Refinement 3's requirement ("a small, additive, optional
 * source-location side-channel is allowed IF proven zero-impact when unused" —
 * proven here, not assumed) and the load-bearing reason `parseDocument` is safe
 * to instrument.
 *
 * Deliberately compares parseDocument's own output WITH vs WITHOUT a sink
 * (self-relative), not against the corpus's `query_text` oracle — matching the
 * oracle would require replicating `parseBatch`'s chunk-splitting/temp-table
 * bookkeeping here, which is unrelated to what this test needs to prove.
 * Corpus entries that are genuine multi-statement batches (`;`-separated) don't
 * parse as a single `parseDocument` call and are skipped — tracked via
 * `testedCount` so the test can't silently degrade into testing nothing.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseDocument } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { buildYamlResolver } from '../../src/core/metadata/buildYamlResolver';
import { RecordingSourceMapSink } from '../../src/core/query/sourceMap';

interface Golden { file: string; valid: boolean; input: string; query_text: string; }

const CORPUS_DIR = path.resolve(__dirname, '../fixtures/corpus');
const GOLDEN = path.join(CORPUS_DIR, 'golden.jsonl');

const golden: Golden[] = fs.existsSync(GOLDEN)
  ? fs.readFileSync(GOLDEN, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l))
  : [];

describe('sourceMap: zero impact on parseDocument, proven across the golden corpus', () => {
  const resolver = buildYamlResolver(path.join(CORPUS_DIR, 'metadata', 'cf'));

  it('golden fixture is present', () => {
    expect(golden.length).toBeGreaterThan(0);
  });

  it('attaching a sourceMap sink never changes parseDocument\'s rendered output, and never turns a successful parse into a throw', () => {
    let testedCount = 0;
    const mismatches: Array<{ file: string; reason: string }> = [];
    for (const g of golden) {
      if (!g.valid) continue;
      let baseline: ReturnType<typeof parseDocument>;
      try {
        baseline = parseDocument(g.input, resolver);
      } catch {
        continue; // genuine multi-statement batch or otherwise not single-document input — out of scope here
      }
      testedCount++;
      const sink = new RecordingSourceMapSink();
      let withSink: ReturnType<typeof parseDocument>;
      try {
        withSink = parseDocument(g.input, resolver, { sourceMap: sink });
      } catch (e) {
        mismatches.push({ file: g.file, reason: `sink attachment caused a throw: ${e instanceof Error ? e.message : String(e)}` });
        continue;
      }
      const a = generateBatch({ members: [baseline] });
      const b = generateBatch({ members: [withSink] });
      if (a !== b) {
        mismatches.push({ file: g.file, reason: 'rendered output differs with a sourceMap sink attached' });
      }
    }
    // Не вакуумный гейт: подавляющее большинство корпуса — одиночные операторы
    // (без `;`), должны реально пройти через parseDocument напрямую.
    expect(testedCount).toBeGreaterThan(golden.length / 2);
    expect(mismatches.slice(0, 10), `${mismatches.length} mismatches out of ${testedCount} tested`).toEqual([]);
  });
});
