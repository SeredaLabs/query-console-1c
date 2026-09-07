/**
 * Чистый помощник для hover по полю запроса (`Alias.Field[.Field…]`) в исходнике
 * `.bsl` — semantic-core hardening, hover-шаг. Находит цепочку идентификаторов вокруг
 * позиции курсора (по СЫРОМУ тексту литерала запроса, тем же смещениям, что уже
 * даёт `queryAtCursor.ts`) и, если её голова — известный псевдоним источника,
 * описывает конкретный наведённый сегмент через `resolveFieldPath`.
 *
 * Модуль ДОЛЖЕН оставаться чистым (без `import vscode`) — как и `queryAtCursor.ts`;
 * связка с `vscode.HoverProvider` — отдельный файл `queryHoverProvider.ts`.
 *
 * ИЗВЕСТНОЕ УПРОЩЕНИЕ (документировано, не скрыто): псевдоним ищется по ВСЕМ
 * таблицам пакета сразу (все участники объединения, все подзапросы), первое
 * совпадение побеждает — без построения полноценного дерева областей видимости
 * (полный Scope, который специально НЕ строился в рамках этого шага — см.
 * Architecture Report). На практике псевдонимы почти всегда уникальны в пределах
 * всего пакета, поэтому это даёт верный результат в подавляющем большинстве
 * случаев; в редком случае двух подзапросов с ОДНИМ и тем же псевдонимом hover
 * может показать не тот источник — не более того (advisory-информация, не влияет
 * на Apply/round-trip).
 */
import { parseBatch } from '../core/query/sdblParser';
import type { BatchDocument, } from '../core/query/batchModel';
import type { QueryDocument } from '../core/query/unionModel';
import type { QueryModel, SelectedTable } from '../core/query/queryModel';
import { defaultTableAlias } from '../core/query/queryModel';
import type { MetadataResolver } from '../core/query/metadataResolver';
import { resolveFieldPath, type FieldPathResolution } from '../core/query/fieldPathResolver';

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

function collectAllTables(doc: BatchDocument): SelectedTable[] {
  const out: SelectedTable[] = [];
  const walkModel = (model: QueryModel): void => {
    for (const t of model.tables) {
      out.push(t);
      if (t.subquery) walkDocument(t.subquery);
    }
  };
  const walkDocument = (qdoc: QueryDocument): void => {
    for (const member of qdoc.members) walkModel(member.model);
  };
  for (const member of doc.members) walkDocument(member);
  return out;
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
  let doc: BatchDocument;
  try {
    doc = parseBatch(queryText, resolver);
  } catch {
    return {};
  }

  const head = chain[0].toUpperCase();
  const table = collectAllTables(doc).find(t => defaultTableAlias(t).toUpperCase() === head);
  if (!table || table.subquery || !table.fullName || table.fullName.startsWith('&')) return {};

  const meta = resolver.tableByFullName(table.fullName);
  if (!meta) return { tableFullName: table.fullName };

  if (chain.length === 1) return { tableFullName: meta.fullName };
  return { tableFullName: meta.fullName, resolution: resolveFieldPath(meta, chain.slice(1), resolver) };
}
