/**
 * C32 Safe Apply / No-op Apply: the host-side baseline of one Designer panel.
 * An Apply equal to the text reported right after the first open of the source query
 * changes nothing; every other case (no source query, no or a rejected report, a
 * changed text) keeps the current Apply path.
 */
import { describe, it, expect } from 'vitest';
import { ApplyBaseline, sourceQueryOf } from '../../src/extension/applyBaseline';

const SOURCE = 'ВЫБРАТЬ Т.Код ИЗ Справочник.Валюты КАК Т';
const APPLIED = 'ВЫБРАТЬ\n\tТ.Код КАК Код\nИЗ\n\tСправочник.Валюты КАК Т';

function opened(): { b: ApplyBaseline; id: number } {
  const b = new ApplyBaseline(SOURCE);
  const id = b.load(SOURCE);
  b.report(id, APPLIED);
  return { b, id };
}

describe('C32: an unchanged Apply', () => {
  it('equals the text reported after the first open of the source query', () => {
    const { b } = opened();
    expect(b.isUnchanged(APPLIED)).toBe(true);
  });

  it('is compared exactly: any difference is a change', () => {
    const { b } = opened();
    expect(b.isUnchanged(`${APPLIED} `)).toBe(false);
    expect(b.isUnchanged(APPLIED.replace('Код КАК Код', 'Код КАК Код2'))).toBe(false);
    expect(b.isUnchanged(SOURCE)).toBe(false);
    expect(b.isUnchanged('')).toBe(false);
  });

  it('stays unchanged after a switch when the other UI applies the same text', () => {
    const { b } = opened();
    b.switchDesigner();
    b.load(APPLIED);
    expect(b.isUnchanged(APPLIED)).toBe(true);
  });
});

describe('C32: without a baseline Apply keeps its current path', () => {
  it('no report at all', () => {
    const b = new ApplyBaseline(SOURCE);
    b.load(SOURCE);
    expect(b.isUnchanged(APPLIED)).toBe(false);
  });

  it('no source query (a new query, result-processing code, no editor)', () => {
    const b = new ApplyBaseline(undefined);
    const id = b.load(APPLIED);
    b.report(id, APPLIED);
    expect(b.isUnchanged(APPLIED)).toBe(false);
  });

  it.each([
    ['an unknown load id', 99, APPLIED],
    ['a load id that is not a number', '1', APPLIED],
    ['a text that is not a string', 1, 42],
    ['a missing load id', undefined, APPLIED],
  ])('a malformed report: %s', (_name, loadId, text) => {
    const b = new ApplyBaseline(SOURCE);
    b.load(SOURCE);
    b.report(loadId, text);
    expect(b.isUnchanged(APPLIED)).toBe(false);
  });

  it('a report for a load of another text (not the source query)', () => {
    const b = new ApplyBaseline(SOURCE);
    const id = b.load('ВЫБРАТЬ 1');
    b.report(id, APPLIED);
    expect(b.isUnchanged(APPLIED)).toBe(false);
  });

  it('a report that arrives only after a switch', () => {
    const b = new ApplyBaseline(SOURCE);
    const id = b.load(SOURCE);
    b.switchDesigner();
    b.report(id, APPLIED);
    const switchedId = b.load(APPLIED);
    b.report(switchedId, APPLIED);
    expect(b.isUnchanged(APPLIED)).toBe(false);
  });
});

describe('C32: late or repeated reports do not move the baseline', () => {
  it('the first report wins', () => {
    const { b, id } = opened();
    b.report(id, 'ВЫБРАТЬ 2');
    expect(b.isUnchanged(APPLIED)).toBe(true);
    expect(b.isUnchanged('ВЫБРАТЬ 2')).toBe(false);
  });

  it('a repeated load of the source query (webview reloaded) does not replace it', () => {
    const { b } = opened();
    const again = b.load(SOURCE);
    b.report(again, 'ВЫБРАТЬ 2');
    expect(b.isUnchanged(APPLIED)).toBe(true);
  });

  it('a repeated load before any report: either report of the source query is accepted, once', () => {
    const b = new ApplyBaseline(SOURCE);
    const first = b.load(SOURCE);
    const second = b.load(SOURCE);
    b.report(second, APPLIED);
    b.report(first, 'ВЫБРАТЬ 2');
    expect(b.isUnchanged(APPLIED)).toBe(true);
  });

  it('reports of the switched UI never become the baseline (edits before the switch stay changes)', () => {
    const b = new ApplyBaseline(SOURCE);
    const id = b.load(SOURCE);
    b.report(id, APPLIED);
    const edited = `${APPLIED}\nГДЕ\n\tТ.Код = "1"`;
    b.switchDesigner();
    b.report(b.load(edited), edited);
    expect(b.isUnchanged(edited)).toBe(false);
    expect(b.isUnchanged(APPLIED)).toBe(true);
  });
});

describe('C32: the source query of a panel', () => {
  it.each([
    ['an existing literal', { queryRange: { start: 10, end: 40 } }, SOURCE, SOURCE],
    ['a new query (empty range)', { queryRange: { start: 10, end: 10 } }, undefined, undefined],
    ['an empty range with a text', { queryRange: { start: 10, end: 10 } }, SOURCE, undefined],
    ['result-processing code', { queryRange: { start: 10, end: 40 }, resultProcessing: true }, SOURCE, undefined],
    ['no range', {}, SOURCE, undefined],
    ['no editor', undefined, SOURCE, undefined],
  ])('%s', (_name, saved, initial, expected) => {
    expect(sourceQueryOf(saved, initial)).toBe(expected);
  });
});
