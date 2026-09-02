import { tokenize } from './sdblLexer';
import type { Token } from './sdblLexer';

/**
 * Однословные секции верхнего уровня — перед каждой всегда перенос строки (глубина 0).
 * ИТОГИ/ОБЪЕДИНИТЬ/соединения (ЛЕВОЕ/ПРАВОЕ/…СОЕДИНЕНИЕ) в v1 НЕ включены: их разбор
 * (тело ИТОГИ до своего ПО, многословные соединения, вложенные ПО) заметно сложнее и
 * рискованнее сделать правильно лексическим проходом без построения модели — design-док
 * явно допускает не покрывать всё сразу («не роздувати задачу»). Такие тексты форматер
 * просто не трогает начиная с первого нераспознанного места — это БЕЗОПАСНО (не меняет
 * семантику), просто менее красиво для них, чем для типового ВЫБРАТЬ/ИЗ/ГДЕ.
 */
const CLAUSE_KEYWORDS = new Set(['ВЫБРАТЬ', 'ИЗ', 'ГДЕ', 'ИМЕЮЩИЕ', 'ПОМЕСТИТЬ', 'ДОБАВИТЬ', 'УНИЧТОЖИТЬ']);

/** Первое слово двухсловных секций-списков (`СГРУППИРОВАТЬ ПО …`, `УПОРЯДОЧИТЬ ПО …») —
 * второе слово ПО остаётся на той же строке, что и первое (`СГРУППИРОВАТЬ`). */
const TWO_WORD_LIST_CLAUSES = new Set(['СГРУППИРОВАТЬ', 'УПОРЯДОЧИТЬ']);

/** Секции, чьи элементы через запятую переносятся по одному на строку (с отступом). */
const LIST_CLAUSES = new Set(['ВЫБРАТЬ', 'СГРУППИРОВАТЬ', 'УПОРЯДОЧИТЬ']);

function isKw(t: Token, value: string): boolean {
  return t.type === 'keyword' && t.value === value;
}

/**
 * Лексический pretty-printer текста запроса — ТОЛЬКО whitespace/переносы строк между
 * уже готовыми токенами, без построения `QueryModel` (design-док, риск п.0.4: пайплайн
 * `parseBatch`/`generateBatch` безусловно квалифицирует «голые» ссылки на поля псевдонимом
 * источника ДАЖЕ БЕЗ резолвера метаданных при единственном источнике — проверено прямым
 * запуском, `Код` → `Валюты.Код` — то есть меняет напечатанный текст сверх пробелов, что
 * явно запрещено этим требованием). Значения/написание токенов здесь никогда не меняются —
 * семантика гарантированно сохраняется структурно, а не только «по тестам».
 *
 * Переносит на новую строку (глубина скобок 0, т.е. НЕ внутри вложенных подзапросов/
 * аргументов функций/скобок виртуальной таблицы — там всё остаётся как написал пользователь):
 * каждую секцию верхнего уровня (`CLAUSE_KEYWORDS`/`TWO_WORD_LIST_CLAUSES`) — с отступом 0;
 * каждый элемент списка после запятой в `ВЫБРАТЬ`/`СГРУППИРОВАТЬ ПО`/`УПОРЯДОЧИТЬ ПО` —
 * с отступом 1 уровень (таб). Всё остальное — исходный интервал между токенами копируется
 * дословно (в т.ч. отступы внутри условий/соединений/подзапросов — v1 их не трогает).
 *
 * Невалидный текст (не токенизируется) возвращает как есть — форматирование не обязано
 * работать на неразобираемом тексте, но и не должно на нём падать.
 */
export function formatQueryText(text: string): string {
  let tokens: Token[];
  try {
    tokens = tokenize(text, { comments: true });
  } catch {
    return text;
  }
  if (tokens.length === 0) return text;

  let out = '';
  let depth = 0;
  let listClauseActive = false;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const prev: Token | undefined = tokens[i - 1];
    const isClauseStart = depth === 0 && t.type === 'keyword' && CLAUSE_KEYWORDS.has(t.value);
    const isTwoWordClauseStart = depth === 0 && t.type === 'keyword' && TWO_WORD_LIST_CLAUSES.has(t.value);

    // Состояние «мы сейчас внутри списка через запятую» обновляем независимо от prev —
    // нужно и для самого первого токена, если запрос начинается с ВЫБРАТЬ (обычный случай).
    if (isClauseStart || isTwoWordClauseStart) {
      listClauseActive = LIST_CLAUSES.has(t.value);
    }

    let sep: string | null = null;
    if (prev) {
      if (isClauseStart || isTwoWordClauseStart) {
        sep = '\n';
      } else if (depth === 0 && CLAUSE_KEYWORDS.has(prev.value) && prev.type === 'keyword') {
        sep = '\n\t';
      } else if (depth === 0 && TWO_WORD_LIST_CLAUSES.has(prev.value) && prev.type === 'keyword' && isKw(t, 'ПО')) {
        sep = ' ';
      } else if (
        depth === 0 && isKw(prev, 'ПО') && i >= 2 && TWO_WORD_LIST_CLAUSES.has(tokens[i - 2].value) && tokens[i - 2].type === 'keyword'
      ) {
        sep = '\n\t';
      } else if (depth === 0 && listClauseActive && prev.type === 'punct' && prev.value === ',') {
        sep = '\n\t';
      }
    }

    if (sep != null) {
      out += sep;
    } else if (prev) {
      out += text.slice(prev.pos + prev.text.length, t.pos);
    }
    out += t.text;

    if (t.type === 'punct' && t.value === '(') depth++;
    else if (t.type === 'punct' && t.value === ')') depth = Math.max(0, depth - 1);
  }

  return out;
}
