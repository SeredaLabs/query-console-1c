/**
 * Phase 2b of the semantic-core roadmap (memory: project-semantic-core-roadmap).
 *
 * Mirrors the live 3-level correlated-subquery experiment run against a real
 * 1C instance (Phase 2a, 2026-09-10): a field name shared by the grandparent
 * and parent levels, absent from the innermost level.
 */
import { describe, it, expect } from 'vitest';
import { resolveCorrelatedField, type FieldOwner } from '../../src/core/semantic/correlation';

function source(name: string, fields: string[]): FieldOwner & { name: string } {
  return { name, fields: new Set(fields) };
}

describe('resolveCorrelatedField', () => {
  it('resolves to the NEAREST ancestor level even when a farther level also has a matching field, with no ambiguity (real 1C: resolves cleanly)', () => {
    const parent = [source('Т2', ['Знач', 'Общ'])];
    const grandparent = [source('Т1', ['Х', 'Общ'])];
    const result = resolveCorrelatedField('Общ', [parent, grandparent]);
    expect(result).toEqual({ kind: 'resolved', value: parent[0] });
  });

  it('falls back to a FARTHER ancestor level when the nearest one has no match at all (real 1C: resolves via the grandparent)', () => {
    const parent = [source('Т2', ['Знач'])]; // no "Общ" here this time
    const grandparent = [source('Т1', ['Х', 'Общ'])];
    const result = resolveCorrelatedField('Общ', [parent, grandparent]);
    expect(result).toEqual({ kind: 'resolved', value: grandparent[0] });
  });

  it('reports ambiguous when TWO sources at the SAME (nearest matching) level both carry the field', () => {
    const parent = [source('А', ['Общ']), source('Б', ['Общ'])];
    const grandparent = [source('Т1', ['Общ'])];
    const result = resolveCorrelatedField('Общ', [parent, grandparent]);
    expect(result.kind).toBe('ambiguous');
    if (result.kind === 'ambiguous') {
      expect(result.candidates).toEqual(parent);
    }
  });

  it('returns unknown when no ancestor level has the field at all', () => {
    const parent = [source('Т2', ['Знач'])];
    const grandparent = [source('Т1', ['Х'])];
    expect(resolveCorrelatedField('Общ', [parent, grandparent])).toEqual({ kind: 'unknown' });
  });

  it('returns unknown for an empty ancestor chain (no enclosing levels at all)', () => {
    expect(resolveCorrelatedField('Общ', [])).toEqual({ kind: 'unknown' });
  });

  it('treats a source with no known field set (wildcard/unresolved) as never matching', () => {
    const parent = [{ name: 'Т2' } as FieldOwner]; // fields undefined
    const grandparent = [source('Т1', ['Общ'])];
    const result = resolveCorrelatedField('Общ', [parent, grandparent]);
    expect(result).toEqual({ kind: 'resolved', value: grandparent[0] });
  });
});
