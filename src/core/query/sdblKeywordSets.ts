/**
 * Shared SDBL keyword/operator sets.
 *
 * These groups were previously hand-copied, independently, into several files
 * (qualifyBareFields.ts, sdblParser.ts, sdblGenerator.ts, exprFormatter.ts,
 * wrapTabSectionAggregates.ts, dropRedundantGroupDerefs.ts). If 1C's grammar
 * ever gains a new literal/aggregate/period/meta-function keyword, only some
 * copies would get updated. Consolidated here as the single source of truth.
 */

/** SDBL literal keywords (`НЕОПРЕДЕЛЕНО`, `ИСТИНА`, `ЛОЖЬ`, `NULL`). */
export const LITERAL_WORDS = new Set(['НЕОПРЕДЕЛЕНО', 'ИСТИНА', 'ЛОЖЬ', 'NULL']);

/** Aggregate function words (`СУММА`, `КОЛИЧЕСТВО`, `МАКСИМУМ`, `МИНИМУМ`, `СРЕДНЕЕ`). */
export const AGGREGATE_WORDS = new Set(['СУММА', 'КОЛИЧЕСТВО', 'МАКСИМУМ', 'МИНИМУМ', 'СРЕДНЕЕ']);

/** Comparison operator punctuation (`=`, `<>`, `<`, `>`, `<=`, `>=`). */
export const COMPARISON_OPERATORS = new Set(['=', '<>', '<', '>', '<=', '>=']);

/** Period/date-part granularity words (argument of date functions like НАЧАЛОПЕРИОДА). */
export const PERIOD_WORDS = new Set([
  'ГОД', 'ПОЛУГОДИЕ', 'КВАРТАЛ', 'МЕСЯЦ', 'ДЕКАДА', 'НЕДЕЛЯ', 'ДЕНЬ', 'ЧАС', 'МИНУТА', 'СЕКУНДА',
]);

/** Meta-function/display words (`ЗНАЧЕНИЕ`, `ТИП`, `ПРЕДСТАВЛЕНИЕ`, `ПРЕДСТАВЛЕНИЕССЫЛКИ`). */
export const META_FUNCTION_WORDS = new Set(['ЗНАЧЕНИЕ', 'ТИП', 'ПРЕДСТАВЛЕНИЕ', 'ПРЕДСТАВЛЕНИЕССЫЛКИ']);
