/**
 * The left operand of an inline membership subquery (`<lhs> В (ВЫБРАТЬ …)`,
 * reflowInlineMembershipSubquery) is flattened to one line only in code
 * (C25c-1): string literals stay byte-for-byte. Covered through the three
 * product paths that reach it: a virtual-table argument, the select list and an
 * OR leaf in WHERE. The code cases pin the current output.
 */
import { describe, it, expect } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';

const SUB = 'В (ВЫБРАТЬ Х.А, Х.Б ИЗ Справочник.Валюты КАК Х)';
const gen = (text: string): string => generateBatch(parseBatch(text));

const vt = (lhs: string): string =>
  gen(`ВЫБРАТЬ О.Р КАК Р ИЗ РегистрНакопления.Р.Остатки(, ${lhs} ${SUB}) КАК О`);
const vtExpected = (lhs: string): string =>
  'ВЫБРАТЬ\n\tО.Р КАК Р\nИЗ\n\tРегистрНакопления.Р.Остатки(\n\t\t\t,\n'
  + `\t\t\t${lhs} В\n\t\t\t\t(ВЫБРАТЬ\n\t\t\t\t\tХ.А,\n\t\t\t\t\tХ.Б\n\t\t\t\tИЗ\n\t\t\t\t\tСправочник.Валюты КАК Х)) КАК О`;

const select = (lhs: string): string => gen(`ВЫБРАТЬ ${lhs} ${SUB} КАК Ф ИЗ Справочник.Валюты КАК Т`);
const selectExpected = (lhs: string): string =>
  `ВЫБРАТЬ\n\t${lhs} В\n\t\t(ВЫБРАТЬ\n\t\t\tХ.А,\n\t\t\tХ.Б\n\t\tИЗ\n\t\t\tСправочник.Валюты КАК Х) КАК Ф\nИЗ\n\tСправочник.Валюты КАК Т`;

const orLeaf = (lhs: string): string =>
  gen(`ВЫБРАТЬ Т.Код КАК Код ИЗ Справочник.Валюты КАК Т ГДЕ ${lhs} ${SUB} ИЛИ Т.Код = 1`);
const orLeafExpected = (lhs: string): string =>
  'ВЫБРАТЬ\n\tТ.Код КАК Код\nИЗ\n\tСправочник.Валюты КАК Т\nГДЕ\n'
  + `\t(${lhs} В\n\t\t\t\t(ВЫБРАТЬ\n\t\t\t\t\tХ.А,\n\t\t\t\t\tХ.Б\n\t\t\t\tИЗ\n\t\t\t\t\tСправочник.Валюты КАК Х)\n\t\t\tИЛИ Т.Код = 1)`;

describe('membership lhs in code (unchanged output)', () => {
  it('virtual table: a multi-line tuple is flattened', () => {
    expect(vt('(Т.А,\n Т.Б)')).toBe(vtExpected('(Т.А, Т.Б)'));
  });

  it('select list: a multi-line tuple is flattened', () => {
    expect(select('(Т.Код,\n  Т.Наименование)')).toBe(selectExpected('(Т.Код, Т.Наименование)'));
  });
});

describe('membership lhs: literals stay byte-for-byte', () => {
  it.each([
    ['("a  b", Т.Код)'],
    ['("( a )", Т.Код)'],
  ])('virtual table %s', lhs => {
    expect(vt(lhs)).toBe(vtExpected(lhs));
  });

  it.each([
    ['("a  b", Т.Код)'],
    ['("( a )", Т.Код)'],
  ])('select list %s', lhs => {
    expect(select(lhs)).toBe(selectExpected(lhs));
  });

  it.each([
    ['("a  b", Т.Код)'],
    ['("( a )", Т.Код)'],
  ])('WHERE OR leaf %s', lhs => {
    expect(orLeaf(lhs)).toBe(orLeafExpected(lhs));
  });

  it('mixed lhs: code is still normalized around a kept literal', () => {
    expect(vt('("a  b",\n  Т.Код )')).toBe(vtExpected('("a  b", Т.Код)'));
  });
});
