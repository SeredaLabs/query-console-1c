import { describe, it, expect } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { findUnsafeVirtualTables, findMalformedCustomExpressions } from '../../src/core/query/semanticValidator';
import { assembleBatch, initialState, reducer } from '../../src/webview/state/queryStore';

/**
 * Apply-gate parity fix (2026-09-22, architecture audit P1 #1): Canvas Save
 * used to check ONLY `batchText.error`/empty text — unlike Classic
 * (`webview/App.tsx`), it never ran `findUnsafeVirtualTables`/
 * `findMalformedCustomExpressions` before writing back to the editor, so a
 * virtual table with uncovered positions 3+ (or a structurally broken custom
 * expression) would silently lose data on a Canvas round-trip.
 *
 * Canvas loads a query the exact same way Classic does — `tryOpenBatch` ->
 * `LOAD_BATCH` -> the SAME `webview/state/queryStore.ts` reducer/`assembleBatch`
 * (`src/webview-canvas/App.tsx`'s `loadModel` handler). These tests prove the
 * detection functions Canvas's new gate depends on correctly flag the exact
 * reproduction from the audit (three virtual-table args -> only one survives)
 * when driven through that real state path, not just against a hand-built
 * `BatchDocument`.
 */
describe('Canvas Apply-gate data path (webview/state/queryStore, shared with Classic)', () => {
  it('a virtual table with 3 args (arity 1 + 2 unsafe extra) is flagged after LOAD_BATCH + assembleBatch', () => {
    // РегистрРасчета.*.ДанныеГрафика — confirmed arity 1 (see
    // test/unit/virtualTableRoundTrip.test.ts); &Б/&В are the "3rd+ argument"
    // this gate exists to catch before a silent-loss Save.
    const text = 'ВЫБРАТЬ Т.Период ИЗ РегистрРасчета.Начисления.ДанныеГрафика(&А, &Б, &В) КАК Т';
    const doc = parseBatch(text);

    const state = reducer(initialState(), { type: 'LOAD_BATCH', doc });
    const names = findUnsafeVirtualTables(assembleBatch(state));

    expect(names).toEqual(['РегистрРасчета.Начисления.ДанныеГрафика']);
  });

  it('a query without any unsafe virtual table is not flagged (no false positive blocking Save)', () => {
    const text = 'ВЫБРАТЬ Валюты.Код ИЗ Справочник.Валюты КАК Валюты';
    const doc = parseBatch(text);

    const state = reducer(initialState(), { type: 'LOAD_BATCH', doc });
    expect(findUnsafeVirtualTables(assembleBatch(state))).toEqual([]);
    expect(findMalformedCustomExpressions(assembleBatch(state))).toEqual([]);
  });

  it('a structurally broken custom field expression is flagged after LOAD_BATCH + assembleBatch', () => {
    // Same malformed-custom-expression class as Classic's malformedCustomError
    // gate (semanticValidator.ts's isStructurallyValidExpression) — a raw
    // trailing binary operator the tolerant parser keeps as custom text
    // without checking its own grammatical correctness.
    const doc = parseBatch('ВЫБРАТЬ Валюты.Код + КАК Плохое ИЗ Справочник.Валюты КАК Валюты');

    const state = reducer(initialState(), { type: 'LOAD_BATCH', doc });
    const hits = findMalformedCustomExpressions(assembleBatch(state));

    expect(hits.length).toBeGreaterThan(0);
  });
});

// Source-level wiring of the shared gate (Classic and Canvas) is pinned in
// test/unit/applyGate.test.ts.
