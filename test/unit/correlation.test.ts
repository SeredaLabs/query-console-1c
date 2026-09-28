/**
 * Phase 2b of the semantic-core roadmap (memory: project-semantic-core-roadmap).
 *
 * Mirrors the live 3-level correlated-subquery experiment run against a real
 * 1C instance (Phase 2a, 2026-09-10): a field name shared by the grandparent
 * and parent levels, absent from the innermost level. Pinned on the production
 * paths: `resolveNearestAncestorMatch` (the level walk behind `resolveAliasAt`)
 * and `correlatedOuterAlias` (bare condition fields of a sole-source subquery, C4).
 */
import { describe, it, expect } from 'vitest';
import { resolveNearestAncestorMatch } from '../../src/core/semantic/correlation';
import { correlatedOuterAlias, type SourceInfo } from '../../src/core/query/qualifyBareFields';

/** Field sets are upper-cased, as `sourceInfosOf` builds them from metadata. */
function source(alias: string, fields?: string[]): SourceInfo {
  return fields
    ? { id: alias, alias, fields: new Set(fields.map(f => f.toUpperCase())), wildcard: false }
    : { id: alias, alias, wildcard: true };
}

/** The innermost (sole) source: never owns the field in these cases. */
const inner = source('Т3', ['Своё']);

describe('correlatedOuterAlias: nearest enclosing level wins (live-verified rule)', () => {
  it('resolves to the NEAREST level even when a farther level also has the field (real 1C: no ambiguity)', () => {
    const parent = [source('Т2', ['Знач', 'Общ'])];
    const grandparent = [source('Т1', ['Х', 'Общ'])];
    expect(correlatedOuterAlias(inner, 'Общ', [parent, grandparent])).toBe('Т2');
  });

  it('falls back to a FARTHER level when the nearest one has no match (real 1C: resolves via the grandparent)', () => {
    const parent = [source('Т2', ['Знач'])];
    const grandparent = [source('Т1', ['Х', 'Общ'])];
    expect(correlatedOuterAlias(inner, 'Общ', [parent, grandparent])).toBe('Т1');
  });

  it('two owners at the nearest matching level: no owner, and no fall-through to a unique farther owner', () => {
    const parent = [source('А', ['Общ']), source('Б', ['Общ'])];
    const grandparent = [source('Т1', ['Общ'])];
    expect(correlatedOuterAlias(inner, 'Общ', [parent, grandparent])).toBeUndefined();
  });

  it('no level has the field', () => {
    expect(correlatedOuterAlias(inner, 'Общ', [[source('Т2', ['Знач'])], [source('Т1', ['Х'])]])).toBeUndefined();
  });

  it('empty chain (no enclosing levels)', () => {
    expect(correlatedOuterAlias(inner, 'Общ', [])).toBeUndefined();
  });

  it('a source with unknown fields never matches, so the walk continues outward', () => {
    expect(correlatedOuterAlias(inner, 'Общ', [[source('Т2')], [source('Т1', ['Общ'])]])).toBe('Т1');
  });

  it('matches field names case-insensitively, like SDBL identifiers', () => {
    expect(correlatedOuterAlias(inner, 'общ', [[source('Т2', ['Общ'])]])).toBe('Т2');
  });

  it('the inner source owning the field, or having unknown fields, keeps it inner', () => {
    const levels = [[source('Т2', ['Общ'])]];
    expect(correlatedOuterAlias(source('Т3', ['Общ']), 'Общ', levels)).toBeUndefined();
    expect(correlatedOuterAlias(source('Т3'), 'Общ', levels)).toBeUndefined();
  });
});

describe('resolveNearestAncestorMatch: result shape of the level walk', () => {
  const byName = (name: string) => (s: SourceInfo) => s.alias === name;

  it('resolved at the nearest matching level', () => {
    const parent = [source('Т')];
    expect(resolveNearestAncestorMatch(byName('Т'), [parent, [source('Т')]])).toEqual({ kind: 'resolved', value: parent[0] });
  });

  it('ambiguous with the candidates of that level only (never pooled with a farther level)', () => {
    const parent = [source('Т'), source('Т')];
    expect(resolveNearestAncestorMatch(byName('Т'), [parent, [source('Т')]])).toEqual({ kind: 'ambiguous', candidates: parent });
  });

  it('unknown when nothing matches or the chain is empty', () => {
    expect(resolveNearestAncestorMatch(byName('Т'), [[source('Х')]])).toEqual({ kind: 'unknown' });
    expect(resolveNearestAncestorMatch(byName('Т'), [])).toEqual({ kind: 'unknown' });
  });
});
