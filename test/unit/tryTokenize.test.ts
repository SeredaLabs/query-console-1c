import { describe, expect, it } from 'vitest';
import { tokenize, tryTokenize } from '../../src/core/query/sdblLexer';

describe('optional strict lexical analysis', () => {
  it('preserves token spelling, offsets and optional comments', () => {
    const text = '  выбрать &Ціна, "a""b" // )\n#Имя#';
    expect(tryTokenize(text)).toEqual(tokenize(text));
    expect(tryTokenize(text, { comments: true })).toEqual(tokenize(text, { comments: true }));
  });
  it('distinguishes empty input from an unknown result', () => {
    expect(tryTokenize('')).toEqual(tokenize(''));
    expect(tryTokenize('&')).toBeUndefined();
  });
  it.each(['А И &', 'А И #', 'А И §', 'А И "unfinished', "А И 'unfinished"])(
    'does not return partial facts or repaired text for %s', text => {
      expect(tryTokenize(text)).toBeUndefined();
    },
  );
  it('does not swallow unexpected failures', () => {
    // A broken caller is not a lexical error and must reach the controlled error boundary.
    expect(() => tryTokenize(null as unknown as string)).toThrow(TypeError);
  });
});
