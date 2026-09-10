/**
 * Phase 2c of the semantic-core roadmap (memory: project-semantic-core-roadmap).
 *
 * Batch-wide temp-table (`ПОМЕСТИТЬ`/`ДОБАВИТЬ`) NAME visibility — deliberately
 * narrowed (per this roadmap's Refinement 4) to "only insofar as it affects
 * `Alias.Field` source resolution": this answers whether a given temp-table
 * name is in scope for a given statement, NOT what columns it has. Full
 * temp-table schema tracking (column inference, `*` expansion) already exists
 * in `sdblParser.ts`'s `parseBatch` (`registerTempTables`,
 * `augmentResolverWithTempTables`, `inferUndefinedTempTables`) for generation
 * purposes and is out of scope here — this module answers a narrower,
 * semantic-layer-shaped question (is this name visible at all) by formalizing
 * the SAME rule as a pure, standalone query over an already-parsed
 * `BatchDocument`, for Phase 3a/3b's `resolveAliasAt` to consume later.
 *
 * The rule itself (matches `registerTempTables` exactly, already corpus-
 * proven, not a new hypothesis): a temp table created by `ПОМЕСТИТЬ` becomes
 * visible starting with the VERY NEXT statement — never the statement that
 * creates it (structurally impossible: the table doesn't exist until that
 * whole statement finishes) and never an earlier one (no backward
 * visibility). `ДОБАВИТЬ` (`appendTemp`) adds rows to an ALREADY-created temp
 * table and so never itself introduces a new visible name — matches
 * `registerTempTables`'s own `queryType !== 'createTemp'` guard.
 *
 * `УНИЧТОЖИТЬ` (`dropTemp`) is NOT treated as removing a name from later
 * visibility — this matches the existing `registerTempTables` behavior
 * exactly (it has no drop-handling either), not a new gap introduced here.
 */
import type { BatchDocument } from '../query/batchModel';
import type { QueryDocument } from '../query/unionModel';

function tempTableCreatedBy(doc: QueryDocument): string | undefined {
  const m0 = doc.members[0]?.model;
  if (m0?.queryType === 'createTemp' && m0.tempTableName) return m0.tempTableName;
  return undefined;
}

/**
 * For each statement index in `batch.members`, the set of (upper-cased) temp
 * table names visible to it — i.e. created via `ПОМЕСТИТЬ` by some STRICTLY
 * EARLIER statement. Index 0 always maps to an empty set (nothing precedes
 * the first statement).
 */
export function computeTempTableVisibility(batch: BatchDocument): ReadonlyMap<number, ReadonlySet<string>> {
  const result = new Map<number, ReadonlySet<string>>();
  const visible = new Set<string>();
  batch.members.forEach((doc, i) => {
    result.set(i, new Set(visible));
    const created = tempTableCreatedBy(doc);
    if (created) visible.add(created.toUpperCase());
  });
  return result;
}
