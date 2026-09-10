/**
 * Phase 2c of the semantic-core roadmap (memory: project-semantic-core-roadmap).
 */
import { describe, it, expect } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { computeTempTableVisibility } from '../../src/core/semantic/tempTableVisibility';

const SEP = '\n;\n\n' + '/'.repeat(80) + '\n';

describe('computeTempTableVisibility', () => {
  it('a single-statement batch has an empty visible set at index 0', () => {
    const batch = parseBatch('ВЫБРАТЬ Т.Код ИЗ Справочник.Номенклатура КАК Т');
    const visibility = computeTempTableVisibility(batch);
    expect(visibility.get(0)).toEqual(new Set());
  });

  it('a temp table is visible starting with the NEXT statement, never its own creating statement', () => {
    const stmt0 = 'ВЫБРАТЬ Т.Код КАК Код ПОМЕСТИТЬ ВТ1 ИЗ Справочник.Номенклатура КАК Т';
    const stmt1 = 'ВЫБРАТЬ ВТ1.Код ИЗ ВТ1 КАК ВТ1';
    const batch = parseBatch(stmt0 + SEP + stmt1);
    const visibility = computeTempTableVisibility(batch);
    expect(visibility.get(0)).toEqual(new Set()); // not visible to its own creating statement
    expect(visibility.get(1)).toEqual(new Set(['ВТ1']));
  });

  it('accumulates across more than one earlier temp-table-creating statement', () => {
    const stmt0 = 'ВЫБРАТЬ Т.Код КАК Код ПОМЕСТИТЬ ВТ1 ИЗ Справочник.Номенклатура КАК Т';
    const stmt1 = 'ВЫБРАТЬ ВТ1.Код КАК Код ПОМЕСТИТЬ ВТ2 ИЗ ВТ1 КАК ВТ1';
    const stmt2 = 'ВЫБРАТЬ ВТ2.Код ИЗ ВТ2 КАК ВТ2';
    const batch = parseBatch(stmt0 + SEP + stmt1 + SEP + stmt2);
    const visibility = computeTempTableVisibility(batch);
    expect(visibility.get(0)).toEqual(new Set());
    expect(visibility.get(1)).toEqual(new Set(['ВТ1']));
    expect(visibility.get(2)).toEqual(new Set(['ВТ1', 'ВТ2']));
  });

  it('a plain (non-temp-table) statement in between does not affect what is visible afterward', () => {
    const stmt0 = 'ВЫБРАТЬ Т.Код КАК Код ПОМЕСТИТЬ ВТ1 ИЗ Справочник.Номенклатура КАК Т';
    const stmt1 = 'ВЫБРАТЬ Т.Код ИЗ Справочник.Номенклатура КАК Т';
    const stmt2 = 'ВЫБРАТЬ ВТ1.Код ИЗ ВТ1 КАК ВТ1';
    const batch = parseBatch(stmt0 + SEP + stmt1 + SEP + stmt2);
    const visibility = computeTempTableVisibility(batch);
    expect(visibility.get(1)).toEqual(new Set(['ВТ1']));
    expect(visibility.get(2)).toEqual(new Set(['ВТ1']));
  });

  it('ДОБАВИТЬ (appendTemp) does not itself introduce a new visible name', () => {
    const stmt0 = 'ВЫБРАТЬ Т.Код КАК Код ПОМЕСТИТЬ ВТ1 ИЗ Справочник.Номенклатура КАК Т';
    const stmt1 = 'ВЫБРАТЬ Т.Код КАК Код ДОБАВИТЬ ВТ1 ИЗ Справочник.Номенклатура КАК Т';
    const stmt2 = 'ВЫБРАТЬ ВТ1.Код ИЗ ВТ1 КАК ВТ1';
    const batch = parseBatch(stmt0 + SEP + stmt1 + SEP + stmt2);
    const visibility = computeTempTableVisibility(batch);
    // Still just {ВТ1} (from stmt0's ПОМЕСТИТЬ) — stmt1's ДОБАВИТЬ adds no NEW name.
    expect(visibility.get(2)).toEqual(new Set(['ВТ1']));
  });

  it('temp table names are compared case-insensitively (upper-cased)', () => {
    const stmt0 = 'ВЫБРАТЬ Т.Код КАК Код ПОМЕСТИТЬ ВтМойВт ИЗ Справочник.Номенклатура КАК Т';
    const stmt1 = 'ВЫБРАТЬ ВТМОЙВТ.Код ИЗ ВТМОЙВТ КАК ВТМОЙВТ';
    const batch = parseBatch(stmt0 + SEP + stmt1);
    const visibility = computeTempTableVisibility(batch);
    expect(visibility.get(1)).toEqual(new Set(['ВТМОЙВТ']));
  });
});
