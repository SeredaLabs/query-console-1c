/**
 * Phase 2x-2 follow-up (semantic-core roadmap, memory: project-semantic-core-roadmap):
 * hover enrichment for a virtual-table OUTPUT field (e.g. `Остатки.КоличествоОстаток`
 * in the SELECT list/WHERE/etc. — NOT a positional argument, see
 * `describeVirtualTableArg.ts` for that separate concern).
 *
 * Reverse-maps an output field name back to the real BASE register's own
 * resource field it was expanded from, plus which suffix/role produced it —
 * `КоличествоОстаток` → base `Количество`, suffix `Остаток`. Exact-match
 * only, never a guess: tries every suffix this project's OWN metadata
 * builders (`yamlLoader.ts`, `accountingVirtualTables.ts`) could have used
 * (imported from the same `virtualTableResourceSuffixes.ts` those builders
 * use, so this can never independently drift from what they actually
 * generate), and only reports a match when `<candidate><suffix>` equals the
 * observed name exactly AND `<candidate>` is a REAL resource field on the
 * base register's own metadata.
 *
 * Deliberately does NOT attempt регистр бухгалтерии's synthesized fields
 * (`Счет`/`СубконтоN`/`ВидСубконтоN`/etc.) — these have no base-register
 * field to map back to at all (built fresh from the chart of accounts, not
 * expanded from `base.fields`) and already show correct name/type/reference
 * info directly from the virtual table's own metadata (see
 * `resolveHeadTable`'s `virtualTableByFullName` fallback) — no enrichment
 * needed or possible there. Same for dimensions/attributes, which pass
 * through unchanged (same name on the base and the slice).
 */
import type { MetaTable, TableKind } from './types';
import { ACCUM_RESOURCE_SUFFIXES, ACCOUNTING_RESOURCE_SUFFIXES } from './virtualTableResourceSuffixes';

export interface VirtualTableOutputFieldInfo {
  /** The output field's own name as written in the query, e.g. "КоличествоОстаток". */
  outputName: string;
  /** The base register's real resource field this was expanded from, e.g. "Количество". */
  baseFieldName: string;
  /** The suffix identified, e.g. "Остаток", "Приход", "НачальныйОстаток". */
  suffix: string;
}

function uniqueSuffixes(groups: Record<string, readonly string[]>): readonly string[] {
  return Array.from(new Set(Object.values(groups).flat()));
}

const ACCUM_SUFFIXES = uniqueSuffixes(ACCUM_RESOURCE_SUFFIXES);
const ACCOUNTING_SUFFIXES = uniqueSuffixes(ACCOUNTING_RESOURCE_SUFFIXES);

function reverseMap(baseMeta: MetaTable, outputName: string, suffixes: readonly string[]): VirtualTableOutputFieldInfo | undefined {
  for (const suffix of suffixes) {
    if (!outputName.endsWith(suffix)) continue;
    const candidate = outputName.slice(0, outputName.length - suffix.length);
    if (candidate.length === 0) continue;
    const baseField = baseMeta.fields.find((f) => f.kind === 'resource' && f.name === candidate);
    if (baseField) return { outputName, baseFieldName: candidate, suffix };
  }
  return undefined;
}

/**
 * `registerKind` is the VIRTUAL TABLE's own kind (`MetaTable.kind`, same as
 * the base register's — slices don't change `kind`), `baseMeta` is the real
 * base register's metadata (`resolver.tableByFullName(virtual.baseFullName)`).
 * `undefined` — fail-open — for any register kind without a known suffix
 * table (РегистрСведений has no suffixes at all; fields pass through
 * unchanged), or when no suffix reconstructs `outputName` against a real
 * base resource field.
 */
export function describeVirtualTableOutputField(
  registerKind: TableKind,
  baseMeta: MetaTable,
  outputName: string,
): VirtualTableOutputFieldInfo | undefined {
  if (registerKind === 'РегистрНакопления') return reverseMap(baseMeta, outputName, ACCUM_SUFFIXES);
  if (registerKind === 'РегистрБухгалтерии') return reverseMap(baseMeta, outputName, ACCOUNTING_SUFFIXES);
  return undefined;
}
