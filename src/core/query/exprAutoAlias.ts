// Lexical facts for result-column names of expressions without `КАК` (bare parameter,
// `ПРЕДСТАВЛЕНИЕ(<поле>)`). The names themselves are assigned in `columnNames.ts` (C30),
// the one place every consumer (parser, generator, UNION, temp tables) reads them from.
//
// Лексические факты (что есть параметр, имя, алфавит идентификатора) берутся из
// лексера (A1), а не из собственных классов символов: конструктор 1С даёт
// `&Ціна КАК Ціна`, `ПРЕДСТАВЛЕНИЕ(ВТ.Ціна) КАК ЦінаПредставление`.

import { tryTokenize, isNameToken, isIdentifierName, isWordToken } from './sdblLexer';
import type { Token } from './sdblLexer';

/**
 * Имя голого параметра выборки `&Имя` (без `&`), если всё выражение — один
 * param-токен, а имя — идентификатор (`&123` не голый параметр с именем).
 * Иначе (вызов, индексация, комментарий, нелексируемый текст) — `undefined`.
 */
export function bareParamName(expression: string): string | undefined {
  const tokens = tryTokenize(expression, { comments: true });
  if (!tokens || tokens.length !== 2 || tokens[0].type !== 'param') return undefined;
  const name = tokens[0].text.slice(1);
  return isIdentifierName(name) ? name : undefined;
}

/**
 * Path of the field argument of `ПРЕДСТАВЛЕНИЕ(<поле>)` / `ПРЕДСТАВЛЕНИЕССЫЛКИ(<поле>)`,
 * as name segments (`ПРЕДСТАВЛЕНИЕ(Т.Ссылка.Код)` → `['Т', 'Ссылка', 'Код']`), when the
 * whole expression is exactly that call with one field-path argument; otherwise
 * `undefined`. The column name built from it is `columnNames`' job (C30): it needs the
 * sources to tell a source alias from a field. Names follow the lexer alphabet (A1).
 */
export function representationArgPath(expression: string): string[] | undefined {
  const tokens = tryTokenize(expression, { comments: true });
  if (!tokens || !isWordToken(tokens[0], 'ПРЕДСТАВЛЕНИЕ', 'ПРЕДСТАВЛЕНИЕССЫЛКИ')) return undefined;
  if (!isPunct(tokens[1], '(')) return undefined;
  const segs: string[] = [];
  let i = 2;
  for (;;) {
    const seg = tokens[i];
    if (!isNameToken(seg)) return undefined;
    segs.push(seg.text);
    i++;
    if (!isPunct(tokens[i], '.')) break;
    i++;
  }
  if (!isPunct(tokens[i], ')') || tokens[i + 1]?.type !== 'eof') return undefined;
  return segs;
}

function isPunct(t: Token | undefined, value: string): boolean {
  return t?.type === 'punct' && t.value === value;
}
