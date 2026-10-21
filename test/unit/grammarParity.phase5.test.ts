import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { tryOpenDesignerBatch } from '../../src/webview/openDesignerBatch';
import { decideApply } from '../../src/webview/applyGate';
import { findMalformedCustomExpressions, findUnsafeVirtualTables } from '../../src/core/query/semanticValidator';

const evidence = JSON.parse(readFileSync('test/fixtures/platform/v5-phase5-8.3.15.json', 'utf8'));
type Case = { id: string; text: string; platform: { valid: boolean; query_text?: string; schemaError?: string }; ours: { none: { generatedSha256?: string } }; generatedPlatform?: { valid: boolean; canonicalSha256: string; matchesOriginalCanonical: boolean } };
const cases: Case[] = evidence.cases;
const sha = (text: string) => createHash('sha256').update(text).digest('hex');

function measure(text: string) {
  const opened = tryOpenDesignerBatch(text);
  if (!opened.ok) return { opened, generated: '', stable: false, apply: { ok: false } };
  const generated = generateBatch(opened.doc);
  const reopened = tryOpenDesignerBatch(generated);
  const blocked = findUnsafeVirtualTables(opened.doc).length > 0 || findMalformedCustomExpressions(opened.doc).length > 0;
  return { opened, generated, stable: reopened.ok && generateBatch(reopened.doc) === generated,
    apply: decideApply(generated, null, blocked ? { kind: 'malformedCustom' } : null, undefined, text) };
}

describe('V5 phase 5: platform-attested inputs and generated outputs (8.3.15.1489)', () => {
  // The committed BSP resolver is not metadata for this live base. These cases
  // attest the no-metadata Designer path; they do not assert schema completeness.
  for (const c of cases.filter(c => c.platform.valid && c.platform.query_text && !c.platform.schemaError)) {
    it(c.id, () => {
      const m = measure(c.text);
      expect(m.opened.ok).toBe(true);
      expect(m.stable).toBe(true);
      expect(m.apply.ok).toBe(true);
      // This exact output was independently sent back to the platform. A new
      // output needs fresh evidence, not a blind hash refresh.
      expect(sha(m.generated)).toBe(c.ours.none.generatedSha256);
      expect(c.generatedPlatform?.valid).toBe(true);
      expect(c.generatedPlatform?.canonicalSha256).toBe(sha(c.platform.query_text!));
      expect(c.generatedPlatform?.matchesOriginalCanonical).toBe(true);
    });
  }
});

// C40: the scalar comparison subquery rejected by 8.3.15 is Apply-blocked (see
// scalarSubquery.c40.test.ts for the other operand positions).
const scalar = cases.find(c => c.id === 'PQ-expression.scalar-subquery')!;
const scalarResult = measure(scalar.text);
it('C40: reject or Apply-block the scalar comparison subquery rejected by 8.3.15', () => {
  expect(!scalarResult.opened.ok || !scalarResult.apply.ok).toBe(true);
});
