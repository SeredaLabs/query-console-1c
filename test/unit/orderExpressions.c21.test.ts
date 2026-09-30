import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { buildYamlResolver } from '../../src/core/metadata/buildYamlResolver';
import type { MetadataResolver } from '../../src/core/query/metadataResolver';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { tryOpenDesignerBatch, COMMENT_LOSS_ON_OPEN } from '../../src/webview/openDesignerBatch';
import { decideApply, findStaticApplyBlocker } from '../../src/webview/applyGate';
import { assembleBatch, initialState, reducer } from '../../src/webview/state/queryStore';

const resolver: MetadataResolver = {
  tableByFullName: fullName => fullName === 'РегистрНакопления.Продажи' ? {
    fullName, kind: 'РегистрНакопления', name: 'Продажи',
    fields: ['Количество', 'Сумма'].map(name => ({ name, kind: 'resource', types: [{ primitive: 'Число' }] })),
  } : undefined,
};
const head = 'ВЫБРАТЬ Т.Количество КАК Количество ИЗ РегистрНакопления.Продажи КАК Т';
const ordered = (key: string) => `${head} УПОРЯДОЧИТЬ ПО ${key}`;
const modelOf = (text: string) => parseBatch(text).members[0].members[0].model;

describe.each([['without metadata', undefined], ['with metadata', resolver]] as const)(
  'C21 ORDER expression keys (%s)', (_mode, metadata) => {
    it.each([
      'Т.Количество + 1',
      'Т.Количество - 1',
      'Т.Количество * Т.Сумма',
      'Т.Количество / 2',
      '(Т.Количество + 1)',
      '-Т.Количество',
      '-(Т.Количество + 1)',
      'Т.Количество * (Т.Сумма + ЕСТЬNULL(Т.Количество, 0))',
      'Т.Количество + ВЫБОР КОГДА Т.Сумма > 0 ТОГДА 1 ИНАЧЕ 0 КОНЕЦ',
      'ЕСТЬNULL(Т.Количество, 0) + 1',
    ])('opens, stores and applies the entire key: %s', key => {
      const attempt = tryOpenDesignerBatch(ordered(key) + ' УБЫВ', metadata);
      expect(attempt.ok, attempt.ok ? '' : attempt.error).toBe(true);
      if (!attempt.ok) throw new Error(attempt.error);
      const model = attempt.doc.members[0].members[0].model;
      expect(model.order!.fields).toEqual([{ tableId: '', path: '', expression: key, direction: 'desc' }]);
      const output = generateBatch(attempt.doc);
      const state = reducer(initialState(), { type: 'LOAD_BATCH', doc: attempt.doc });
      expect(decideApply(output, null, findStaticApplyBlocker(state), metadata)).toEqual({ ok: true });
      expect(generateBatch(parseBatch(output, metadata))).toBe(output);
      expect(modelOf(output).order!.fields[0].direction).toBe('desc');
    });
  },
);

describe('C21 ORDER boundaries and preservation', () => {
  it.each(['Т.Количество * (Т.Сумма + 1)', '(Т.Количество + 1) * Т.Сумма'])(
    'keeps parentheses that determine arithmetic precedence: %s', key => {
      const output = generateBatch(parseBatch(ordered(key)));
      expect(output).toContain(`\t${key}`);
      expect(modelOf(output).order!.fields[0].expression).toBe(key);
    },
  );

  it('keeps aliases/simple references alongside expression keys and binds directions per key', () => {
    const model = modelOf(ordered('Т.Количество + ЕСТЬNULL(Т.Сумма, 0) УБЫВ, Количество ВОЗР, -Т.Сумма УБЫВ, Т.Количество'));
    expect(model.order!.fields).toMatchObject([
      { expression: 'Т.Количество + ЕСТЬNULL(Т.Сумма, 0)', direction: 'desc' },
      { selectAlias: 'Количество', direction: 'asc' },
      { expression: '-Т.Сумма', direction: 'desc' },
      { path: 'Количество', qualified: true, direction: 'asc' },
    ]);
    expect(model.order!.fields[1].expression).toBeUndefined();
    expect(model.order!.fields[3].expression).toBeUndefined();
  });

  it('leaves TOTALS and AUTOORDER to their section parsers', () => {
    const model = modelOf(ordered('(Т.Количество + 1) УБЫВ ИТОГИ СУММА(Количество) ПО ОБЩИЕ АВТОУПОРЯДОЧИВАНИЕ'));
    expect(model.order).toMatchObject({ auto: true, fields: [{ expression: '(Т.Количество + 1)', direction: 'desc' }] });
    expect(model.totals).toMatchObject({ grand: true });
    const output = generateBatch(parseBatch(ordered('Т.Количество + 1 АВТОУПОРЯДОЧИВАНИЕ')));
    expect(generateBatch(parseBatch(output))).toBe(output);
  });

  it('preserves DCS in its existing position and stops at a package separator', () => {
    const doc = parseBatch(`${head} {УПОРЯДОЧИТЬ ПО Количество} УПОРЯДОЧИТЬ ПО -Т.Количество; ВЫБРАТЬ 1 КАК Один`);
    expect(doc.members).toHaveLength(2);
    const model = doc.members[0].members[0].model;
    expect(model.order!.fields[0].expression).toBe('-Т.Количество');
    expect(model.builder).toBeDefined();
    const output = generateBatch(doc);
    expect(generateBatch(parseBatch(output))).toBe(output);
  });

  it('leaves an unsupported trailing DCS block for controlled rejection', () => {
    expect(() => parseBatch(ordered('-Т.Количество {УПОРЯДОЧИТЬ ПО Количество}'))).toThrow(/получено «\{»/);
  });

  it('accepts the original report with corpus metadata, independently of field types', () => {
    const metadata = buildYamlResolver(resolve(__dirname, '../fixtures/corpus/metadata/cf'));
    expect(tryOpenDesignerBatch('ВЫБРАТЬ Т.Код КАК А ИЗ Справочник.Валюты КАК Т УПОРЯДОЧИТЬ ПО Т.Код + 1', metadata).ok).toBe(true);
  });

  it('leaves the closing parenthesis of a source subquery unread', () => {
    const input = `ВЫБРАТЬ П.Количество ИЗ (${ordered('Т.Количество + 1 УБЫВ')}) КАК П`;
    const doc = parseBatch(input);
    const output = generateBatch(doc);
    expect(output).toContain('Т.Количество + 1 УБЫВ');
    expect(generateBatch(parseBatch(output))).toBe(output);
    expect(doc.members[0].members[0].model.tables[0].alias).toBe('П');
  });

  it('retains a trailing UNION expression through the store, unrelated edit and reopen', () => {
    const input = `${head} ОБЪЕДИНИТЬ ВСЕ ${head.replaceAll('Т.', 'Б.').replace('КАК Т', 'КАК Б')} УПОРЯДОЧИТЬ ПО Т.Количество + 1 УБЫВ`;
    const doc = parseBatch(input);
    expect(doc.members[0].members[1].model.order!.fields[0].expression).toBe('Т.Количество + 1');
    const state = reducer(initialState(), { type: 'LOAD_BATCH', doc });
    expect(findStaticApplyBlocker(state)).toBeNull();
    const edited = reducer(state, { type: 'SET_SELECTION_ALLOWED', allowed: true });
    const output = generateBatch(assembleBatch(edited));
    expect(output).toContain('Количество + 1 УБЫВ');
    expect(generateBatch(parseBatch(output))).toBe(output);
  });

  it.each(['ВОЗР', 'УБЫВ'])('keeps rejecting reversed modifiers: %s ИЕРАРХИЯ', direction => {
    expect(() => parseBatch(ordered(`Т.Количество + 1 ${direction} ИЕРАРХИЯ`))).toThrow(/ИЕРАРХИЯ/);
  });

  it.each(['Т.Количество +', '-'])('keeps dangling operators blocked at Apply: %s', key => {
    const doc = parseBatch(ordered(key));
    const state = reducer(initialState(), { type: 'LOAD_BATCH', doc });
    expect(findStaticApplyBlocker(state)).toEqual({ kind: 'malformedCustom' });
    expect(decideApply(generateBatch(doc), null, findStaticApplyBlocker(state), undefined)).toEqual({ ok: false, kind: 'blocked' });
  });

  it('still requires consent when an expression loses an inline comment (C17)', () => {
    const attempt = tryOpenDesignerBatch(ordered('Т.Количество + // arithmetic note\n1'));
    expect(attempt).toMatchObject({ ok: false, error: COMMENT_LOSS_ON_OPEN, lost: ['// arithmetic note'] });
  });
});
