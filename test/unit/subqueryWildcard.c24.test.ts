/**
 * C24 (data loss): `expandStarFields` treated a nested SELECT source as resolvable and
 * empty. Whenever a resolver was active — a base one, or the temp-table-only one the
 * Designer gets once the batch has a temp table — `ВЫБРАТЬ Вл.* ИЗ (ВЫБРАТЬ …) КАК Вл`
 * and `ВЫБРАТЬ * ИЗ (ВЫБРАТЬ …) КАК Вл` lost their wildcard and the whole statement
 * (Designer → Apply allowed it). The platform expands such a star to the subquery's
 * columns (СхемаЗапроса, SL_kza 2026-10-11: `Вл.К КАК К`). Resolving those columns is
 * C24 step 1; until then the wildcard is kept as written, never removed.
 */
import * as path from 'path';
import { describe, it, expect } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { buildYamlResolver } from '../../src/core/metadata/buildYamlResolver';
import { tryOpenDesignerBatch } from '../../src/webview/openDesignerBatch';
import { initialState, reducer } from '../../src/webview/state/queryStore';
import { computeBatchTextSafe } from '../../src/webview/computeBatchText';
import { decideApply, findStaticApplyBlocker } from '../../src/webview/applyGate';

const SEP = '////////////////////////////////////////////////////////////////////////////////';
const resolver = buildYamlResolver(path.join(__dirname, '../fixtures/corpus/metadata/cf'));
const gen = (text: string, withResolver = false): string => generateBatch(parseBatch(text, withResolver ? resolver : undefined));
const statements = (text: string): string[] => text.split(SEP);
function designer(text: string): { text: string; applyOk: boolean } {
  const open = tryOpenDesignerBatch(text);
  if (!open.ok) throw new Error(open.error);
  const state = reducer(initialState(), { type: 'LOAD_BATCH', doc: open.doc });
  const out = computeBatchTextSafe(state, true);
  return { text: out.text, applyOk: decideApply(out.text, out.error, findStaticApplyBlocker(state), undefined).ok };
}

const SUB = '(ВЫБРАТЬ Т.Код КАК К, Т.Наименование КАК Н ИЗ Справочник.Валюты КАК Т ГДЕ Т.Наименование = "a  (b") КАК Вл';
const PLACE = 'ВЫБРАТЬ 1 КАК А ПОМЕСТИТЬ ВТ;\n';
const forms: Record<string, string> = {
  qualified: `ВЫБРАТЬ Вл.* ИЗ ${SUB}`,
  unqualified: `ВЫБРАТЬ * ИЗ ${SUB}`,
  qualifiedMixed: `ВЫБРАТЬ Вл.*, 1 КАК Х ИЗ ${SUB}`,
};

describe('C24: a wildcard over a nested SELECT is never removed', () => {
  for (const [name, statement] of Object.entries(forms)) {
    for (const prelude of ['', PLACE]) {
      const text = prelude + statement;
      const label = `${name}${prelude ? ' after a temp table' : ''}`;

      it.each([false, true])(`${label}, resolver: %s`, withResolver => {
        const out = gen(text, withResolver);
        expect(statements(out)).toHaveLength(prelude ? 2 : 1);
        const star = name === 'unqualified' ? '\t*' : '\tВл.*';
        expect(statements(out).pop()).toContain(star);
        expect(out).toContain('"a  (b"');
      });

      it(`${label}: Designer → Apply → reopen keeps every statement and the wildcard`, () => {
        const first = designer(text);
        expect(first.applyOk).toBe(true);
        expect(statements(first.text)).toHaveLength(prelude ? 2 : 1);
        expect(first.text).toContain('"a  (b"');
        expect(statements(first.text).pop()).toMatch(/\t(Вл\.)?\*/u);
        let current = first.text;
        for (let cycle = 0; cycle < 3; cycle++) {
          const next = designer(current);
          expect(next.applyOk).toBe(true);
          expect(next.text).toBe(current);
          current = next.text;
        }
      });
    }
  }

  it('a bare star over a real table and a nested SELECT is kept whole, not half expanded', () => {
    const out = gen(`ВЫБРАТЬ * ИЗ Справочник.Валюты КАК Т, ${SUB}`, true);
    expect(out).toContain('ВЫБРАТЬ\n\t*\nИЗ');
  });

  it('a star over a real table still expands with metadata', () => {
    expect(gen('ВЫБРАТЬ Т.* ИЗ Справочник.Валюты КАК Т', true)).toContain('\tТ.Ссылка КАК Ссылка,\n');
  });
});
