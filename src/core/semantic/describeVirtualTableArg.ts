/**
 * Phase 2x-2 of the semantic-core roadmap (memory: project-semantic-core-roadmap),
 * increment 1 (hover-only, see `.claude/scratch_phase2x2_virtual_table_design.md`
 * §2.3 — bare-field resolution inside `Условие`/etc. is a later, separate
 * increment, NOT done here).
 *
 * Combines three things, none of which know about each other:
 *  - the `'virtualTableArg'` source-map events (`sourceMap.ts`) recorded by
 *    `parseVirtualParams` — purely positional (which table, which 0-based slot);
 *  - `model.tables[i].fullName` (`<РегистрKind>.<ИмяРегистра>.<Slice>`) to
 *    recover the register kind and slice name for that same table;
 *  - the static catalog (`virtualTableSignatures.ts`) that maps
 *    (register kind, slice, positional slot) to a human-meaningful role.
 *
 * Reuses `findModelAt` (Phase 3d/3b) for the same position-aware "which query
 * level is this" scoping `resolveAliasAt`/`isOutputAliasReference` already
 * rely on, so a `virtualTableArg` event inside a subquery source resolves
 * against ITS OWN model's `tables` array (per-model 0-based numbering,
 * matching `'table'` kind's own indexing), never the outer query's.
 */
import type { TableKind } from '../metadata/types';
import { lookupVirtualTableSignature, type VirtualTableParamSpec } from '../metadata/virtualTableSignatures';
import { rangeContains } from '../query/sourceMap';
import { findModelAt } from './resolveAliasAt';
import type { Resolution } from './resolution';
import type { SemanticSnapshot } from './semanticSnapshot';

export interface VirtualTableArgDescription {
  /** Full dotted name of the virtual-table source, e.g. `РегистрНакопления.Продажи.Остатки`. */
  tableFullName: string;
  param: VirtualTableParamSpec;
}

/**
 * `'unknown'` (not an error) whenever there isn't enough to say — a non-
 * `'complete'` snapshot, a position outside any recorded `virtualTableArg`
 * event, a table that isn't actually a virtual-table source, or a slot the
 * static catalog doesn't cover (e.g. an out-of-range extra argument already
 * flagged `unsafeExtraArgs` elsewhere) — matching this roadmap's fail-open
 * convention throughout (`resolveAliasAt`, `isOutputAliasReference`).
 */
export function describeVirtualTableArgAt(snapshot: SemanticSnapshot, position: number): Resolution<VirtualTableArgDescription> {
  if (snapshot.completeness !== 'complete') return { kind: 'unknown' };
  const event = snapshot.sourceMapEvents.find((e) => e.kind === 'virtualTableArg' && rangeContains(e.range, position));
  if (!event || event.argIndex === undefined) return { kind: 'unknown' };

  const model = findModelAt(snapshot, position);
  const table = model?.tables[event.index];
  if (!table || !table.virtual || !table.fullName) return { kind: 'unknown' };

  const parts = table.fullName.split('.');
  if (parts.length < 3) return { kind: 'unknown' };
  const signature = lookupVirtualTableSignature(parts[0] as TableKind, parts[2]);
  const param = signature?.params[event.argIndex];
  if (!param) return { kind: 'unknown' };

  return { kind: 'resolved', value: { tableFullName: table.fullName, param } };
}
