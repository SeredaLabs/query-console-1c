import { FUNCTION_CATALOG, type FunctionGroup, type FunctionLeaf } from '../core/query/functionCatalog';

export type HighlightTokenType = 'plain' | 'keyword' | 'function' | 'string' | 'date' | 'number' | 'param' | 'comment';

export interface HighlightSegment {
  type: HighlightTokenType;
  text: string;
}

/**
 * Ключевые слова языка запросов для подсветки. Отдельный от `sdblLexer`
 * список: тот лексер обслуживает разбор реального текста (round-trip модели)
 * и любое расширение его набора ключевых слов меняет поведение парсера.
 * Здесь же подсветка чисто косметическая и не обязана бить один-в-один с
 * грамматикой — переносим более широкий, привычный по 1С набор слов.
 */
const KEYWORDS = new Set([
  'ВЫБРАТЬ', 'РАЗРЕШЕННЫЕ', 'РАЗЛИЧНЫЕ', 'ПЕРВЫЕ', 'ИЗ', 'КАК', 'ГДЕ',
  'И', 'ИЛИ', 'НЕ', 'В', 'ИЕРАРХИИ', 'МЕЖДУ', 'ПОДОБНО', 'ЕСТЬ', 'NULL',
  'СОЕДИНЕНИЕ', 'ВНУТРЕННЕЕ', 'ЛЕВОЕ', 'ПРАВОЕ', 'ПОЛНОЕ', 'ПО',
  'СГРУППИРОВАТЬ', 'ГРУППИРУЮЩИМ', 'НАБОРАМ', 'ИМЕЮЩИЕ',
  'ПОМЕСТИТЬ', 'ДОБАВИТЬ', 'УНИЧТОЖИТЬ', 'УПОРЯДОЧИТЬ', 'УБЫВ', 'ВОЗР',
  'АВТОУПОРЯДОЧИВАНИЕ', 'ИТОГИ', 'ОБЩИЕ', 'ИЕРАРХИЯ', 'ТОЛЬКО', 'ПЕРИОДАМИ',
  'ИНДЕКСИРОВАТЬ', 'УНИКАЛЬНО', 'ДЛЯ', 'ИЗМЕНЕНИЯ', 'ОБЪЕДИНИТЬ', 'ВСЕ',
  'ССЫЛКА', 'ВЫБОР', 'КОГДА', 'ТОГДА', 'ИНАЧЕ', 'КОНЕЦ',
]);

/** Имена функций (СТРОКА, ГОД, ВЫРАЗИТЬ, ...), извлечённые из каталога функций конструктора. */
function buildFunctionNames(): Set<string> {
  const names = new Set<string>();
  function walk(node: FunctionGroup | FunctionLeaf): void {
    if ('template' in node) {
      const head = node.label.split(/[\s(]/)[0];
      if (/^[A-Za-zА-Яа-яЁё_][A-Za-zА-Яа-яЁё0-9_]*$/.test(head)) names.add(head.toUpperCase());
    } else {
      node.children.forEach(walk);
    }
  }
  walk(FUNCTION_CATALOG);
  return names;
}

const FUNCTION_NAMES = buildFunctionNames();

const TOKEN_RE = /\/\/[^\n]*|"(?:[^"]|"")*"|'[^']*'|&[A-Za-zА-Яа-яЁё_][A-Za-zА-Яа-яЁё0-9_]*|\d+(?:\.\d+)?|#?[A-Za-zА-Яа-яЁё_][A-Za-zА-Яа-яЁё0-9_]*/gu;

/**
 * Разбивает текст запроса/выражения на сегменты для подсветки. Никогда не
 * бросает исключение — рассчитан на текст в процессе набора (может быть
 * синтаксически неполным), поэтому не пытается строго парсить грамматику,
 * а лишь классифицирует лексемы по внешнему виду.
 */
export function highlightSegments(text: string): HighlightSegment[] {
  const segments: HighlightSegment[] = [];
  let last = 0;
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(text))) {
    if (m.index > last) segments.push({ type: 'plain', text: text.slice(last, m.index) });
    const raw = m[0];
    segments.push({ type: classify(raw, text, TOKEN_RE.lastIndex), text: raw });
    last = TOKEN_RE.lastIndex;
  }
  if (last < text.length) segments.push({ type: 'plain', text: text.slice(last) });
  return segments;
}

function classify(raw: string, fullText: string, endPos: number): HighlightTokenType {
  const first = raw[0];
  if (first === '/') return 'comment';
  if (first === '"') return 'string';
  if (first === "'") return 'date';
  if (first === '&') return 'param';
  if (first >= '0' && first <= '9') return 'number';

  const upper = raw.toUpperCase();
  if (KEYWORDS.has(upper)) return 'keyword';
  if (FUNCTION_NAMES.has(upper)) return 'function';

  // Généric: identifier immediately followed by "(" — treat as a function call
  // even when it isn't in the catalog (custom/unknown functions still read better colored).
  let i = endPos;
  while (i < fullText.length && (fullText[i] === ' ' || fullText[i] === '\t')) i++;
  if (fullText[i] === '(') return 'function';

  return 'plain';
}
