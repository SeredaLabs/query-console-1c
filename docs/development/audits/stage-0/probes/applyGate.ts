// TEMPORARY Stage 0b audit probe (docs/development/audits/stage-0.md): would the
// Apply gate stop a round-trip text change found by differential.ts? Mirrors
// src/webview/applyGate.ts on a parsed batch: static blockers
// (findUnsafeVirtualTables, findMalformedCustomExpressions) on the parsed input,
// then validateBatchText(generated, resolver) — the same final check as Apply.
// Approximation: the real gate assembles the batch from UI state; here the
// parsed batch stands in for it. No tree-sitter needed.
// Run: npx tsx docs/development/audits/stage-0/probes/applyGate.ts $PWD > docs/development/audits/stage-0/apply-gate.jsonl
import * as fs from 'fs';
import * as path from 'path';
const ROOT = process.argv[2];
const req = (p: string) => require(path.join(ROOT, p));
const { parseBatch } = req('src/core/query/sdblParser.ts');
const { generateBatch } = req('src/core/query/sdblGenerator.ts');
const { findUnsafeVirtualTables, findMalformedCustomExpressions } = req('src/core/query/semanticValidator.ts');
const { validateBatchText } = req('src/core/query/validateBatch.ts');
const { buildYamlResolver } = req('src/core/metadata/buildYamlResolver.ts');
const resolver = buildYamlResolver(path.join(ROOT, 'test/fixtures/corpus/metadata/cf'));

const probes = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/development/audits/stage-0/probes/construct-probes.json'), 'utf8'));
const byId = new Map<string, string>(probes.map((p: any) => [p.id, p.text]));
const fixture = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/oracle', f), 'utf8'));
const cases: Array<{ id: string; text: string }> = [
  ...['R01', 'R02', 'R03', 'R05', 'K01', 'K02', 'K04', 'K05', 'V05', 'V06', 'V07', 'V08', 'V10', 'P03', 'E30'].map(id => ({ id: 'probe:' + id, text: byId.get(id)! })),
  { id: 'reprobe:RP17 INDEX BY without ПОМЕСТИТЬ', text: 'ВЫБРАТЬ\n\tВал.Код КАК Код\nИЗ\n\tСправочник.Валюты КАК Вал\n\nИНДЕКСИРОВАТЬ ПО\n\tВал.Код' },
  { id: 'reprobe:RP18 НЕ (arith > n)', text: 'ВЫБРАТЬ\n\tВал.Код КАК Код\nИЗ\n\tСправочник.Валюты КАК Вал\nГДЕ\n\tНЕ (Вал.Наценка + 2 * Вал.Наценка > 10)' },
  // second pass over the fixture's own expected (canonical) output
  { id: 'oracle:0163 expected (second pass)', text: fixture('0163-where-subquery-bare-source-qualifies-fields.json').expected },
  { id: 'oracle:0164 expected (second pass)', text: fixture('0164-negated-where-hierarchy-subquery-qualifies.json').expected },
];
for (const c of cases) {
  const out: Record<string, unknown> = { id: c.id };
  try {
    const d = parseBatch(c.text, resolver);
    const g = generateBatch(d);
    const unsafe = findUnsafeVirtualTables(d);
    const malformed = findMalformedCustomExpressions(d).length;
    const blocker = unsafe.length ? 'unsafeVirtualTable' : malformed ? 'malformedCustom' : null;
    const v = validateBatchText(g, resolver);
    out.generated = g;
    out.changed = g !== c.text;
    out.staticBlocker = blocker;
    out.finalCheck = v.ok ? 'ok' : 'invalid: ' + v.error;
    out.applyWouldWrite = blocker === null && v.ok;
  } catch (e) {
    out.parseError = (e as Error).message;
  }
  console.log(JSON.stringify(out));
}
