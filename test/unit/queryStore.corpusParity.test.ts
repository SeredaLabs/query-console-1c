import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { buildYamlResolver } from '../../src/core/metadata/buildYamlResolver';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { assembleBatch, initialState, reducer } from '../../src/webview/state/queryStore';

const corpus = resolve(__dirname, '../fixtures/corpus');
const rows: { file: string; valid: boolean; input: string }[] = readFileSync(resolve(corpus, 'golden.jsonl'), 'utf8')
  .split('\n').filter(line => line.trim()).map(line => JSON.parse(line));

for (const withMetadata of [false, true]) {
  describe(`store corpus parity (${withMetadata ? 'with' : 'without'} metadata)`, () => {
    const mismatches: string[] = [];
    beforeAll(() => {
      const resolver = withMetadata ? buildYamlResolver(resolve(corpus, 'metadata/cf')) : undefined;
      for (const row of rows.filter(row => row.valid)) {
        const doc = parseBatch(row.input, resolver);
        const direct = generateBatch(doc);
        // Keep the reference independent even if a future reducer mutates its input.
        const stored = generateBatch(assembleBatch(reducer(initialState(), { type: 'LOAD_BATCH', doc: structuredClone(doc) })));
        if (stored === direct) continue;
        mismatches.push(row.file);
      }
    }, 30_000);

    it('checks the full committed valid corpus', () => {
      expect(rows.filter(row => row.valid)).toHaveLength(1976);
    });

    it('every store output equals direct core output byte-for-byte', () => {
      expect(mismatches).toEqual([]);
    });
  });
}
