/**
 * Phase 1a of the semantic-core roadmap (memory: project-semantic-core-roadmap).
 * Sanity checks for the `SemanticSnapshot` skeleton — no real analysis exists yet,
 * this only guards the lifecycle shape (versioning/staleness discipline).
 */
import { describe, it, expect } from 'vitest';
import { createSemanticSnapshot, createEmptySemanticIndex } from '../../src/core/semantic/semanticSnapshot';
import type { BatchDocument } from '../../src/core/query/batchModel';

const emptyBatch: BatchDocument = { members: [] };

describe('createSemanticSnapshot', () => {
  it('carries the given documentVersion and model through unchanged', () => {
    const snapshot = createSemanticSnapshot(7, 'ВЫБРАТЬ 1', emptyBatch);
    expect(snapshot.documentVersion).toBe(7);
    expect(snapshot.model).toBe(emptyBatch);
  });

  it('starts with an empty index (no analysis performed yet, by design)', () => {
    const snapshot = createSemanticSnapshot(1, 'ВЫБРАТЬ 1', emptyBatch);
    expect(snapshot.index.scopesById.size).toBe(0);
    expect(snapshot.index.symbolsById.size).toBe(0);
    expect(snapshot.index.referencesBySymbolId.size).toBe(0);
  });

  it('produces the same sourceHash for identical text and a different one for different text', () => {
    const a = createSemanticSnapshot(1, 'ВЫБРАТЬ 1', emptyBatch);
    const b = createSemanticSnapshot(2, 'ВЫБРАТЬ 1', emptyBatch);
    const c = createSemanticSnapshot(3, 'ВЫБРАТЬ 2', emptyBatch);
    expect(a.sourceHash).toBe(b.sourceHash);
    expect(a.sourceHash).not.toBe(c.sourceHash);
  });

  it('defaults completeness to \'complete\' for callers that already know their model came from a clean parse', () => {
    expect(createSemanticSnapshot(1, 'ВЫБРАТЬ 1', emptyBatch).completeness).toBe('complete');
  });

  it('accepts an explicit completeness override (Phase 1c: for callers not certain the parse was clean)', () => {
    expect(createSemanticSnapshot(1, 'ВЫБРАТЬ 1', emptyBatch, 'recovered').completeness).toBe('recovered');
    expect(createSemanticSnapshot(1, 'ВЫБРАТЬ 1', emptyBatch, 'unavailable').completeness).toBe('unavailable');
  });

  it('defaults sourceMapEvents to an empty array', () => {
    expect(createSemanticSnapshot(1, 'ВЫБРАТЬ 1', emptyBatch).sourceMapEvents).toEqual([]);
  });

  it('carries an explicit sourceMapEvents array through unchanged', () => {
    const events = [{ statementIndex: 0, kind: 'table' as const, index: 0, range: { start: 0, end: 1 } }];
    expect(createSemanticSnapshot(1, 'ВЫБРАТЬ 1', emptyBatch, 'complete', events).sourceMapEvents).toBe(events);
  });
});

describe('createEmptySemanticIndex', () => {
  it('returns independent, empty maps on each call', () => {
    const first = createEmptySemanticIndex();
    const second = createEmptySemanticIndex();
    first.scopesById.set(1, { id: 1 });
    expect(second.scopesById.size).toBe(0);
  });
});
