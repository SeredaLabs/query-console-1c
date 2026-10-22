import type { MetadataResolver } from '../core/query/metadataResolver';
import { findStaticApplyBlocker } from './applyGate';
import { computeBatchTextSafe } from './computeBatchText';
import { tryOpenDesignerBatch } from './openDesignerBatch';
import type { QueryState } from './state/queryStore';
import { localizeDiagnostic, t } from './i18n';

/**
 * Classic ↔ Canvas switching carries the current model to the other UI as its
 * generated query text, which the other UI opens like any loaded query. Switch
 * only when that text reopens through the same designer-open gate with nothing
 * lost; otherwise stay in the current UI with its state untouched.
 */
export function prepareDesignerSwitch(
  state: QueryState,
  resolver: MetadataResolver | undefined,
): { ok: true; text: string } | { ok: false; error: string } {
  const out = computeBatchTextSafe(state, true);
  const blocked = (reason: string) => ({ ok: false as const, error: t('designer.mode.blocked', { reason }) });
  if (out.error !== null) return blocked(localizeDiagnostic(out.error));
  // A model Apply refuses here never switches: the other UI reopens the generated
  // text, which can lose the reason for the block — U2: dropped unsafe virtual-table
  // arguments; C42: a trailing unclosed `(` closed by generation.
  const blocker = findStaticApplyBlocker(state);
  if (blocker) {
    return blocked(blocker.kind === 'unsafeVirtualTable'
      ? t('constructor.unsafeVirtual', { name: blocker.name })
      : t('constructor.malformedCustom'));
  }
  if (!out.text.trim()) return { ok: true, text: '' };
  const reopened = tryOpenDesignerBatch(out.text, resolver);
  if (!reopened.ok) return blocked('commentLossDoc' in reopened ? t('designer.mode.commentLoss') : localizeDiagnostic(reopened.error));
  return { ok: true, text: out.text };
}
