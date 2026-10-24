/** Bounded observational study. Never updates production code or fixture baselines.
 * Run from repository root; see the accompanying architecture report for limits.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { tryTokenize, wordOf } from '../../src/core/query/sdblLexer';
import { buildYamlResolver } from '../../src/core/metadata/buildYamlResolver';
import { tryOpenDesignerBatch } from '../../src/webview/openDesignerBatch';
import { initialState, reducer, assembleBatch } from '../../src/webview/state/queryStore';
import { findStaticApplyBlocker, decideApply } from '../../src/webview/applyGate';
import { computeBatchTextSafe } from '../../src/webview/computeBatchText';
import { analyze } from '../../src/core/query/queryAnalysisService';

const root = process.cwd();
const output = path.resolve(process.argv[2] ?? 'docs/development/audits/structured-raw-2026-10-23');
const jsonl = (file: string): any[] => fs.readFileSync(file, 'utf8').split('\n').filter(s => s.trim()).map(s => JSON.parse(s));
const hash = (o: unknown) => createHash('sha256').update(JSON.stringify(o)).digest('hex');
const resolver = buildYamlResolver(path.join(root, 'test/fixtures/corpus/metadata/cf'));
type Example = { id: string; source: string; text: string; evidence?: unknown; canonical?: string; factors?: number[] };
const cases: Example[] = [];
for (const g of jsonl('test/fixtures/corpus/golden.jsonl')) {
  cases.push({ id: g.file, source: 'golden', text: g.input, evidence: { valid: g.valid }, canonical: g.query_text });
}
for (const g of jsonl('test/fixtures/grammar-parity/catalog.jsonl')) {
  cases.push({ id: g.constructId, source: 'grammar-parity', text: g.text, evidence: { status: g.platformStatus, ref: g.evidenceRef, scope: g.scope } });
}
// Fixed platform inventory: language/condition probes, scalar subqueries and V5.
for (const file of ['c2-english.json', 'c40-scalar-subquery.json', 'v5-phase5-8.3.15.json']) {
  const fixture = JSON.parse(fs.readFileSync(`test/fixtures/platform/${file}`, 'utf8'));
  for (const c of fixture.cases) {
    const text = c.query ?? c.text;
    if (typeof text !== 'string' || !/ГДЕ|ИМЕЮЩИЕ|СОЕДИНЕНИЕ|WHERE|HAVING|JOIN/iu.test(text)) continue;
    cases.push({ id: `${file}#${c.id ?? c.name}`, source: 'platform', text, evidence: { platform: c.platform, build: fixture.platformBuild, provenance: fixture.platformMethod ?? fixture.source } });
  }
}

const factors = ['spaces', 'lineBreaks', 'outerParens', 'aliasT_or_V', 'leadingNot', 'and_or', 'depth1_or_2', 'scalar_or_tuple'];
const pairKeys = (row: number[]) => row.flatMap((a, i) => row.slice(i + 1).map((b, k) => `${i}:${a}/${i + k + 1}:${b}`));
const candidates = Array.from({ length: 256 }, (_, n) => factors.map((_, i) => (n >> i) & 1));
const uncovered = new Set(candidates.flatMap(pairKeys));
const rows: number[][] = [];
while (uncovered.size) {
  let best = candidates[0], score = -1;
  for (const row of candidates) {
    const count = pairKeys(row).filter(k => uncovered.has(k)).length;
    if (count > score) { best = row; score = count; }
  }
  if (score <= 0) throw new Error('pairwise construction incomplete');
  rows.push(best);
  pairKeys(best).forEach(k => uncovered.delete(k));
}
const select = (alias: string, where: string, tuple = false) => `ВЫБРАТЬ ${alias}.Код${tuple ? `, ${alias}.Наименование` : ''} ИЗ Справочник.Валюты КАК ${alias} ГДЕ ${where}`;
rows.forEach((row, index) => {
  const [spaces, lines, parens, aliasBit, not, or, depth, tuple] = row;
  const alias = aliasBit ? 'В' : 'Т';
  let inner = select('Х', 'Х.Код = &Код', !!tuple);
  if (depth) inner = select('Я', `Я.Код В (${inner})`, !!tuple);
  const lhs = tuple ? `(${alias}.Код, ${alias}.Наименование)` : `${alias}.Код`;
  let condition = `${alias}.Код = &Код ${or ? 'ИЛИ' : 'И'} ${not ? 'НЕ ' : ''}${lhs} В (${inner})`;
  if (parens) condition = `(${condition})`;
  let text = select(alias, condition);
  if (lines) text = text.replace(/ ИЗ /g, '\nИЗ\n').replace(/ ГДЕ /g, '\nГДЕ\n').replace(/ ВЫБРАТЬ /g, '\nВЫБРАТЬ\n');
  if (spaces) text = text.replace(/ /g, '  ');
  cases.push({ id: `pairwise-${index + 1}`, source: 'pairwise', text, factors: row });
});
const leaf = select('Х', 'Х.Код = 1');
const grouping = 'ВЫБРАТЬ Х.Код ИЗ Справочник.Валюты КАК Х СГРУППИРОВАТЬ ПО ГРУППИРУЮЩИМ НАБОРАМ ((Х.Код), (Х.Наименование))';
const wrap = (inner: string, alias = 'Т', or = false) => select(alias, `${or ? `${alias}.Код = 1 ИЛИ ` : ''}${alias}.Код В (${inner})`);
const risks: Record<string, string> = {
  'structured-control': wrap(leaf), 'alias-V': wrap(leaf, 'В'),
  'or-raw': wrap(leaf, 'Т', true), 'grouping-structured': wrap(grouping),
  'C49-grouping-raw': wrap(grouping, 'Т', true),
  'literal-lhs-compact': select('Т', `1 В (${leaf})`),
  'literal-lhs-multiline': select('Т', `1 В (${leaf.replace(' ИЗ ', '\nИЗ\n')})`),
  'C44-incomplete': select('Т', 'Т.Код ='),
  'C45-trailing-and': select('Т', 'Т.Код = 1 И'),
  'C47-english': 'SELECT T.Код FROM Catalog.Валюты AS T WHERE T.Код = 1 AND',
  'C46-join-empty': 'ВЫБРАТЬ А.Код ИЗ Справочник.Валюты КАК А ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Валюты КАК Б ПО А.Код = Б.Код И И А.Код = 1',
  'C48-raw-broken': wrap(select('Х', 'Х.Код = 1 И'), 'Т', true),
  'C48-structured-broken': wrap(select('Х', 'Х.Код = 1 И')),
  'not-tuple': select('Т', '(Т.Код, Т.Наименование) НЕ В (ВЫБРАТЬ Х.Код, Х.Наименование ИЗ Справочник.Валюты КАК Х)'),
  'between-and': select('Т', 'Т.Код МЕЖДУ &А И &Б И Т.Наименование = &Н'),
  'comment-internal': select('Т', 'Т.Код // ) ИЛИ\n = &Код'),
  'literal-protection': select('Т', 'Т.Наименование = "НЕ ИЛИ (ВЫБРАТЬ x)"'),
  'parameter-parens': select('Т', 'Т.Код = &Код И (&Условие)'),
  'not-or': select('Т', `НЕ (Т.Код = 1 ИЛИ Т.Код В (${leaf}))`),
  'case-subquery': `ВЫБРАТЬ ВЫБОР КОГДА Т.Код В (${leaf}) ТОГДА 1 ИНАЧЕ 0 КОНЕЦ КАК Флаг ИЗ Справочник.Валюты КАК Т`,
  'join-subquery': `ВЫБРАТЬ А.Код ИЗ Справочник.Валюты КАК А ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Валюты КАК Б ПО А.Код = Б.Код И А.Код В (${leaf})`,
  'having-incomplete': 'ВЫБРАТЬ КОЛИЧЕСТВО(*) КАК К ИЗ Справочник.Валюты КАК Т ИМЕЮЩИЕ КОЛИЧЕСТВО(*) =',
  'lexical-error': select('Т', 'Т.Наименование = "broken'),
  'raw-nested-broken': wrap(wrap(select('Х', 'Х.Код = 1 И'), 'Я', true), 'Т', true),
};
for (const [id, text] of Object.entries(risks)) cases.push({ id, source: 'risk', text });

function diff(a: any, b: any, at = ''): string[] {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return [at || '/'];
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap(k => diff(a[k], b[k], `${at}/${k}`));
}
function representations(doc: any, at = ''): any[] {
  if (!doc || typeof doc !== 'object') return [];
  const here = typeof doc.custom === 'boolean' ? [{ path: at, custom: doc.custom, kind: doc.subquery ? 'subquery' : doc.expression !== undefined ? 'raw' : 'structured' }] : [];
  return here.concat(Object.entries(doc).flatMap(([k, v]) => representations(v, `${at}/${k}`)));
}
function facts(text: string) {
  const tokens = tryTokenize(text)?.filter(t => t.type !== 'eof' && t.type !== 'comment');
  if (!tokens) return { lexical: 'unknown' };
  const words = tokens.map(wordOf);
  return {
    bool: words.filter(w => ['И', 'ИЛИ', 'НЕ'].includes(w)),
    subqueries: words.filter(w => w === 'ВЫБРАТЬ').length - 1,
    fields: tokens.flatMap((t, i) => tokens[i + 1]?.value === '.' && tokens[i + 2] ? [`${t.text}.${tokens[i + 2].text}`] : []),
    literals: tokens.filter(t => ['string', 'number', 'date'].includes(t.type)).map(t => t.text),
    parameters: tokens.filter(t => t.type === 'param').map(t => t.text),
  };
}
const records: any[] = [];
const started = Date.now();
for (const example of cases) {
  for (const mode of ['without-metadata', 'corpus-metadata'] as const) {
    const r = mode === 'corpus-metadata' ? resolver : undefined;
    const record: any = { ...example, mode, passes: [] };
    let text = example.text;
    for (let pass = 0; pass < 3; pass++) {
      try {
        const model = parseBatch(text, r, { preserveComments: true });
        const generated = generateBatch(model);
        const opened = tryOpenDesignerBatch(text, r);
        let apply: any = { ok: false, kind: 'open-refused', error: opened.ok ? undefined : opened.error };
        let store: any;
        if (opened.ok) {
          const state = reducer(initialState(), { type: 'LOAD_BATCH', doc: opened.doc });
          const computed = computeBatchTextSafe(state, true);
          const blocker = findStaticApplyBlocker(state);
          store = { text: computed.text, error: computed.error, blocker, modelPathsChanged: diff(opened.doc, assembleBatch(state)) };
          apply = decideApply(computed.text, computed.error, blocker, r, example.text);
        }
        record.passes.push({ text, generated, textChanged: text !== generated, model, modelHash: hash(model), representations: representations(model), facts: facts(text), generatedFacts: facts(generated), analysisDiagnostics: analyze(text, r).diagnostics, open: opened.ok ? { ok: true } : { ok: false, error: opened.error }, apply, store });
        text = generated;
      } catch (error) {
        record.passes.push({ text, error: String(error), apply: { ok: false, kind: 'no-generated-output' } });
        break;
      }
    }
    record.transitions = record.passes.slice(1).map((p: any, i: number) => {
      const prev = record.passes[i];
      const comparable = p.generated !== undefined && prev.generated !== undefined;
      return { from: i + 1, to: i + 2, comparable, generatedChanged: comparable && prev.generated !== p.generated, modelPathsChanged: comparable ? diff(prev.model, p.model) : [], representationChanged: comparable && JSON.stringify(prev.representations) !== JSON.stringify(p.representations), factPathsChanged: comparable ? diff(prev.generatedFacts, p.generatedFacts) : [] };
    });
    records.push(record);
  }
}
const groups: Record<string, any> = {};
for (const source of [...new Set(cases.map(c => c.source))]) {
  groups[source] = {};
  for (const mode of ['without-metadata', 'corpus-metadata']) {
    const rows = records.filter(r => r.source === source && r.mode === mode);
    const count = (f: (r: any) => boolean) => rows.filter(f).length;
    groups[source][mode] = { total: rows.length,
      parseErrors: count(r => r.passes.some((p: any) => p.error)),
      initialParseErrors: count(r => !!r.passes[0].error),
      laterParseErrors: count(r => r.passes.slice(1).some((p: any) => p.error)),
      firstTextChanges: count(r => r.passes[0].textChanged),
      laterTextChanges: count(r => r.transitions.some((t: any) => t.generatedChanged)),
      laterModelChanges: count(r => r.transitions.some((t: any) => t.modelPathsChanged.length)),
      representationChanges: count(r => r.transitions.some((t: any) => t.representationChanged)),
      applyAllowed: count(r => r.passes[0].apply?.ok),
      applyTransitions: count(r => new Set(r.passes.map((p: any) => JSON.stringify(p.apply))).size > 1),
      storeTextDiffers: count(r => r.passes.some((p: any) => p.store && p.store.text !== p.generated)),
    };
  }
}
// Self-check the observations, independently of whether the product passed a contract.
if (new Set(rows.flatMap(pairKeys)).size !== 112) throw new Error('pair coverage lost');
for (const record of records) {
  if (!record.passes.length || record.passes.length > 3) throw new Error('invalid pass count');
  record.passes.forEach((p: any, i: number) => {
    if (i && p.text !== record.passes[i - 1].generated) throw new Error('broken round-trip chain');
    if (!p.error && (!p.model || !p.apply || !p.generated)) throw new Error('incomplete observation');
  });
}
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'observations.jsonl.gz'), gzipSync(records.map(r => JSON.stringify(r)).join('\n') + '\n'));
const signals = records.filter(r => r.source === 'risk' || r.source === 'pairwise' || r.transitions.some((t: any) => t.generatedChanged || t.representationChanged) || r.passes.some((p: any) => p.store && p.store.text !== p.generated)).map(r => ({ id: r.id, source: r.source, mode: r.mode, transitions: r.transitions, passes: r.passes.map((p: any) => ({ generated: p.generated, error: p.error, apply: p.apply, representations: p.representations, storeTextDiffers: p.store && p.store.text !== p.generated })) }));
const summary = { head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), elapsedMs: Date.now() - started, cases: cases.length, records: records.length, groups, pairwise: { factors, rows, coveredPairs: new Set(rows.flatMap(pairKeys)).size, expectedPairs: 112 }, inputs: ['test/fixtures/corpus/golden.jsonl', 'test/fixtures/grammar-parity/catalog.jsonl', ...['c2-english.json', 'c40-scalar-subquery.json', 'v5-phase5-8.3.15.json'].map(f => `test/fixtures/platform/${f}`)].map(file => ({ file, sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex') })) };
fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
fs.writeFileSync(path.join(output, 'signals.json'), JSON.stringify(signals, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
