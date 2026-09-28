/**
 * `repairLexicalErrorsForRecovery` ends because every retry must make progress.
 * The real lexer always reports a removable character, so a lexer is modelled
 * whose error the blanking cannot remove; the repair must rethrow it at once
 * instead of lexing the same text again.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

const lexer = vi.hoisted(() => ({ pos: undefined as number | undefined, calls: 0 }));

vi.mock('../../src/core/query/sdblLexer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/query/sdblLexer')>();
  return {
    ...actual,
    tokenize: (text: string, opts?: Parameters<typeof actual.tokenize>[1]) => {
      lexer.calls++;
      if (lexer.pos !== undefined) throw new actual.SdblLexError('Лексическая ошибка 1:1 — model', lexer.pos, 'token');
      return actual.tokenize(text, opts);
    },
  };
});

import { repairLexicalErrorsForRecovery } from '../../src/core/query/selectListRepair';
import { SdblLexError } from '../../src/core/query/sdblLexer';

afterEach(() => { lexer.pos = undefined; lexer.calls = 0; });

describe('repairLexicalErrorsForRecovery: progress guard', () => {
  const text = 'ВЫБРАТЬ 1\n ИЗ Т';
  for (const [what, pos] of [
    ['on a space', text.indexOf(' ')],
    ['on a line break', text.indexOf('\n')],
    ['past the end', text.length + 5],
    ['negative', -1],
    ['NaN', Number.NaN],
  ] as const) {
    it(`an error ${what} is rethrown after one attempt`, () => {
      lexer.pos = pos;
      expect(() => repairLexicalErrorsForRecovery(text)).toThrow(SdblLexError);
      expect(lexer.calls).toBe(1);
    });
  }

  it('real lexical errors still make progress and are repaired', () => {
    expect(repairLexicalErrorsForRecovery('ВЫБРАТЬ &, "x').text).toBe('ВЫБРАТЬ  ,   ');
  });
});
