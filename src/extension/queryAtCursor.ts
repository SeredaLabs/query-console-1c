/**
 * Чистый помощник для команды расширения «открыть запрос под курсором»: находит
 * строковый литерал запроса 1С в исходнике `.bsl` по символьному смещению курсора.
 *
 * Лексические правила совпадают с `extractQueryStrings` (src/cli/extractQueries.ts):
 * экранирование `""`, продолжения `|`, пропуск комментариев `//` и литералов дат
 * `'…'`. В отличие от него, здесь дополнительно отслеживаются символьные смещения
 * открывающей/закрывающей кавычек, чтобы команда могла заменить литерал при сохранении.
 *
 * Модуль ДОЛЖЕН оставаться чистым (без `import vscode`/`fs`) — он юнит-тестируется.
 * Привязка к команде vscode — отдельная задача (6.6.B).
 */

export interface QueryHit {
  /** Восстановленный (de-piped) текст запроса — то, что передаётся в `parseBatch`. */
  text: string;
  /** Смещение открывающей кавычки. */
  start: number;
  /** Смещение за закрывающей кавычкой: `[start, end)` охватывает кавычки литерала. */
  end: number;
}

const QUERY_KEYWORDS = ['ВЫБРАТЬ', 'УНИЧТОЖИТЬ'];

/**
 * Снимает ведущую «тривию» — пробелы (включая BOM) И строки-комментарии `//…` — до
 * первого значимого токена. 1С открывает конструктором запрос, начинающийся с
 * комментария (`// …` перед ВЫБРАТЬ), поэтому распознавание ключевого слова не должно
 * спотыкаться о ведущие комментарии (фаза 8.1).
 */
function stripLeadingTrivia(text: string): string {
  let s = text;
  for (;;) {
    const before = s;
    s = s.replace(/^[\s﻿]+/, '');
    if (s.startsWith('//')) {
      const nl = s.indexOf('\n');
      s = nl === -1 ? '' : s.slice(nl + 1);
    }
    if (s === before) break;
  }
  return s;
}

function startsWithQueryKeyword(text: string): boolean {
  const trimmed = stripLeadingTrivia(text);
  const upper = trimmed.toUpperCase();
  return QUERY_KEYWORDS.some((kw) => {
    if (!upper.startsWith(kw)) return false;
    const next = trimmed.charAt(kw.length);
    return next === '' || !/[\p{L}\p{N}_]/u.test(next);
  });
}

/**
 * Восстанавливает текст запроса из тела BSL-литерала: убирает ведущие пробелы и
 * символ `|` на строках-продолжениях (инверсия formatAsBslString).
 */
function unpipe(rawBody: string): string {
  const lines = rawBody.split('\n');
  return lines
    .map((line, i) => {
      if (i === 0) return line;
      const m = line.match(/^[ \t]*\|/);
      return m ? line.slice(m[0].length) : line;
    })
    .join('\n');
}

/**
 * Сканирует `source` и возвращает ВСЕ строковые литералы-запросы (в порядке
 * появления) с их восстановленным текстом и границами `[openQuotePos, closeQuotePos+1)`.
 */
export function findAllQueryLiterals(source: string): QueryHit[] {
  const hits: QueryHit[] = [];
  const n = source.length;
  let i = 0;

  while (i < n) {
    const ch = source[i];

    // Комментарий до конца строки.
    if (ch === '/' && source[i + 1] === '/') {
      while (i < n && source[i] !== '\n') i++;
      continue;
    }

    // Литерал даты в одинарных кавычках — пропускаем целиком.
    if (ch === "'") {
      i++;
      while (i < n && source[i] !== "'" && source[i] !== '\n') i++;
      if (i < n && source[i] === "'") i++;
      continue;
    }

    // Строковый литерал в двойных кавычках.
    if (ch === '"') {
      const openPos = i;
      i++; // пропускаем открывающую кавычку
      let raw = '';
      let closePos = -1;
      while (i < n) {
        const c = source[i];
        if (c === '"') {
          if (source[i + 1] === '"') {
            raw += '"';
            i += 2;
            continue;
          }
          closePos = i;
          i++; // пропускаем закрывающую кавычку
          break;
        }
        raw += c;
        i++;
      }
      const text = unpipe(raw);
      if (startsWithQueryKeyword(text)) {
        // Конец диапазона — за закрывающей кавычкой (или за концом строки, если её нет).
        const endExclusive = closePos === -1 ? n : closePos + 1;
        hits.push({ text, start: openPos, end: endExclusive });
      }
      continue;
    }

    i++;
  }

  return hits;
}

/**
 * Находит диапазон ключевого слова запроса (`ВЫБРАТЬ`/`УНИЧТОЖИТЬ`) в СЫРОМ
 * документе для уже найденного `hit` — в отличие от `hit.text` (де-пайпленного, со
 * схлопнутыми `""`), здесь смещения считаются напрямую по `source`, поэтому годятся
 * для `document.positionAt` без пересчёта.
 *
 * Сначала находим индекс ключевого слова В `hit.text` — тем же критерием
 * (`stripLeadingTrivia`/`startsWithQueryKeyword`), которым уже отобран этот hit,
 * так что совпадение гарантировано. Затем переводим этот индекс в (номер строки,
 * колонка) — ключевое слово не может пересекать перевод строки — и находим сырое
 * смещение начала ЭТОЙ ЖЕ строки в исходном документе: `unpipe` не добавляет и не
 * убирает переводы строк (только обрезает `[ \t]*\|`-префикс на строках-
 * продолжениях), поэтому номера строк в `hit.text` и в сыром `source` совпадают.
 * Единственное намеренное упрощение — экранированная `""` до самого ключевого
 * слова на той же строке сдвинула бы колонку (в `hit.text` она уже схлопнута в
 * одну кавычку); на практике запрос не начинается с кавычки внутри строки, так что
 * это не встречается. Если по любой причине разбор не сошёлся — `undefined`
 * (fail-open: диагностика для этого литерала просто не строится, вместо неверного
 * диапазона).
 */
export function findQueryKeywordRange(source: string, hit: QueryHit): { start: number; end: number } | undefined {
  let rest = hit.text;
  let consumed = 0;
  for (;;) {
    const before = rest;
    const leading = rest.match(/^[\s﻿]+/);
    if (leading) {
      rest = rest.slice(leading[0].length);
      consumed += leading[0].length;
    }
    if (rest.startsWith('//')) {
      const nl = rest.indexOf('\n');
      const cut = nl === -1 ? rest.length : nl + 1;
      rest = rest.slice(cut);
      consumed += cut;
    }
    if (rest === before) break;
  }
  const upper = rest.toUpperCase();
  const kw = QUERY_KEYWORDS.find((k) => {
    if (!upper.startsWith(k)) return false;
    const next = rest.charAt(k.length);
    return next === '' || !/[\p{L}\p{N}_]/u.test(next);
  });
  if (!kw) return undefined;

  const beforeKeyword = hit.text.slice(0, consumed);
  const lineNumber = (beforeKeyword.match(/\n/g) ?? []).length;
  const col = consumed - (beforeKeyword.lastIndexOf('\n') + 1);

  const bodyStart = hit.start + 1; // пропускаем открывающую кавычку
  const limit = hit.end > hit.start && source[hit.end - 1] === '"' ? hit.end - 1 : hit.end;
  let rawLineStart = bodyStart;
  for (let n = 0; n < lineNumber; n++) {
    const nl = source.indexOf('\n', rawLineStart);
    if (nl === -1 || nl >= limit) return undefined;
    rawLineStart = nl + 1;
  }
  if (lineNumber > 0) {
    const prefix = source.slice(rawLineStart, limit).match(/^[ \t]*\|/);
    if (prefix) rawLineStart += prefix[0].length;
  }

  const start = rawLineStart + col;
  return { start, end: start + kw.length };
}

/**
 * Находит среди `findAllQueryLiterals(source)` литерал, в чьих границах кавычек
 * (включительно) лежит `offset`. Если такого литерала нет — `null`.
 */
export function findQueryAt(source: string, offset: number): QueryHit | null {
  return findAllQueryLiterals(source).find((hit) => offset >= hit.start && offset < hit.end) ?? null;
}
