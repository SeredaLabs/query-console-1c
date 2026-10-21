/**
 * R11 step 1: Designer → Apply keeps the meaning of СГРУППИРОВАТЬ ПО.
 *
 * Six GROUP BY rewrites copied what the 1C query constructor prints
 * (`dropRedundantGroupDerefs`, `moveBeforePrefixGroupDerefToEnd`,
 * `moveLeadingMovementCaseToEnd`, `dropFunctionallyDeterminedMovementCase`,
 * `relocateKeptMovementCase`, `substituteGroupFieldWithSelectExpr`; the second and the
 * last were removed at the R11 closure, 2026-10-21). They ran in the
 * Designer whenever the batch had a temp table (the temp-table resolver passed their
 * `if (!resolver)` gate), and one of them changes the result:
 *
 * S1 (СхемаЗапроса + execute_query, SL_kza 2026-10-12, `test/fixtures/platform/r11-group-by.json`):
 * a nested query grouped by `Т.ЗагружатьИзИнтернета, Т.Наименование` and selecting
 * `ВЫБОР КОГДА Т.Наименование = "x" … КОНЕЦ КАК Наименование` — with any `ПОМЕСТИТЬ` in
 * the batch, Apply replaced `Т.Наименование` by that `ВЫБОР`: the original returns 11
 * rows, the applied text 2 (counts 9 and 2). The platform keeps the GROUP BY.
 * S2: the same where `Т.Наименование` is only inside a string literal.
 *
 * The rewrites now run only in the constructor-parity mode (oracle/corpus); the
 * Designer keeps every GROUP BY item, in its order, with and without temp tables.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { tryOpenDesignerBatch } from '../../src/webview/openDesignerBatch';
import { initialState, reducer } from '../../src/webview/state/queryStore';
import { computeBatchTextSafe } from '../../src/webview/computeBatchText';
import { decideApply, findStaticApplyBlocker } from '../../src/webview/applyGate';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { buildYamlResolver } from '../../src/core/metadata/buildYamlResolver';
import { tokenize } from '../../src/core/query/sdblLexer';

const evidence = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'platform', 'r11-group-by.json'), 'utf8'));

function designer(text: string): { text: string; applyOk: boolean } {
  const open = tryOpenDesignerBatch(text);
  if (!open.ok) throw new Error(open.error);
  const state = reducer(initialState(), { type: 'LOAD_BATCH', doc: open.doc });
  const out = computeBatchTextSafe(state, true);
  return { text: out.text, applyOk: decideApply(out.text, out.error, findStaticApplyBlocker(state), undefined).ok };
}

/** Designer → Apply → reopen, three cycles: Apply allowed and the text stable. */
function stable(text: string): string {
  const first = designer(text);
  expect(first.applyOk).toBe(true);
  let cur = first.text;
  for (let i = 0; i < 3; i++) {
    const next = designer(cur);
    expect(next.applyOk).toBe(true);
    expect(next.text).toBe(cur);
    cur = next.text;
  }
  return first.text;
}

/**
 * GROUP BY items of the last statement, in text order (a nested query's list comes
 * where it is written), read from the text with the shared lexer — not through the
 * parser, whose rewrites are what is under test. Tokens are joined by single spaces,
 * so only formatting is normalized; the items, their order and literals are not.
 */
function groupItems(text: string): string[][] {
  const statement = text.split(/;\s*\n(?:\s*\/{10,}\s*\n)?/u).filter(s => s.trim()).pop()!;
  const toks = tokenize(statement).filter(t => t.type !== 'eof');
  const word = (i: number) => (toks[i]?.type === 'keyword' || toks[i]?.type === 'ident' ? toks[i].text.toUpperCase() : '');
  const END = new Set(['ИМЕЮЩИЕ', 'УПОРЯДОЧИТЬ', 'ОБЪЕДИНИТЬ', 'ИТОГИ', 'ДЛЯ', 'ИНДЕКСИРОВАТЬ', 'АВТОУПОРЯДОЧИВАНИЕ']);
  const lists: string[][] = [];
  for (let i = 0; i < toks.length; i++) {
    if (word(i) !== 'СГРУППИРОВАТЬ' || word(i + 1) !== 'ПО') continue;
    const items: string[] = [];
    let cur: string[] = [];
    let depth = 0;
    for (let j = i + 2; j < toks.length; j++) {
      const t = toks[j];
      if (t.type === 'punct' && t.value === '(') depth++;
      if (t.type === 'punct' && t.value === ')') { if (depth === 0) break; depth--; }
      if (depth === 0 && END.has(word(j))) break;
      if (depth === 0 && t.type === 'punct' && t.value === ',') { items.push(cur.join(' ')); cur = []; continue; }
      cur.push(t.text);
    }
    if (cur.length) items.push(cur.join(' '));
    lists.push(items);
  }
  return lists;
}

const TT = 'ВЫБРАТЬ 1 КАК Ф ПОМЕСТИТЬ ВТ;\n';
const cases: Record<string, string> = Object.fromEntries(
  evidence.cases.map((c: { name: string; query: string }) => [c.name.replace(/__orig$/u, ''), c.query.replace(/^ВЫБРАТЬ 1 КАК Ф ПОМЕСТИТЬ ВТ;\n/u, '')]),
);

describe('R11 S1: the platform-confirmed result change is gone', () => {
  it.each([['without a temp table', ''], ['with a temp table', TT]])('%s', (_name, prelude) => {
    const query = prelude + evidence.S1_data.query.replace(/^ВЫБРАТЬ 1 КАК Ф ПОМЕСТИТЬ ВТ;\n/u, '');
    const out = stable(query);
    expect(groupItems(out)).toEqual(groupItems(query));
    expect(groupItems(out)).toEqual([['Т . ЗагружатьИзИнтернета', 'Т . Наименование']]);
    // Before the fix Apply wrote this GROUP BY (2 rows instead of 11 on the platform).
    expect(groupItems(evidence.S1_data.appliedBeforeFix)[0][1]).toMatch(/^ВЫБОР /u);
  });
});

describe('R11: GROUP BY items are kept, with and without a temp table', () => {
  it.each(Object.keys(cases).flatMap(name => [[name, ''], [name, TT]]))('%s %j', (name, prelude) => {
    const query = prelude + cases[name];
    expect(groupItems(stable(query))).toEqual(groupItems(query));
  });
});

describe('R11: the rewrites remain in the constructor-parity mode', () => {
  const resolver = buildYamlResolver(path.join(__dirname, '../fixtures/corpus/metadata/cf'));
  const constructor = (text: string) => generateBatch(parseBatch(text, resolver, { wildcardPolicy: 'constructor' }));

  it('S4: the movement-kind ВЫБОР determined by the grouped field is dropped, as on the platform', () => {
    const s4 = evidence.cases.find((c: { name: string }) => c.name === 'S4_dropcase_ok_tt__orig');
    expect(groupItems(constructor(s4.query))).toEqual(groupItems(s4.platform));
  });

  it('S3: the leading movement-kind ВЫБОР moves to the end (constructor behaviour, unchanged)', () => {
    const out = groupItems(constructor(cases.S3_movecase_lead))[0];
    expect(out[0]).toBe('Т . Код');
  });
});
