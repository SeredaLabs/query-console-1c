// TEMPORARY Stage 0b audit script (docs/development/audits/stage-0.md): derives
// every number quoted in the Stage 0b report from the raw result files. No
// tree-sitter needed (reads results.jsonl / construct-probes.jsonl /
// apply-gate.jsonl only).
// Run: npx tsx docs/development/audits/stage-0/probes/summarize.ts $PWD
import * as fs from 'fs';
import * as path from 'path';
const ROOT = process.argv[2];
const D = path.join(ROOT, 'docs/development/audits/stage-0');
const jl = (f: string) => fs.readFileSync(path.join(D, f), 'utf8').trim().split('\n').map(l => JSON.parse(l));
const rows = jl('results.jsonl');
const probes = jl('construct-probes.jsonl');
const gate = jl('apply-gate.jsonl');
const count = <T>(xs: T[], f: (x: T) => string) => { const o: Record<string, number> = {}; for (const x of xs) { const k = f(x); o[k] = (o[k] ?? 0) + 1; } return o; };
const bySource = <T extends { source: string }>(xs: T[], f: (x: T) => string) => { const o: Record<string, Record<string, number>> = {}; for (const x of xs) { (o[x.source] ??= {}); const k = f(x); o[x.source][k] = (o[x.source][k] ?? 0) + 1; } return o; };
const sum = (xs: any[], f: (x: any) => number) => xs.reduce((s, x) => s + (f(x) ?? 0), 0);

const golden = rows.filter(r => r.source === 'golden');
const slotPk: Record<string, number> = {}, slotN: Record<string, number> = {}, conPk: Record<string, number> = {}, conN: Record<string, number> = {};
for (const r of golden) {
  for (const [k, v] of Object.entries<number>(r.structure.slots ?? {})) { slotPk[k] = (slotPk[k] ?? 0) + 1; slotN[k] = (slotN[k] ?? 0) + v; }
  for (const [k, v] of Object.entries<number>(r.structure.constructs ?? {})) { conPk[k] = (conPk[k] ?? 0) + 1; conN[k] = (conN[k] ?? 0) + v; }
}
const classes = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/corpus/corpus-classes.json'), 'utf8')).entries;
const corpusRecovered = golden.filter(r => classes[r.id.slice('golden:'.length)]?.class === 'RECOVERED');

// Heuristic, multi-label categories for packages only tree-sitter rejects
// (ours-only) in repository sources; labels come from the package text.
const repoText = new Map<string, string>();
for (const l of fs.readFileSync(path.join(ROOT, 'test/fixtures/corpus/golden.jsonl'), 'utf8').split('\n')) if (l.trim()) { const g = JSON.parse(l); repoText.set('golden:' + g.file, g.input); }
for (const f of fs.readdirSync(path.join(ROOT, 'test/fixtures/oracle'))) if (f.endsWith('.json')) repoText.set('oracle:' + f, JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/oracle', f), 'utf8')).input);
for (const f of fs.readdirSync(path.join(ROOT, 'test/fixtures/queries'))) if (f.endsWith('.sdbl')) repoText.set('queries:' + f, fs.readFileSync(path.join(ROOT, 'test/fixtures/queries', f), 'utf8'));
function competitorGapLabels(t: string): string[] {
  const L: string[] = [];
  if (/#[А-ЯЁA-Z]/i.test(t)) L.push('template #-marker');
  if (/\{/.test(t)) L.push('report-builder braces {}');
  if (/ВЫРАЗИТЬ\([^()]*(\([^()]*\))?[^()]*\)\./i.test(t)) L.push('ВЫРАЗИТЬ(...).field');
  if (/УНИЧТОЖИТЬ/i.test(t)) L.push('УНИЧТОЖИТЬ');
  if (/НАБОРАМ/i.test(t)) L.push('ГРУППИРУЮЩИМ/ИНДЕКСИРОВАТЬ ПО НАБОРАМ');
  if (/ИТОГИ[\s\S]*ОБЩИЕ/i.test(t)) L.push('ИТОГИ ... ОБЩИЕ');
  if (/(РАЗЛИЧНЫЕ|ПЕРВЫЕ\s+\d+)\s+РАЗРЕШЕННЫЕ|ПЕРВЫЕ\s+\d+\s+РАЗЛИЧНЫЕ/i.test(t)) L.push('selection modifier order');
  if (/;\s*$/.test(t.trim())) L.push('trailing ;');
  if (/КАК\s+(Ссылка|Значение|Тип)[А-ЯЁа-яё]+/i.test(t) || /ПО\s+Значение/i.test(t)) L.push('identifier starting with a keyword (Ссылка…/Значение…)');
  if (/РегистрБухгалтерии\.[^.]+\.[^(]+\([^)]*,\s*,/i.test(t)) L.push('accounting VT omitted args');
  if (L.length === 0) L.push('unclassified');
  return L;
}
const oursOnlyRepo = rows.filter(r => r.acceptance === 'ours-only' && repoText.has(r.id));
const competitorGapCategories: Record<string, number> = {};
for (const r of oursOnlyRepo) for (const l of competitorGapLabels(repoText.get(r.id)!)) competitorGapCategories[l] = (competitorGapCategories[l] ?? 0) + 1;

const summary = {
  unit: 'query package (statement and union-member totals reported separately)',
  packagesBySource: count(rows, r => r.source),
  statementsBySource: Object.fromEntries(Object.entries(count(rows, r => r.source)).map(([s]) => [s, sum(rows.filter(r => r.source === s), r => r.statementCount)])),
  unionMembersBySource: Object.fromEntries(Object.entries(count(rows, r => r.source)).map(([s]) => [s, sum(rows.filter(r => r.source === s), r => r.unionMemberCount ?? 0)])),
  acceptance: { total: count(rows, r => r.acceptance), bySource: bySource(rows, r => r.acceptance) },
  roundTrip: { total: count(rows, r => r.roundTrip.value), bySource: bySource(rows, r => `${r.roundTrip.value} (${r.roundTrip.method})`) },
  idempotence: {
    textNotIdempotent: rows.filter(r => r.roundTrip.idempotentText === false).map(r => r.id),
    modelNotIdempotent: rows.filter(r => r.roundTrip.idempotentModel === false).map(r => r.id),
    checked: rows.filter(r => r.roundTrip.idempotentText !== undefined).length,
  },
  detectorCalibrationOnGoldenCanonicalChanges: count(rows.filter(r => r.detectorCalibration), r => r.detectorCalibration.value),
  structure: { total: count(rows, r => r.structure.value), bySource: bySource(rows, r => r.structure.value) },
  goldenOpaque: {
    corpusRecoveredEntries: corpusRecovered.length,
    partiallyStructuredPackages: golden.filter(r => r.structure.value === 'partially-structured').length,
    totalOpaqueSpans: sum(golden, r => r.structure.opaqueSpanCount),
    slots: Object.fromEntries(Object.entries(slotPk).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, { packages: v, spans: slotN[k] }])),
    constructs: Object.fromEntries(Object.entries(conPk).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, { packages: v, occurrences: conN[k] }])),
  },
  competitorRejectsRepoPackages: { packages: oursOnlyRepo.length, multiLabelCategories: Object.fromEntries(Object.entries(competitorGapCategories).sort((a, b) => b[1] - a[1])) },
  unsafeVirtualTablePackages: rows.filter(r => r.unsafeVirtualTables).map(r => r.id),
  probes: {
    total: probes.length,
    acceptance: count(probes, p => p.acceptance),
    roundTrip: count(probes, p => p.roundTrip.value),
    keyInOpaqueSpan: probes.filter(p => p.keyInOpaqueSpan).map(p => p.id),
    notIdempotent: probes.filter(p => p.roundTrip.idempotentText === false).map(p => p.id),
  },
  applyGate: gate.map(g => ({ id: g.id, staticBlocker: g.staticBlocker, finalCheck: g.finalCheck === 'ok' ? 'ok' : 'invalid', applyWouldWrite: g.applyWouldWrite })),
};
fs.writeFileSync(path.join(D, 'summary.json'), JSON.stringify(summary, null, 1) + '\n');
console.log(JSON.stringify(summary, null, 1));
