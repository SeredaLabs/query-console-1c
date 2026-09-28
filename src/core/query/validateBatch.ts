/**
 * 7.8.10 — Проверка запроса при нажатии «ОК».
 *
 * `tryOpenBatch` и `validateBatchText` используют общий разбор `tryParseBatch`,
 * затем локальные проверки `validateBatchSemantics`. Успех разбора сам по себе
 * недостаточен. Перед записью webview дополнительно проверяет статические
 * ограничения сохранности модели через `applyGate`; это не проверка полной
 * семантической эквивалентности исходного и сгенерированного текста.
 */

import { parseBatch } from './sdblParser';
import type { ParseOptions } from './sdblParser';
import type { BatchDocument } from './batchModel';
import type { MetadataResolver } from './metadataResolver';
import { validateBatchSemantics, type SemanticErrorDetails } from './semanticValidator';

/**
 * Позиция ошибки, уже структурированная её источником (`SemanticError` из
 * `semanticValidator.ts`) — не текст, который нужно повторно парсить. Синтаксические
 * ошибки парсера (`tryParseBatch`) её пока не несут: `sdblParser.ts` бросает `Error`
 * только с готовым текстом сообщения (её трогать не входит в эту задачу) — для них
 * `diagnostic` остаётся `undefined`, `error` — единственный источник информации.
 */
export interface ErrorDiagnostic {
  line?: number;
  col?: number;
  fullName?: string;
  details?: SemanticErrorDetails;
}

export type ParseAttempt =
  | { ok: true; doc: BatchDocument }
  | { ok: false; error: string; diagnostic?: ErrorDiagnostic };

/**
 * Единый разбор текста пакета — общий источник правды для открытия из текста
 * (`App.loadModel`) и проверки при «ОК» (`validateBatchText`). Успех → разобранный
 * документ; исключение лексера/парсера → текст ошибки.
 *
 * Фаза 8.1: при открытии из текста передаётся `{ preserveComments: true }`, чтобы
 * собрать комментарии `//…`. Для проверки при «ОК» опция не нужна (валидируется лишь
 * разбираемость на этом шаге; семантика проверяется вызывающей функцией).
 */
export function tryParseBatch(text: string, opts?: ParseOptions): ParseAttempt {
  try {
    return { ok: true, doc: parseBatch(text, undefined, opts) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Фаза 8.4 — открытие запроса из текста с локальной семантической проверкой.
 * Сначала синтаксис (`tryParseBatch`); при успехе — семантика (`validateBatchSemantics`).
 * Первая семантическая ошибка → `{ ok:false }`. Без резолвера ПРОВЕРКА ТАБЛИЦ
 * пропускается (fail-open), но чисто структурные проверки (дубли псевдонимов,
 * число колонок ОБЪЕДИНЕНИЯ) работают всегда — см. `semanticValidator.ts`.
 */
export function tryOpenBatch(
  text: string,
  resolver?: MetadataResolver,
  opts?: ParseOptions,
): ParseAttempt {
  const r = tryParseBatch(text, opts);
  if (!r.ok) return r;
  const errors = validateBatchSemantics(r.doc, resolver, text);
  if (errors.length > 0) {
    const { message, line, col, fullName, details } = errors[0];
    return { ok: false, error: message, diagnostic: { line, col, fullName, details } };
  }
  return r;
}

export type ValidationResult = { ok: true } | { ok: false; error: string };

/**
 * Проверка при «ОК»: тот же критерий, что и открытие из текста. Синтаксическая
 * ошибка → сообщение парсера с префиксом; при корректном синтаксисе — семантическая
 * проверка (сообщение в стиле эталона, без префикса). Без резолвера проверка
 * существования таблиц пропускается, но структурные проверки (см.
 * `semanticValidator.ts`) работают в любом случае.
 */
export function validateBatchText(text: string, resolver?: MetadataResolver): ValidationResult {
  const r = tryParseBatch(text);
  if (!r.ok) return { ok: false, error: 'Запрос содержит ошибку: ' + r.error };
  const errors = validateBatchSemantics(r.doc, resolver, text);
  if (errors.length > 0) return { ok: false, error: errors[0].message };
  return { ok: true };
}
