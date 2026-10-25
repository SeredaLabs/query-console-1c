/**
 * Чистое ядро диагностики «этот запрос не откроется в конструкторе» — то же
 * `tryParseBatch`, что и открытие из текста (`App.loadModel`) и проверка при «ОК»
 * (`validateBatchText`), см. `validateBatch.ts`, плюс структурная проверка сырых
 * выражений `findMalformedCustomExpressions` — та же, что блокирует Apply
 * (`webview/applyGate.ts`); обе не требуют метаданных. Осознанно НЕ гоняет
 * `tryOpenBatch`/семантику: она требует резолвер метаданных (файловая/кэш
 * зависимость), слишком тяжело для фонового прохода на каждое изменение документа.
 *
 * C41 stage 1b: с УЖЕ загруженными метаданными (резолвер передаёт контроллер, сам
 * модуль их не грузит) добавляется проверка полей — та же `validateBatchSemantics`,
 * что при открытии, в «Тексте запроса» и при Apply; из её ошибок берутся только
 * `fieldNotFound`. Без резолвера поведение прежнее.
 *
 * Модуль ДОЛЖЕН оставаться чистым (без `import vscode`) — адаптер к
 * `vscode.Diagnostic` и жизненный цикл (debounce, подписки) — в
 * `queryDiagnosticsController.ts`.
 */

import { findAllQueryLiterals, findQueryKeywordRange } from './queryAtCursor';
import { tryParseBatch } from '../core/query/validateBatch';
import { findMalformedCustomExpressions, validateBatchSemantics } from '../core/query/semanticValidator';
import type { MetadataResolver } from '../core/query/metadataResolver';

export interface QueryParseProblem {
  /**
   * `'parse'` — `parseBatch` не разобрал литерал (конструктор его не откроет);
   * `'malformedExpression'` — разобрал, но сохранил структурно некорректный
   * сырой текст выражения/условия, и Apply его заблокирует
   * (`findMalformedCustomExpressions`, тот же чекер, что в `webview/applyGate.ts`);
   * `'fieldNotFound'` — поле не найдено по уже загруженным метаданным (C41 1b).
   */
  kind: 'parse' | 'malformedExpression' | 'fieldNotFound';
  /** Сырое сообщение парсера или валидатора (не локализуется — как и везде, отражает язык платформы 1С); пусто для `'malformedExpression'`. */
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
export function computeQueryParseProblems(source: string, resolver?: MetadataResolver): QueryParseProblem[] {
  const problems: QueryParseProblem[] = [];
  for (const hit of findAllQueryLiterals(source)) {
    // C2: only a literal known to be a 1C query is checked; an English start that
    // does not parse may be native SQL or an unfinished query (`queryDialect.ts`).
    if (hit.dialect !== 'sdbl') continue;
    const attempt = tryParseBatch(hit.text);
    let problem: Omit<QueryParseProblem, 'start' | 'end'> | undefined;
    if (!attempt.ok) problem = { kind: 'parse', message: attempt.error };
    else if (findMalformedCustomExpressions(attempt.doc).length > 0) problem = { kind: 'malformedExpression', message: '' };
    else if (resolver) {
      const fieldError = validateBatchSemantics(attempt.doc, resolver, hit.text).find(e => e.details?.kind === 'fieldNotFound');
      if (fieldError) problem = { kind: 'fieldNotFound', message: fieldError.message };
    }
    if (!problem) continue;
    const range = findQueryKeywordRange(source, hit);
    if (!range) continue;
    problems.push({ ...problem, start: range.start, end: range.end });
  }
  return problems;
}
