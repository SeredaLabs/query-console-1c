/**
 * Level 0 query parameter semantics (semantic-core roadmap, memory:
 * project-semantic-core-roadmap — read that memory's own "Query parameter
 * semantics boundary" STATUS UPDATE before extending this; see also the
 * contract docstring above `extractQueryParamNames` in
 * `resultProcessingTemplate.ts`, the existing regex-based utility this is a
 * semantic-layer counterpart to, NOT a duplicate of).
 *
 * Finds every `&Параметр` occurrence in a piece of SDBL text via the REAL
 * lexer (`tokenize`) — deliberately NOT a regex over raw text like
 * `extractQueryParamNames`, so an `&` that happens to appear inside a string
 * literal is correctly never mistaken for a parameter (the lexer already
 * consumes the whole string token first). Scope is the WHOLE text passed in
 * — matches 1C's own `&Параметр` semantics: one value, shared across every
 * statement of the same `Запрос.Текст`, no per-statement/union-member
 * restriction the way table aliases have.
 *
 * Deliberately works from raw text, not a `SemanticSnapshot` — the lexer
 * never throws on structurally broken SDBL the way `parseBatch` can, so this
 * stays available even for a `'recovered'`/`'unavailable'` snapshot (the
 * exact v0.1.33 regression class other hover features had to special-case
 * around). No source-map recording needed either: unlike `virtualTableArg`
 * (which needs to know WHICH table/argument slot it's in), a parameter
 * occurrence carries no structural context to preserve — a direct lexer scan
 * over the caller's already-translated query text (the same coordinate
 * system `describeChain`/`describeVirtualTableArg` already receive their
 * `position` in) is simpler and strictly more robust than threading this
 * through the parser's batch/statement coordinate-stitching would have been.
 */
import { tokenize } from './sdblLexer';
import { rangeContains, type TextRange } from './sourceMap';

export interface QueryParameterOccurrence {
  /** Parameter name as typed, WITHOUT the leading `&` (e.g. "Товар"). */
  name: string;
  /** Range of the WHOLE token, including the leading `&` (e.g. "&Товар"). */
  range: TextRange;
}

/** Every `&Параметр` occurrence in `queryText`, in source order. */
export function collectQueryParameterOccurrences(queryText: string): QueryParameterOccurrence[] {
  const out: QueryParameterOccurrence[] = [];
  for (const t of tokenize(queryText)) {
    if (t.type !== 'param') continue;
    out.push({ name: t.text.slice(1), range: { start: t.pos, end: t.pos + t.text.length } });
  }
  return out;
}

/**
 * Occurrences grouped by parameter name — case-INSENSITIVE key (matches
 * every other identifier-comparison convention in this codebase, e.g.
 * `resolveAliasAt`'s `alias.toUpperCase()`), since SDBL identifiers
 * (including `&Параметр` names) are not case-sensitive. Each occurrence in
 * the list keeps its own as-typed `name` casing.
 */
export function collectQueryParameters(queryText: string): Map<string, QueryParameterOccurrence[]> {
  const map = new Map<string, QueryParameterOccurrence[]>();
  for (const occ of collectQueryParameterOccurrences(queryText)) {
    const key = occ.name.toUpperCase();
    const list = map.get(key);
    if (list) list.push(occ);
    else map.set(key, [occ]);
  }
  return map;
}

/**
 * The `&Параметр` occurrence at `position` (`position` inside its range,
 * INCLUDING the leading `&`) — `undefined` if `position` isn't on a
 * parameter token at all. Used by hover/completion to answer "is the cursor
 * on a query parameter, and which one". Range containment goes through the
 * shared `rangeContains` (half-open `[start, end)`, same as every other
 * `TextRange` consumer in this codebase) — `position === range.end` is the
 * boundary right AFTER the token, not on it.
 */
export function findQueryParameterAt(queryText: string, position: number): QueryParameterOccurrence | undefined {
  return collectQueryParameterOccurrences(queryText).find((occ) => rangeContains(occ.range, position));
}
