/**
 * Чистое ядро диагностики «этот запрос не откроется в конструкторе» — то же
 * `tryParseBatch`, что и открытие из текста (`App.loadModel`) и проверка при «ОК»
 * (`validateBatchText`), см. `validateBatch.ts`. Осознанно НЕ гоняет
 * `tryOpenBatch`/семантику: она требует резолвер метаданных (файловая/кэш
 * зависимость), слишком тяжело для фонового прохода на каждое изменение документа.
 *
 * Модуль ДОЛЖЕН оставаться чистым (без `import vscode`) — адаптер к
 * `vscode.Diagnostic` и жизненный цикл (debounce, подписки) — в
 * `queryDiagnosticsController.ts`.
 */

import { findAllQueryLiterals, findQueryKeywordRange } from './queryAtCursor';
import { tryParseBatch } from '../core/query/validateBatch';

export interface QueryParseProblem {
  /** Сырое сообщение парсера (не локализуется — как и везде, отражает язык платформы 1С). */
  message: string;
  /** Смещения в СЫРОМ документе (диапазон ключевого слова запроса, не весь литерал). */
  start: number;
  end: number;
}

/**
 * Сканирует `source` и возвращает по одной проблеме на каждый литерал запроса,
 * который не разбирается `parseBatch`. Литерал, для которого не удалось найти
 * диапазон ключевого слова (`findQueryKeywordRange` вернул `undefined`) —
 * пропускается: fail-open, лучше отсутствие диагностики, чем неверный диапазон.
 */
export function computeQueryParseProblems(source: string): QueryParseProblem[] {
  const problems: QueryParseProblem[] = [];
  for (const hit of findAllQueryLiterals(source)) {
    const attempt = tryParseBatch(hit.text);
    if (attempt.ok) continue;
    const range = findQueryKeywordRange(source, hit);
    if (!range) continue;
    problems.push({ message: attempt.error, start: range.start, end: range.end });
  }
  return problems;
}
