/**
 * C2 slice 4: the Designer writes an English query in Russian, as the 1C Designer
 * does. The query text is translated before it is opened, so the parser, the
 * expression formatter and the generator see the Russian form they already handle
 * (platform canonical texts: test/fixtures/platform/c2-english.json).
 *
 * Only words are translated, never names: an alias after `КАК`/`AS`, a segment
 * after `.`, a path head before `.`, a temp table name and everything inside
 * `ЗНАЧЕНИЕ(…)`/`ТИП(…)` (the platform keeps those as written) stay as typed. A
 * contextual word is translated only where it cannot be a name: a function name
 * before `(`, a type inside `ВЫРАЗИТЬ(… КАК <тип>)`, a period word as an argument
 * of a period function. Sources (`Catalog.X`) are left to the parser, which stores
 * them under the Russian name.
 *
 * The translation is kept only when both texts parse and their models have the
 * same names and the same expressions up to the language; otherwise the text is
 * opened as written (the platform accepts that mixed text too).
 */
import { tryTokenize, type Token } from './sdblLexer';
import { ENGLISH_KEYWORDS, ENGLISH_METADATA_KINDS, ENGLISH_WORDS, canonicalMetadataKind } from './sdblEnglish';
import { tryParseBatch } from './validateBatch';

/** English function names → Russian (platform canonical, c2-english.json). */
const ENGLISH_FUNCTIONS: ReadonlyMap<string, string> = new Map([
  ['ISNULL', 'ЕСТЬNULL'], ['SUBSTRING', 'ПОДСТРОКА'], ['VALUETYPE', 'ТИПЗНАЧЕНИЯ'], ['DATETIME', 'ДАТАВРЕМЯ'],
  ['DATEADD', 'ДОБАВИТЬКДАТЕ'], ['DATEDIFF', 'РАЗНОСТЬДАТ'], ['BEGINOFPERIOD', 'НАЧАЛОПЕРИОДА'], ['ENDOFPERIOD', 'КОНЕЦПЕРИОДА'],
  ['YEAR', 'ГОД'], ['QUARTER', 'КВАРТАЛ'], ['MONTH', 'МЕСЯЦ'], ['DAYOFYEAR', 'ДЕНЬГОДА'], ['DAY', 'ДЕНЬ'],
  ['WEEK', 'НЕДЕЛЯ'], ['WEEKDAY', 'ДЕНЬНЕДЕЛИ'], ['HOUR', 'ЧАС'], ['MINUTE', 'МИНУТА'], ['SECOND', 'СЕКУНДА'],
  ['PRESENTATION', 'ПРЕДСТАВЛЕНИЕ'], ['REFPRESENTATION', 'ПРЕДСТАВЛЕНИЕССЫЛКИ'],
  ['VALUE', 'ЗНАЧЕНИЕ'], ['TYPE', 'ТИП'], ['CAST', 'ВЫРАЗИТЬ'],
]);

/** Contextual words that are reserved on the platform (never a name), translated anywhere but a name position. */
const STRUCTURAL = new Set(['NOT', 'OR', 'IS', 'ESCAPE', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'TRUE', 'FALSE', 'UNDEFINED', 'ASC', 'OUTER', 'REFS']);
const PRIMITIVE_TYPES = new Set(['STRING', 'NUMBER', 'DATE', 'BOOLEAN']);
const PERIOD_WORDS = new Set(['YEAR', 'HALFYEAR', 'QUARTER', 'MONTH', 'TENDAYS', 'WEEK', 'DAY', 'HOUR', 'MINUTE', 'SECOND']);
/** Calls whose arguments may be period words (Russian names, after translation). */
const PERIOD_CALLS = new Set(['ДОБАВИТЬКДАТЕ', 'РАЗНОСТЬДАТ', 'НАЧАЛОПЕРИОДА', 'КОНЕЦПЕРИОДА', 'ПЕРИОДАМИ']);
/** Keywords after which a name follows. */
const NAME_AFTER = new Set(['КАК', 'ПОМЕСТИТЬ', 'УНИЧТОЖИТЬ']);

const isPunct = (t: Token | undefined, v: string): boolean => t?.type === 'punct' && t.value === v;

/** Russian spelling of `t` at this position, or `undefined` to keep it. */
function translateToken(tokens: Token[], i: number, frame: Frame | undefined): string | undefined {
  const t = tokens[i];
  if (t.type !== 'keyword' && t.type !== 'ident') return undefined;
  const prev = tokens[i - 1];
  const next = tokens[i + 1];
  const up = t.text.toUpperCase();
  if (isPunct(prev, '.')) return undefined; // a path segment is a name
  if (isPunct(next, '.')) {
    // A path head is a name, except the metadata kind of a type (`ССЫЛКА Catalog.X`,
    // `ВЫРАЗИТЬ(… КАК Catalog.X)`), which the platform prints in Russian.
    if (t.type === 'ident' && (isAfterRefs(prev) || (frame?.castType && isAfterAs(prev)))) {
      const kind = canonicalMetadataKind(t.text);
      return kind !== t.text ? kind : undefined;
    }
    return undefined;
  }
  if (prev && prev.type === 'keyword' && NAME_AFTER.has(prev.value) && !(frame?.castType && prev.value === 'КАК')) return undefined;
  if (t.type === 'keyword') {
    if (up === t.value) return undefined; // already Russian
    if (t.value === 'ИЕРАРХИЯ' && prev?.type === 'keyword' && prev.value === 'В') return 'ИЕРАРХИИ';
    return t.value;
  }
  // A type of ВЫРАЗИТЬ, also with its qualifiers: `STRING(10)`.
  if (PRIMITIVE_TYPES.has(up) && frame?.castType && isAfterAs(prev)) return ENGLISH_WORDS.get(up)![0];
  if (STRUCTURAL.has(up)) return ENGLISH_WORDS.get(up)![0]; // also before `(`: `NOT (…)`
  if (isPunct(next, '(')) return ENGLISH_FUNCTIONS.get(up) ?? (up === 'PERIODS' ? 'ПЕРИОДАМИ' : undefined);
  if (PERIOD_WORDS.has(up) && frame && PERIOD_CALLS.has(frame.call) && (isPunct(prev, ',') || isPunct(prev, '(')) &&
      (isPunct(next, ',') || isPunct(next, ')'))) {
    return ENGLISH_WORDS.get(up)![0];
  }
  return undefined;
}

const isAfterAs = (t: Token | undefined): boolean => t?.type === 'keyword' && t.value === 'КАК';
const isAfterRefs = (t: Token | undefined): boolean => t?.type === 'ident' && ['REFS', 'ССЫЛКА'].includes(t.text.toUpperCase());

/** An open parenthesis: the call it belongs to (Russian name) and whether it is ВЫРАЗИТЬ. */
interface Frame { call: string; castType: boolean; opaque: boolean }

/** The text with English words in Russian (unchecked), or `undefined` when nothing changes or it cannot be lexed. */
export function translateEnglishWords(text: string): string | undefined {
  const tokens = tryTokenize(text, { comments: true })?.filter(t => t.type !== 'comment' && t.type !== 'eof');
  if (!tokens) return undefined;
  const edits: Array<{ pos: number; len: number; text: string }> = [];
  const stack: Frame[] = [];
  const spelled: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const frame = stack[stack.length - 1];
    if (isPunct(t, '(')) {
      const head = spelled[i - 1] ?? '';
      stack.push({ call: head, castType: head === 'ВЫРАЗИТЬ', opaque: (frame?.opaque ?? false) || head === 'ЗНАЧЕНИЕ' || head === 'ТИП' });
      spelled[i] = '(';
      continue;
    }
    if (isPunct(t, ')')) { stack.pop(); spelled[i] = ')'; continue; }
    const ru = frame?.opaque ? undefined : translateToken(tokens, i, frame);
    if (ru !== undefined && ru !== t.text) edits.push({ pos: t.pos, len: t.text.length, text: ru });
    spelled[i] = (ru ?? (t.type === 'keyword' ? t.value : t.text)).toUpperCase();
  }
  if (edits.length === 0) return undefined;
  let out = text;
  for (const e of edits.reverse()) out = out.slice(0, e.pos) + e.text + out.slice(e.pos + e.len);
  return out;
}

/** Model keys holding names: compared exactly. Every other string is compared up to the language. */
const NAME_KEYS = new Set([
  'alias', 'path', 'leftPath', 'rightPath', 'tsName', 'tsFullName', 'tempTableName', 'selectAlias', 'sortAlias',
  'operandAlias', 'outputName', 'name', 'fullName', 'id', 'tableId', 'leftTableId', 'rightTableId', 'seedTableId', 'joinedTableId', 'ref',
]);

const ALL_ENGLISH = new Map<string, string>([
  ...ENGLISH_KEYWORDS, ...[...ENGLISH_WORDS].map(([en, ru]) => [en, ru[0]] as [string, string]), ...ENGLISH_FUNCTIONS,
  ...ENGLISH_METADATA_KINDS,
]);
/** One word in a language-free spelling: upper case, English → Russian. */
export function languageFreeWord(word: string): string {
  const up = word.toUpperCase();
  return up === 'ИЕРАРХИИ' ? 'ИЕРАРХИЯ' : (ALL_ENGLISH.get(up) ?? up).toUpperCase();
}

/** A string with every word in a language-free spelling and normalized spacing. */
function languageFree(s: string): string {
  return s.replace(/[\p{L}_][\p{L}\p{N}_]*/gu, languageFreeWord).replace(/\s+/g, ' ').replace(/\s*([(),])\s*/g, '$1');
}

function sameModel(a: unknown, b: unknown, key = ''): boolean {
  if (typeof a === 'string' && typeof b === 'string') return NAME_KEYS.has(key) ? a === b : languageFree(a) === languageFree(b);
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => sameModel(x, b[i], key));
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a).filter(k => (a as Record<string, unknown>)[k] !== undefined);
    const kb = Object.keys(b).filter(k => (b as Record<string, unknown>)[k] !== undefined);
    return ka.length === kb.length && ka.every(k => sameModel((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], k));
  }
  return a === b;
}

/**
 * The query in Russian words when the translation is proven safe (both texts
 * parse to the same model up to the language, names unchanged); otherwise
 * `undefined` — open the text as written.
 */
export function translateEnglishQuery(text: string): string | undefined {
  const translated = translateEnglishWords(text);
  if (translated === undefined) return undefined;
  const before = tryParseBatch(text);
  const after = tryParseBatch(translated);
  if (!before.ok || !after.ok) return undefined;
  return sameModel(before.doc, after.doc) ? translated : undefined;
}
