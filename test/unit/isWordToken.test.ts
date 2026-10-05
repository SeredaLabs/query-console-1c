/**
 * `isWordToken` — the lexer's word-role primitive (A1-1): an ident or keyword
 * whose canonical value, upper-cased, is one of the given words. Literals,
 * comments, numbers, parameters and punctuation are never words.
 */
import { describe, it, expect } from 'vitest';
import { isWordToken, tokenize, type Token } from '../../src/core/query/sdblLexer';

/** The first non-EOF token of `text` (comments kept). */
const tok = (text: string): Token => tokenize(text, { comments: true })[0];

describe('isWordToken', () => {
  it('keyword: canonical upper-case value, any spelling', () => {
    expect(tok('И').type).toBe('keyword');
    expect(isWordToken(tok('И'), 'И')).toBe(true);
    expect(isWordToken(tok('выбрать'), 'ВЫБРАТЬ')).toBe(true);
    expect(isWordToken(tok('Выбрать'), 'ВЫБРАТЬ')).toBe(true);
  });

  it('ident: case-insensitive', () => {
    expect(tok('НЕ').type).toBe('ident');
    for (const spelling of ['НЕ', 'не', 'Не', 'нЕ']) expect(isWordToken(tok(spelling), 'НЕ')).toBe(true);
    expect(isWordToken(tok('ВыБоР'), 'ВЫБОР')).toBe(true);
  });

  it('several accepted words', () => {
    expect(isWordToken(tok('тогда'), 'КОГДА', 'ТОГДА')).toBe(true);
    expect(isWordToken(tok('ИНАЧЕ'), 'КОГДА', 'ТОГДА')).toBe(false);
  });

  it('English word only when passed as an argument', () => {
    expect(isWordToken(tok('when'), 'КОГДА')).toBe(false);
    expect(isWordToken(tok('when'), 'КОГДА', 'WHEN')).toBe(true);
  });

  it('a word not among the arguments', () => {
    expect(isWordToken(tok('ИЛИ'), 'И')).toBe(false);
    expect(isWordToken(tok('ВЫБОРКА'), 'ВЫБОР')).toBe(false);
  });

  it('never a word: string, date, comment, number, parameter, punctuation, undefined', () => {
    expect(isWordToken(tok('"НЕ"'), 'НЕ', '"НЕ"')).toBe(false);
    expect(isWordToken(tok("'20200101'"), 'НЕ')).toBe(false);
    expect(isWordToken(tok('// НЕ'), 'НЕ', '// НЕ')).toBe(false);
    expect(isWordToken(tok('1'), '1')).toBe(false);
    expect(isWordToken(tok('&НЕ'), 'НЕ', '&НЕ')).toBe(false);
    expect(isWordToken(tok('('), '(')).toBe(false);
    expect(isWordToken(undefined, 'НЕ')).toBe(false);
  });
});
