import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
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

/**
 * Pins the fix at the source level: Canvas's App.tsx must import and use both
 * gate functions, the same way Classic's App.tsx already does. A future edit
 * that accidentally drops this wiring (e.g. during an unrelated Save-flow
 * refactor) fails this test instead of silently reintroducing the bug.
 */
describe('src/webview-canvas/App.tsx uses the same Apply-gate as Classic', () => {
  const APP_TSX = path.resolve(__dirname, '../../src/webview-canvas/App.tsx');

  it('imports findUnsafeVirtualTables and findMalformedCustomExpressions from semanticValidator', () => {
    const src = fs.readFileSync(APP_TSX, 'utf8');
    expect(src).toMatch(/import\s*\{[^}]*findUnsafeVirtualTables[^}]*\}\s*from\s*['"]\.\.\/core\/query\/semanticValidator['"]/);
    expect(src).toMatch(/import\s*\{[^}]*findMalformedCustomExpressions[^}]*\}\s*from\s*['"]\.\.\/core\/query\/semanticValidator['"]/);
  });

  it('handleSave and saveDisabled both reference the gate result (not just batchText.error)', () => {
    const src = fs.readFileSync(APP_TSX, 'utf8');
    expect(src).toContain('saveBlocked');
    // The gate must actually be able to block: `saveBlocked` must be read at
    // least twice — once for the button's disabled state, once inside
    // handleSave's own early-return (defense in depth, mirroring Classic's
    // onOk double-check of generationError/unsafeVtError/malformedCustomError).
    const occurrences = (src.match(/saveBlocked/g) ?? []).length;
    expect(occurrences).toBeGreaterThanOrEqual(3); // declaration + handleSave + saveDisabled
  });
});
