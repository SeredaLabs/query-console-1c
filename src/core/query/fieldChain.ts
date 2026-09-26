/**
 * Пошук ланцюжка ідентифікаторів `<голова>.<сегмент>…` навколо позиції в тексті —
 * чисті текстові помічники без метаданих. Спільні для hover/completion у `.bsl`
 * (`src/extension/hoverFieldInfo.ts` реекспортує їх) і для редактора довільних
 * виразів Classic webview (який не може імпортувати `src/extension`).
 */

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

  // `&Параметр`: the SDBL lexer's own 'param' token is '&' immediately
  // followed by the name — `findChainAt` itself works on raw characters, not
  // lexer tokens, so it happily finds "Параметр" as a head segment when the
  // cursor sits on those letters, indistinguishable from a real alias/field
  // reference of the same spelling. Without this guard, every caller
  // (alias/field hover, virtual-table condition-field hover) could
  // confidently resolve a PARAMETER reference to an unrelated real alias or
  // field that happens to share its name — exactly the "confidently wrong"
  // class of bug this whole roadmap exists to avoid. No chain here at all is
  // the correct fail-open answer (Phase 2x-3, not started, is where a real
  // parameter-aware resolution would eventually live).
  if (segments[0].start > 0 && text[segments[0].start - 1] === '&') return null;

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

  if (segments.length === 0) return null;
  // Same `&Параметр` guard as `findChainAt` — see its comment.
  if (segments[0].start > 0 && text[segments[0].start - 1] === '&') return null;
  return segments;
}
