/**
 * C25a: the condition-subquery qualifier rewrite (`<auto alias>.` →
 * `<source name>.`, renderConditionSubquery) is applied only inside the lexer's
 * code ranges. String literals and comments are user text and stay
 * byte-for-byte; without lexical facts the generated text is left unchanged.
 */
import { describe, it, expect } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { codeRanges } from '../../src/core/query/sdblLexer';
import { tryOpenDesignerBatch } from '../../src/webview/openDesignerBatch';

const withSubquery = (condition: string, select = 'Пользователи.Ссылка'): string =>
  'ВЫБРАТЬ Т.Код КАК Код ИЗ Справочник.Валюты КАК Т ГДЕ Т.Ссылка В '
  + `(ВЫБРАТЬ ${select} ИЗ Справочник.Пользователи ГДЕ ${condition})`;

const expected = (select: string, condition: string): string => [
  'ВЫБРАТЬ',
  '\tТ.Код КАК Код',
  'ИЗ',
  '\tСправочник.Валюты КАК Т',
  'ГДЕ',
  '\tТ.Ссылка В',
  '\t\t\t(ВЫБРАТЬ',
  `\t\t\t\t${select}`,
  '\t\t\tИЗ',
  '\t\t\t\tСправочник.Пользователи',
  '\t\t\tГДЕ',
  `\t\t\t\t${condition})`,
].join('\n');

describe('codeRanges', () => {
  it('excludes string literals (with "" escapes), date literals and comments', () => {
    const text = 'А "x ""y""" Б // c\nВ \'20240101\' Г';
    const ranges = codeRanges(text)!;
    expect(ranges.map(([s, e]) => text.slice(s, e))).toEqual(['А ', ' Б ', '\nВ ', ' Г']);
  });

  it('covers the whole text when there is nothing to exclude, and nothing for empty text', () => {
    expect(codeRanges('А.Б = 1')).toEqual([[0, 7]]);
    expect(codeRanges('')).toEqual([]);
    expect(codeRanges('"только литерал"')).toEqual([]);
  });

  it('is undefined when the text cannot be lexed', () => {
    expect(codeRanges('А = "незакрыт')).toBeUndefined();
    expect(codeRanges('А = &')).toBeUndefined();
  });
});

describe('C25a: condition-subquery qualifier rewrite', () => {
  it('rewrites qualifiers in code and keeps a string literal byte-for-byte', () => {
    const out = generateBatch(parseBatch(withSubquery('Пользователи.Наименование = "Пользователи.x"')));
    expect(out).toBe(expected(
      'Справочник.Пользователи.Ссылка',
      'Справочник.Пользователи.Наименование = "Пользователи.x"',
    ));
  });

  it('keeps a literal in the subquery select list byte-for-byte', () => {
    const out = generateBatch(parseBatch(withSubquery('ИСТИНА', '"Пользователи.Ссылка"')));
    expect(out).toContain('\t\t\t\t"Пользователи.Ссылка"\n');
    expect(out).not.toContain('"Справочник.Пользователи.Ссылка"');
  });

  it('keeps a comment byte-for-byte', () => {
    const text = withSubquery('Пользователи.Наименование = 1 // Пользователи.x\n');
    const out = generateBatch(parseBatch(text, undefined, { preserveComments: true }));
    expect(out).toContain('\t\t\t\tСправочник.Пользователи.Наименование = 1\n\t\t\t\t// Пользователи.x\n');
    expect(out).not.toContain('// Справочник.Пользователи.x');
  });

  it('keeps the literal through the Designer open path', () => {
    const open = tryOpenDesignerBatch(withSubquery('Пользователи.Наименование = "Пользователи.x"'));
    expect(open.ok).toBe(true);
    if (open.ok) expect(generateBatch(open.doc)).toContain('= "Пользователи.x")');
  });

  it('leaves canonical output unchanged when there is no literal or comment', () => {
    const out = generateBatch(parseBatch(withSubquery('Пользователи.Наименование = &Имя')));
    expect(out).toBe(expected(
      'Справочник.Пользователи.Ссылка',
      'Справочник.Пользователи.Наименование = &Имя',
    ));
  });

  it('does not rewrite speculatively when the generated subquery cannot be lexed', () => {
    const doc = parseBatch(withSubquery('Пользователи.Наименование = &Имя'));
    const inner = doc.members[0].members[0].model.conditions![0].subquery!.members[0].model;
    inner.conditions = [{ custom: true, tableId: 't0', path: '', operator: '=', param: '', expression: 'Пользователи.Наименование = "x' }];
    const out = generateBatch(doc);
    expect(out).toContain('Пользователи.Наименование = "x');
    expect(out).not.toContain('Справочник.Пользователи.');
  });
});
