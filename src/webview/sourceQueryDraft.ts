import type { QueryDocument } from '../core/query/unionModel';
import type { MetadataResolver } from '../core/query/metadataResolver';
import { decideApply, findStaticApplyBlocker } from './applyGate';
import { computeBatchTextSafe } from './computeBatchText';
import { assembleMembers, initialState, reducer, type QueryState } from './state/queryStore';

/** LOAD_BATCH synthesizes source names in-place; a cancelled draft must not
 * mutate the parent's document. Metadata catalog ownership stays with the session. */
export function sourceQueryDraft(doc?: QueryDocument): QueryState {
  return doc
    ? reducer(initialState(), { type: 'LOAD_BATCH', doc: { members: [structuredClone(doc)] } })
    : initialState();
}

/** The source-update reducer intentionally prunes dependent scalar fields.
 * A contextual draft must refuse that implicit deletion of parent content. */
export function removedSourceFieldPaths(state: QueryState, tableId: string, columns: string[]): string[] {
  const keep = new Set(columns);
  return state.selectedFields.filter(f => f.tableId === tableId && f.path !== ''
    && !keep.has(f.path) && !keep.has(f.path.split('.')[0])).map(f => f.path);
}

export function finishSourceQueryDraft(state: QueryState, resolver?: MetadataResolver):
  { ok: true; doc: QueryDocument } | { ok: false; error?: string } {
  // A source is one SELECT/UNION document, never a package or a temp operation.
  const members = assembleMembers(state);
  if (state.batchSaved.length !== 1 || members.some(m => m.model.queryType !== 'select')) {
    return { ok: false };
  }
  const generated = computeBatchTextSafe(state, true);
  const decision = decideApply(generated.text, generated.error, findStaticApplyBlocker(state), resolver);
  if (!decision.ok) return { ok: false, error: decision.kind === 'invalid' ? decision.error : undefined };
  return { ok: true, doc: { members } };
}
