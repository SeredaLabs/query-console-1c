/**
 * C16: user `//` comments kept in a virtual-table / `ПЕРИОДАМИ(…)` argument text.
 *
 * The parser stores an argument as `leading comments` + raw code + `trailing
 * comments` (see `argTextsKeepingComments` in sdblParser.ts); renderers split it
 * back to place the argument separator before the trailing comment, where no
 * comment can swallow it. The split is lexer-based; comments inside the code
 * range stay part of the raw code.
 */
import { tryTokenize } from './sdblLexer';

export interface ArgComments {
  /** Own-line comments before the code. */
  leading: string[];
  /** Raw code, from its first to its last code token. */
  code: string;
  /** Comment on the code's last line, if any. */
  same?: string;
  /** Own-line comments after the code. */
  own: string[];
}

/** `undefined` when the text has no comment, no code, or cannot be lexed: render it verbatim. */
export function splitArgComments(text: string): ArgComments | undefined {
  const tokens = tryTokenize(text, { comments: true })?.filter(t => t.type !== 'eof');
  if (!tokens || !tokens.some(t => t.type === 'comment')) return undefined;
  let first = 0;
  while (first < tokens.length && tokens[first].type === 'comment') first++;
  let last = tokens.length - 1;
  while (last >= first && tokens[last].type === 'comment') last--;
  if (first > last) return undefined;
  const codeEnd = tokens[last].pos + tokens[last].text.length;
  const after = tokens.slice(last + 1);
  const same = after.length > 0 && !text.slice(codeEnd, after[0].pos).includes('\n') ? after[0].text : undefined;
  return {
    leading: tokens.slice(0, first).map(t => t.text),
    code: text.slice(tokens[first].pos, codeEnd),
    same,
    own: (same === undefined ? after : after.slice(1)).map(t => t.text),
  };
}
