import type { BatchDocument } from '../core/query/batchModel';
import type { MetadataResolver } from '../core/query/metadataResolver';
import { tryOpenBatch, type ParseAttempt } from '../core/query/validateBatch';
import { generateBatch } from '../core/query/sdblGenerator';
import { tokenize } from '../core/query/sdblLexer';

export const COMMENT_LOSS_ON_OPEN = 'Конструктор не может сохранить все комментарии этого запроса. При сохранении часть комментариев будет потеряна. Продолжить?';

function userComments(text: string): string[] {
  return tokenize(text, { comments: true }).filter(t => t.type === 'comment' && !/^\/+$/u.test(t.text)).map(t => t.text);
}

export type DesignerOpenAttempt = ParseAttempt | {
  ok: false;
  error: string;
  /** Validated candidate, only loadable after explicit comment-loss consent. */
  commentLossDoc: BatchDocument;
  lost: string[];
};

/** Detect comment loss before replacing the editable model. Count repeated
 * comments independently; package separators are excluded by the binder contract.
 * Only this known loss offers a candidate for confirmation. Other failures stay
 * errors and cannot be overridden. */
export function tryOpenDesignerBatch(text: string, resolver?: MetadataResolver): DesignerOpenAttempt {
  const result = tryOpenBatch(text, resolver, { preserveComments: true });
  if (!result.ok) return result;
  try {
    const original = userComments(text);
    if (original.length === 0) return result;
    const generated = userComments(generateBatch(result.doc));
    const remaining = new Map<string, number>();
    for (const comment of generated) remaining.set(comment, (remaining.get(comment) ?? 0) + 1);
    const lost: string[] = [];
    for (const comment of original) {
      const count = remaining.get(comment) ?? 0;
      if (count === 0) lost.push(comment);
      else remaining.set(comment, count - 1);
    }
    return lost.length ? { ok: false, error: COMMENT_LOSS_ON_OPEN, commentLossDoc: result.doc, lost } : result;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
