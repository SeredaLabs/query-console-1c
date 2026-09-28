/**
 * C4: a bare field in a condition of a sole-source subquery belongs to an
 * enclosing query when metadata proves the inner source lacks it and exactly one
 * source at the nearest enclosing level owns it (the live-verified rule already
 * applied to the select list, `src/core/semantic/correlation.ts`). Without that
 * proof the previous sole-source binding is kept.
 */
import { describe, it, expect } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { buildResolverFromTables } from '../../src/core/metadata/buildModelResolver';
import type { MetaTable } from '../../src/core/metadata/types';
import { initialState, reducer } from '../../src/webview/state/queryStore';
import { computeBatchTextSafe } from '../../src/webview/computeBatchText';
import { decideApply, findStaticApplyBlocker } from '../../src/webview/applyGate';

const T = (name: string, fields: string[]): MetaTable => ({
  kind: 'Справочник', name, fullName: `Справочник.${name}`,
  fields: fields.map(f => ({ name: f, kind: 'standard' as const, types: [{ primitive: 'Число' as const }] })),
});
const r = buildResolverFromTables([T('А', ['Код', 'Цена', 'Флаг']), T('В', ['Код', 'Имя'])]);
const inner = (where: string) =>
  `ВЫБРАТЬ А.Код ИЗ Справочник.А КАК А ГДЕ А.Код В (ВЫБРАТЬ В.Код ИЗ Справочник.В КАК В ГДЕ ${where})`;
const flat = (s: string) => s.replace(/\s+/g, ' ');

function roundTrip(text: string, resolver = r): string {
  const out = generateBatch(parseBatch(text, resolver));
  expect(generateBatch(parseBatch(out, resolver))).toBe(out);
  return flat(out);
}

describe('C4: correlated bare fields in subquery conditions', () => {
  for (const [where, expected] of [
    ['Цена > 0', 'ГДЕ А.Цена > 0)'],
    ['Цена = &Ц', 'ГДЕ А.Цена = &Ц)'],
    ['Цена + 1 > 0', 'ГДЕ А.Цена + 1 > 0)'],
    ['Флаг', 'ГДЕ А.Флаг)'],
    ['НЕ Флаг', 'ГДЕ НЕ А.Флаг)'],
    ['Цена > 0 И Имя = "x"', 'ГДЕ А.Цена > 0 И В.Имя = "x")'],
    ['В.Код > Цена', 'ГДЕ В.Код > А.Цена)'],
    ['(Цена > 0 ИЛИ Имя = "x")', 'ГДЕ (А.Цена > 0 ИЛИ В.Имя = "x"))'],
  ]) {
    it(`binds to the outer owner: ${where}`, () => {
      expect(roundTrip(inner(where))).toContain(expected);
    });
  }

  for (const where of ['А.Флаг', 'НЕ А.Флаг', 'А.Цена = &Ц', 'А.Цена > 0']) {
    it(`keeps an explicit outer reference without double qualification: ${where}`, () => {
      const out = roundTrip(inner(where));
      expect(out).toContain(`ГДЕ ${where})`);
      expect(out).not.toContain('В.А.');
    });
  }

  it('an inner field named like the outer alias still navigates the inner source', () => {
    const rf = buildResolverFromTables([T('А', ['Код', 'Цена']), T('В', ['Код', 'А'])]);
    expect(flat(generateBatch(parseBatch(inner('А.Цена = &Ц'), rf)))).toContain('ГДЕ В.А.Цена = &Ц)');
  });

  it('keeps inner ownership when the inner source has the field', () => {
    expect(roundTrip(inner('Имя = &И'))).toContain('ГДЕ В.Имя = &И)');
  });

  it('keeps an explicitly qualified inner reference as written', () => {
    expect(roundTrip(inner('В.Цена > 0'))).toContain('ГДЕ В.Цена > 0)');
  });

  it('keeps the previous binding without metadata', () => {
    const out = flat(generateBatch(parseBatch(inner('Цена > 0'))));
    expect(out).toContain('ГДЕ В.Цена > 0)');
  });

  it('keeps the previous binding when the inner source has no metadata', () => {
    const noInner = buildResolverFromTables([T('А', ['Код', 'Цена'])]);
    expect(flat(generateBatch(parseBatch(inner('Цена > 0'), noInner)))).toContain('ГДЕ В.Цена > 0)');
  });

  it('keeps the previous binding when two sources at the nearest level own the field', () => {
    const r2 = buildResolverFromTables([T('А', ['Код', 'Цена']), T('Б', ['Цена']), T('В', ['Код'])]);
    const text = 'ВЫБРАТЬ А.Код ИЗ Справочник.А КАК А, Справочник.Б КАК Б ' +
      'ГДЕ А.Код В (ВЫБРАТЬ В.Код ИЗ Справочник.В КАК В ГДЕ Цена > 0)';
    expect(flat(generateBatch(parseBatch(text, r2)))).toContain('ГДЕ В.Цена > 0)');
  });

  it('does not correlate a source subquery with its query', () => {
    const text = 'ВЫБРАТЬ Т.Код ИЗ (ВЫБРАТЬ В.Код ИЗ Справочник.В КАК В ГДЕ Цена > 0) КАК Т';
    expect(flat(generateBatch(parseBatch(text, r)))).toContain('ГДЕ В.Цена > 0)');
  });

  it('nearest enclosing level wins over a farther one', () => {
    const r3 = buildResolverFromTables([T('А', ['Код', 'Цена']), T('Б', ['Код', 'Цена']), T('В', ['Код'])]);
    const text = 'ВЫБРАТЬ А.Код ИЗ Справочник.А КАК А ГДЕ А.Код В ' +
      '(ВЫБРАТЬ Б.Код ИЗ Справочник.Б КАК Б ГДЕ Б.Код В ' +
      '(ВЫБРАТЬ В.Код ИЗ Справочник.В КАК В ГДЕ Цена > 0))';
    const out = roundTrip(text, r3);
    expect(out).toContain('ГДЕ Б.Цена > 0)');
    expect(out).not.toContain('А.Цена');
  });

  it('falls through to a farther level when the nearer one lacks the field', () => {
    const r4 = buildResolverFromTables([T('А', ['Код', 'Цена']), T('Б', ['Код']), T('В', ['Код'])]);
    const text = 'ВЫБРАТЬ А.Код ИЗ Справочник.А КАК А ГДЕ А.Код В ' +
      '(ВЫБРАТЬ Б.Код ИЗ Справочник.Б КАК Б ГДЕ Б.Код В ' +
      '(ВЫБРАТЬ В.Код ИЗ Справочник.В КАК В ГДЕ Цена > 0))';
    expect(roundTrip(text, r4)).toContain('ГДЕ А.Цена > 0)');
  });

  it('every condition subquery of one query sees the same enclosing level', () => {
    const text = 'ВЫБРАТЬ А.Код ИЗ Справочник.А КАК А ' +
      'ГДЕ А.Код В (ВЫБРАТЬ В.Код ИЗ Справочник.В КАК В ГДЕ Цена > 0) ' +
      'И А.Код В (ВЫБРАТЬ В.Код ИЗ Справочник.В КАК В ГДЕ Цена < 9)';
    const out = roundTrip(text);
    expect(out).toContain('ГДЕ А.Цена > 0)');
    expect(out).toContain('ГДЕ А.Цена < 9)');
  });

  it('applies inside a JOIN condition subquery', () => {
    const rj = buildResolverFromTables([T('А', ['Код', 'Цена']), T('Б', ['Код']), T('В', ['Код'])]);
    const text = 'ВЫБРАТЬ А.Код ИЗ Справочник.А КАК А ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Б КАК Б ' +
      'ПО А.Код = Б.Код И Б.Код В (ВЫБРАТЬ В.Код ИЗ Справочник.В КАК В ГДЕ Цена > 0)';
    expect(flat(generateBatch(parseBatch(text, rj)))).toContain('ГДЕ А.Цена > 0)');
  });

  it('Apply writes the outer-qualified text', () => {
    const state = reducer(initialState(), { type: 'LOAD_BATCH', doc: parseBatch(inner('Цена > 0'), r) });
    const output = computeBatchTextSafe(state, true);
    expect(decideApply(output.text, output.error, findStaticApplyBlocker(state), undefined)).toEqual({ ok: true });
    expect(flat(output.text!)).toContain('ГДЕ А.Цена > 0)');
  });

  // Query-wizard text observed live on 2026-09-28 (docs/development/audits/c4-correlated-2026-09-28.md).
  describe('matches the live 1C query wizard', () => {
    const live = buildResolverFromTables([
      { kind: 'Справочник', name: 'Пользователи', fullName: 'Справочник.Пользователи',
        fields: ['Ссылка', 'Недействителен', 'Служебный'].map(f => ({ name: f, kind: 'standard' as const, types: [{ primitive: 'Булево' as const }] })) },
      { kind: 'Справочник', name: 'ИдентификаторыОбъектовМетаданных', fullName: 'Справочник.ИдентификаторыОбъектовМетаданных',
        fields: ['Ссылка', 'Наименование'].map(f => ({ name: f, kind: 'standard' as const, types: [{ primitive: 'Строка' as const }] })) },
    ]);
    const input = (where: string) =>
      'ВЫБРАТЬ П.Ссылка КАК Ссылка ИЗ Справочник.Пользователи КАК П ГДЕ П.Ссылка В ' +
      `(ВЫБРАТЬ Ид.Ссылка ИЗ Справочник.ИдентификаторыОбъектовМетаданных КАК Ид ГДЕ ${where})`;
    const wizard = (where: string) =>
      'ВЫБРАТЬ\n\tП.Ссылка КАК Ссылка\nИЗ\n\tСправочник.Пользователи КАК П\nГДЕ\n\tП.Ссылка В\n' +
      '\t\t\t(ВЫБРАТЬ\n\t\t\t\tИд.Ссылка\n\t\t\tИЗ\n\t\t\t\tСправочник.ИдентификаторыОбъектовМетаданных КАК Ид\n' +
      `\t\t\tГДЕ\n${where})`;
    for (const [where, printed] of [
      ['Недействителен = ЛОЖЬ', '\t\t\t\tП.Недействителен = ЛОЖЬ'],
      ['НЕ Недействителен И Служебный = &Служебный', '\t\t\t\tНЕ П.Недействителен\n\t\t\t\tИ П.Служебный = &Служебный'],
      ['П.Недействителен = ЛОЖЬ', '\t\t\t\tП.Недействителен = ЛОЖЬ'],
    ]) {
      it(where, () => {
        expect(generateBatch(parseBatch(input(where), live))).toBe(wizard(printed));
        expect(generateBatch(parseBatch(wizard(printed), live))).toBe(wizard(printed));
      });
    }
  });
});
