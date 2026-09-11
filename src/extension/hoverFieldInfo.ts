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
 * Phase 3d/3e (semantic-core roadmap, memory: project-semantic-core-roadmap):
 * both `describeChain` (hover) and `resolveCompletionTarget` (autocomplete)
 * resolve the chain's HEAD alias via `resolveHeadTable`, which prefers
 * `resolveAliasAt` (position-aware — respects real JOIN-condition scoping and
 * nearest-ancestor subquery correlation, live-verified against real 1C) over
 * the OLD flat, whole-batch, first-match `findAliasTable`. Per this roadmap's
 * shadow-mode sweep (see `shadowMode.ts`) and an explicit product decision: a
 * non-`'resolved'` outcome (`'unknown'`/`'ambiguous'`) at a real, in-scope
 * position means NO answer for that alias — deliberately NOT falling back to
 * the old flat lookup, since doing so risked resurrecting confidently-WRONG
 * answers in exactly the cases (e.g. a right-nested JOIN's own inner
 * condition) this roadmap exists to fix. The old flat lookup is still used —
 * not as a "fallback on uncertainty", but because `resolveAliasAt` has no
 * data to work with at all: a `'recovered'`/`'unavailable'` snapshot (broken
 * SELECT list — the exact v0.1.33 regression class) carries no
 * `sourceMapEvents`, and neither does a `headPosition` translation failure.
 */
import type { MetadataResolver } from '../core/query/metadataResolver';
import type { MetaTable } from '../core/metadata/types';
import type { SelectedTable } from '../core/query/queryModel';
import { resolveFieldPath, type FieldPathResolution } from '../core/query/fieldPathResolver';
import { findAliasTable } from '../core/query/findAliasTable';
import { buildSemanticSnapshotFromText } from '../core/semantic/buildSemanticSnapshot';
import { resolveAliasAt } from '../core/semantic/resolveAliasAt';
import { resolveSymbolTable } from '../core/semantic/collectSymbols';

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
 * Несе ті самі `[start, end)` офсети, що й `findChainAt` (Phase 3e: перший
 * сегмент — голова-псевдонім — потрібен `rawOffsetToQueryTextOffset`, щоб
 * передати позицію в `resolveCompletionTarget`).
 *
 * `null`, якщо курсор не стоїть одразу після крапки, перед якою йде відомий
 * ланцюжок ідентифікаторів (наприклад, курсор на початку файлу чи після
 * пробілу/оператора без попередньої крапки) — тоді доповнювати нічого.
 */
export function findChainForCompletion(text: string, offset: number): FieldChainSegment[] | null {
  if (offset < 0 || offset > text.length) return null;

  // Пропускаємо назад символи вже набраного (можливо порожнього) сегмента —
  // саме він буде відфільтрований VS Code, у результат не входить.
  let cur = offset;
  while (cur > 0 && isWordChar(text[cur - 1])) cur--;
  if (cur === 0 || text[cur - 1] !== '.') return null;
  cur--; // "з'їдаємо" крапку перед сегментом, що вводиться

  const segments: FieldChainSegment[] = [];
  for (;;) {
    if (cur === 0 || !isWordChar(text[cur - 1])) break;
    const segEnd = cur;
    let segStart = segEnd;
    while (segStart > 0 && isWordChar(text[segStart - 1])) segStart--;
    segments.unshift({ text: text.slice(segStart, segEnd), start: segStart, end: segEnd });
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
 * Резолвить ГОЛОВУ ланцюжка (`alias`) до її таблиці — спільне ядро для
 * `describeChain` і `resolveCompletionTarget` (Phase 3d/3e).
 *
 * Коли `queryText` дає `completeness === 'complete'` снепшот (звичайний,
 * повністю розбираний запит) І `headPosition` відомий — резолвить позиційно-
 * усвідомлений `resolveAliasAt`; будь-який результат, крім `'resolved'`
 * (`'unknown'`/`'ambiguous'`), означає `undefined` — свідоме продуктове
 * рішення НЕ підстраховуватись старим плоским пошуком у цьому випадку, бо це
 * ризикувало б повернути підтверджено НЕПРАВИЛЬНУ відповідь саме в тих
 * випадках (право-вкладений JOIN тощо), заради яких цей резолвер і будувався.
 *
 * Інакше (снепшот `'recovered'`/`'unavailable'`, або `headPosition` невідомий) —
 * `resolveAliasAt` тут принципово безпорадний: у "recovered" моделі ЗОВСІМ немає
 * `sourceMapEvents` (репарація зсуває офсети — див. `SemanticSnapshot.
 * sourceMapEvents`'ів власний doc), а курсор при зламаному SELECT-списку якраз і
 * стоїть УСЕРЕДИНІ того, що repair замінив плейсхолдером. Тому тут — той самий
 * старий плоский `findAliasTable` (позиційно-сліпий), що й завжди захищав від
 * реального продакшн-регресу v0.1.33 (пропущена кома ламала весь SELECT).
 */
function resolveHeadTable(
  queryText: string,
  resolver: MetadataResolver,
  alias: string,
  headPosition: number | undefined,
): { table: SelectedTable; meta: MetaTable | undefined } | undefined {
  const snapshot = buildSemanticSnapshotFromText(1, queryText, resolver);
  if (snapshot.completeness === 'complete' && headPosition !== undefined) {
    const resolution = resolveAliasAt(snapshot, headPosition, alias);
    if (resolution.kind !== 'resolved') return undefined;
    const table = resolveSymbolTable(snapshot.model, resolution.value.ref.path);
    // Те саме, що й стара findAliasTable: підзапит (fullName === '') і
    // параметр-джерело (`&Имя`) — не справжня таблиця метаданих, unknown.
    if (!table || !table.fullName || table.fullName.startsWith('&')) return undefined;
    return { table, meta: resolver.tableByFullName(table.fullName) };
  }

  return findAliasTable(queryText, resolver, alias);
}

function describeViaTable(
  table: { fullName: string },
  meta: MetaTable | undefined,
  chain: string[],
  resolver: MetadataResolver,
): ChainDescription {
  if (!meta) return { tableFullName: table.fullName };
  if (chain.length === 1) return { tableFullName: meta.fullName };
  return { tableFullName: meta.fullName, resolution: resolveFieldPath(meta, chain.slice(1), resolver) };
}

/**
 * Разбирает `queryText` (уже реконструированный из BSL-литерала, БЕЗ `|`-префиксов
 * — см. `queryAtCursor.ts`'s `unpipe`) и описывает `chain` (текстовые сегменты,
 * `chain[0]` — предполагаемый псевдоним источника).
 *
 * `headPosition` — смещение головы `chain[0]` В КООРДИНАТАХ `queryText` (не
 * сырого документа — см. `queryAtCursor.ts`'s `rawOffsetToQueryTextOffset` для
 * перевода).
 */
export function describeChain(
  queryText: string,
  resolver: MetadataResolver,
  chain: string[],
  headPosition: number | undefined,
): ChainDescription {
  if (chain.length === 0) return {};
  const found = resolveHeadTable(queryText, resolver, chain[0], headPosition);
  if (!found) return {};
  return describeViaTable(found.table, found.meta, chain, resolver);
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
 *
 * `headPosition` — те саме, що й у `describeChain` (Phase 3e): офсет голови
 * `prefixChain[0]` У КООРДИНАТАХ `queryText`, для позиційно-усвідомленого
 * `resolveAliasAt` через спільний `resolveHeadTable`.
 */
export function resolveCompletionTarget(
  queryText: string,
  resolver: MetadataResolver,
  prefixChain: string[],
  headPosition: number | undefined,
): CompletionTarget | undefined {
  if (prefixChain.length === 0) return undefined;
  const found = resolveHeadTable(queryText, resolver, prefixChain[0], headPosition);
  if (!found || !found.meta) return undefined;

  if (prefixChain.length === 1) return { meta: found.meta };

  const resolution = resolveFieldPath(found.meta, prefixChain.slice(1), resolver);
  if (resolution.unresolvedTail.length > 0) return undefined;
  const last = resolution.resolved[resolution.resolved.length - 1];
  if (!last || last.kind !== 'reference' || !last.refTarget) return undefined;
  return { meta: last.refTarget };
}
