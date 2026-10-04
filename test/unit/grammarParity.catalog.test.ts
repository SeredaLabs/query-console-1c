/**
 * SDBL grammar parity catalog as an executable contract (ledger V5, phase 2;
 * docs/development/grammar-parity.md). Every entry's recorded Query Core
 * status is re-measured on each run, in both metadata modes, so normal CI
 * catches a regression against an already recorded platform verdict.
 *
 *  G2 platform-valid:   opens, stable second pass, Apply allowed, recorded
 *                       canonical text reproduced; otherwise an open debt item.
 *  G3 platform-invalid: safety contract only: rejected on open or Apply
 *                       blocked. Parser over-acceptance alone is not a failure.
 *  Unknown/unattested:  no verdict; the recorded status must still hold
 *                       (unknown also needs an open U item).
 *  G5 integrity:        ids, enums, provenance, status consistency, debt links.
 *
 * A failing status comparison means either a regression or an improvement:
 * fix the code, or update the catalog entry with evidence. Never both blindly.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { findUnsafeVirtualTables, findMalformedCustomExpressions } from '../../src/core/query/semanticValidator';
import { decideApply } from '../../src/webview/applyGate';
import { tryOpenDesignerBatch } from '../../src/webview/openDesignerBatch';
import { buildYamlResolver } from '../../src/core/metadata/buildYamlResolver';
import type { MetadataResolver } from '../../src/core/query/metadataResolver';

const ROOT = path.resolve(__dirname, '../..');
const CATALOG = path.join(ROOT, 'test/fixtures/grammar-parity/catalog.jsonl');
const LEDGER = path.join(ROOT, 'docs/development/technical-debt.md');
const STAGE0_QUEUE = 'docs/development/audits/stage-0/platform-reprobe.jsonl';

type Entry = {
  constructId: string; category: string; title: string; text: string;
  scope: 'in' | 'out' | 'pending'; source: string; origin: string[];
  evidenceRef: string | null;
  platformStatus: 'valid' | 'invalid' | 'unknown' | 'unattested';
  platformBuild: string | null; platformMethod: string | null; platformDate: string | null;
  oursStatus: 'accepts' | 'rejects';
  roundTripStatus: 'stable' | 'unstable' | 'not-applicable';
  canonicalStatus: 'matches' | 'differs' | 'not-recorded' | 'not-applicable';
  applyStatus: 'allowed' | 'blocked' | 'not-applicable';
  debtId: string | null; note?: string;
};

const ENUMS = {
  scope: ['in', 'out', 'pending'],
  platformStatus: ['valid', 'invalid', 'unknown', 'unattested'],
  oursStatus: ['accepts', 'rejects'],
  roundTripStatus: ['stable', 'unstable', 'not-applicable'],
  canonicalStatus: ['matches', 'differs', 'not-recorded', 'not-applicable'],
  applyStatus: ['allowed', 'blocked', 'not-applicable'],
} as const;

const readJsonl = (file: string): any[] =>
  fs.readFileSync(file, 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l));

const entries: Entry[] = readJsonl(CATALOG);

/** Ledger rows `| ID | STATUS · … |` → status word (OPEN, PARTIAL, UNKNOWN, CLOSED). */
const ledger = new Map<string, string>();
for (const m of fs.readFileSync(LEDGER, 'utf8').matchAll(/^\| ([A-Z]+(?:-[A-Z]+)?\d+) \| ([A-Z]+)/gm)) ledger.set(m[1], m[2]);
const isOpenDebt = (id: string | null) => !!id && ['OPEN', 'PARTIAL', 'UNKNOWN'].includes(ledger.get(id) ?? '');

/** `path#id` → the JSONL row with that id. */
function evidenceRow(ref: string): any {
  const [file, id] = ref.split('#');
  return readJsonl(path.join(ROOT, file)).find(r => r.id === id);
}

const resolver = buildYamlResolver(path.join(ROOT, 'test/fixtures/corpus/metadata/cf'));
const MODES: Array<[string, MetadataResolver | undefined]> = [['without resolver', undefined], ['with resolver', resolver]];

type Measured = Pick<Entry, 'oursStatus' | 'roundTripStatus' | 'applyStatus'> & { generated?: string };

/** Same steps as the product: Designer open gate, generation, second pass, Apply gate. */
function measure(text: string, r: MetadataResolver | undefined): Measured {
  const open = tryOpenDesignerBatch(text, r);
  if (!open.ok) return { oursStatus: 'rejects', roundTripStatus: 'not-applicable', applyStatus: 'not-applicable' };
  const generated = generateBatch(open.doc);
  let second: string | null = null;
  try { second = generateBatch(parseBatch(generated, r)); } catch { second = null; }
  const blocked = findUnsafeVirtualTables(open.doc).length > 0 || findMalformedCustomExpressions(open.doc).length > 0;
  const apply = decideApply(generated, null, blocked ? { kind: 'malformedCustom' } : null, r);
  return {
    oursStatus: 'accepts',
    roundTripStatus: second === generated ? 'stable' : 'unstable',
    applyStatus: apply.ok ? 'allowed' : 'blocked',
    generated,
  };
}

const recorded = (e: Entry) => ({ oursStatus: e.oursStatus, roundTripStatus: e.roundTripStatus, applyStatus: e.applyStatus });
const strip = ({ generated: _g, ...status }: Measured) => status;

/** Higher = more of the construct survives open → round trip → Apply. */
const supportRank = (s: ReturnType<typeof recorded>) =>
  (s.oursStatus === 'accepts' ? 1 : 0) + (s.roundTripStatus === 'stable' ? 1 : 0) + (s.applyStatus === 'allowed' ? 1 : 0);

/** Recorded vs measured status, with a message that separates stale catalog
 * evidence (support improved, or behavior changed in an allowed direction)
 * from a Query Core regression. */
function expectRecordedStatus(e: Entry, m: Measured, mode: string): void {
  const was = recorded(e), now = strip(m);
  if (JSON.stringify(was) === JSON.stringify(now)) return;
  const more = supportRank(now) > supportRank(was);
  // For platform-invalid text, more support is not an improvement: G3 judges safety separately.
  const stale = e.platformStatus === 'valid' ? more : !more;
  const verdict = stale
    ? `catalog evidence is stale: ${e.constructId} now behaves differently from its record. If intended, update the catalog entry (and its debt item ${e.debtId ?? '—'}) with evidence; this is not a product regression by itself.`
    : `Query Core regression against a recorded platform verdict: ${e.constructId} (${e.platformStatus}) ${e.platformStatus === 'valid' ? 'lost support' : 'became more permissive'}.`;
  expect.fail(`${verdict}\n  mode: ${mode}\n  recorded: ${JSON.stringify(was)}\n  measured: ${JSON.stringify(now)}`);
}

describe('grammar parity catalog: G5 integrity', () => {
  it('is non-empty and constructIds are unique, well-formed and match their category', () => {
    expect(entries.length).toBeGreaterThan(0);
    const ids = entries.map(e => e.constructId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of entries) {
      expect(e.constructId, e.constructId).toMatch(/^[a-z][a-z-]*\.[a-z0-9][a-z0-9-]*$/);
      expect(e.constructId.split('.')[0], e.constructId).toBe(e.category);
    }
  });

  it.each(entries.map(e => [e.constructId, e] as const))('%s: enums, provenance and status consistency', (_id, e) => {
    for (const [field, values] of Object.entries(ENUMS)) expect(values, `${field}`).toContain((e as any)[field]);
    expect(e.title.trim()).not.toBe('');
    expect(e.text.trim()).not.toBe('');
    expect(e.source.trim()).not.toBe('');
    expect(Array.isArray(e.origin) && e.origin.length > 0).toBe(true);

    if (e.platformStatus === 'unattested') {
      expect(e.evidenceRef).toBeNull();
    } else {
      // Platform evidence must be traceable; a missing build is recorded as "unknown", never omitted.
      expect(e.evidenceRef).toMatch(/^[^#]+\.jsonl#.+$/);
      expect(evidenceRow(e.evidenceRef!), e.evidenceRef!).toBeDefined();
      expect(e.platformBuild?.trim()).toBeTruthy();
      expect(e.platformMethod?.trim()).toBeTruthy();
      expect(e.platformDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    if (e.source === 'stage-0-platform-reprobe') {
      const id = e.evidenceRef!.split('#')[1];
      const probe = readJsonl(path.join(ROOT, STAGE0_QUEUE)).find(r => r.id === id);
      expect(probe?.text, 'catalog text must be the probed text').toBe(e.text);
    }

    if (e.oursStatus === 'rejects') {
      expect([e.roundTripStatus, e.applyStatus, e.canonicalStatus]).toEqual(['not-applicable', 'not-applicable', 'not-applicable']);
    } else {
      expect(e.roundTripStatus).not.toBe('not-applicable');
      expect(e.applyStatus).not.toBe('not-applicable');
    }
    if (e.platformStatus !== 'valid') expect(['not-applicable', 'not-recorded']).toContain(e.canonicalStatus);
    if (e.canonicalStatus === 'matches') expect(typeof evidenceRow(e.evidenceRef!)?.platformCanonical).toBe('string');

    if (e.debtId !== null) expect(ledger.has(e.debtId), `${e.debtId} must be a ledger item`).toBe(true);
    // A platform-valid construct that ours does not fully support is a gap and needs an open debt item.
    const gap = e.platformStatus === 'valid' && (e.oursStatus === 'rejects' || e.roundTripStatus === 'unstable'
      || e.applyStatus === 'blocked' || e.canonicalStatus === 'differs');
    if (gap) expect(isOpenDebt(e.debtId), `gap without open debt: ${e.debtId}`).toBe(true);
    // Platform-invalid text that opens must never be writable (safety contract).
    if (e.platformStatus === 'invalid' && e.oursStatus === 'accepts') expect(e.applyStatus).toBe('blocked');
    if (e.platformStatus === 'unknown') {
      expect(e.debtId ?? '').toMatch(/^U\d+$/);
      expect(isOpenDebt(e.debtId)).toBe(true);
    }
  });
});

for (const [mode, r] of MODES) {
  describe(`grammar parity catalog (${mode})`, () => {
    const by = (status: Entry['platformStatus']) => entries.filter(e => e.platformStatus === status).map(e => [e.constructId, e] as const);

    it.each(by('valid'))('G2 %s: platform-valid construct keeps its recorded support', (_id, e) => {
      const m = measure(e.text, r);
      expectRecordedStatus(e, m, mode);
      if (e.scope === 'in' && !isOpenDebt(e.debtId)) {
        expect(m).toMatchObject({ oursStatus: 'accepts', roundTripStatus: 'stable', applyStatus: 'allowed' });
      }
      if (e.canonicalStatus === 'matches') expect(m.generated).toBe(evidenceRow(e.evidenceRef!).platformCanonical);
    });

    it.each(by('invalid'))('G3 %s: platform-invalid construct is rejected or Apply-blocked', (_id, e) => {
      const m = measure(e.text, r);
      expectRecordedStatus(e, m, mode);
      expect(m.oursStatus === 'rejects' || m.applyStatus === 'blocked').toBe(true);
    });

    const pending = [...by('unknown'), ...by('unattested')];
    it.each(pending.length ? pending : [['(none)', null] as const])('%s: no platform verdict, recorded status holds', (_id, e) => {
      if (!e) return;
      expectRecordedStatus(e, measure(e.text, r), mode);
    });
  });
}
