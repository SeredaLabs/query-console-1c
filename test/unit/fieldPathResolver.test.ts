/**
 * Semantic-core hardening, step 1 (see architecture report in conversation/commit
 * history around this change): `findField`/`firstRef`/the segment-walking loop were
 * independently hand-written in `canonicalizeFieldCasing.ts`, `resolveBuilderStar.ts`,
 * and `dropRedundantGroupDerefs.ts`. This file has two jobs:
 *
 * 1. Directly unit-test the new shared `resolveFieldPath` kernel across the
 *    scenarios that matter for field-path resolution generally (simple field,
 *    reference chain, unknown alias/segment, synthetic temp-table "unknown" type,
 *    unresolvable reference target, dimension/resource-kind field).
 * 2. PARITY: prove `resolveFieldPath` reports information consistent with what the
 *    existing PUBLIC consumers (`canonicalizeFieldCasing`, `resolveBuilderStar`) —
 *    still the production implementations, untouched by this change — actually do,
 *    for the same metadata/model fixtures. This is the safety net a future migration
 *    (moving those consumers onto the shared kernel) would need to keep passing.
 */
import { describe, it, expect } from 'vitest';
import { resolveFieldPath, findField, firstRef } from '../../src/core/query/fieldPathResolver';
import { canonicalizeFieldCasing } from '../../src/core/query/canonicalizeFieldCasing';
import { resolveBuilderStar } from '../../src/core/query/resolveBuilderStar';
import { buildResolverFromTables } from '../../src/core/metadata/buildModelResolver';
import type { MetaTable } from '../../src/core/metadata/types';
import type { QueryModel } from '../../src/core/query/queryModel';

// ── Fixture metadata: Справочник.Товары.Контрагент → Справочник.Контрагенты.Наименование ──
const KONTRAGENTY: MetaTable = {
  kind: 'Справочник',
  name: 'Контрагенты',
  fullName: 'Справочник.Контрагенты',
  fields: [
    { name: 'Наименование', kind: 'standard', types: [{ primitive: 'Строка' }] },
  ],
};

const TOVARY: MetaTable = {
  kind: 'Справочник',
  name: 'Товары',
  fullName: 'Справочник.Товары',
  fields: [
    { name: 'Наименование', kind: 'standard', types: [{ primitive: 'Строка' }] },
    { name: 'Цена', kind: 'standard', types: [{ primitive: 'Число' }] },
    { name: 'Контрагент', kind: 'standard', types: [{ ref: { kind: 'Справочник', name: 'Контрагенты' } }] },
    // Reference field whose target table is NOT in the resolver — models an
    // incomplete-metadata scenario (unknown != invalid: the field IS a reference,
    // we just can't navigate further through it).
    { name: 'СсылкаБезМетаданных', kind: 'standard', types: [{ ref: { kind: 'Справочник', name: 'НетВМетаданных' } }] },
    // Synthetic/unknown-typed field, mirroring sdblParser.ts's registerTempTables
    // output for a column whose source expression isn't a provable literal.
    { name: 'СинтетическоеПоле', kind: 'standard', types: [] },
  ],
};

// Register-like table exercising the FieldKind axis (dropRedundantGroupDerefs.ts
// special-cases 'dimension'/'resource' at the head segment — this module doesn't,
// deliberately, see fieldPathResolver.ts's doc comment).
const REGISTR: MetaTable = {
  kind: 'РегистрНакопления',
  name: 'ОстаткиТоваров',
  fullName: 'РегистрНакопления.ОстаткиТоваров',
  fields: [
    { name: 'Товар', kind: 'dimension', types: [{ ref: { kind: 'Справочник', name: 'Товары' } }] },
    { name: 'Количество', kind: 'resource', types: [{ primitive: 'Число' }] },
  ],
};

const resolver = buildResolverFromTables([TOVARY, KONTRAGENTY, REGISTR]);

describe('resolveFieldPath — direct scenarios', () => {
  it('resolves a simple scalar field', () => {
    const r = resolveFieldPath(TOVARY, ['Наименование'], resolver);
    expect(r.kind).toBe('scalar');
    expect(r.unresolvedTail).toEqual([]);
    expect(r.resolved).toHaveLength(1);
    expect(r.resolved[0].field.name).toBe('Наименование');
  });

  it('resolves a two-segment reference chain (Контрагент.Наименование)', () => {
    const r = resolveFieldPath(TOVARY, ['Контрагент', 'Наименование'], resolver);
    expect(r.kind).toBe('scalar');
    expect(r.resolved).toHaveLength(2);
    expect(r.resolved[0].kind).toBe('reference');
    expect(r.resolved[0].refTarget).toBe(KONTRAGENTY);
    expect(r.resolved[1].field.name).toBe('Наименование');
  });

  it('is case-insensitive at every segment', () => {
    const r = resolveFieldPath(TOVARY, ['контрагент', 'наименование'], resolver);
    expect(r.kind).toBe('scalar');
    expect(r.resolved.map(s => s.field.name)).toEqual(['Контрагент', 'Наименование']);
  });

  it('reports an unresolvable FIRST segment as unknown, tail preserved verbatim', () => {
    const r = resolveFieldPath(TOVARY, ['НетТакогоПоля', 'Наименование'], resolver);
    expect(r.kind).toBe('unknown');
    expect(r.resolved).toHaveLength(0);
    expect(r.unresolvedTail).toEqual(['НетТакогоПоля', 'Наименование']);
  });

  it('reports an unresolvable MIDDLE segment as unknown, stopping there', () => {
    const r = resolveFieldPath(TOVARY, ['Контрагент', 'НетТакогоРеквизита', 'Хвост'], resolver);
    expect(r.kind).toBe('unknown');
    expect(r.resolved).toHaveLength(1); // "Контрагент" resolved; the rest didn't
    expect(r.unresolvedTail).toEqual(['НетТакогоРеквизита', 'Хвост']);
  });

  it('stops navigation at a proven-scalar intermediate segment (can\'t go further)', () => {
    const r = resolveFieldPath(TOVARY, ['Наименование', 'Хвост'], resolver);
    expect(r.kind).toBe('scalar');
    expect(r.resolved).toHaveLength(1);
    expect(r.unresolvedTail).toEqual(['Хвост']);
  });

  it('a synthetic (types: []) field classifies as unknown, not scalar', () => {
    const r = resolveFieldPath(TOVARY, ['СинтетическоеПоле'], resolver);
    expect(r.kind).toBe('unknown');
    expect(r.resolved[0].field.types).toEqual([]);
  });

  it('a reference field whose target has no metadata: kind=reference, refTarget=undefined', () => {
    const r = resolveFieldPath(TOVARY, ['СсылкаБезМетаданных'], resolver);
    expect(r.kind).toBe('reference');
    expect(r.resolved[0].refTarget).toBeUndefined();
  });

  it('navigating PAST a reference with no target metadata reports unknown (cur becomes undefined)', () => {
    const r = resolveFieldPath(TOVARY, ['СсылкаБезМетаданных', 'ЧтоУгодно'], resolver);
    expect(r.kind).toBe('unknown');
    expect(r.unresolvedTail).toEqual(['ЧтоУгодно']);
  });

  it('surfaces FieldKind (dimension/resource) on resolved segments, for callers that need the special case', () => {
    const r = resolveFieldPath(REGISTR, ['Товар'], resolver);
    expect(r.resolved[0].field.kind).toBe('dimension');
    const r2 = resolveFieldPath(REGISTR, ['Количество'], resolver);
    expect(r2.resolved[0].field.kind).toBe('resource');
  });
});

describe('findField / firstRef — extracted primitives match prior inline behavior', () => {
  it('findField is case-insensitive and returns undefined when absent', () => {
    expect(findField(TOVARY, 'наименование')?.name).toBe('Наименование');
    expect(findField(TOVARY, 'НетПоля')).toBeUndefined();
  });

  it('firstRef returns the first ref-typed MetaType, undefined otherwise', () => {
    expect(firstRef(findField(TOVARY, 'Контрагент')!)).toEqual({ kind: 'Справочник', name: 'Контрагенты' });
    expect(firstRef(findField(TOVARY, 'Наименование')!)).toBeUndefined();
  });
});

describe('parity: resolveFieldPath vs. the production canonicalizeFieldCasing()', () => {
  function modelWith(path: string, qualified = true): QueryModel {
    return {
      tables: [{ id: 't1', fullName: 'Справочник.Товары', alias: 'Товары' }],
      fields: [{ tableId: 't1', path, qualified }],
    };
  }

  it('canonicalizes casing exactly where resolveFieldPath found a differently-cased segment', () => {
    const model = modelWith('контрагент.наименование');
    canonicalizeFieldCasing(model, resolver);
    expect(model.fields[0].path).toBe('Контрагент.Наименование');

    // Same input, through the shared kernel: every resolved segment's canonical
    // name matches what canonicalizeFieldCasing actually wrote above.
    const r = resolveFieldPath(TOVARY, ['контрагент', 'наименование'], resolver);
    expect(r.resolved.map(s => s.field.name).join('.')).toBe(model.fields[0].path);
  });

  it('leaves an unresolvable path untouched, same as resolveFieldPath\'s unresolvedTail', () => {
    const model = modelWith('контрагент.НетТакогоРеквизита');
    canonicalizeFieldCasing(model, resolver);
    // First segment ("контрагент") IS resolvable and gets canonicalized even though
    // the second isn't — canonicalizeSegments preserves the resolved prefix.
    expect(model.fields[0].path).toBe('Контрагент.НетТакогоРеквизита');

    const r = resolveFieldPath(TOVARY, ['контрагент', 'НетТакогоРеквизита'], resolver);
    expect(r.kind).toBe('unknown');
    expect(r.resolved.map(s => s.field.name)).toEqual(['Контрагент']);
    expect(r.unresolvedTail).toEqual(['НетТакогоРеквизита']);
  });
});

describe('parity: resolveFieldPath.kind vs. the production resolveBuilderStar() classify()', () => {
  function builderModelWith(ref: string): QueryModel {
    return {
      tables: [{ id: 't1', fullName: 'Справочник.Товары', alias: 'Товары' }],
      fields: [],
      builder: {
        fields: [{ ref, child: true }],
        conditions: [],
        order: [],
        totals: [],
      },
    };
  }

  it('"scalar" classification drops the .* suffix, matching resolveFieldPath.kind', () => {
    const model = builderModelWith('Товары.Наименование');
    resolveBuilderStar(model, resolver);
    expect(model.builder!.fields[0].child).toBe(false); // dropped: proven scalar

    const r = resolveFieldPath(TOVARY, ['Наименование'], resolver);
    expect(r.kind).toBe('scalar');
  });

  it('"reference" classification KEEPS the .* suffix, matching resolveFieldPath.kind', () => {
    const model = builderModelWith('Товары.Контрагент');
    resolveBuilderStar(model, resolver);
    expect(model.builder!.fields[0].child).toBe(true); // kept: proven reference

    const r = resolveFieldPath(TOVARY, ['Контрагент'], resolver);
    expect(r.kind).toBe('reference');
  });

  it('"unknown" (synthetic types:[] field) KEEPS the .* suffix — unknown != invalid', () => {
    const model = builderModelWith('Товары.СинтетическоеПоле');
    resolveBuilderStar(model, resolver);
    expect(model.builder!.fields[0].child).toBe(true); // kept: not proven non-reference

    const r = resolveFieldPath(TOVARY, ['СинтетическоеПоле'], resolver);
    expect(r.kind).toBe('unknown');
  });
});
