/**
 * R6: the period-unit words inside `sdblParser` `EXPR_STOP_WORDS` were a private copy
 * without `ПОЛУГОДИЕ`, so bare-field qualification turned
 * `НАЧАЛОПЕРИОДА(Т.Дата, ПОЛУГОДИЕ)` into `Т.ПОЛУГОДИЕ` (Designer → Apply ok). The list
 * now comes from `PERIOD_WORDS`. Platform (СхемаЗапроса, SL_kza 2026-10-11) keeps every
 * unit as written: `ГДЕ НАЧАЛОПЕРИОДА(&Д, ПОЛУГОДИЕ) = &Д`.
 */
import { describe, it, expect } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { PERIOD_WORDS } from '../../src/core/query/sdblKeywordSets';
import { tryOpenDesignerBatch } from '../../src/webview/openDesignerBatch';
import { initialState, reducer } from '../../src/webview/state/queryStore';
import { computeBatchTextSafe } from '../../src/webview/computeBatchText';
import { decideApply, findStaticApplyBlocker } from '../../src/webview/applyGate';

const gen = (text: string): string => generateBatch(parseBatch(text));
const F = 'ИЗ Справочник.Валюты КАК Т';
const contexts: Record<string, (unit: string) => string> = {
  where: u => `ВЫБРАТЬ Т.Код КАК К ${F} ГДЕ НАЧАЛОПЕРИОДА(Т.Дата, ${u}) = &Д`,
  whereBare: u => `ВЫБРАТЬ Т.Код КАК К ${F} ГДЕ НАЧАЛОПЕРИОДА(Дата, ${u}) = &Д`,
  whereParam: u => `ВЫБРАТЬ Т.Код КАК К ${F} ГДЕ НАЧАЛОПЕРИОДА(&Д, ${u}) = &Д`,
  join: u => `ВЫБРАТЬ Т.Код КАК К ${F} ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Валюты КАК В ПО НАЧАЛОПЕРИОДА(Т.Дата, ${u}) = НАЧАЛОПЕРИОДА(В.Дата, ${u})`,
  select: u => `ВЫБРАТЬ КОНЕЦПЕРИОДА(Т.Дата, ${u}) КАК Д ${F}`,
};

describe('R6: every period unit stays a unit, never a field', () => {
  for (const [name, make] of Object.entries(contexts)) {
    it.each([...PERIOD_WORDS])(`${name}: %s`, unit => {
      const out = gen(make(unit));
      expect(out).not.toContain(`.${unit}`);
      // Same output as КВАРТАЛ with the unit swapped, and a stable reopen.
      expect(out).toBe(gen(make('КВАРТАЛ')).split('КВАРТАЛ').join(unit));
      expect(gen(out)).toBe(out);
    });
  }

  it('platform canonical text for ПОЛУГОДИЕ', () => {
    expect(gen(contexts.whereParam('ПОЛУГОДИЕ'))).toBe(
      'ВЫБРАТЬ\n\tТ.Код КАК К\nИЗ\n\tСправочник.Валюты КАК Т\nГДЕ\n\tНАЧАЛОПЕРИОДА(&Д, ПОЛУГОДИЕ) = &Д',
    );
  });

  it('Designer → Apply keeps ПОЛУГОДИЕ', () => {
    const open = tryOpenDesignerBatch(contexts.where('ПОЛУГОДИЕ'));
    if (!open.ok) throw new Error(open.error);
    const state = reducer(initialState(), { type: 'LOAD_BATCH', doc: open.doc });
    const out = computeBatchTextSafe(state, true);
    expect(out.text).toContain('НАЧАЛОПЕРИОДА(Т.Дата, ПОЛУГОДИЕ)');
    expect(decideApply(out.text, out.error, findStaticApplyBlocker(state), undefined).ok).toBe(true);
  });
});
