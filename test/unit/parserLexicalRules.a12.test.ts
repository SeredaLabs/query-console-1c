/**
 * A1-2: parser lexical rule copies use the lexer's facts. `stripLineComments`
 * takes comment boundaries from comment tokens (a `//` inside a literal is not a
 * comment), and the expression editor's lexical issue takes its offset from
 * `SdblLexError.pos` instead of parsing the error message.
 */
import { describe, it, expect } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { tokenize, SdblLexError } from '../../src/core/query/sdblLexer';
import { analyzeExpression } from '../../src/webview/expressionEditor/expressionContext';

const JOIN = 'ВЫБРАТЬ Т.Код КАК Код ИЗ Справочник.Валюты КАК Т ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Валюты КАК Х ПО Т.Ссылка = Х.Ссылка';
const joinCondition = (tail: string): string => generateBatch(parseBatch(`${JOIN} ${tail}`)).split('ПО ')[1];

describe('stripLineComments: comment boundaries from the lexer', () => {
  it('`//` inside a literal stays, the real comment goes', () => {
    expect(joinCondition('И Х.Наименование = "a // b" // c\n И Х.Код = 1'))
      .toBe('Т.Ссылка = Х.Ссылка\n\t\t\tИ (Х.Наименование = "a // b")\n\t\t\tИ (Х.Код = 1)');
  });

  it('a `//` line inside a multi-line literal stays', () => {
    expect(joinCondition('И Х.Наименование = "x\n// не комментарий\ny" // c\n И Х.Код = 1'))
      .toBe('Т.Ссылка = Х.Ссылка\n\t\t\tИ (Х.Наименование = "x\n// не комментарий\ny")\n\t\t\tИ (Х.Код = 1)');
  });
});

describe('lexical issue offset is SdblLexError.pos', () => {
  it.each([
    ['Т.А + 1 И\n  Т.Б $ 2'],
    ['Т.А = 1\r\nИ Т.Б = "x'],
    ['"abc'],
  ])('%j', text => {
    let error: unknown;
    try { tokenize(text); } catch (e) { error = e; }
    expect(error).toBeInstanceOf(SdblLexError);
    const issue = analyzeExpression(text, { tables: [] } as never).issues[0];
    expect(issue).toMatchObject({ from: (error as SdblLexError).pos, to: (error as SdblLexError).pos + 1, kind: 'lexical' });
  });
});
