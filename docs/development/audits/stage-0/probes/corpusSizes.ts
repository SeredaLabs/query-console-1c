// Stage 0a scratch probe: corpus sizes at package / statement / union-member level.
// Not part of the repository. Run: npx tsx <this file> <repoRoot>
import * as fs from 'fs';
import * as path from 'path';

const ROOT = process.argv[2];
const { parseBatch, getBatchStatementSpans } = require(path.join(ROOT, 'src/core/query/sdblParser.ts'));

interface Pkg { source: string; id: string; text: string }
const pkgs: Pkg[] = [];

const golden = fs.readFileSync(path.join(ROOT, 'test/fixtures/corpus/golden.jsonl'), 'utf8')
  .split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
for (const g of golden) pkgs.push({ source: 'golden', id: g.file, text: g.input });

const metaDir = path.join(ROOT, 'test/fixtures/corpus/meta1c');
for (const f of fs.readdirSync(metaDir).filter(f => f.endsWith('.txt'))) {
  pkgs.push({ source: 'meta1c', id: f, text: fs.readFileSync(path.join(metaDir, f), 'utf8').replace(/^﻿/, '') });
}
const qDir = path.join(ROOT, 'test/fixtures/queries');
for (const f of fs.readdirSync(qDir).filter(f => f.endsWith('.sdbl'))) {
  pkgs.push({ source: 'queries', id: f, text: fs.readFileSync(path.join(qDir, f), 'utf8') });
}
const oDir = path.join(ROOT, 'test/fixtures/oracle');
for (const f of fs.readdirSync(oDir).filter(f => f.endsWith('.json'))) {
  const o = JSON.parse(fs.readFileSync(path.join(oDir, f), 'utf8'));
  pkgs.push({ source: 'oracle', id: f, text: o.input });
}

const stats: Record<string, { packages: number; parsed: number; failed: number; statementsSpan: number; statementsModel: number; unionMembers: number; multiStatementPackages: number; unionPackages: number }> = {};
const failures: Array<{ source: string; id: string; error: string }> = [];
for (const p of pkgs) {
  const s = (stats[p.source] ??= { packages: 0, parsed: 0, failed: 0, statementsSpan: 0, statementsModel: 0, unionMembers: 0, multiStatementPackages: 0, unionPackages: 0 });
  s.packages++;
  const spans = getBatchStatementSpans(p.text);
  s.statementsSpan += spans.length;
  if (spans.length > 1) s.multiStatementPackages++;
  try {
    const doc = parseBatch(p.text);
    s.parsed++;
    s.statementsModel += doc.members.length;
    let maxU = 0;
    for (const m of doc.members) { s.unionMembers += m.members.length; maxU = Math.max(maxU, m.members.length); }
    if (maxU > 1) s.unionPackages++;
  } catch (e) {
    s.failed++;
    failures.push({ source: p.source, id: p.id, error: e instanceof Error ? e.message : String(e) });
  }
}
console.log(JSON.stringify({ stats, failures }, null, 1));
