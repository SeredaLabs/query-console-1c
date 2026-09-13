/**
 * Phase 2x-1 of the semantic-core roadmap (memory: project-semantic-core-roadmap).
 */
import { describe, it, expect } from 'vitest';
import { buildSemanticSnapshotFromText } from '../../src/core/semantic/buildSemanticSnapshot';
import { isOutputAliasReference } from '../../src/core/semantic/resolveOutputAliasReference';

describe('isOutputAliasReference', () => {
  it('true for a bare identifier inside УПОРЯДОЧИТЬ that names a SELECT-output alias', () => {
    const text = 'ВЫБРАТЬ Т.Поле КАК Алиас ИЗ Справочник.А КАК Т УПОРЯДОЧИТЬ ПО Алиас';
    const snapshot = buildSemanticSnapshotFromText(1, text);
    const pos = text.lastIndexOf('Алиас');
    expect(isOutputAliasReference(snapshot, pos, 'Алиас')).toBe(true);
  });

  it('true for a bare identifier inside ИТОГИ that names a SELECT-output alias', () => {
    const text = 'ВЫБРАТЬ Т.Поле КАК Алиас ИЗ Справочник.А КАК Т ИТОГИ Алиас ПО Алиас';
    const snapshot = buildSemanticSnapshotFromText(1, text);
    const pos = text.indexOf('Алиас ПО') ;
    expect(isOutputAliasReference(snapshot, pos, 'Алиас')).toBe(true);
  });

  it('case-insensitive alias matching', () => {
    const text = 'ВЫБРАТЬ Т.Поле КАК Алиас ИЗ Справочник.А КАК Т УПОРЯДОЧИТЬ ПО алиас';
    const snapshot = buildSemanticSnapshotFromText(1, text);
    const pos = text.lastIndexOf('алиас');
    expect(isOutputAliasReference(snapshot, pos, 'АЛИАС')).toBe(true);
  });

  it('false when the position is inside УПОРЯДОЧИТЬ but the name is NOT a select-output alias', () => {
    const text = 'ВЫБРАТЬ Т.Поле КАК Алиас ИЗ Справочник.А КАК Т УПОРЯДОЧИТЬ ПО ЩосьІнше';
    const snapshot = buildSemanticSnapshotFromText(1, text);
    const pos = text.lastIndexOf('ЩосьІнше');
    expect(isOutputAliasReference(snapshot, pos, 'ЩосьІнше')).toBe(false);
  });

  it('false when the same alias name appears OUTSIDE any УПОРЯДОЧИТЬ/ИТОГИ section (e.g. in ГДЕ)', () => {
    const text = 'ВЫБРАТЬ Т.Поле КАК Алиас ИЗ Справочник.А КАК Т ГДЕ Т.Поле = 1';
    const snapshot = buildSemanticSnapshotFromText(1, text);
    const pos = text.indexOf('Т.Поле = 1');
    expect(isOutputAliasReference(snapshot, pos, 'Поле')).toBe(false);
  });

  it('false for a non-complete snapshot (recovered/unavailable)', () => {
    const broken = 'ВЫБРАТЬ Т.Поле1 Т.Поле2 КАК Алиас ИЗ Справочник.А КАК Т УПОРЯДОЧИТЬ ПО Алиас';
    const snapshot = buildSemanticSnapshotFromText(1, broken);
    expect(snapshot.completeness).not.toBe('complete');
    expect(isOutputAliasReference(snapshot, 0, 'Алиас')).toBe(false);
  });

  it('false for a query with no УПОРЯДОЧИТЬ/ИТОГИ at all', () => {
    const text = 'ВЫБРАТЬ Т.Поле КАК Алиас ИЗ Справочник.А КАК Т';
    const snapshot = buildSemanticSnapshotFromText(1, text);
    expect(isOutputAliasReference(snapshot, text.indexOf('Алиас'), 'Алиас')).toBe(false);
  });
});
