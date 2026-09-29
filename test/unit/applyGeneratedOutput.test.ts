/**
 * C8: the Apply gate also checks the GENERATED output. The static
 * malformed-expression check covers the input model, but a balanced model can
 * be generated into text whose own custom expression is unbalanced: the
 * tolerant parser then reparses it successfully by swallowing the following
 * sections into that opaque expression. Known trigger: a line comment at the end
 * of a manually entered JOIN conjunct, whose synthetic wrapper `)` lands inside
 * the comment.
 */
import { describe, it, expect } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { validateBatchText } from '../../src/core/query/validateBatch';
import { findMalformedCustomExpressions } from '../../src/core/query/semanticValidator';
import { initialState, reducer, type QueryState } from '../../src/webview/state/queryStore';
import { computeBatchTextSafe } from '../../src/webview/computeBatchText';
import { decideApply, findStaticApplyBlocker, GENERATED_MALFORMED_EXPRESSION } from '../../src/webview/applyGate';
import { localizeDiagnostic, setLocale } from '../../src/webview/i18n';

const QUERY = 'ВЫБРАТЬ Т.А КАК А, СУММА(Т.Б) КАК Б ИЗ Спр.Т КАК Т ЛЕВОЕ СОЕДИНЕНИЕ Спр.Б КАК Б ПО Т.А = Б.А ' +
  'ГДЕ Т.А = 1 СГРУППИРОВАТЬ ПО Т.А';

/** Loads QUERY and replaces its JOIN condition with a custom one, as the condition editor does. */
function withJoinCondition(expression: string, legacy = false): QueryState {
  const doc = parseBatch(QUERY);
  const join = doc.members[0].members[0].model.joins![0];
  join.custom = true;
  join.expression = expression;
  if (legacy) delete join.conditions;
  else join.conditions = [{ custom: true, expression }];
  return reducer(initialState(), { type: 'LOAD_BATCH', doc });
}

function applyOf(state: QueryState) {
  const out = computeBatchTextSafe(state, true);
  return { out, decision: decideApply(out.text, out.error, findStaticApplyBlocker(state), undefined) };
}

describe('C8: generated output with a malformed custom expression is not applied', () => {
  for (const legacy of [false, true]) {
    it(`JOIN ПО with a trailing line comment (${legacy ? 'expression' : 'conditions[]'})`, () => {
      const state = withJoinCondition('Т.А = Б.А // к', legacy);
      // The input model itself is balanced and passes the static C5 check.
      expect(findStaticApplyBlocker(state)).toBeNull();
      const { out, decision } = applyOf(state);
      expect(out.text).toContain('Б.А // к)');
      // The generated text formally reparses and validates…
      expect(validateBatchText(out.text!).ok).toBe(true);
      // …only because the unbalanced `(` swallowed ГДЕ/СГРУППИРОВАТЬ ПО into the join text.
      const reparsed = parseBatch(out.text!);
      expect(reparsed.members[0].members[0].model.conditions).toBeUndefined();
      expect(findMalformedCustomExpressions(reparsed).length).toBeGreaterThan(0);
      expect(decision).toEqual({ ok: false, kind: 'invalid', error: GENERATED_MALFORMED_EXPRESSION });
    });
  }

  it('JOIN ПО where the comment also splits the conjunct (`// И к`)', () => {
    const { decision } = applyOf(withJoinCondition('Т.А = Б.А // И к\nИ Т.Б = Б.Б'));
    expect(decision).toEqual({ ok: false, kind: 'invalid', error: GENERATED_MALFORMED_EXPRESSION });
  });

  it('the message is localized (not the generic unknown-diagnostic text)', () => {
    try {
      setLocale('en');
      expect(localizeDiagnostic(GENERATED_MALFORMED_EXPRESSION)).toBe('The generated query text contains a malformed expression; applying is blocked');
      setLocale('uk');
      expect(localizeDiagnostic(GENERATED_MALFORMED_EXPRESSION)).toBe('Згенерований текст запиту містить некоректний вираз; застосування заблоковано');
    } finally {
      setLocale('en'); // the module default
    }
  });

  it('a malformed INPUT expression is still blocked by the static C5 check', () => {
    const state = withJoinCondition('(Т.А = Б.А');
    expect(findStaticApplyBlocker(state)).toEqual({ kind: 'malformedCustom' });
    expect(applyOf(state).decision).toEqual({ ok: false, kind: 'blocked' });
  });

  it('valid generated output, including a comment that stays on its own line, is applied', () => {
    for (const expression of ['Т.А = Б.А И Т.Б = Б.Б', 'Т.А = Б.А // (\nИ Т.Б = Б.Б']) {
      expect(applyOf(withJoinCondition(expression)).decision).toEqual({ ok: true });
    }
    const plain = reducer(initialState(), { type: 'LOAD_BATCH', doc: parseBatch(QUERY) });
    expect(applyOf(plain).decision).toEqual({ ok: true });
  });
});
