/**
 * Чистый помощник для семантики поля запроса (`Alias.Field[.Field…]`) в исходнике
 * `.bsl` — общее ядро для hover (`queryHoverProvider.ts`) И автодополнения
 * (`queryCompletionProvider.ts`). Находит цепочку идентификаторов вокруг позиции
 * курсора (по СЫРОМУ тексту литерала запроса, тем же смещениям, что уже даёт
 * `queryAtCursor.ts`) и, если её голова — известный псевдоним источника, описывает
 * конкретный сегмент через `resolveFieldPath`.
 *
 * Модуль ДОЛЖЕН оставаться чистым (без `import vscode`) — как и `queryAtCursor.ts`;
 * связка с `vscode.HoverProvider`/`vscode.CompletionItemProvider` — отдельные
 * файлы (`queryHoverProvider.ts`, `queryCompletionProvider.ts`).
 *
 * ИЗВЕСТНОЕ УПРОЩЕНИЕ (документировано, не скрыто): псевдоним ищется по ВСЕМ
 * таблицам пакета сразу (все участники объединения, все подзапросы), первое
 * совпадение побеждает — без построения полноценного дерева областей видимости
 * (полный Scope, который специально НЕ строился в рамках этого шага — см.
 * Architecture Report). На практике псевдонимы почти всегда уникальны в пределах
 * всего пакета, поэтому это даёт верный результат в подавляющем большинстве
 * случаев; в редком случае двух подзапросов с ОДНИМ и тем же псевдонимом hover
 * может показать не тот источник — не более того (advisory-информация, не влияет
 * на Apply/round-trip). Публично задокументировано как known limitation в
 * docs/en(ru,uk)/limitations.md и docs/development/known-issues.md — обновляй
 * оба места, если это когда-нибудь будет исправлено или переформулировано.
 */
import type { MetadataResolver } from '../core/query/metadataResolver';
import type { MetaTable } from '../core/metadata/types';
import { resolveFieldPath, type FieldPathResolution } from '../core/query/fieldPathResolver';
import { findAliasTable } from '../core/query/findAliasTable';

export interface FieldChainSegment {
  /** Текст сегмента как написано в исходнике. */
  text: string;
  /** Смещения `[start, end)` СИМВОЛОВ этого сегмента относительно начала строки,
   * переданной в `findChainAt` (то есть относительно сырого текста ЛИТЕРАЛА, если
   * вызывающий код передал именно его — см. `queryHoverProvider.ts`). */
  start: number;
  end: number;
}

function isWordChar(c: string | undefined): boolean {
  return c !== undefined && /[\p{L}\p{N}_]/u.test(c);
}

/**
 * Находит цепочку `<голова>.<сегмент>…`, содержащую символьную позицию `offset` в
 * `text`, и индекс сегмента, В КОТОРОМ лежит `offset`. `null`, если `offset` не
 * попадает ни в один идентификатор (например, курсор на пробеле/операторе).
 *
 * Работает НАЗАД и ВПЕРЁД от найденного идентификатора через `.`-соседей — не
 * требует полного лексического разбора текста (комментарии/строковые литералы не
 * пропускаются явно, но это не создаёт риска для чего-то важнее рекомендации
 * hover: см. файловый комментарий).
 */
export function findChainAt(text: string, offset: number): { segments: FieldChainSegment[]; hoveredIndex: number } | null {
  if (offset < 0 || offset > text.length) return null;

  // Слово, в которое (или сразу после которого) попадает offset.
  let wordStart: number;
  let wordEnd: number;
  if (isWordChar(text[offset])) {
    wordStart = offset;
    wordEnd = offset;
  } else if (isWordChar(text[offset - 1])) {
    // Курсор сразу ПОСЛЕ слова (типичная позиция VS Code на границе токена).
    wordStart = offset - 1;
    wordEnd = offset;
  } else {
    return null;
  }
  while (wordStart > 0 && isWordChar(text[wordStart - 1])) wordStart--;
  while (wordEnd < text.length && isWordChar(text[wordEnd])) wordEnd++;

  const segments: FieldChainSegment[] = [{ text: text.slice(wordStart, wordEnd), start: wordStart, end: wordEnd }];
  let hoveredIndex = 0;

  // Назад: пока перед текущим началом стоит `.`, за которой — ещё идентификатор.
  let cur = wordStart;
  for (;;) {
    if (cur === 0 || text[cur - 1] !== '.') break;
    let segEnd = cur - 1;
    let segStart = segEnd;
    while (segStart > 0 && isWordChar(text[segStart - 1])) segStart--;
    if (segStart === segEnd) break; // точка не предварена идентификатором
    segments.unshift({ text: text.slice(segStart, segEnd), start: segStart, end: segEnd });
    hoveredIndex++;
    cur = segStart;
  }

  // Вперёд: симметрично.
  cur = wordEnd;
  for (;;) {
    if (cur >= text.length || text[cur] !== '.') break;
    const segStart = cur + 1;
    let segEnd = segStart;
    while (segEnd < text.length && isWordChar(text[segEnd])) segEnd++;
    if (segEnd === segStart) break;
    segments.push({ text: text.slice(segStart, segEnd), start: segStart, end: segEnd });
    cur = segEnd;
  }

  return { segments, hoveredIndex };
}

/**
 * Знаходить ланцюжок ПЕРЕД курсором для автодоповнення полів: сегменти, вже
 * набрані ДО крапки, що передує сегменту, який зараз вводиться (сам цей частково
 * набраний сегмент НЕ входить у результат — VS Code сам фільтрує запропоновані
 * варіанти за тим, що вже введено, як для будь-якого звичайного автодоповнення).
 *
 * `null`, якщо курсор не стоїть одразу після крапки, перед якою йде відомий
 * ланцюжок ідентифікаторів (наприклад, курсор на початку файлу чи після
 * пробілу/оператора без попередньої крапки) — тоді доповнювати нічого.
 */
export function findChainForCompletion(text: string, offset: number): string[] | null {
  if (offset < 0 || offset > text.length) return null;

  // Пропускаємо назад символи вже набраного (можливо порожнього) сегмента —
  // саме він буде відфільтрований VS Code, у результат не входить.
  let cur = offset;
  while (cur > 0 && isWordChar(text[cur - 1])) cur--;
  if (cur === 0 || text[cur - 1] !== '.') return null;
  cur--; // "з'їдаємо" крапку перед сегментом, що вводиться

  const segments: string[] = [];
  for (;;) {
    if (cur === 0 || !isWordChar(text[cur - 1])) break;
    const segEnd = cur;
    let segStart = segEnd;
    while (segStart > 0 && isWordChar(text[segStart - 1])) segStart--;
    segments.unshift(text.slice(segStart, segEnd));
    cur = segStart;
    if (cur === 0 || text[cur - 1] !== '.') break;
    cur--;
  }

  return segments.length > 0 ? segments : null;
}


export interface ChainDescription {
  /** Полное имя метаданных таблицы, на которую ссылается голова цепочки —
   * `undefined`, если псевдоним не найден или таблица не резолвится по метаданным
   * (параметр `&Имя`, подзапрос, ВТ, пробел в метаданных — unknown != invalid). */
  tableFullName?: string;
  /** Резолюция сегментов ПОСЛЕ головы через `resolveFieldPath` — `undefined`, если
   * таблица головы не резолвится (см. выше) или цепочка состоит из одной головы. */
  resolution?: FieldPathResolution;
}

/**
 * Разбирает `queryText` (уже реконструированный из BSL-литерала, БЕЗ `|`-префиксов
 * — см. `queryAtCursor.ts`'s `unpipe`) и описывает `chain` (текстовые сегменты,
 * `chain[0]` — предполагаемый псевдоним источника).
 */
export function describeChain(
  queryText: string,
  resolver: MetadataResolver,
  chain: string[]
): ChainDescription {
  if (chain.length === 0) return {};
  const found = findAliasTable(queryText, resolver, chain[0]);
  if (!found) return {};

  const { table, meta } = found;
  if (!meta) return { tableFullName: table.fullName };

  if (chain.length === 1) return { tableFullName: meta.fullName };
  return { tableFullName: meta.fullName, resolution: resolveFieldPath(meta, chain.slice(1), resolver) };
}

export interface CompletionTarget {
  /** Таблиця метаданих, чиї `.fields` треба запропонувати як варіанти
   * автодоповнення. */
  meta: MetaTable;
}

/**
 * Розбирає `queryText` і резолвить `prefixChain` (`prefixChain[0]` — псевдонім
 * джерела, решта — вже НАБРАНИЙ шлях по полях-посиланнях ДО сегмента, що зараз
 * вводиться, — див. `findChainForCompletion`) до таблиці метаданих, чиї поля
 * треба запропонувати. `undefined` — fail-open (unknown != invalid): псевдонім
 * не знайдено, метаданих немає, або шлях не резолвиться до кінця (частину
 * ланцюжка не вдалося пройти) — пропонувати ВГАДАНІ варіанти тут гірше, ніж не
 * запропонувати нічого.
 */
export function resolveCompletionTarget(
  queryText: string,
  resolver: MetadataResolver,
  prefixChain: string[]
): CompletionTarget | undefined {
  if (prefixChain.length === 0) return undefined;
  const found = findAliasTable(queryText, resolver, prefixChain[0]);
  if (!found || !found.meta) return undefined;

  if (prefixChain.length === 1) return { meta: found.meta };

  const resolution = resolveFieldPath(found.meta, prefixChain.slice(1), resolver);
  if (resolution.unresolvedTail.length > 0) return undefined;
  const last = resolution.resolved[resolution.resolved.length - 1];
  if (!last || last.kind !== 'reference' || !last.refTarget) return undefined;
  return { meta: last.refTarget };
}
