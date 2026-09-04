import { assembleBatch, stripBatchComments, type QueryState } from './state/queryStore';
import { generateBatch } from '../core/query/sdblGenerator';

export interface BatchTextResult {
  text: string;
  /** Контролируемая ошибка генерации (ТЗ v2.1 §28/§30) — null, если генерация
   * прошла успешно. */
  error: string | null;
}

/**
 * Собрать пакет из состояния конструктора и сгенерировать SDBL-текст — оборачивая
 * ЛЮБОЕ исключение (сборка модели ИЛИ сама генерация) в controlled-результат вместо
 * throw.
 *
 * Раньше это вычислялось прямо внутри `useMemo` в App.tsx на каждый ре-рендер
 * (при каждом изменении модели, задолго до нажатия «ОК») БЕЗ try/catch — и без
 * React Error Boundary где-либо в дереве. Любое исключение здесь приводило к
 * падению ВСЕГО webview (React размонтирует всё дерево), а не только к ошибке
 * применения (ТЗ §30, P0 LOCKED TEST: "generator throws → caller catches → NO
 * editor modification → controlled error shown → panel remains usable").
 */
export function computeBatchTextSafe(state: QueryState, preserveComments: boolean): BatchTextResult {
  try {
    const assembled = assembleBatch(state);
    const text = generateBatch(preserveComments ? assembled : stripBatchComments(assembled));
    return { text, error: null };
  } catch (e) {
    return { text: '', error: e instanceof Error ? e.message : String(e) };
  }
}
