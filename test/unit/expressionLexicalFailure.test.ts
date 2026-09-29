import { describe, expect, it } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { initialState, reducer } from '../../src/webview/state/queryStore';
import { computeBatchTextSafe } from '../../src/webview/computeBatchText';
import { decideApply, findStaticApplyBlocker } from '../../src/webview/applyGate';
import type { QueryDocument } from '../../src/core/query/unionModel';

const QUERY = 'ВЫБРАТЬ Т.А ИЗ Спр.Т КАК Т ЛЕВОЕ СОЕДИНЕНИЕ Спр.Б КАК Б ПО Т.А = Б.А ГДЕ Т.А = 1 СГРУППИРОВАТЬ ПО Т.А';
const BROKEN = ['  Т.А = & И Т.Б = 2  ', 'НЕ (Т.А = §)', '(Т.А, &) НЕ В (&П)',
  'Т.А = 1 И Т.Б = "unfinished', "Т.А = 'unfinished И Б", 'Т.А = # И\n  Т.Б = 2',
  '  {&П} {&}  '];

type Placement =
  | 'join' | 'legacyJoin' | 'where' | 'having' | 'virtual' | 'accounting' | 'builder'
  | 'select' | 'trailing' | 'group' | 'order' | 'index' | 'totals' | 'periodBy'
  | 'tabExpr' | 'castPrefix' | 'criterion';

function modelOf(doc: QueryDocument) {
  return doc.members[0].members[0].model;
}

function docFor(placement: Placement): QueryDocument {
  if (placement === 'virtual') {
    return parseBatch('ВЫБРАТЬ Т.А ИЗ РегистрНакопления.Продажи.Остатки(, ) КАК Т');
  }
  if (placement === 'accounting') {
    return parseBatch('ВЫБРАТЬ Т.А ИЗ РегистрБухгалтерии.Хозрасчетный.Остатки(, , ) КАК Т');
  }
  if (placement === 'index') {
    return parseBatch('ВЫБРАТЬ Т.А КАК А ПОМЕСТИТЬ ВТ ИЗ Спр.Т КАК Т ИНДЕКСИРОВАТЬ ПО Т.А');
  }
  if (placement === 'totals' || placement === 'periodBy') {
    return parseBatch('ВЫБРАТЬ Т.А КАК А ИЗ Спр.Т КАК Т ИТОГИ СУММА(А) ПО Т.А');
  }
  if (placement === 'criterion') {
    return parseBatch('ВЫБРАТЬ Т.Ссылка ИЗ КритерийОтбора.Основной(&К) КАК Т');
  }
  return parseBatch(QUERY);
}

function place(doc: QueryDocument, placement: Placement, expression: string): void {
  const model = modelOf(doc);
  if (placement === 'join' || placement === 'legacyJoin') {
    const join = model.joins![0];
    join.custom = true;
    join.expression = expression;
    if (placement === 'join') join.conditions = [{ custom: true, expression }];
    else delete join.conditions;
  } else if (placement === 'where') model.conditions = [{ custom: true, expression }];
  else if (placement === 'having') model.having = [{ custom: true, expression }];
  else if (placement === 'virtual' || placement === 'accounting') model.tables[0].virtual!.condition = expression;
  else if (placement === 'builder') {
    model.builder = { fields: [], conditions: [{ ref: expression, child: false, condition: true }], order: [], totals: [] };
  } else if (placement === 'select') {
    model.fields = [{ tableId: 't0', path: '', expression, alias: 'Поле1' }];
  } else if (placement === 'trailing') {
    model.trailingFields = [{ tableId: 't0', path: '', expression, alias: 'Хвост' }];
  } else if (placement === 'group') {
    model.grouping = {
      multiple: false,
      groupFields: [{ tableId: '', path: '', expression }],
      groupSets: [],
      aggregates: [],
    };
  } else if (placement === 'order') {
    model.order = { fields: [{ tableId: '', path: '', expression, direction: 'asc' }], auto: false };
  } else if (placement === 'index') {
    model.indexing = { indexes: [{ unique: false, fields: [{ tableId: '', path: '', expression }] }] };
  } else if (placement === 'totals') {
    model.totals!.totalFields = [{ tableId: '', path: '', expression }];
  } else if (placement === 'periodBy') {
    model.totals!.groupFields[0].periodBy = expression;
  } else if (placement === 'tabExpr') {
    model.tabSectionFields = [{
      tableId: model.tables[0].id, tsName: 'Товары', tsFullName: 'Спр.Т.Товары', fields: [],
      exprFields: [{ expression, alias: 'Колонка' }],
    }];
  } else if (placement === 'castPrefix') {
    model.tabSectionFields = [{
      tableId: model.tables[0].id, tsName: 'Товары', tsFullName: 'Спр.Т.Товары', fields: ['Код'],
      castPrefix: expression,
    }];
  } else {
    model.tables[0].virtual!.period = expression;
  }
}

function assertSlot(doc: QueryDocument, expression: string): void {
  const original = JSON.stringify(doc);
  expect(generateBatch(doc)).toContain(expression);
  expect(JSON.stringify(doc)).toBe(original);
  const state = reducer(initialState(), { type: 'LOAD_BATCH', doc });
  const before = JSON.stringify(state);
  const preview = computeBatchTextSafe(state, true);
  expect(preview.error).toBeNull();
  expect(preview.text).toContain(expression);
  expect(decideApply(preview.text, preview.error, findStaticApplyBlocker(state), undefined).ok).toBe(false);
  expect(JSON.stringify(state)).toBe(before);
}

const PLACEMENTS: Placement[] = [
  'join', 'legacyJoin', 'where', 'having', 'virtual', 'accounting', 'builder',
  'select', 'trailing', 'group', 'order', 'index', 'totals', 'periodBy',
  'tabExpr', 'castPrefix', 'criterion',
];

describe('lexically invalid expressions: preserve text, keep preview, refuse Apply', () => {
  for (const placement of PLACEMENTS) {
    it.each(BROKEN)(`${placement}: %s`, expression => {
      const doc = docFor(placement);
      place(doc, placement, expression);
      assertSlot(doc, expression);
    });
  }
});

describe('invalid text uses slot layout, not a swallowable wrapper', () => {
  const expression = 'Т.А = "unfinished';

  it('JOIN does not wrap invalid conjuncts in extra parentheses', () => {
    const doc = docFor('join');
    place(doc, 'join', expression);
    const text = generateBatch(doc);
    expect(text).toContain(expression);
    expect(text).not.toContain(`(${expression}`);
  });

  it('virtual-table closing parenthesis is not on the same line when the whole prefix is lexically invalid', () => {
    const doc = docFor('virtual');
    place(doc, 'virtual', expression);
    const text = generateBatch(doc);
    const i = text.indexOf(expression);
    expect(i).toBeGreaterThan(-1);
    expect(text.slice(i + expression.length).startsWith(')')).toBe(false);
  });

  it('builder block closer is not on the same line when the whole field is lexically invalid', () => {
    const doc = docFor('builder');
    place(doc, 'builder', expression);
    const text = generateBatch(doc);
    const i = text.indexOf(expression);
    expect(i).toBeGreaterThan(-1);
    expect(text.slice(i + expression.length).startsWith('}')).toBe(false);
    expect(text).not.toContain(`(${expression}`);
  });
});
