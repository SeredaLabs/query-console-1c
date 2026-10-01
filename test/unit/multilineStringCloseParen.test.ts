import { describe, expect, it } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { tokenize } from '../../src/core/query/sdblLexer';

const literals = (text: string) => tokenize(text).filter(t => t.type === 'string').map(t => t.text);

/** Valid multiline `"a` / `b"`: last line is `b"` and is not a complete lexeme. */

describe('valid multiline string: closing ) stays on the last line of the literal', () => {
  it('source subquery', () => {
    const input = 'ВЫБРАТЬ П.А КАК А ИЗ (ВЫБРАТЬ Т.Код КАК А ИЗ Справочник.Валюты КАК Т\nГДЕ Т.Код = "a\nb") КАК П';
    const output = generateBatch(parseBatch(input));
    expect(literals(output)).toEqual(literals(input));
    expect(output).toBe(
      'ВЫБРАТЬ\n\tП.А КАК А\nИЗ\n\t(ВЫБРАТЬ\n\t\tТ.Код КАК А\n\tИЗ\n\t\tСправочник.Валюты КАК Т\n\tГДЕ\n\t\tТ.Код = "a\nb") КАК П'
    );
  });

  it('virtual-table argument (emitRawCall is not on this path)', () => {
    const input = 'ВЫБРАТЬ Т.А ИЗ РегистрНакопления.Продажи.Остатки(, Номенклатура = "a\nb") КАК Т';
    const output = generateBatch(parseBatch(input));
    expect(literals(output)).toEqual(literals(input));
    expect(output).toBe(
      'ВЫБРАТЬ\n\tТ.А КАК А\nИЗ\n\tРегистрНакопления.Продажи.Остатки(\n\t\t\t,\n\t\t\tНоменклатура = "a\nb") КАК Т'
    );
  });

  it('condition subquery', () => {
    const input = 'ВЫБРАТЬ П.А КАК А ИЗ Справочник.Валюты КАК П ГДЕ П.Код В (ВЫБРАТЬ Т.Код КАК Код ИЗ Справочник.Валюты КАК Т\nГДЕ Т.Код = "a\nb")';
    const output = generateBatch(parseBatch(input));
    expect(literals(output)).toEqual(literals(input));
    expect(output).toBe(
      'ВЫБРАТЬ\n\tП.А КАК А\nИЗ\n\tСправочник.Валюты КАК П\nГДЕ\n\tП.Код В\n\t\t\t(ВЫБРАТЬ\n\t\t\t\tТ.Код КАК Код\n\t\t\tИЗ\n\t\t\t\tСправочник.Валюты КАК Т\n\t\t\tГДЕ\n\t\t\t\tТ.Код = "a\nb")'
    );
  });
});
