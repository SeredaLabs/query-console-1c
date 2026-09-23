import { validateBatchText } from '../core/query/validateBatch';
import { findUnsafeVirtualTables, findMalformedCustomExpressions } from '../core/query/semanticValidator';
import type { MetadataResolver } from '../core/query/metadataResolver';
import { assembleBatch, type QueryState } from './state/queryStore';

/**
 * Apply gate shared by Classic (`webview/App.tsx`, «ОК») and Canvas
 * (`webview-canvas/App.tsx`, «Зберегти») — both write the same generated text
 * back into the editor, so both must refuse the same queries. Each UI only maps
 * the result to its own messages; the checks and their order live here.
 */

/**
 * A known capability/preservation boundary that makes the current model
 * unsafe to apply (ТЗ §27/28/54 P0.5), checked continuously so the apply
 * button can be disabled with a reason:
 *  - `unsafeVirtualTable`: a virtual table with uncovered positions 3+ (see
 *    `docs/development/known-issues.md`, `findUnsafeVirtualTables`) — applying
 *    would silently drop those arguments;
 *  - `malformedCustom`: a stored custom/raw expression fails the structural SDBL
 *    acceptor (`findMalformedCustomExpressions`) — the tolerant parser keeps
 *    such text without checking its own grammar.
 */
export type StaticApplyBlocker =
  | { kind: 'unsafeVirtualTable'; name: string }
  | { kind: 'malformedCustom' };

export function findStaticApplyBlocker(state: QueryState): StaticApplyBlocker | null {
  const batch = assembleBatch(state);
  const names = findUnsafeVirtualTables(batch);
  if (names.length > 0) return { kind: 'unsafeVirtualTable', name: names[0] };
  if (findMalformedCustomExpressions(batch).length > 0) return { kind: 'malformedCustom' };
  return null;
}

export type ApplyDecision =
  | { ok: true }
  /** Empty text, a generation error or a static blocker — the UI already shows why. */
  | { ok: false; kind: 'blocked' }
  /** The generated text failed the same check as opening from text (`validateBatchText`). */
  | { ok: false; kind: 'invalid'; error: string };

/**
 * Final check at the moment of applying. Re-validates the generated text with
 * the same criterion as opening a query from text (syntax, then semantics:
 * tables, fields, duplicate aliases, UNION column counts), so the constructor
 * never writes back a query it would itself refuse to open. Deliberately run
 * on click only, not on every render — it re-parses the whole batch.
 */
export function decideApply(
  text: string,
  generationError: string | null,
  blocker: StaticApplyBlocker | null,
  resolver: MetadataResolver | undefined,
): ApplyDecision {
  if (!text.trim() || generationError !== null || blocker !== null) return { ok: false, kind: 'blocked' };
  const v = validateBatchText(text, resolver);
  return v.ok ? { ok: true } : { ok: false, kind: 'invalid', error: v.error };
}
