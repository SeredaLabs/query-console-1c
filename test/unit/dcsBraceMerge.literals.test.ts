/**
 * DCS brace merge in virtual-table arguments (mergeDcsBraces) treats only
 * braces in code as structure (C25 R1): a brace inside a string literal is
 * data. Queries that differ only in a literal payload get the same structure
 * outside that literal, and the literal stays byte-for-byte. The code cases pin
 * the current output.
 */
import { describe, it, expect } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';

/** The rendered virtual-table call `Остатки(…)` for the given arguments. */
const vt = (args: string): string => {
  const out = generateBatch(parseBatch(`ВЫБРАТЬ О.Р КАК Р ИЗ РегистрНакопления.Р.Остатки(${args}) КАК О`));
  return out.slice(out.indexOf('Остатки'), out.lastIndexOf(' КАК О'));
};

describe('code braces (unchanged output)', () => {
  it.each([
    [', {Т.А} {Т.Б}', 'Остатки(, {Т.А, Т.Б})'],
    [', {Т.А}\n {Т.Б}  {&П}', 'Остатки(, {Т.А, Т.Б, &П})'],
    [', {Ф = "abc"} {Г = 1}', 'Остатки(, {Ф = "abc", Г = 1})'],
    [', {(Т.А = "abc")} {(Т.Б)}', 'Остатки(, {(Т.А = "abc"), (Т.Б)})'],
  ])('%j → %j', (args, output) => {
    expect(vt(args)).toBe(output);
  });
});

describe('a literal payload does not change the brace structure', () => {
  const shapes = [', {Ф = $} {Г = 1}', ', {Ф = $}', ', {Г = 1} {Ф = $}', '{Ф = $} {Г = 1}, ', ', {(Т.А = $)} {(Т.Б)}'];
  const payloads = ['"a} {b"', '"} {"', '"{"', '"}"', '"a ""}"" {b"', '"} {  x"'];
  for (const shape of shapes) {
    const control = vt(shape.replace('$', '"abc"'));
    it.each(payloads)(`${JSON.stringify(shape)} with %s`, payload => {
      expect(vt(shape.replace('$', payload))).toBe(control.split('"abc"').join(payload));
    });
  }
});
