/**
 * Phase 1b of the semantic-core roadmap (memory: project-semantic-core-roadmap).
 *
 * Dedicated source-map oracle suite: proves RANGE correctness, which the golden
 * corpus (text round-trip fidelity) is orthogonal to and can never catch — e.g. a
 * systematically-swapped pair of sibling ranges would still produce byte-identical
 * `generateBatch` output. Invariants checked: range containment (every recorded
 * range sits within its document's bounds and, for nested constructs, within its
 * parent's range), non-overlap between sibling tables, `source.slice(range)`
 * actually matching the construct that produced the event, and the mandatory
 * right-nested multi-JOIN form the constructor emits for nested joins.
 */
import { describe, it, expect } from 'vitest';
import { parseDocument } from '../../src/core/query/sdblParser';
import { RecordingSourceMapSink, findContaining, findNearest } from '../../src/core/query/sourceMap';
import type { SourceMapEvent } from '../../src/core/query/sourceMap';

function recordEvents(text: string): SourceMapEvent[] {
  const sink = new RecordingSourceMapSink();
  parseDocument(text, undefined, { sourceMap: sink });
  return sink.events;
}

describe('source-map oracle: single source, no joins', () => {
  const text = 'ВЫБРАТЬ Т.Поле ИЗ Справочник.Валюты КАК Т';
  const events = recordEvents(text);

  it('records exactly one unionMember and one table event', () => {
    expect(events.filter((e) => e.kind === 'unionMember')).toHaveLength(1);
    expect(events.filter((e) => e.kind === 'table')).toHaveLength(1);
  });

  it('the table range slices back to exactly its source text', () => {
    const table = events.find((e) => e.kind === 'table')!;
    expect(text.slice(table.range.start, table.range.end)).toBe('Справочник.Валюты КАК Т');
  });

  it('the unionMember range contains the whole query', () => {
    const member = events.find((e) => e.kind === 'unionMember')!;
    expect(member.range.start).toBe(0);
    expect(text.slice(member.range.start, member.range.end)).toBe(text);
  });

  it('the table range is fully contained within the unionMember range', () => {
    const member = events.find((e) => e.kind === 'unionMember')!;
    const table = events.find((e) => e.kind === 'table')!;
    expect(table.range.start).toBeGreaterThanOrEqual(member.range.start);
    expect(table.range.end).toBeLessThanOrEqual(member.range.end);
  });
});

describe('source-map oracle: flat multi-JOIN chain', () => {
  const text =
    'ВЫБРАТЬ А.Поле ИЗ Справочник.А КАК А ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Б КАК Б ПО А.Поле = Б.Поле ЛЕВОЕ СОЕДИНЕНИЕ Справочник.В КАК В ПО Б.Поле = В.Поле';
  const events = recordEvents(text);
  const tables = events.filter((e) => e.kind === 'table').sort((a, b) => a.index - b.index);

  it('records exactly 3 table sources, in FROM-list order', () => {
    expect(tables).toHaveLength(3);
    expect(tables.map((t) => t.index)).toEqual([0, 1, 2]);
  });

  it('sibling table ranges never overlap', () => {
    for (let i = 0; i < tables.length; i++) {
      for (let j = i + 1; j < tables.length; j++) {
        const a = tables[i].range;
        const b = tables[j].range;
        const overlap = a.start < b.end && b.start < a.end;
        expect(overlap).toBe(false);
      }
    }
  });

  it('each table range slices back to its own source clause', () => {
    expect(text.slice(tables[0].range.start, tables[0].range.end)).toBe('Справочник.А КАК А');
    expect(text.slice(tables[1].range.start, tables[1].range.end)).toBe('Справочник.Б КАК Б');
    expect(text.slice(tables[2].range.start, tables[2].range.end)).toBe('Справочник.В КАК В');
  });

  it('table ranges appear in source order (A before B before C)', () => {
    expect(tables[0].range.start).toBeLessThan(tables[1].range.start);
    expect(tables[1].range.start).toBeLessThan(tables[2].range.start);
  });
});

describe('source-map oracle: right-nested multi-JOIN ("правовложенная" form, mandatory per Refinement 5)', () => {
  // Конструктор пишет именно эту форму для вложенных соединений (фаза 6.15.8/6.16):
  // присоединяемый источник сам несёт вложенную цепочку, чьи `ПО` идут раньше `ПО`
  // внешнего соединения.
  const text =
    'ВЫБРАТЬ А.Поле ИЗ Справочник.А КАК А ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Б КАК Б ЛЕВОЕ СОЕДИНЕНИЕ Справочник.В КАК В ПО Б.Поле = В.Поле ПО А.Поле = Б.Поле';
  const events = recordEvents(text);
  const tables = events.filter((e) => e.kind === 'table').sort((a, b) => a.index - b.index);

  it('still records exactly 3 non-overlapping table sources', () => {
    expect(tables).toHaveLength(3);
    for (let i = 0; i < tables.length; i++) {
      for (let j = i + 1; j < tables.length; j++) {
        const a = tables[i].range;
        const b = tables[j].range;
        expect(a.start < b.end && b.start < a.end).toBe(false);
      }
    }
  });

  it('each table range slices back to its own source clause, in textual order', () => {
    expect(text.slice(tables[0].range.start, tables[0].range.end)).toBe('Справочник.А КАК А');
    expect(text.slice(tables[1].range.start, tables[1].range.end)).toBe('Справочник.Б КАК Б');
    expect(text.slice(tables[2].range.start, tables[2].range.end)).toBe('Справочник.В КАК В');
    expect(tables[0].range.start).toBeLessThan(tables[1].range.start);
    expect(tables[1].range.start).toBeLessThan(tables[2].range.start);
  });
});

describe('source-map oracle: subquery source', () => {
  // Дыра, ранее задокументированная здесь ("records the outer table but NOT
  // the inner subquery's own sources"), закрыта: subquery-source-рекурсия
  // теперь тоже пробрасывает sourceMap, смещая offset'ы вложенного
  // `parseDocument`-вызова (`innerText`, свой собственный `parseDocument`) в
  // координаты внешнего текста.
  const text = 'ВЫБРАТЬ Т.Поле ИЗ (ВЫБРАТЬ Б.Поле ИЗ Справочник.Б КАК Б) КАК Т';
  const events = recordEvents(text);

  it('records BOTH the outer table (subquery source) and the inner subquery\'s own table', () => {
    const tables = events.filter((e) => e.kind === 'table');
    expect(tables).toHaveLength(2);
  });

  it('the outer event covers the whole `(...) КАК Т` span', () => {
    const outer = events.filter((e) => e.kind === 'table').find((e) => text.slice(e.range.start, e.range.end).startsWith('('))!;
    expect(text.slice(outer.range.start, outer.range.end)).toBe('(ВЫБРАТЬ Б.Поле ИЗ Справочник.Б КАК Б) КАК Т');
  });

  it('the inner event, translated to OUTER coordinates, slices back to the inner source clause', () => {
    const inner = events.filter((e) => e.kind === 'table').find((e) => text.slice(e.range.start, e.range.end) === 'Справочник.Б КАК Б');
    expect(inner).toBeDefined();
  });

  it('the inner subquery also gets its own unionMember event, nested within the outer one', () => {
    const members = events.filter((e) => e.kind === 'unionMember').sort((a, b) => a.range.start - b.range.start);
    expect(members.length).toBeGreaterThanOrEqual(2); // outer query's member + inner subquery's member
    // Inner (subquery) member's range must be fully contained within the outer one.
    const [outerMember, innerMember] = members;
    expect(innerMember.range.start).toBeGreaterThanOrEqual(outerMember.range.start);
    expect(innerMember.range.end).toBeLessThanOrEqual(outerMember.range.end);
  });

  it('findContaining resolves a position inside the inner subquery to the inner table first (innermost-first)', () => {
    const posInsideInner = text.indexOf('Справочник.Б') + 1;
    const containing = findContaining(events, posInsideInner);
    expect(containing.length).toBeGreaterThan(0);
    expect(text.slice(containing[0].range.start, containing[0].range.end)).toBe('Справочник.Б КАК Б');
  });
});

describe('source-map oracle: DOUBLY-nested subquery (subquery inside a subquery)', () => {
  const text = 'ВЫБРАТЬ Т.Поле ИЗ (ВЫБРАТЬ В.Поле ИЗ (ВЫБРАТЬ Б.Поле ИЗ Справочник.Б КАК Б) КАК В) КАК Т';
  const events = recordEvents(text);

  it('records all three table sources at the correct nesting depth', () => {
    const tables = events.filter((e) => e.kind === 'table');
    expect(tables).toHaveLength(3);
    const innermost = tables.find((e) => text.slice(e.range.start, e.range.end) === 'Справочник.Б КАК Б');
    expect(innermost).toBeDefined();
  });

  it('a position inside the innermost table resolves through findContaining as the smallest range', () => {
    const pos = text.indexOf('Справочник.Б') + 1;
    const containing = findContaining(events, pos);
    expect(text.slice(containing[0].range.start, containing[0].range.end)).toBe('Справочник.Б КАК Б');
    // Every ancestor level must also contain this position (nesting, not disjoint).
    for (let i = 1; i < containing.length; i++) {
      expect(containing[i].range.start).toBeLessThanOrEqual(containing[i - 1].range.start);
      expect(containing[i].range.end).toBeGreaterThanOrEqual(containing[i - 1].range.end);
    }
  });
});

describe('source-map oracle: UNION members', () => {
  const text = 'ВЫБРАТЬ А.Поле ИЗ Справочник.А КАК А ОБЪЕДИНИТЬ ВСЕ ВЫБРАТЬ Б.Поле ИЗ Справочник.Б КАК Б';
  const events = recordEvents(text);
  const members = events.filter((e) => e.kind === 'unionMember').sort((a, b) => a.index - b.index);

  it('records one unionMember event per branch, non-overlapping and in order', () => {
    expect(members).toHaveLength(2);
    expect(members[0].range.end).toBeLessThanOrEqual(members[1].range.start);
  });

  it("each member's table is contained within that member's own range, not the other's", () => {
    const tables = events.filter((e) => e.kind === 'table');
    expect(tables).toHaveLength(2);
    const [tableA, tableB] = tables;
    expect(tableA.range.start).toBeGreaterThanOrEqual(members[0].range.start);
    expect(tableA.range.end).toBeLessThanOrEqual(members[0].range.end);
    expect(tableB.range.start).toBeGreaterThanOrEqual(members[1].range.start);
    expect(tableB.range.end).toBeLessThanOrEqual(members[1].range.end);
  });
});

// NOTE: a describe block exercising implicit-FROM synthesis (`Т.Поле` with no
// explicit `ИЗ`) was deliberately NOT added here — it currently throws through
// `parseDocument`/`parseBatch` due to an unrelated, PRE-EXISTING parser bug
// found while writing this suite (confirmed via `git stash` against the
// unmodified parser, flagged separately: task_e7391f21 — synthesizeImplicitFrom/
// synthesizeTempTableFrom replace the Cursor with a new one over rewritten
// text, but parseDocumentInner's leftover-data check still inspects the STALE
// original cursor). `Cursor.sourceMap`'s doc comment in sdblParser.ts still
// explains why that path intentionally doesn't propagate the sink (fail-open
// by construction, once that bug is fixed) — add the fail-open test back then.

describe('findContaining/findNearest: range-boundary semantics', () => {
  // `Alias|`, `Alias.|`, `Alias.Field|` — курсор непосредственно перед токеном /
  // на точке / сразу после поля (Refinement 5's cursor-boundary requirement).
  const text = 'ВЫБРАТЬ Т.Поле ИЗ Справочник.Валюты КАК Т';
  const events = recordEvents(text);
  const table = events.find((e) => e.kind === 'table')!;
  const aliasPos = text.indexOf('КАК Т') + 'КАК '.length; // start of the bare "Т" alias token

  it('half-open range: position at range.start is contained, position at range.end is NOT (exclusive)', () => {
    expect(findContaining(events, table.range.start)).toContainEqual(table);
    expect(findContaining(events, table.range.end).some((e) => e === table)).toBe(false);
  });

  it('"Alias|" (cursor immediately before the alias token) is inside the table range', () => {
    expect(findContaining(events, aliasPos).some((e) => e === table)).toBe(true);
  });

  it('"Alias.|" (cursor one past the alias, i.e. end of range) falls outside — findNearest still resolves to it', () => {
    const justPastAlias = table.range.end;
    expect(findContaining(events, justPastAlias).some((e) => e === table)).toBe(false);
    expect(findNearest(events, justPastAlias)).toBe(table);
  });

  it('a position well before any recorded range still resolves via findNearest (nearest boundary, not containment)', () => {
    expect(findNearest(events, 0)).toBeDefined();
  });

  it('findContaining returns innermost-first when ranges nest (table before its enclosing unionMember)', () => {
    const pos = table.range.start;
    const containing = findContaining(events, pos);
    expect(containing.length).toBeGreaterThanOrEqual(2);
    expect(containing[0].kind).toBe('table');
    expect(containing[containing.length - 1].kind).toBe('unionMember');
  });
});
