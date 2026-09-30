import type { MetadataResolver } from '../core/query/metadataResolver';
import { tryOpenBatch, type ParseAttempt } from '../core/query/validateBatch';
import { generateBatch } from '../core/query/sdblGenerator';
import { tokenize } from '../core/query/sdblLexer';

export const COMMENT_LOSS_ON_OPEN = 'Конструктор не может сохранить все комментарии этого запроса. Открытие заблокировано; исходный текст не изменён';

function userComments(text: string): string[] {
  return tokenize(text, { comments: true }).filter(t => t.type === 'comment' && !/^\/+$/u.test(t.text)).map(t => t.text);
}

/** C17 boundary: reject before loading an editable model when its initial
 * generation loses user comments. Count repeated comments independently;
 * generated package separators are excluded by the existing binder contract.
 * This protects both UIs without changing raw-expression rendering. */
export function tryOpenDesignerBatch(text: string, resolver?: MetadataResolver): ParseAttempt {
  const result = tryOpenBatch(text, resolver, { preserveComments: true });
  if (!result.ok) return result;
  try {
    const original = userComments(text);
    if (original.length === 0) return result;
    const generated = userComments(generateBatch(result.doc));
    const remaining = new Map<string, number>();
    for (const comment of generated) remaining.set(comment, (remaining.get(comment) ?? 0) + 1);
    for (const comment of original) {
      const count = remaining.get(comment) ?? 0;
      if (count === 0) return { ok: false, error: COMMENT_LOSS_ON_OPEN };
      remaining.set(comment, count - 1);
    }
    return result;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
