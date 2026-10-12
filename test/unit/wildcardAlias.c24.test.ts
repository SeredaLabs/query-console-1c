/**
 * C24 step 0: an unexpanded wildcard got the automatic expression alias, so Designer →
 * Apply wrote `* КАК Поле1` / `Т.* КАК Поле1` — a platform syntax error (СхемаЗапроса,
 * SL_kza 2026-10-11: `Syntax error "КАК"`), and Apply allowed it. A wildcard now keeps
 * no alias and takes no `Поле{n}` number (the platform numbers expressions the same
 * way), and a wildcard with an alias fails the open/Apply check. Expanding the star
 * (step 1) is not part of this change: without expansion `*` / `Т.*` stay as written.
 */
import { describe, it, expect } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { validateBatchText } from '../../src/core/query/validateBatch';
import { deriveUnionColumns } from '../../src/core/query/unionModel';
import { tryOpenDesignerBatch } from '../../src/webview/openDesignerBatch';
import { initialState, reducer } from '../../src/webview/state/queryStore';
import { computeBatchTextSafe } from '../../src/webview/computeBatchText';
import { decideApply, findStaticApplyBlocker } from '../../src/webview/applyGate';

const gen = (text: string): string => generateBatch(parseBatch(text));
function designer(text: string): { text: string; applyOk: boolean } {
  const open = tryOpenDesignerBatch(text);
  if (!open.ok) throw new Error(open.error);
  const state = reducer(initialState(), { type: 'LOAD_BATCH', doc: open.doc });
  const out = computeBatchTextSafe(state, true);
  return { text: out.text, applyOk: decideApply(out.text, out.error, findStaticApplyBlocker(state), undefined).ok };
}

const F = 'ИЗ Справочник.Валюты КАК Т';

describe('C24 step 0: a wildcard is printed without an alias', () => {
  it.each([
    ['ВЫБРАТЬ * ИЗ Справочник.Валюты', 'ВЫБРАТЬ\n\t*\nИЗ\n\tСправочник.Валюты КАК Валюты'],
    [`ВЫБРАТЬ Т.* ${F}`, 'ВЫБРАТЬ\n\tТ.*\nИЗ\n\tСправочник.Валюты КАК Т'],
    [`ВЫБРАТЬ Т.*, Т.Код КАК К2 ${F}`, 'ВЫБРАТЬ\n\tТ.*,\n\tТ.Код КАК К2\nИЗ\n\tСправочник.Валюты КАК Т'],
    [`ВЫБРАТЬ РАЗЛИЧНЫЕ Т.* ${F}`, 'ВЫБРАТЬ РАЗЛИЧНЫЕ\n\tТ.*\nИЗ\n\tСправочник.Валюты КАК Т'],
  ])('%j', (input, expected) => {
    expect(gen(input)).toBe(expected);
    const first = designer(input);
    expect(first.text).toBe(expected);
    expect(first.applyOk).toBe(true);
    // Designer → Apply → reopen is stable.
    expect(designer(first.text).text).toBe(first.text);
    expect(designer(designer(first.text).text).text).toBe(first.text);
  });

  it('a wildcard takes no Поле{n} number (platform numbering)', () => {
    const aliases = (text: string) => parseBatch(text).members[0].members[0].model.fields.map(f => f.alias);
    expect(aliases(`ВЫБРАТЬ Т.*, 1 + 1 ${F}`)).toEqual([undefined, 'Поле1']);
    expect(aliases(`ВЫБРАТЬ 1 + 1, Т.*, 2 + 2 ${F}`)).toEqual(['Поле1', undefined, 'Поле2']);
    // C24 step 1a (D5): next to the kept wildcard the synthesized names are not printed.
    expect(gen(`ВЫБРАТЬ 1 + 1, Т.*, 2 + 2 ${F}`)).toContain('\t1 + 1,\n\tТ.*,\n\t2 + 2\n');
  });

  it('a star over a temp table of the batch still expands', () => {
    expect(gen('ВЫБРАТЬ 1 КАК А ПОМЕСТИТЬ ВТ;\nВЫБРАТЬ * ИЗ ВТ')).toContain('ВЫБРАТЬ\n\tВТ.А КАК А\nИЗ\n\tВТ КАК ВТ');
  });

  it('UNION columns do not number a wildcard', () => {
    const doc = parseBatch(`ВЫБРАТЬ Т.*, 1 + 1 ${F}\nОБЪЕДИНИТЬ ВСЕ\nВЫБРАТЬ Т.*, 2 + 2 ${F}`);
    const columns = deriveUnionColumns(doc.members[0].members).map(c => c.alias);
    expect(columns).not.toContain('Поле2');
    expect(columns).toContain('Поле1');
  });
});

describe('C24 step 0: a wildcard with an alias is not opened or applied', () => {
  it.each([
    'ВЫБРАТЬ * КАК Поле1 ИЗ Справочник.Валюты',
    `ВЫБРАТЬ Т.* КАК Поле1 ${F}`,
    `ВЫБРАТЬ Т.* КАК Х ${F}`,
    `ВЫБРАТЬ Т.Код КАК К, Т.* КАК Х ${F}`,
  ])('%j', text => {
    const v = validateBatchText(text);
    expect(v.ok).toBe(false);
    expect(tryOpenDesignerBatch(text).ok).toBe(false);
    expect(decideApply(text, null, null, undefined).ok).toBe(false);
  });
});
