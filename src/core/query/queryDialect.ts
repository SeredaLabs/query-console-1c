/**
 * C2 slice 2: which language a BSL string literal is written in, decided once
 * here so every editor feature (detection, hover, completion, diagnostics, the
 * Designer command) reads the same answer.
 *
 * - `sdbl`: a 1C query. It starts with `ВЫБРАТЬ`/`УНИЧТОЖИТЬ` (the Russian
 *   words are unambiguous, so a broken query is still a 1C query), or it starts
 *   with `SELECT`/`DROP`, has no native SQL marker and parses as SDBL.
 * - `nativeSql`: it starts with `SELECT`/`DROP` and has code that the 1C query
 *   language never has (`--` or `/* *\/` comments, `@name` variables, `[name]`
 *   bracket quoting; none occurs in the 1976 corpus packages). Checked before
 *   parsing: the parser keeps unknown expressions as raw text and would accept
 *   `Id = @Id`. Typical for ADO / external data source strings in BSL.
 * - `unknown`: it starts with `SELECT`/`DROP`, has no such marker and does not
 *   parse as SDBL — an unfinished English 1C query while typing, or SQL we cannot
 *   tell apart. Treated as a query, but parse errors are not reported.
 *
 * Strings that start with none of these words are not queries (`undefined`).
 * Pure; text only (no surrounding BSL is analysed).
 */
import { tryParseBatch } from './validateBatch';

export type QueryDialect = 'sdbl' | 'nativeSql' | 'unknown';

const RUSSIAN_QUERY_WORDS = ['ВЫБРАТЬ', 'УНИЧТОЖИТЬ'];
const ENGLISH_QUERY_WORDS = ['SELECT', 'DROP'];
/** Words a query literal may start with, in both languages. */
export const QUERY_START_WORDS: readonly string[] = [...RUSSIAN_QUERY_WORDS, ...ENGLISH_QUERY_WORDS];

/** Native SQL code that SDBL has no form for (checked outside string literals). */
const NATIVE_SQL_MARKERS = [/--/, /\/\*/, /@[\p{L}_]/u, /\[[\p{L}_][\p{L}\p{N}_ ]*\]/u];

/**
 * The query word `text` starts with (upper case), after `prefix` trivia was
 * removed by the caller, or `undefined`. A word boundary must follow it.
 */
export function leadingQueryWord(text: string): string | undefined {
  const upper = text.toUpperCase();
  return QUERY_START_WORDS.find(w => upper.startsWith(w) && !/[\p{L}\p{N}_]/u.test(text.charAt(w.length)));
}

/**
 * Dialect of a query literal whose leading trivia is already skipped (`body`
 * starts at the first code character) — `full` is the whole literal text that
 * is parsed. `undefined`: not a query.
 */
export function detectQueryDialect(body: string, full: string = body): QueryDialect | undefined {
  const word = leadingQueryWord(body);
  if (word === undefined) return undefined;
  if (RUSSIAN_QUERY_WORDS.includes(word)) return 'sdbl';
  const code = full.replace(/"(?:[^"]|"")*"?/g, '""').replace(/\/\/[^\n]*/g, '');
  if (NATIVE_SQL_MARKERS.some(re => re.test(code))) return 'nativeSql';
  return tryParseBatch(full).ok ? 'sdbl' : 'unknown';
}
