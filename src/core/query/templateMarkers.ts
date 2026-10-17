/**
 * U1: `#Имя` template markers. BSL code replaces such a marker with arbitrary text
 * before running the query — a table name, a nested query, a whole join, a
 * condition, a field list — so the query core cannot know what it stands for.
 * Whatever the marker means, the text around it must stay as the author wrote it:
 * an added `КАК`, removed parentheses or a `#Имя.` prefix change the substituted
 * query (platform fixture `test/fixtures/platform/u1-template-markers.json`).
 *
 * The rule compares, for every marker in order, the code token before and after
 * it in the original and in the text about to be written. Layout, comments and
 * keyword case do not count; a `#` inside a string literal or a comment is not a
 * marker. Pure, lexer-based.
 */
import { tryTokenize, type Token } from './sdblLexer';

const isMarker = (t: Token): boolean => t.type === 'ident' && t.text.startsWith('#') && t.text.length > 1;

/** Comparable spelling of a neighbour token: names and keywords case-insensitive. */
function key(t: Token | undefined): string {
  if (!t) return '';
  return t.type === 'ident' || t.type === 'keyword' ? `${t.type === 'ident' ? 'i' : 'k'}:${t.value.toUpperCase()}` : `${t.type}:${t.text}`;
}

interface MarkerContext { marker: string; before: string; after: string }

function contexts(text: string): MarkerContext[] | undefined {
  const tokens = tryTokenize(text)?.filter(t => t.type !== 'eof');
  if (!tokens) return undefined;
  const out: MarkerContext[] = [];
  tokens.forEach((t, i) => {
    if (isMarker(t)) out.push({ marker: t.text.toUpperCase(), before: key(tokens[i - 1]), after: key(tokens[i + 1]) });
  });
  return out;
}

/**
 * The first template marker whose surroundings differ between `original` and
 * `generated` (or that is added or lost), or `undefined` when every marker keeps
 * its neighbours. A text the lexer cannot read counts as changed when the
 * original has a `#`.
 */
export function findChangedTemplateMarker(original: string, generated: string): string | undefined {
  if (!original.includes('#')) return undefined;
  const before = contexts(original);
  const after = contexts(generated);
  if (!before || !after) return '#';
  for (let i = 0; i < Math.max(before.length, after.length); i++) {
    const a = before[i], b = after[i];
    if (!a || !b || a.marker !== b.marker || a.before !== b.before || a.after !== b.after) {
      return tokensName(original, i) ?? tokensName(generated, i) ?? '#';
    }
  }
  return undefined;
}

/** The marker as written (original case) at position `i` among the markers. */
function tokensName(text: string, i: number): string | undefined {
  return tryTokenize(text)?.filter(isMarker)[i]?.text;
}

/** Apply refusal message (Russian core form, localized by `localizeDiagnostic`). */
export function templateMarkerChangedMessage(marker: string): string {
  return `Конструктор изменил текст вокруг шаблонного маркера "${marker}"; применение заблокировано`;
}
