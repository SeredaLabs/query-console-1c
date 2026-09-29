/**
 * A user-authored line comment in an arbitrary JOIN condition is rendered
 * verbatim: never split, never passed through the expression formatter, and
 * wrapped so that no synthetic `)` (or anything appended after the condition)
 * lands inside the comment. The parser strips comments from JOIN text it reads,
 * so such comments only come from manual edits.
 */
import { describe, it, expect } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { tokenize } from '../../src/core/query/sdblLexer';
import { findMalformedCustomExpressions } from '../../src/core/query/semanticValidator';
import { initialState, reducer } from '../../src/webview/state/queryStore';
import { computeBatchTextSafe } from '../../src/webview/computeBatchText';
import { decideApply, findStaticApplyBlocker } from '../../src/webview/applyGate';
import type { BatchDocument } from '../../src/core/query/batchModel';

const QUERY = 'ВЫБРАТЬ Т.А КАК А ИЗ Спр.Т КАК Т ЛЕВОЕ СОЕДИНЕНИЕ Спр.Б КАК Б ПО Т.А = Б.А ' +
  'ГДЕ Т.А = 1 СГРУППИРОВАТЬ ПО Т.А';

type Placement = 'conditions[] first' | 'conditions[] next' | 'expression';

function build(expression: string, placement: Placement, query = QUERY, inner = false): BatchDocument {
  const doc = parseBatch(query);
  let model = doc.members[0].members[0].model;
  if (inner) model = model.tables[0].subquery!.members[0].model;
  const join = model.joins![0];
  if (placement === 'conditions[] next') {
    join.conditions = [join.conditions![0], { custom: true, expression }];
  } else {
    join.custom = true;
    join.expression = expression;
    if (placement === 'expression') delete join.conditions;
    else join.conditions = [{ custom: true, expression }];
  }
  return doc;
}

const codeTokens = (text: string): string =>
  tokenize(text).filter(t => t.type !== 'eof').map(t => t.value).join(' ');
const commentsOf = (text: string): string[] =>
  tokenize(text, { comments: true }).filter(t => t.type === 'comment').map(t => t.text);

const CASES: Array<[string, string]> = [
  ['trailing comment', 'Т.А = Б.А // к'],
  ['comment with И, then И', 'Т.А = Б.А // И к\nИ Т.Б = Б.Б'],
  ['comment with (, then И', 'Т.А = Б.А // (\nИ Т.Б = Б.Б'],
  ['comment with ) " И ИЛИ', 'Т.А = Б.А // ) " И ИЛИ'],
];

describe('JOIN ПО with a user-authored line comment', () => {
  for (const [name, expression] of CASES) {
    for (const placement of ['conditions[] first', 'conditions[] next', 'expression'] as const) {
      it(`${name} (${placement})`, () => {
        const doc = build(expression, placement);
        const out = generateBatch(doc);
        // The comment is kept once, verbatim, and the code tokens are unchanged.
        expect(commentsOf(out)).toEqual(commentsOf(expression));
        expect(codeTokens(out)).toContain(codeTokens(expression));
        // The output is well formed: nothing swallowed, no malformed expression.
        const reparsed = parseBatch(out);
        const model = reparsed.members[0].members[0].model;
        expect(findMalformedCustomExpressions(reparsed)).toEqual([]);
        expect(model.conditions?.length).toBe(1);
        expect(model.grouping).toBeDefined();
        // Apply accepts it (no C8 block) and generation is deterministic.
        const state = reducer(initialState(), { type: 'LOAD_BATCH', doc });
        const text = computeBatchTextSafe(state, true);
        expect(decideApply(text.text, text.error, findStaticApplyBlocker(state), undefined)).toEqual({ ok: true });
        expect(generateBatch(doc)).toBe(out);
        // Reopening: the parser strips JOIN comments; the code round-trips stably.
        const again = generateBatch(reparsed);
        expect(commentsOf(again)).toEqual([]);
        expect(generateBatch(parseBatch(again))).toBe(again);
      });
    }
  }

  it('a comment at the end of a subquery source does not swallow `) КАК …`', () => {
    const query = 'ВЫБРАТЬ П.А КАК А ИЗ (ВЫБРАТЬ Т.А КАК А ИЗ Спр.Т КАК Т ЛЕВОЕ СОЕДИНЕНИЕ Спр.Б КАК Б ПО Т.А = Б.А) КАК П ГДЕ П.А = 1';
    for (const placement of ['conditions[] first', 'expression'] as const) {
      const out = generateBatch(build('Т.А = Б.А // к', placement, query, true));
      expect(out).toContain('ПО (Т.А = Б.А) // к\n\t) КАК П');
      const reparsed = parseBatch(out);
      expect(findMalformedCustomExpressions(reparsed)).toEqual([]);
      expect(reparsed.members[0].members[0].model.conditions?.length).toBe(1);
    }
  });

  it('a comment at the end of a condition subquery does not swallow its `)`', () => {
    const query = 'ВЫБРАТЬ Х.А КАК А ИЗ Спр.Х КАК Х ГДЕ Х.А В (ВЫБРАТЬ Т.А ИЗ Спр.Т КАК Т ЛЕВОЕ СОЕДИНЕНИЕ Спр.Б КАК Б ПО Т.А = Б.А) И Х.Б = 2';
    const doc = parseBatch(query);
    const join = doc.members[0].members[0].model.conditions![0].subquery!.members[0].model.joins![0];
    join.custom = true;
    join.expression = 'Т.А = Б.А // к';
    join.conditions = [{ custom: true, expression: 'Т.А = Б.А // к' }];
    const out = generateBatch(doc);
    expect(out).toMatch(/\(Т\.А = Б\.А\) \/\/ к\n\t+\)\n\tИ Х\.Б = 2/);
    const reparsed = parseBatch(out);
    expect(findMalformedCustomExpressions(reparsed)).toEqual([]);
    expect(reparsed.members[0].members[0].model.conditions?.length).toBe(2);
  });

  it('a trailing comment at the top level adds no blank line', () => {
    expect(generateBatch(build('Т.А = Б.А // к', 'conditions[] first'))).toContain('ПО (Т.А = Б.А) // к\nГДЕ');
  });

  it('`"a//b"` is a string, not a comment: ordinary wrapping', () => {
    for (const placement of ['conditions[] first', 'expression'] as const) {
      const out = generateBatch(build('Т.С = "a//b"', placement));
      expect(out).toContain('ПО (Т.С = "a//b")\nГДЕ');
      expect(commentsOf(out)).toEqual([]);
    }
  });
});
