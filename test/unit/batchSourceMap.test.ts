/**
 * Phase 1b of the semantic-core roadmap (memory: project-semantic-core-roadmap).
 *
 * Batch-aware source mapping: closes the gap flagged by an external review of
 * Phase 1a-1c — `parseDocument`'s `sourceMap` option only proves the mapping
 * WITHIN one `;`-separated statement, but `buildSemanticSnapshotFromText`'s real
 * entry point is `parseBatch`, which parses potentially MANY statements. This
 * suite proves `opts.batchSourceMap` stitches each statement's chunk-relative
 * events into absolute, `statementIndex`-tagged ranges correctly.
 */
import { describe, it, expect } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { RecordingBatchSourceMapSink, findContaining } from '../../src/core/query/sourceMap';
import type { AbsoluteSourceMapEvent } from '../../src/core/query/sourceMap';

function recordBatchEvents(text: string): AbsoluteSourceMapEvent[] {
  const sink = new RecordingBatchSourceMapSink();
  parseBatch(text, undefined, { batchSourceMap: sink });
  return sink.events;
}

describe('batchSourceMap: single-statement batch (no `;`)', () => {
  const text = 'ВЫБРАТЬ Т.Поле ИЗ Справочник.Валюты КАК Т';
  const events = recordBatchEvents(text);

  it('tags every event with statementIndex 0 and absolute ranges equal to the plain parseDocument case', () => {
    expect(events.every((e) => e.statementIndex === 0)).toBe(true);
    const table = events.find((e) => e.kind === 'table')!;
    expect(text.slice(table.range.start, table.range.end)).toBe('Справочник.Валюты КАК Т');
  });
});

describe('batchSourceMap: multi-statement batch (`;`-separated)', () => {
  const stmt0 = 'ВЫБРАТЬ А.Поле ИЗ Справочник.А КАК А';
  const stmt1 = 'ВЫБРАТЬ Б.Поле ИЗ Справочник.Б КАК Б';
  const SEP = '\n;\n\n' + '/'.repeat(80) + '\n';
  const text = stmt0 + SEP + stmt1;
  const events = recordBatchEvents(text);

  it('tags each statement\'s events with the right statementIndex', () => {
    const byStatement = new Map<number, AbsoluteSourceMapEvent[]>();
    for (const e of events) {
      if (!byStatement.has(e.statementIndex)) byStatement.set(e.statementIndex, []);
      byStatement.get(e.statementIndex)!.push(e);
    }
    expect([...byStatement.keys()].sort()).toEqual([0, 1]);
  });

  it('ranges are ABSOLUTE within the whole batch text, not the statement\'s own local text', () => {
    const stmt1Table = events.find((e) => e.statementIndex === 1 && e.kind === 'table')!;
    // If ranges were still chunk-relative, this would slice into stmt0 instead.
    expect(text.slice(stmt1Table.range.start, stmt1Table.range.end)).toBe('Справочник.Б КАК Б');
    expect(stmt1Table.range.start).toBeGreaterThan(stmt0.length);
  });

  it('statement 0\'s events never overlap statement 1\'s events', () => {
    const stmt0Events = events.filter((e) => e.statementIndex === 0);
    const stmt1Events = events.filter((e) => e.statementIndex === 1);
    for (const a of stmt0Events) {
      for (const b of stmt1Events) {
        expect(a.range.start < b.range.end && b.range.start < a.range.end).toBe(false);
      }
    }
  });

  it('findContaining resolves a position inside statement 1 to statement-1 events only', () => {
    const posInStmt1 = text.indexOf('Б.Поле') + 1;
    const containing = findContaining(events, posInStmt1);
    expect(containing.length).toBeGreaterThan(0);
    expect(containing.every((e) => e.statementIndex === 1)).toBe(true);
  });
});

describe('batchSourceMap: repeated identical table (self-join)', () => {
  const text =
    'ВЫБРАТЬ А.Поле ИЗ Справочник.Валюты КАК А ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Валюты КАК Б ПО А.Поле = Б.Поле';
  const events = recordBatchEvents(text);
  const tables = events.filter((e) => e.kind === 'table').sort((a, b) => a.index - b.index);

  it('two references to the SAME metadata table still get distinct, non-overlapping ranges', () => {
    expect(tables).toHaveLength(2);
    expect(text.slice(tables[0].range.start, tables[0].range.end)).toBe('Справочник.Валюты КАК А');
    expect(text.slice(tables[1].range.start, tables[1].range.end)).toBe('Справочник.Валюты КАК Б');
    expect(tables[0].range.end).toBeLessThanOrEqual(tables[1].range.start);
  });
});

describe('batchSourceMap: temp table shared across statements', () => {
  // Пакет із двох операторів: перший створює тимчасову таблицю (ПОМЕСТИТЬ), другий
  // читає з неї. `parseBatch`'s temp-table-aware resolver augmentation (2nd/3rd
  // params of `augmentResolverWithTempTables`) must keep working identically with
  // `batchSourceMap` attached — this is exactly the edge case an external review
  // flagged as at-risk, since implicit-FROM-via-temp-table synthesis depends on
  // the resolver knowing about the temp table by the time the SECOND statement
  // parses.
  const stmt0 = 'ВЫБРАТЬ А.Поле КАК Поле ПОМЕСТИТЬ ВТ ИЗ Справочник.А КАК А';
  const stmt1 = 'ВЫБРАТЬ ВТ.Поле ИЗ ВТ КАК ВТ';
  const SEP = '\n;\n\n' + '/'.repeat(80) + '\n';
  const text = stmt0 + SEP + stmt1;

  it('parses successfully with batchSourceMap attached (temp-table visibility unaffected)', () => {
    expect(() => recordBatchEvents(text)).not.toThrow();
    const events = recordBatchEvents(text);
    const stmt1Table = events.find((e) => e.statementIndex === 1 && e.kind === 'table')!;
    expect(stmt1Table).toBeDefined();
    expect(text.slice(stmt1Table.range.start, stmt1Table.range.end)).toBe('ВТ КАК ВТ');
  });
});

describe('batchSourceMap: zero-impact when unset', () => {
  it('parseBatch behaves identically whether or not opts.batchSourceMap is supplied', async () => {
    const { generateBatch } = await import('../../src/core/query/sdblGenerator');
    const text = 'ВЫБРАТЬ Т.Поле ИЗ Справочник.Валюты КАК Т';
    const withoutSink = generateBatch(parseBatch(text));
    const sink = new RecordingBatchSourceMapSink();
    const withSink = generateBatch(parseBatch(text, undefined, { batchSourceMap: sink }));
    expect(withSink).toBe(withoutSink);
    expect(sink.events.length).toBeGreaterThan(0); // sanity: the sink actually collected something
  });
});
