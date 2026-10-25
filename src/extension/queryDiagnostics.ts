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
import type { BatchDocument } from '../core/query/batchModel';

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

type LiteralProblem = Omit<QueryParseProblem, 'start' | 'end'> | undefined;

/** The check of one literal text: its parse and Apply-gate result, and the field check. */
export interface LiteralCheck {
  problem: LiteralProblem;
  /** Kept only when the field check can apply (parsed, not malformed). */
  doc?: BatchDocument;
  field?: { resolver: MetadataResolver; problem: LiteralProblem };
}

/**
 * Per-document reuse between passes (the controller keeps one per open document): the
 * result of a literal by its exact text, the field check by the resolver object. Each
 * pass keeps only the literals it met. A literal whose text changed, or whose bounds the
 * scan reads differently, has another text and is checked from scratch.
 */
export interface QueryProblemsCache {
  entries: Map<string, LiteralCheck>;
}

export function createQueryProblemsCache(): QueryProblemsCache {
  return { entries: new Map() };
}

function checkLiteral(text: string): LiteralCheck {
  const attempt = tryParseBatch(text);
  if (!attempt.ok) return { problem: { kind: 'parse', message: attempt.error } };
  if (findMalformedCustomExpressions(attempt.doc).length > 0) return { problem: { kind: 'malformedExpression', message: '' } };
  return { problem: undefined, doc: attempt.doc };
}

function fieldProblem(check: LiteralCheck, text: string, resolver: MetadataResolver): LiteralProblem {
  if (check.field?.resolver !== resolver) {
    const fieldError = validateBatchSemantics(check.doc!, resolver, text).find(e => e.details?.kind === 'fieldNotFound');
    check.field = { resolver, problem: fieldError ? { kind: 'fieldNotFound', message: fieldError.message } : undefined };
  }
  return check.field.problem;
}

/**
 * Сканирует `source` и возвращает по одной проблеме на каждый литерал запроса,
 * который не разбирается `parseBatch`. Литерал, для которого не удалось найти
 * диапазон ключевого слова (`findQueryKeywordRange` вернул `undefined`) —
 * пропускается: fail-open, лучше отсутствие диагностики, чем неверный диапазон.
 * `cache` (C41 1b) only reuses results; the problems are those of a pass without it.
 */
export function computeQueryParseProblems(
  source: string,
  resolver?: MetadataResolver,
  cache?: QueryProblemsCache,
): QueryParseProblem[] {
  const problems: QueryParseProblem[] = [];
  const seen = new Map<string, LiteralCheck>();
  for (const hit of findAllQueryLiterals(source)) {
    // C2: only a literal known to be a 1C query is checked; an English start that
    // does not parse may be native SQL or an unfinished query (`queryDialect.ts`).
    if (hit.dialect !== 'sdbl') continue;
    let check = seen.get(hit.text) ?? cache?.entries.get(hit.text);
    if (!check) check = checkLiteral(hit.text);
    seen.set(hit.text, check);
    const problem = check.problem ?? (resolver && check.doc ? fieldProblem(check, hit.text, resolver) : undefined);
    if (!problem) continue;
    const range = findQueryKeywordRange(source, hit);
    if (!range) continue;
    problems.push({ ...problem, start: range.start, end: range.end });
  }
  if (cache) cache.entries = seen;
  return problems;
}
