/**
 * Phase 2x-1 of the semantic-core roadmap (memory: project-semantic-core-roadmap).
 *
 * A bare identifier inside `УПОРЯДОЧИТЬ`/`ИТОГИ` can name a SELECT-list OUTPUT
 * column alias instead of a source-table alias/field — a genuinely different
 * resolution domain, not covered by `resolveAliasAt` (which only ever
 * resolves source aliases). Without this check, hover/completion would try
 * `resolveAliasAt` on such an identifier and, if it happens to COLLIDE with a
 * real table alias elsewhere in the query, confidently show information for
 * the WRONG thing (that unrelated table), instead of recognizing it names an
 * output column.
 *
 * Reuses `selectOutputAliases` — the SAME set `qualifyBareFields.ts`'s
 * generator pass already uses (corpus-proven) to decide that exact bare name
 * stays UNqualified in `УПОРЯДОЧИТЬ`/`ИТОГИ` — so this doesn't invent a new
 * rule, it makes the advisory layer consistent with what the round-trip
 * engine already does. Deliberately does NOT cover `ИМЕЮЩИЕ` (HAVING) — live-
 * verified against real 1C (see `selectOutputAliases`'s own doc) that HAVING
 * never resolves a bare identifier against SELECT-output aliases at all, so
 * there is nothing for this module to do there.
 *
 * This module only ANSWERS "is this a reference to an output column, not a
 * table alias" — callers (`hoverFieldInfo.ts`'s `resolveHeadTable`) decide
 * what to do with that (currently: show nothing, rather than inventing an
 * "output column" hover/completion result this roadmap has no design for
 * yet).
 */
import { rangeContains } from '../query/sourceMap';
import { selectOutputAliases } from '../query/qualifyBareFields';
import { findModelAt } from './resolveAliasAt';
import type { SemanticSnapshot } from './semanticSnapshot';

export function isOutputAliasReference(snapshot: SemanticSnapshot, position: number, alias: string): boolean {
  if (snapshot.completeness !== 'complete') return false;
  const inSection = snapshot.sourceMapEvents.some(
    (e) => e.kind === 'outputAliasSection' && rangeContains(e.range, position),
  );
  if (!inSection) return false;
  const model = findModelAt(snapshot, position);
  if (!model) return false;
  return selectOutputAliases(model).has(alias.toUpperCase());
}
