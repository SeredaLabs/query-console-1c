/**
 * C40: a scalar subquery used as an operand — of a comparison in ГДЕ, a ВЫБОР
 * condition or a join condition, or as a function argument — is a syntax error on
 * the platform (validate_query, 8.3.15.1489, test/fixtures/platform/c40-scalar-subquery.json).
 * The parser keeps such a condition as custom text, and the structural acceptor
 * (`isStructurallyValidExpression`) used to skip any `(ВЫБРАТЬ …)` group, so Apply
 * wrote the query back. A subquery is accepted only as the operand of `В` /
 * `НЕ В` / `В ИЕРАРХИИ`, which the platform accepts.
 *
 * The rule is the shared Apply contract of Classic and Canvas
 * (`findStaticApplyBlocker` / `decideApply`); a refusal writes nothing.
 * Version boundary: evidence is from 8.3.15 only.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { tryOpenDesignerBatch } from '../../src/webview/openDesignerBatch';
import { initialState, reducer } from '../../src/webview/state/queryStore';
import { computeBatchTextSafe } from '../../src/webview/computeBatchText';
import { decideApply, findStaticApplyBlocker } from '../../src/webview/applyGate';
import { isStructurallyValidExpression } from '../../src/core/query/expressionSyntaxCheck';
import { computeQueryParseProblems } from '../../src/extension/queryDiagnostics';

type Case = { name: string; query: string; platform: { valid: boolean } };
const evidence = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'platform', 'c40-scalar-subquery.json'), 'utf8'));
const cases: Case[] = evidence.cases;

function applyOf(query: string) {
  const open = tryOpenDesignerBatch(query);
  if (!open.ok) return { opened: false as const };
  const state = reducer(initialState(), { type: 'LOAD_BATCH', doc: open.doc });
  const out = computeBatchTextSafe(state, true);
  const blocker = findStaticApplyBlocker(state);
  return { opened: true as const, blocker, decision: decideApply(out.text, out.error, blocker, undefined, query) };
}

describe('C40: platform-rejected scalar subqueries are never applied', () => {
  it.each(cases.filter(c => !c.platform.valid).map(c => [c.name, c] as const))('%s', (_name, c) => {
    const r = applyOf(c.query);
    // Open keeps the text; only Apply is refused (nothing is written).
    expect(r.opened).toBe(true);
    if (!r.opened) return;
    expect(r.decision.ok).toBe(false);
  });

  it.each(cases.filter(c => !c.platform.valid && c.name !== 'select_list').map(c => [c.name, c] as const))(
    '%s: refused before Apply by the shared static blocker', (_name, c) => {
      const r = applyOf(c.query);
      expect(r.opened && r.blocker).toEqual({ kind: 'malformedCustom' });
    });
});

describe('C40: platform-accepted subqueries stay applicable', () => {
  it.each(cases.filter(c => c.platform.valid).map(c => [c.name, c] as const))('%s', (_name, c) => {
    const r = applyOf(c.query);
    expect(r.opened).toBe(true);
    if (!r.opened) return;
    expect(r.blocker).toBeNull();
    expect(r.decision).toEqual({ ok: true });
  });
});

describe('C40: the structural acceptor', () => {
  it.each([
    'Т.А В (ВЫБРАТЬ 1)', 'НЕ Т.А В (ВЫБРАТЬ 1)', 'Т.А НЕ В (ВЫБРАТЬ 1)', 'Т.А В ИЕРАРХИИ (ВЫБРАТЬ 1)',
    '(Т.А, Т.Б) В (ВЫБРАТЬ 1, 2)', 'Т.А IN (SELECT 1)', '(Т.А В (ВЫБРАТЬ 1))', '(Т.А + 1) = 2', 'ЕСТЬNULL(Т.А, 0) = 1',
  ])('accepts %s', text => expect(isStructurallyValidExpression(text)).toBe(true));

  it.each([
    'Т.А = (ВЫБРАТЬ 1)', '(ВЫБРАТЬ 1) = Т.А', 'Т.А <> (ВЫБРАТЬ 1)', 'Т.А = (SELECT 1)', '(ВЫБРАТЬ 1)',
    'ЕСТЬNULL((ВЫБРАТЬ 1), 0)', 'ЕСТЬNULL(ВЫБРАТЬ 1, 0)', 'Т.А + (ВЫБРАТЬ 1) = 2', 'Т.А МЕЖДУ (ВЫБРАТЬ 1) И 2',
  ])('rejects %s', text => expect(isStructurallyValidExpression(text)).toBe(false));
});

describe('C40: editor diagnostics use the same check', () => {
  const literal = (q: string) => `Запрос.Текст = "${q}";`;
  it('a rejected scalar subquery is marked, an IN subquery is not', () => {
    const [rejected, accepted] = ['rhs_eq', 'in'].map(n => cases.find(c => c.name === n)!.query.replace(/\s+/g, ' '));
    expect(computeQueryParseProblems(literal(rejected)).map(p => p.kind)).toEqual(['malformedExpression']);
    expect(computeQueryParseProblems(literal(accepted))).toEqual([]);
  });
});
