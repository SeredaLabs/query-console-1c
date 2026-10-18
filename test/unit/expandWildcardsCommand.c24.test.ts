/**
 * C24 step 1b: the explicit Designer command "expand `*`" (`planWildcardExpansion`,
 * `EXPAND_WILDCARDS`). Automatic round trips never expand a configuration table
 * (wildcardPreserve.c24.test.ts); this command does, on request, from the
 * configuration catalog only, and refuses what it cannot build.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generate, generateBatch } from '../../src/core/query/sdblGenerator';
import { planWildcardExpansion } from '../../src/core/query/expandStarFields';
import { buildResolverFromTables } from '../../src/core/metadata/buildModelResolver';
import type { MetaField, MetaTable } from '../../src/core/metadata/types';
import type { QueryModel } from '../../src/core/query/queryModel';
import { tryOpenDesignerBatch } from '../../src/webview/openDesignerBatch';
import { initialState, reducer, wildcardExpansionPlan, type QueryState } from '../../src/webview/state/queryStore';
import { computeBatchTextSafe } from '../../src/webview/computeBatchText';

const field = (name: string, kind: MetaField['kind'] = 'standard'): MetaField => ({ name, kind, types: [] });
const CATALOG: MetaTable[] = [
  { kind: 'Справочник', name: 'Валюты', fullName: 'Справочник.Валюты',
    fields: [field('Ссылка'), field('Код'), field('Наименование'), field('Символ', 'attribute'), field('Предопределенный'), field('ИмяПредопределенныхДанных')] },
  { kind: 'Справочник', name: 'Банки', fullName: 'Справочник.Банки', fields: [field('Ссылка'), field('Код')] },
  { kind: 'Документ', name: 'Заказ', fullName: 'Документ.Заказ', fields: [field('Ссылка'), field('Дата')],
    tabularSections: [{ kind: 'ТабличнаяЧасть', name: 'Товары', fullName: 'Документ.Заказ.Товары', fields: [field('Ссылка'), field('Товар', 'attribute')] }] },
  { kind: 'ПланСчетов', name: 'Хозрасчетный', fullName: 'ПланСчетов.Хозрасчетный', fields: [field('Ссылка'), field('Код')] },
] as MetaTable[];
const catalog = buildResolverFromTables(CATALOG);

const model = (text: string): QueryModel => parseBatch(text, undefined, { wildcardPolicy: 'preserve' }).members[0].members[0].model;
const columns = (text: string): string[] | string => {
  const plan = planWildcardExpansion(model(text), catalog);
  return plan.ok ? plan.fields.map(f => `${f.path || f.expression} КАК ${f.alias}`) : plan.reason;
};

describe('planWildcardExpansion: columns, order and names', () => {
  it('a sole source: main fields, then the trailing standard ones', () => {
    expect(columns('ВЫБРАТЬ * ИЗ Справочник.Валюты КАК В')).toEqual([
      'Ссылка КАК Ссылка', 'Код КАК Код', 'Наименование КАК Наименование', 'Символ КАК Символ',
      'Предопределенный КАК Предопределенный', 'ИмяПредопределенныхДанных КАК ИмяПредопределенныхДанных',
    ]);
  });

  it('a bare `*` over two sources: each source in FROM order', () => {
    expect(columns('ВЫБРАТЬ * ИЗ Справочник.Банки КАК Б, Справочник.Валюты КАК В')).toEqual([
      'Ссылка КАК Ссылка', 'Код КАК Код',
      'Ссылка КАК Ссылка1', 'Код КАК Код1', 'Наименование КАК Наименование', 'Символ КАК Символ',
      'Предопределенный КАК Предопределенный', 'ИмяПредопределенныхДанных КАК ИмяПредопределенныхДанных',
    ]);
  });

  it('fields before and after the wildcard keep their places; explicit names are reserved (C30)', () => {
    expect(columns('ВЫБРАТЬ Б.Код КАК Код, Б.* , 1 КАК Ссылка ИЗ Справочник.Банки КАК Б'))
      .toEqual(['Код КАК Код', 'Ссылка КАК Ссылка1', 'Код КАК Код1', '1 КАК Ссылка']);
  });

  it.each([
    ['ВЫБРАТЬ Б.Код ИЗ Справочник.Банки КАК Б', 'noWildcard'],
    ['ВЫБРАТЬ * ИЗ Справочник.Нет КАК Н', 'unknownSource'],
    ['ВЫБРАТЬ * ИЗ ВТ КАК ВТ', 'unknownSource'], // a temp table is not configuration metadata
    ['ВЫБРАТЬ * ИЗ #Таблица', 'unsupportedSource'],
    ['ВЫБРАТЬ * ИЗ &П КАК П', 'unsupportedSource'],
    ['ВЫБРАТЬ * ИЗ РегистрСведений.Курсы.СрезПоследних(&Д, ) КАК К', 'unsupportedSource'],
    ['ВЫБРАТЬ * ИЗ ПланСчетов.Хозрасчетный КАК П', 'unsupportedSource'],
    ['ВЫБРАТЬ * ИЗ Документ.Заказ КАК З', 'tabularSections'],
    ['ВЫБРАТЬ Б.Ссылка.* ИЗ Справочник.Банки КАК Б', 'attributeWildcard'],
    ['ВЫБРАТЬ П.* ИЗ (ВЫБРАТЬ * ИЗ Справочник.Банки КАК Б) КАК П', 'subquerySource'],
    ['ВЫБРАТЬ *, Б.Код + 1 ИЗ Справочник.Банки КАК Б', 'unnamedColumns'],
  ])('refuses %j: %s', (text, reason) => {
    const plan = planWildcardExpansion(model(text), catalog);
    expect(plan.ok ? 'ok' : plan.reason).toBe(reason);
  });

  it('refuses a wildcard row with a comment (it would be lost)', () => {
    const query = parseBatch('ВЫБРАТЬ\n\t// все колонки\n\t*\nИЗ Справочник.Банки КАК Б', undefined, { wildcardPolicy: 'preserve', preserveComments: true }).members[0].members[0].model;
    const plan = planWildcardExpansion(query, catalog);
    expect(plan.ok ? 'ok' : plan.reason).toBe('comments');
  });

  it('never changes its input and never produces projection or trailing buckets', () => {
    const query = model('ВЫБРАТЬ Б.Код КАК Код, * ИЗ Справочник.Банки КАК Б');
    const before = JSON.stringify(query);
    const plan = planWildcardExpansion(query, catalog);
    expect(JSON.stringify(query)).toBe(before);
    expect(plan.ok).toBe(true);
    expect(query.tabSectionFields ?? []).toEqual([]);
    expect(query.trailingFields).toBeUndefined();
  });

  it('is idempotent and stable through generate → parse', () => {
    const query = model('ВЫБРАТЬ * ИЗ Справочник.Валюты КАК В');
    const plan = planWildcardExpansion(query, catalog);
    if (!plan.ok) throw new Error(plan.reason);
    const expanded: QueryModel = { ...query, fields: plan.fields };
    // A second run finds nothing to expand.
    expect(planWildcardExpansion(expanded, catalog)).toEqual({ ok: false, reason: 'noWildcard' });
    const text = generate(expanded);
    const reparsed = model(text);
    expect(reparsed.fields.map(f => [f.path, f.alias])).toEqual(plan.fields.map(f => [f.path, f.alias]));
    expect(generate(reparsed)).toBe(text);
  });
});

describe('EXPAND_WILDCARDS in the Designer store', () => {
  const open = (text: string, tables: MetaTable[] = CATALOG): QueryState => {
    const opened = tryOpenDesignerBatch(text);
    if (!opened.ok) throw new Error(opened.error);
    return reducer(reducer(initialState(), { type: 'SET_METADATA', tables }), { type: 'LOAD_BATCH', doc: opened.doc });
  };
  const text = (state: QueryState): string => computeBatchTextSafe(state, true).text;
  // A UNION with `*` does not open (C24: `Т.* КАК Т.*`); the user adds `*` in the Designer.
  const unionWithStar = (): QueryState => {
    const state = open('ВЫБРАТЬ Б.Код КАК Код ИЗ Справочник.Банки КАК Б ОБЪЕДИНИТЬ ВЫБРАТЬ Б2.Код ИЗ Справочник.Банки КАК Б2');
    return reducer(state, { type: 'ADD_EXPRESSION_FIELD', tableId: state.selectedTables[0].id, expression: '*' });
  };

  it('changes only the select list of the active query', () => {
    const state = open('ВЫБРАТЬ 1 КАК А ПОМЕСТИТЬ ВТ;\nВЫБРАТЬ * ИЗ Справочник.Банки КАК Б ГДЕ Б.Код = &К УПОРЯДОЧИТЬ ПО Б.Код');
    const active = reducer(state, { type: 'SET_ACTIVE_BATCH', index: 1 });
    const after = reducer(active, { type: 'EXPAND_WILDCARDS' });
    for (const key of Object.keys(active) as (keyof QueryState)[]) {
      if (key === 'selectedFields' || key === 'focusedSelectedFieldIdx') continue;
      expect(after[key], key).toBe(active[key]);
    }
    const [first, second] = text(after).split(';');
    expect(first).toBe(text(active).split(';')[0]);
    expect(second).toContain('Б.Ссылка КАК Ссылка,\n\tБ.Код КАК Код');
    expect(second).toContain('ГДЕ\n\tБ.Код = &К');
    expect(second).toContain('УПОРЯДОЧИТЬ ПО\n\tБ.Код');
  });

  it('a refusal returns the same state object (no side effects)', () => {
    for (const state of [open('ВЫБРАТЬ * ИЗ Справочник.Нет КАК Н'), open('ВЫБРАТЬ Б.Код ИЗ Справочник.Банки КАК Б'), unionWithStar()]) {
      expect(wildcardExpansionPlan(state).ok).toBe(false);
      expect(reducer(state, { type: 'EXPAND_WILDCARDS' })).toBe(state);
    }
  });

  it('a UNION member is refused', () => {
    expect(wildcardExpansionPlan(unionWithStar())).toEqual({ ok: false, reason: 'union' });
  });

  it('the preconditions are checked again when applied', () => {
    const state = open('ВЫБРАТЬ * ИЗ Справочник.Банки КАК Б');
    expect(wildcardExpansionPlan(state).ok).toBe(true);
    // The metadata changes between the confirmation and the action.
    const changed = reducer(state, { type: 'SET_METADATA', tables: [] });
    expect(reducer(changed, { type: 'EXPAND_WILDCARDS' })).toBe(changed);
  });

  it('a second command after an expansion is a no-op', () => {
    const once = reducer(open('ВЫБРАТЬ * ИЗ Справочник.Банки КАК Б'), { type: 'EXPAND_WILDCARDS' });
    expect(reducer(once, { type: 'EXPAND_WILDCARDS' })).toBe(once);
    expect(generateBatch(tryOpenDesignerBatch(text(once)).ok ? (tryOpenDesignerBatch(text(once)) as any).doc : undefined)).toBe(text(once));
  });
});

describe('the command uses neither the analysis nor the constructor policy', () => {
  it('its modules name no wildcard policy other than its own contract', () => {
    const src = (p: string) => fs.readFileSync(path.resolve(__dirname, '../../src', p), 'utf8');
    const rest = src('core/query/expandStarFields.ts').split('export function planWildcardExpansion')[1];
    const body = rest.slice(0, rest.indexOf('\n}\n'));
    expect(body).not.toMatch(/'analysis'|'constructor'|expandStarFields\(/u);
    expect(src('webview/components/ExpandWildcardsCommand.tsx')).not.toMatch(/'analysis'|'constructor'|expandStarFields\(/u);
  });
});

describe('platform evidence (SL_kza): the command text equals the platform expansion of `*`', () => {
  const evidence = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'platform', 'c24-expand-command.json'), 'utf8'));
  const run = (query: string): { plan: string; text: string } => {
    const opened = tryOpenDesignerBatch(query);
    if (!opened.ok) throw new Error(opened.error);
    let state = reducer(reducer(initialState(), { type: 'SET_METADATA', tables: evidence.tables }), { type: 'LOAD_BATCH', doc: opened.doc });
    const plan = wildcardExpansionPlan(state);
    state = reducer(state, { type: 'EXPAND_WILDCARDS' });
    return { plan: plan.ok ? 'ok' : plan.reason, text: computeBatchTextSafe(state, true).text };
  };
  it.each(evidence.cases.map((c: { query: string }) => [c.query, c]))('%s', (_query, c: any) => {
    const { plan, text } = run(c.query);
    if (c.command) { expect(plan).toBe(c.command); return; }
    expect(text).toBe(c.commandText);
    expect([c.starValid, c.commandValid, c.sameNamesAndOrder, c.sameProvenance]).toEqual([true, true, true, true]);
  });
});
