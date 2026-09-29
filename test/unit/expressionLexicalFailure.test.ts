import { describe, expect, it } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { initialState, reducer } from '../../src/webview/state/queryStore';
import { computeBatchTextSafe } from '../../src/webview/computeBatchText';
import { decideApply, findStaticApplyBlocker } from '../../src/webview/applyGate';

const QUERY = 'ВЫБРАТЬ Т.А ИЗ Спр.Т КАК Т ЛЕВОЕ СОЕДИНЕНИЕ Спр.Б КАК Б ПО Т.А = Б.А ГДЕ Т.А = 1 СГРУППИРОВАТЬ ПО Т.А';
const BROKEN = ['  Т.А = & И Т.Б = 2  ', 'НЕ (Т.А = §)', '(Т.А, &) НЕ В (&П)',
  'Т.А = 1 И Т.Б = "unfinished', "Т.А = 'unfinished И Б", 'Т.А = # И\n  Т.Б = 2',
  '  {&П} {&}  '];

describe('lexically invalid expressions: preserve text, keep preview, refuse Apply', () => {
  for (const placement of ['join', 'legacyJoin', 'where', 'having', 'virtual', 'accounting', 'builder'] as const) {
    it.each(BROKEN)(`${placement}: %s`, expression => {
      const doc = parseBatch(placement === 'virtual'
        ? 'ВЫБРАТЬ Т.А ИЗ РегистрНакопления.Продажи.Остатки(, ) КАК Т'
        : placement === 'accounting'
          ? 'ВЫБРАТЬ Т.А ИЗ РегистрБухгалтерии.Хозрасчетный.Остатки(, , ) КАК Т'
          : QUERY);
      const model = doc.members[0].members[0].model;
      if (placement === 'join' || placement === 'legacyJoin') {
        const join = model.joins![0];
        join.custom = true;
        join.expression = expression;
        if (placement === 'join') join.conditions = [{ custom: true, expression }];
        else delete join.conditions;
      } else if (placement === 'where') model.conditions = [{ custom: true, expression }];
      else if (placement === 'having') model.having = [{ custom: true, expression }];
      else if (placement === 'virtual' || placement === 'accounting') model.tables[0].virtual!.condition = expression;
      else model.builder = { fields: [], conditions: [{ ref: expression, child: false, condition: true }], order: [], totals: [] };

      const original = JSON.stringify(doc);
      expect(generateBatch(doc)).toContain(expression);
      expect(JSON.stringify(doc)).toBe(original);
      // The existing flat store omits top-level HAVING. Exercise its preview
      // through a retained source-subquery model; direct generation is checked above.
      let previewDoc = doc;
      if (placement === 'having') {
        previewDoc = parseBatch('ВЫБРАТЬ П.А ИЗ (ВЫБРАТЬ Т.А ИЗ Спр.Т КАК Т) КАК П');
        previewDoc.members[0].members[0].model.tables[0].subquery = doc.members[0];
      }
      const state = reducer(initialState(), { type: 'LOAD_BATCH', doc: previewDoc });
      const before = JSON.stringify(state);
      const preview = computeBatchTextSafe(state, true);
      expect(preview.error).toBeNull();
      // An enclosing subquery adds layout indentation to continuation lines.
      expect(preview.text.replace(/\n\t+/g, '\n')).toContain(expression);
      expect(decideApply(preview.text, preview.error, findStaticApplyBlocker(state), undefined).ok).toBe(false);
      expect(JSON.stringify(state)).toBe(before);
    });
  }
});
