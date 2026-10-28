import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { tryOpenDesignerBatch } from '../../src/webview/openDesignerBatch';
import { decideApply } from '../../src/webview/applyGate';
import { findMalformedCustomExpressions, findUnsafeVirtualTables } from '../../src/core/query/semanticValidator';

// The cases refused by 8.3.15.1489 (phase 5 and C40), re-checked on 8.5.1.1529.
const evidence = JSON.parse(readFileSync('test/fixtures/platform/v5-phase5-8.5.1.1529.json', 'utf8'));
type Case = { id: string; text: string; platform: { valid: boolean; query_text?: string; error?: string }; platform8315Valid: boolean };
const cases: Case[] = evidence.cases;

function measure(text: string) {
  const opened = tryOpenDesignerBatch(text);
  if (!opened.ok) return { opened, generated: '', stable: false, apply: { ok: false } };
  const generated = generateBatch(opened.doc);
  const reopened = tryOpenDesignerBatch(generated);
  const blocked = findUnsafeVirtualTables(opened.doc).length > 0 || findMalformedCustomExpressions(opened.doc).length > 0;
  return { opened, generated, stable: reopened.ok && generateBatch(reopened.doc) === generated,
    apply: decideApply(generated, null, blocked ? { kind: 'malformedCustom' } : null, undefined, text) };
}

// Platform-valid on 8.5, refused by the parser: C58 (ИНДЕКСИРОВАТЬ … УНИКАЛЬНО) and
// C59 (an empty grouping set `()`). Expected failures until those are fixed.
const GAPS = new Set(['PQ-package.index-by.2', 'PQ-expression.grouped-by']);
// The platform prints a tab after the opening parenthesis of ГРУППИРУЮЩИМ НАБОРАМ and
// a final line break; ours does not. Whitespace only, open/reopen/Apply pass.
const WHITESPACE_ONLY = new Set(['PQ-group.grouping-sets.1']);
const platformWhitespace = (text: string) => text.replace('НАБОРАМ\n(\t\n', 'НАБОРАМ\n(\n').replace(/\n$/, '');
// No metadata in this test: a table the test base lacks says nothing about grammar.
const tableNotFound = (c: Case) => c.platform.error?.includes('Таблицю не знайдено') ?? false;

const valid = cases.filter(c => c.platform.valid);
const refused = cases.filter(c => !c.platform.valid && !tableNotFound(c));

describe('V5 phase 5 on 8.5.1.1529: platform-valid cases', () => {
  it('records 32 accepted cases, 28 of them refused by 8.3.15.1489', () => {
    expect(valid).toHaveLength(32);
    expect(valid.filter(c => !c.platform8315Valid)).toHaveLength(28);
  });

  for (const c of valid.filter(c => !GAPS.has(c.id))) {
    it(c.id, () => {
      const m = measure(c.text);
      expect(m.opened.ok).toBe(true);
      expect(m.stable).toBe(true);
      expect(m.apply.ok).toBe(true);
      // The Designer's own canonical text, compared exactly.
      const expected = WHITESPACE_ONLY.has(c.id) ? platformWhitespace(c.platform.query_text!) : c.platform.query_text;
      expect(m.generated).toBe(expected);
    });
  }

  for (const c of valid.filter(c => GAPS.has(c.id))) {
    it.fails(`${c.id}: opens (gap)`, () => {
      expect(measure(c.text).opened.ok).toBe(true);
    });
  }
});

describe('V5 phase 5 on 8.5.1.1529: platform-refused cases are not applied', () => {
  it('records 10 grammar refusals and 2 configuration-dependent ones', () => {
    expect(refused).toHaveLength(10);
    expect(cases.filter(tableNotFound)).toHaveLength(2);
  });

  for (const c of refused) {
    it(c.id, () => {
      const m = measure(c.text);
      expect(!m.opened.ok || !m.apply.ok).toBe(true);
    });
  }
});
