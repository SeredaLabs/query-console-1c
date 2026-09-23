import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseBatch } from '../../src/core/query/sdblParser';
import { buildResolverFromTables } from '../../src/core/metadata/buildModelResolver';
import { computeBatchTextSafe } from '../../src/webview/computeBatchText';
import { initialState, reducer, type QueryState } from '../../src/webview/state/queryStore';
import { decideApply, findStaticApplyBlocker } from '../../src/webview/applyGate';

/**
 * `webview/applyGate.ts` is the ONE apply gate for both constructors: Classic
 * «ОК» (`webview/App.tsx`) and Canvas «Зберегти» (`webview-canvas/App.tsx`).
 * Driven through the real shared state path (LOAD_BATCH → reducer →
 * computeBatchTextSafe), the same one both UIs use.
 */
const load = (text: string): QueryState => reducer(initialState(), { type: 'LOAD_BATCH', doc: parseBatch(text) });
const decide = (state: QueryState, resolver?: Parameters<typeof decideApply>[3]) => {
  const out = computeBatchTextSafe(state, true);
  return decideApply(out.text, out.error, findStaticApplyBlocker(state), resolver);
};

describe('applyGate: decideApply (click-time check)', () => {
  it('a clean query is applied', () => {
    expect(decide(load('ВЫБРАТЬ В.Код ИЗ Справочник.Валюты КАК В'))).toEqual({ ok: true });
  });

  it('two fields edited to the same alias are refused with the validator message (was saved by Canvas before)', () => {
    let s = load('ВЫБРАТЬ В.Код КАК А, В.Наименование КАК Б ИЗ Справочник.Валюты КАК В');
    s = reducer(s, { type: 'SET_FIELD_ALIAS', fieldIdx: 1, alias: 'А' });
    expect(decide(s)).toEqual({ ok: false, kind: 'invalid', error: 'Повторяющийся псевдоним "А"' });
  });

  it('a field missing from the metadata is refused when a resolver is available', () => {
    const resolver = buildResolverFromTables([{
      kind: 'Справочник', name: 'Валюты', fullName: 'Справочник.Валюты',
      fields: [{ name: 'Код', kind: 'standard', types: [] }],
    }]);
    const r = decide(load('ВЫБРАТЬ В.Цена ИЗ Справочник.Валюты КАК В'), resolver);
    expect(r).toEqual({ ok: false, kind: 'invalid', error: 'Поле "Цена" не найдено в "Справочник.Валюты"' });
  });

  it('empty text, a generation error or a static blocker is "blocked" without re-validating', () => {
    expect(decideApply('', null, null, undefined)).toEqual({ ok: false, kind: 'blocked' });
    expect(decideApply('ВЫБРАТЬ 1', 'boom', null, undefined)).toEqual({ ok: false, kind: 'blocked' });
    expect(decideApply('ВЫБРАТЬ 1', null, { kind: 'malformedCustom' }, undefined)).toEqual({ ok: false, kind: 'blocked' });
  });
});

describe('applyGate: findStaticApplyBlocker (continuous check)', () => {
  it('flags a virtual table with unsafe extra arguments', () => {
    const s = load('ВЫБРАТЬ Т.Период ИЗ РегистрРасчета.Начисления.ДанныеГрафика(&А, &Б, &В) КАК Т');
    expect(findStaticApplyBlocker(s)).toEqual({ kind: 'unsafeVirtualTable', name: 'РегистрРасчета.Начисления.ДанныеГрафика' });
  });

  it('flags a structurally broken custom expression', () => {
    const s = load('ВЫБРАТЬ Валюты.Код + КАК Плохое ИЗ Справочник.Валюты КАК Валюты');
    expect(findStaticApplyBlocker(s)).toEqual({ kind: 'malformedCustom' });
  });

  it('a clean query has no blocker', () => {
    expect(findStaticApplyBlocker(load('ВЫБРАТЬ В.Код ИЗ Справочник.Валюты КАК В'))).toBeNull();
  });
});

/**
 * Source-level pin: both constructors must go through the shared gate, and
 * neither may call the underlying checks directly again (that is how Canvas
 * ended up with a weaker, duplicated copy that skipped `validateBatchText`).
 */
describe('both constructors use the shared apply gate', () => {
  for (const rel of ['../../src/webview/App.tsx', '../../src/webview-canvas/App.tsx']) {
    const src = fs.readFileSync(path.resolve(__dirname, rel), 'utf8');
    it(`${rel.replace('../../', '')} calls findStaticApplyBlocker and decideApply`, () => {
      expect(src).toContain('findStaticApplyBlocker(state)');
      expect(src).toMatch(/decideApply\(/);
    });
    it(`${rel.replace('../../', '')} does not call the underlying checks itself`, () => {
      expect(src).not.toMatch(/\b(findUnsafeVirtualTables|findMalformedCustomExpressions|validateBatchText)\s*\(/);
      expect(src).not.toMatch(/import[^;]*\b(findUnsafeVirtualTables|findMalformedCustomExpressions|validateBatchText)\b/);
    });
  }
});
