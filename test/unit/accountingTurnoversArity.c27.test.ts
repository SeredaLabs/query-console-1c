/**
 * C27: without metadata the Designer prints six positions of an accounting
 * `Обороты` (no correspondence assumed) where 1C prints eight; the platform gives
 * the written, the six- and the eight-position form the same canonical text, so
 * the difference is cosmetic.
 * Platform evidence: test/fixtures/platform/c27-accounting-turnovers-arity.json.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { tryOpenDesignerBatch } from '../../src/webview/openDesignerBatch';
import { initialState, reducer } from '../../src/webview/state/queryStore';
import { computeBatchTextSafe } from '../../src/webview/computeBatchText';

const evidence = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'platform', 'c27-accounting-turnovers-arity.json'), 'utf8'));
const designer = (text: string): string => {
  const open = tryOpenDesignerBatch(text);
  if (!open.ok) throw new Error(open.error);
  return computeBatchTextSafe(reducer(initialState(), { type: 'LOAD_BATCH', doc: open.doc }), true).text;
};
const vtArgs = (text: string): string => /Обороты(\([^)]*(?:\)[^)]*)*?\)) КАК/u.exec(text)![1];

describe('C27: accounting Обороты positions', () => {
  it.each(evidence.pairs.map((p: { short: string }, i: number) => [i, p]))('pair %s: the Designer form is equivalent on the platform', (_i, p: any) => {
    expect(p.sameCanonical).toBe(true);
    expect(p.designerSameCanonical).toBe(true);
    expect(vtArgs(designer(p.short))).toBe(p.designerArgs);
  });
});
