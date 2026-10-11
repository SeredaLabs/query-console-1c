/**
 * R13: the JOIN single-CASE reflow (`renderJoinConjunct`, phase 6.16.53 — a conjunct
 * `поле = ВЫБОР … КОНЕЦ` is laid out at the conjunct's own indent) decided "opens a
 * CASE" and "exactly one КОНЕЦ" on raw text. A literal line ending with `ВЫБОР` turned
 * an inline CASE multi-line, and a literal `КОНЕЦ` counted as a second КОНЕЦ, so a real
 * multi-line CASE lost its canonical layout. Both checks now read only code; a literal
 * payload gets the layout of a same-shaped neutral literal. Layout only: literal bytes,
 * model and Apply were never affected.
 */
import { describe, it, expect } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { tryOpenDesignerBatch } from '../../src/webview/openDesignerBatch';
import { initialState, reducer } from '../../src/webview/state/queryStore';
import { computeBatchTextSafe } from '../../src/webview/computeBatchText';
import { decideApply, findStaticApplyBlocker } from '../../src/webview/applyGate';

const gen = (text: string): string => generateBatch(parseBatch(text));
const neutral = (literal: string): string => `"${literal.slice(1, -1).replace(/[^\n"]/gu, 'a')}"`;
function designer(text: string): { text: string; applyOk: boolean } {
  const open = tryOpenDesignerBatch(text);
  if (!open.ok) throw new Error(open.error);
  const state = reducer(initialState(), { type: 'LOAD_BATCH', doc: open.doc });
  const out = computeBatchTextSafe(state, true);
  return { text: out.text, applyOk: decideApply(out.text, out.error, findStaticApplyBlocker(state), undefined).ok };
}

const J = (conjunct: string): string =>
  `ВЫБРАТЬ Т.Код КАК Код ИЗ Справочник.Валюты КАК Т ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Валюты КАК Х ПО Т.Ссылка = Х.Ссылка И ${conjunct}`;
const cases: Array<[string, string, string[]]> = [
  ['inline CASE in an aggregate', 'МАКСИМУМ(ВЫБОР КОГДА Т.Наименование = $ ТОГДА 1 КОНЕЦ) = 1', ['"x ВЫБОР\ny"', '"ВЫБОР\ny"']],
  ['multi-line `= ВЫБОР … КОНЕЦ`', 'Т.Код = ВЫБОР\nКОГДА Т.Наименование = $ ТОГДА "1"\nИНАЧЕ "2"\nКОНЕЦ',
    ['"КОНЕЦ"', '"x КОНЕЦ"', '"КОНЕЦ x"', '"x КОНЕЦ\ny"', '"x\nКОНЕЦ y"', '"x\nКОНЕЦ"', '"x\n\tКОНЕЦ"', '"( КОНЕЦ"', '") КОНЕЦ"']],
];

describe('R13: literal ВЫБОР / КОНЕЦ do not switch the JOIN CASE reflow', () => {
  for (const [name, conjunct, payloads] of cases) {
    it.each(payloads)(`${name}: %j`, payload => {
      const first = designer(J(conjunct.replace('$', payload)));
      expect(first.applyOk).toBe(true);
      expect(first.text).toContain(payload);
      expect(first.text.split(payload).join(neutral(payload))).toBe(designer(J(conjunct.replace('$', neutral(payload)))).text);
      expect(gen(J(conjunct.replace('$', payload)))).toBe(first.text);
      expect(designer(first.text).text).toBe(first.text);
    });
  }
});

describe('R13: code still decides', () => {
  it('a real `= ВЫБОР … КОНЕЦ` is laid out at the conjunct indent', () => {
    expect(gen(J('Т.Код = ВЫБОР\nКОГДА Т.Наименование = "a" ТОГДА "1"\nИНАЧЕ "2"\nКОНЕЦ'))).toContain(
      '\t\t\tИ (Т.Код = ВЫБОР\n\t\t\t\tКОГДА Т.Наименование = "a"\n\t\t\t\t\tТОГДА "1"\n\t\t\t\tИНАЧЕ "2"\n\t\t\tКОНЕЦ)',
    );
  });

  it('`поле =⏎ВЫБОР` (ВЫБОР on the next line) still opens the CASE', () => {
    expect(gen(J('Т.Код =\nВЫБОР\nКОГДА Т.Наименование = "a" ТОГДА "1"\nИНАЧЕ "2"\nКОНЕЦ')))
      .toBe(gen(J('Т.Код = ВЫБОР\nКОГДА Т.Наименование = "a" ТОГДА "1"\nИНАЧЕ "2"\nКОНЕЦ')));
  });

  it('two code КОНЕЦ (a CASE chain) are not reflowed as one CASE', () => {
    const two = 'Т.Код = ВЫБОР\nКОГДА Т.Наименование = "a" ТОГДА "1" ИНАЧЕ "2" КОНЕЦ + ВЫБОР КОГДА Т.Код = "1" ТОГДА "1" ИНАЧЕ "2"\nКОНЕЦ';
    const out = gen(J(two));
    expect(gen(out)).toBe(out);
    expect(out).toContain('КОНЕЦ + ВЫБОР');
  });
});
