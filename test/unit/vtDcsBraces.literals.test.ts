/**
 * DCS braces in virtual-table arguments (wrapDcsBraceParam, aliasDcsBraceExprs,
 * mergeDcsBraces) are transformed only when the braces are code (C25c-1):
 * brace-like text inside a string literal stays byte-for-byte and does not
 * advance the `Поле<2k>` alias numbering. The code cases pin the current output.
 */
import { describe, it, expect } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';

/** The rendered virtual-table call `Остатки(…)` for the given arguments. */
const vt = (args: string): string => {
  const out = generateBatch(parseBatch(`ВЫБРАТЬ О.Р КАК Р ИЗ РегистрНакопления.Р.Остатки(${args}) КАК О`));
  return out.slice(out.indexOf('Остатки'), out.lastIndexOf(' КАК О'));
};
const multi = (condition: string): string => `Остатки(\n\t\t\t,\n\t\t\t${condition})`;

describe('DCS braces in code (unchanged output)', () => {
  it.each([
    [', {&x}', 'Остатки(, {(&x)})'],
    [', {(Т.А)}', 'Остатки(, {(Т.А) КАК Поле2})'],
    [', {Т.А} {Т.Б}', 'Остатки(, {Т.А, Т.Б})'],
    [', Т.Ф = 1 И {(Т.Б)}', multi('Т.Ф = 1\n\t\t\t\tИ {(Т.Б) КАК Поле2}')],
    [', {Ф = "{}"} {Г = 1}', 'Остатки(, {Ф = "{}", Г = 1})'],
  ])('%j → %j', (args, output) => {
    expect(vt(args)).toBe(output);
  });

  // Until C25 R1 a `}` inside the literal ended the brace scan, so these groups
  // were not merged (N2). Only code braces are structure now: the input merges
  // like `{Ф = "x"} {Г = 1}`, and the literal stays byte-for-byte.
  it('a `}` in a literal does not stop the merge (N2)', () => {
    expect(vt(', {Ф = "}"} {Г = 1}')).toBe('Остатки(, {Ф = "}", Г = 1})');
  });
});

describe('wrapDcsBraceParam: literals stay byte-for-byte', () => {
  it.each([
    [', Т.Ф = "{&x}" И Т.Г = 1', multi('Т.Ф = "{&x}"\n\t\t\t\tИ Т.Г = 1')],
    [', Т.Ф = "a ""{&x}"" b" И Т.Г = 1', multi('Т.Ф = "a ""{&x}"" b"\n\t\t\t\tИ Т.Г = 1')],
    [', Т.Ф = "{&x}" И {&y}', multi('Т.Ф = "{&x}"\n\t\t\t\tИ {(&y)}')],
  ])('%j → %j', (args, output) => {
    expect(vt(args)).toBe(output);
  });
});

describe('aliasDcsBraceExprs: literals stay byte-for-byte and are not numbered', () => {
  it.each([
    [', Ф = "{(a)}" И Г = 1', multi('Ф = "{(a)}"\n\t\t\t\tИ Г = 1')],
    [', Ф = "a ""{(a)}"" b" И Г = 1', multi('Ф = "a ""{(a)}"" b"\n\t\t\t\tИ Г = 1')],
  ])('%j → %j', (args, output) => {
    expect(vt(args)).toBe(output);
  });

  it('a brace in a literal does not advance the numbering of a code brace', () => {
    expect(vt(', Ф = "{(a)}" И {(Т.Б)}')).toBe(multi('Ф = "{(a)}"\n\t\t\t\tИ {(Т.Б) КАК Поле2}'));
  });
});

describe('mergeDcsBraces: literal whitespace stays byte-for-byte', () => {
  it.each([
    [', {Ф = "a  b"} {Г = 1}', 'Остатки(, {Ф = "a  b", Г = 1})'],
    [', {Ф = "a  ""b"""} {Г = 1}', 'Остатки(, {Ф = "a  ""b""", Г = 1})'],
    [', {Ф = "{a  b}"} {Г = 1}', 'Остатки(, {Ф = "{a  b}", Г = 1})'],
  ])('%j → %j', (args, output) => {
    expect(vt(args)).toBe(output);
  });
});
