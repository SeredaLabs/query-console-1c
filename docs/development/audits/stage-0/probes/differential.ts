// TEMPORARY Stage 0b audit script (docs/development/audits/stage-0.md). Not part
// of the product, not run by any test or CI job. Delete or supersede when the
// audit is closed.
//
// External prerequisite (NOT installed or vendored by this script — install it
// yourself in a scratch directory, never in this repository):
//   - tree-sitter CLI 0.25.10            (npm i tree-sitter-cli@0.25.10 in scratch)
//   - alkoleft/tree-sitter-bsl @ 5752667f4d40879a533c4ffe3005da10ff0b5e29,
//     checked out as <dir>/tree-sitter-bsl (the CLI discovers it by that name)
//   - a C compiler (the CLI compiles the grammar to a native library)
// Environment:
//   TS_CLI=<path to tree-sitter binary>
//   TS_CONFIG=<config.json with {"parser-directories": ["<dir>"]}>
//   TREE_SITTER_LIBDIR=<scratch dir for the compiled grammar library>
//   AUDIT_WORK=<scratch dir for temporary input files>
//   EXT_TS_CORPUS=<tree-sitter-bsl>/grammars/sdbl/test/corpus   (optional)
//   EXT_ANTLR_CORPUS=<bsl-parser>/src/test/resources/sdbl         (optional)
// Run from the repository root:
//   npx tsx docs/development/audits/stage-0/probes/differential.ts $PWD
// Writes docs/development/audits/stage-0/results.jsonl and prints a summary.
// External corpus texts are used only in memory/AUDIT_WORK; results.jsonl
// stores their ids and hashes, never their text.
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { spawnSync } from 'child_process';

const ROOT = process.argv[2];
const req = (p: string) => require(path.join(ROOT, p));
const { parseBatch, getBatchStatementSpans } = req('src/core/query/sdblParser.ts');
const { generateBatch } = req('src/core/query/sdblGenerator.ts');
const { buildYamlResolver } = req('src/core/metadata/buildYamlResolver.ts');
const { findRawFallbackHits } = req('tooling/corpus-verify/classification.ts');
const { findUnsafeVirtualTables } = req('src/core/query/semanticValidator.ts');
const { tokenize } = req('src/core/query/sdblLexer.ts');

const TS_CLI = process.env.TS_CLI!;
const TS_CONFIG = process.env.TS_CONFIG!;
const WORK = process.env.AUDIT_WORK!;
if (!TS_CLI || !TS_CONFIG || !WORK) throw new Error('TS_CLI, TS_CONFIG and AUDIT_WORK are required (see header)');

const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

// ---------------------------------------------------------------- corpus
type Provenance = 'expected-valid-platform-recorded' | 'expected-valid-unknown-provenance' | 'unknown-provenance' | 'external-competitor-test' | 'audit-probe';
interface Pkg { id: string; source: string; provenance: Provenance; text: string; reference?: string; referenceKind?: 'golden' | 'fixture'; useResolver: boolean; storeText: boolean; construct?: string; key?: string }
const pkgs: Pkg[] = [];
const CORPUS = path.join(ROOT, 'test/fixtures/corpus');
for (const line of fs.readFileSync(path.join(CORPUS, 'golden.jsonl'), 'utf8').split('\n')) {
  if (!line.trim()) continue;
  const g = JSON.parse(line);
  pkgs.push({ id: 'golden:' + g.file, source: 'golden', provenance: 'expected-valid-platform-recorded', text: g.input, reference: g.query_text, referenceKind: 'golden', useResolver: true, storeText: false });
}
for (const f of fs.readdirSync(path.join(CORPUS, 'meta1c')).filter(f => f.endsWith('.txt')).sort()) {
  const text = fs.readFileSync(path.join(CORPUS, 'meta1c', f), 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');
  pkgs.push({ id: 'meta1c:' + f, source: 'meta1c', provenance: 'expected-valid-unknown-provenance', text, useResolver: true, storeText: false });
}
for (const f of fs.readdirSync(path.join(ROOT, 'test/fixtures/queries')).filter(f => f.endsWith('.sdbl')).sort()) {
  pkgs.push({ id: 'queries:' + f, source: 'queries', provenance: 'unknown-provenance', text: fs.readFileSync(path.join(ROOT, 'test/fixtures/queries', f), 'utf8'), useResolver: false, storeText: false });
}
for (const f of fs.readdirSync(path.join(ROOT, 'test/fixtures/oracle')).filter(f => f.endsWith('.json')).sort()) {
  const o = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/oracle', f), 'utf8'));
  pkgs.push({ id: 'oracle:' + f, source: 'oracle', provenance: 'unknown-provenance', text: o.input, reference: o.expected, referenceKind: 'fixture', useResolver: false, storeText: false });
}
if (process.env.EXT_TS_CORPUS) {
  // tree-sitter corpus format: ===\n<name>\n===\n<input>\n---\n<expected tree>
  for (const f of fs.readdirSync(process.env.EXT_TS_CORPUS).filter(f => f.endsWith('.sdbl')).sort()) {
    const body = fs.readFileSync(path.join(process.env.EXT_TS_CORPUS, f), 'utf8');
    const re = /^=+\n(.*?)\n=+\n([\s\S]*?)\n-{3,}\n/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body))) {
      pkgs.push({ id: `ext-ts:${f}#${m[1].trim()}`, source: 'ext-tree-sitter-bsl', provenance: 'external-competitor-test', text: m[2], useResolver: false, storeText: false });
    }
  }
}
if (process.env.EXT_ANTLR_CORPUS) {
  for (const f of fs.readdirSync(process.env.EXT_ANTLR_CORPUS).filter(f => f.endsWith('.sdbl')).sort()) {
    pkgs.push({ id: 'ext-antlr:' + f, source: 'ext-bsl-parser', provenance: 'external-competitor-test', text: fs.readFileSync(path.join(process.env.EXT_ANTLR_CORPUS, f), 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n'), useResolver: false, storeText: false });
  }
}

// Audit construct probes (our own minimal queries; validity is UNKNOWN until reprobed).
const PROBES = path.join(ROOT, 'docs/development/audits/stage-0/probes/construct-probes.json');
for (const pr of JSON.parse(fs.readFileSync(PROBES, 'utf8'))) {
  pkgs.push({ id: 'probe:' + pr.id, source: 'construct-probe', provenance: 'audit-probe', text: pr.text, useResolver: true, storeText: true, construct: pr.construct, key: pr.key });
}

// ---------------------------------------------------------------- tree-sitter
interface XNode { tag: string; attrs: Record<string, string>; children: XNode[]; text: string }
function parseXml(xml: string): XNode {
  const root: XNode = { tag: '#root', attrs: {}, children: [], text: '' };
  const stack: XNode[] = [root];
  const re = /<(\/?)([A-Za-z_][\w]*)([^>]*?)(\/?)>|([^<]+)/g;
  const unesc = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    if (m[5] !== undefined) {
      const t = unesc(m[5]).trim();
      if (t) stack[stack.length - 1].children.push({ tag: '#text', attrs: {}, children: [], text: t });
      continue;
    }
    if (m[1]) { stack.pop(); continue; }
    const attrs: Record<string, string> = {};
    for (const a of m[3].matchAll(/(\w+)="([^"]*)"/g)) attrs[a[1]] = a[2];
    const node: XNode = { tag: m[2], attrs, children: [], text: '' };
    stack[stack.length - 1].children.push(node);
    if (!m[4]) stack.push(node);
  }
  return root.children[0];
}

function tsRun(files: string[], args: string[]): string {
  const list = path.join(WORK, 'paths.txt');
  fs.writeFileSync(list, files.join('\n'));
  const r = spawnSync(TS_CLI, ['parse', '--config-path', TS_CONFIG, '--scope', 'source.sdbl', ...args, '--paths', list], { encoding: 'utf8', maxBuffer: 1 << 30, env: process.env });
  if (r.error) throw r.error;
  return r.stdout;
}

/** Map of file -> first error text ('' when clean) for a batch of files. */
function tsErrors(files: string[]): Map<string, string> {
  const out = tsRun(files, ['-q']);
  const errs = new Map<string, string>(files.map(f => [f, '']));
  for (const line of out.split('\n')) {
    const cols = line.split('\t');
    if (cols.length >= 2 && errs.has(cols[0])) errs.set(cols[0], cols[cols.length - 1].trim());
  }
  return errs;
}
function tsTrees(files: string[]): XNode[] {
  const out: XNode[] = [];
  for (let i = 0; i < files.length; i += 200) {
    const chunk = files.slice(i, i + 200);
    const docs = tsRun(chunk, ['-x']).split('<?xml version="1.0"?>').map(s => s.trim()).filter(Boolean);
    if (docs.length !== chunk.length) throw new Error(`xml doc count ${docs.length} != ${chunk.length}`);
    for (const d of docs) out.push(parseXml(d));
  }
  return out;
}

// ------------------------------------------------ normalization (documented)
// N1: drop positions and field attributes; keyword nodes compare by node type
//     only (RU/EN spelling and letter case ignored); identifiers compare
//     case-insensitively with ё≡е; comments dropped; parenthesized_expression is
//     replaced by its inner expression (tree shape already encodes precedence,
//     so only redundant parentheses are ignored).
//     Also (added after calibration on golden canonical-confirmed cases, see
//     stage-0.md): a query_expression whose only child is another
//     query_expression is collapsed (a pure tree artifact of stripping
//     parentheses), and a trailing statement separator `;` is ignored.
// N2: N1 plus field_alias / source_alias subtrees removed. Explicit aliases are
//     then checked separately: every alias written in the input must survive,
//     in order, in the output (auto-added aliases are ignored); an explicit
//     alias equal to the output field's implied name (last identifier of its
//     expression) counts as preserved even if the output omits it.
function norm(n: XNode, dropAliases: boolean): string {
  if (n.tag === '#text') return n.text === '(' || n.text === ')' ? '' : n.text;
  if (n.tag === 'line_comment') return '';
  if (dropAliases && (n.tag === 'field_alias' || n.tag === 'source_alias')) return '';
  if (n.tag.endsWith('_KEYWORD')) return n.tag;
  if (n.tag === 'identifier') return 'id:' + textOf(n).toLowerCase().replace(/ё/g, 'е');
  if (n.tag === 'parenthesized_expression') {
    const inner = n.children.filter(c => c.tag !== '#text');
    if (inner.length === 1) return norm(inner[0], dropAliases);
  }
  if (n.tag === 'query_expression') {
    const inner = n.children.filter(c => c.tag !== '#text' && c.tag !== 'line_comment');
    if (inner.length === 1 && (inner[0].tag === 'query_expression' || inner[0].tag === 'parenthesized_expression')) return norm(inner[0], dropAliases);
  }
  if (n.tag === 'source_file' || n.tag === 'query_package') {
    const kids = [...n.children];
    while (kids.length && kids[kids.length - 1].tag === '#text' && kids[kids.length - 1].text === ';') kids.pop();
    const parts = kids.map(c => norm(c, dropAliases)).filter(Boolean);
    return `${n.tag}(${parts.join(' ')})`;
  }
  const kids = n.children.map(c => norm(c, dropAliases)).filter(Boolean);
  if (kids.length === 0) return `${n.tag}:${textOf(n)}`;
  return `${n.tag}(${kids.join(' ')})`;
}
function textOf(n: XNode): string {
  if (n.tag === '#text') return n.text;
  return n.children.map(textOf).join('');
}
function collect(n: XNode, tag: string, out: XNode[] = []): XNode[] {
  if (n.tag === tag) out.push(n);
  for (const c of n.children) collect(c, tag, out);
  return out;
}
function explicitAliases(n: XNode, tag: string): string[] {
  return collect(n, tag).map(a => textOf(a.children.filter(c => c.tag === 'identifier').slice(-1)[0] ?? a).toLowerCase().replace(/ё/g, 'е'));
}
const CLAUSES = ['select_section', 'field_list', 'from_clause', 'where_clause', 'group_by_clause', 'having_clause', 'order_by_clause', 'totals_clause', 'index_by_clause', 'union_clause', 'into_clause', 'for_update_clause', 'top_clause'];
function clauseDiff(a: XNode, b: XNode): string[] {
  const diffs = new Set<string>();
  for (const c of CLAUSES) {
    if (c === 'select_section') continue;
    const x = collect(a, c).map(n => norm(n, true)).join('|');
    const y = collect(b, c).map(n => norm(n, true)).join('|');
    if (x !== y) diffs.add(c);
  }
  return [...diffs];
}
function structuralCompare(input: XNode, output: XNode): { value: 'structural-equivalent' | 'structural-difference-candidate'; detail: string } {
  const n2in = norm(input, true), n2out = norm(output, true);
  const aIn = explicitAliases(input, 'field_alias'), aOut = explicitAliases(output, 'field_alias');
  const sIn = explicitAliases(input, 'source_alias'), sOut = explicitAliases(output, 'source_alias');
  const subseq = (need: string[], have: string[]) => { let j = 0; for (const h of have) if (j < need.length && need[j] === h) j++; return j === need.length; };
  const implied = new Set(collect(output, 'field').filter(f => !f.children.some(c => c.tag === 'field_alias')).map(f => { const ids = collect(f, 'identifier'); return ids.length ? textOf(ids[ids.length - 1]).toLowerCase().replace(/ё/g, 'е') : ''; }));
  const aliasOk = subseq(aIn.filter(a => !implied.has(a) || aOut.includes(a)), aOut) && subseq(sIn, sOut);
  if (n2in === n2out && aliasOk) return { value: 'structural-equivalent', detail: '' };
  const parts: string[] = [];
  if (n2in !== n2out) parts.push('tree:' + clauseDiff(input, output).join(',') );
  if (!aliasOk) parts.push('explicit-alias-changed');
  return { value: 'structural-difference-candidate', detail: parts.join(';') };
}

// ------------------------------------------------ structure axis (our model)
interface Span { slot: string; text: string }
function opaqueSpans(batch: any): Span[] {
  const out: Span[] = [];
  const push = (slot: string, t?: string) => { if (t !== undefined && t !== '') out.push({ slot, text: t }); };
  const walkDoc = (doc: any) => { for (const m of doc.members) walkModel(m.model); };
  const walkConds = (slot: string, cs: any[] | undefined) => {
    for (const c of cs ?? []) {
      if (c.custom) push(slot, c.expression);
      if (c.leftExpr) push(slot + '.leftExpr', c.leftExpr);
      if (c.subquery) walkDoc(c.subquery);
    }
  };
  const walkModel = (m: any) => {
    for (const t of m.tables) {
      if (t.subquery) walkDoc(t.subquery);
      if (t.virtual) for (const [k, v] of Object.entries(t.virtual)) if (typeof v === 'string' && v !== '') push('virtualParam.' + k, v);
    }
    for (const f of [...m.fields, ...(m.trailingFields ?? [])]) push('selectField', f.expression);
    for (const ts of m.tabSectionFields ?? []) for (const e of ts.exprFields ?? []) push('tabSectionExpr', e.expression);
    for (const j of m.joins ?? []) {
      if (j.custom) push('join', j.expression);
      for (const c of j.conditions ?? []) if (c.custom) push('joinCondition', c.expression);
    }
    walkConds('where', m.conditions);
    walkConds('having', m.having);
    for (const g of m.grouping?.groupFields ?? []) push('groupBy', g.expression);
    for (const set of m.grouping?.groupSets ?? []) for (const g of set) push('groupingSet', g.expression);
    for (const a of m.grouping?.aggregates ?? []) push('groupAggregate', a.expression);
    for (const o of m.order?.fields ?? []) push('orderBy', o.expression);
    for (const g of m.totals?.groupFields ?? []) push('totalsBy', g.expression);
    for (const f of m.totals?.totalFields ?? []) push('totalsField', f.expression);
    for (const ix of m.indexing?.indexes ?? []) for (const f of ix.fields) push('indexBy', f.expression);
  };
  for (const d of batch.members) walkDoc(d);
  return out;
}

const AGG = new Set(['СУММА', 'КОЛИЧЕСТВО', 'МАКСИМУМ', 'МИНИМУМ', 'СРЕДНЕЕ']);
/** Multi-label construct classification of one opaque span (lexer-based). */
function constructsOf(text: string): string[] {
  const toks = tokenize(text).filter((t: any) => t.type !== 'eof' && t.type !== 'comment');
  const up = (t: any) => (t.type === 'keyword' ? t.value : String(t.text).toUpperCase());
  const labels = new Set<string>();
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i], u = up(t), next = toks[i + 1];
    const isCall = next && next.type === 'punct' && next.value === '(' && (t.type === 'ident' || t.type === 'keyword');
    if (u === 'ВЫБОР' || u === 'CASE') labels.add('CASE');
    else if (u === 'ВЫРАЗИТЬ' || u === 'CAST') labels.add('CAST');
    else if (u === 'ВЫБРАТЬ') labels.add('subquery');
    else if (u === 'ИЕРАРХИИ') labels.add('IN HIERARCHY');
    else if (u === 'ПОДОБНО') labels.add('LIKE');
    else if (u === 'СПЕЦСИМВОЛ') labels.add('SPECIALCHAR');
    else if (u === 'МЕЖДУ') labels.add('BETWEEN');
    else if (u === 'ЕСТЬ') labels.add(toks[i + 1] && up(toks[i + 1]) === 'NULL' || (toks[i + 2] && up(toks[i + 2]) === 'NULL') ? 'IS NULL' : 'ЕСТЬ');
    else if (u === 'ССЫЛКА' && !(toks[i - 1] && toks[i - 1].type === 'punct' && toks[i - 1].value === '.')) labels.add('REFERENCE');
    else if (u === 'ИЛИ') labels.add('OR');
    else if (u === 'НЕ') labels.add('NOT');
    else if (u === 'И') labels.add('AND');
    else if (u === 'В' && next && next.type === 'punct' && next.value === '(') labels.add('IN');
    else if (isCall && u === 'ЗНАЧЕНИЕ') labels.add('VALUE() predefined');
    else if (isCall && u === 'ТИП') labels.add('TYPE()');
    else if (isCall && u === 'ТИПЗНАЧЕНИЯ') labels.add('VALUETYPE()');
    else if (isCall && u === 'ДАТАВРЕМЯ') labels.add('DATETIME literal');
    else if (isCall && u === 'ЕСТЬNULL') labels.add('ISNULL()');
    else if (isCall && AGG.has(u)) labels.add('aggregate');
    else if (isCall) labels.add('function:' + u);
    else if (t.type === 'punct' && ['+', '-', '*', '/', '%'].includes(t.value)) labels.add('arithmetic');
    else if (t.type === 'punct' && ['=', '<>', '<', '>', '<=', '>='].includes(t.value)) labels.add('comparison');
    else if (t.type === 'string' || t.type === 'number' || t.type === 'date' || ['ИСТИНА', 'ЛОЖЬ', 'NULL', 'НЕОПРЕДЕЛЕНО'].includes(u)) labels.add('literal');
    else if (t.type === 'param') labels.add('parameter');
    else if (t.type === 'punct' && (t.value === '{' || t.value === '}')) labels.add('builder-braces');
    else if (t.type === 'punct' && ['?', '@', '[', ']', '#'].includes(t.value)) labels.add('template-marker');
  }
  const hasDot = toks.some((t: any) => t.type === 'punct' && t.value === '.');
  if (labels.size === 0) labels.add(hasDot ? 'field-path-only' : 'identifier-only');
  return [...labels];
}

// ---------------------------------------------------------------- run
fs.mkdirSync(path.join(WORK, 'in'), { recursive: true });
fs.mkdirSync(path.join(WORK, 'gen'), { recursive: true });
fs.mkdirSync(path.join(WORK, 'stmt'), { recursive: true });
const resolver = buildYamlResolver(path.join(CORPUS, 'metadata', 'cf'));

interface Ours { ok: boolean; error?: string; g1?: string; g2?: string; idempotentText?: boolean; idempotentModel?: boolean; spans?: Span[]; rawFallbackHits?: number; unsafeVT?: string[]; statements?: number; unionMembers?: number }
const ours: Ours[] = pkgs.map(p => {
  const r = p.useResolver ? resolver : undefined;
  try {
    const d1 = parseBatch(p.text, r);
    const g1 = generateBatch(d1);
    let g2: string | undefined, idemModel: boolean | undefined;
    try {
      const d2 = parseBatch(g1, r);
      g2 = generateBatch(d2);
      const d3 = parseBatch(g2, r);
      idemModel = JSON.stringify(d2) === JSON.stringify(d3);
    } catch (e) { g2 = '<<EXC ' + (e as Error).message + '>>'; idemModel = false; }
    return {
      ok: true, g1, g2, idempotentText: g1 === g2, idempotentModel: idemModel,
      spans: opaqueSpans(d1), rawFallbackHits: findRawFallbackHits(d1).length,
      unsafeVT: findUnsafeVirtualTables(d1),
      statements: d1.members.length, unionMembers: d1.members.reduce((s: number, m: any) => s + m.members.length, 0),
    };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
});

const inFiles = pkgs.map((_, i) => path.join(WORK, 'in', `${i}.sdbl`));
pkgs.forEach((p, i) => fs.writeFileSync(inFiles[i], p.text));
const genIdx = ours.map((o, i) => (o.ok ? i : -1)).filter(i => i >= 0);
const genFiles = genIdx.map(i => path.join(WORK, 'gen', `${i}.sdbl`));
genIdx.forEach((i, k) => fs.writeFileSync(genFiles[k], ours[i].g1!));

const inErr = tsErrors(inFiles);
const genErr = tsErrors(genFiles);
const inTrees = tsTrees(inFiles);
const genTrees = tsTrees(genFiles);
const genTreeOf = new Map<number, { tree: XNode; err: string }>();
genIdx.forEach((i, k) => genTreeOf.set(i, { tree: genTrees[k], err: genErr.get(genFiles[k])! }));

// statement-level localisation for competitor rejections
const stmtJobs: Array<{ pkg: number; stmt: number; file: string }> = [];
pkgs.forEach((p, i) => {
  if (!inErr.get(inFiles[i])) return;
  const spans = getBatchStatementSpans(p.text);
  spans.forEach((s: any, k: number) => {
    const f = path.join(WORK, 'stmt', `${i}_${k}.sdbl`);
    fs.writeFileSync(f, p.text.slice(s.start, s.end));
    stmtJobs.push({ pkg: i, stmt: k, file: f });
  });
});
const stmtErr = stmtJobs.length ? tsErrors(stmtJobs.map(j => j.file)) : new Map<string, string>();

function errorSnippet(text: string, err: string): string {
  const m = /\[(\d+), (\d+)\] - \[(\d+), (\d+)\]/.exec(err);
  if (!m) return '';
  const lines = text.split('\n');
  const line = lines[+m[1]] ?? '';
  const byteCol = +m[2];
  const buf = Buffer.from(line, 'utf8');
  const col = buf.subarray(0, byteCol).toString('utf8').length;
  return line.slice(Math.max(0, col - 30), col + 50).trim();
}

const results = pkgs.map((p, i) => {
  const o = ours[i];
  const cErr = inErr.get(inFiles[i])!;
  const compAccepted = cErr === '';
  const acceptance = o.ok && compAccepted ? 'both' : o.ok ? 'ours-only' : compAccepted ? 'competitor-only' : 'neither';

  // round-trip axis, methods strictly in order
  let roundTrip: { value: string; method: string; detail?: string } = { value: 'unknown', method: 'none' };
  const evidence: string[] = [];
  let calibration: { value: string; detail: string } | undefined;
  if (o.ok) {
    if (p.referenceKind === 'golden') {
      roundTrip = o.g1 === p.reference
        ? { value: p.text === o.g1 ? 'unchanged' : 'canonical-confirmed', method: 'golden' }
        : { value: 'oracle-mismatch-confirmed', method: 'golden' };
      evidence.push('golden query_text (platform-recorded, not re-verified)');
    }
    if (roundTrip.method === 'none' && p.referenceKind === 'fixture') {
      evidence.push(o.g1 === p.reference ? 'fixture-expected match (unknown provenance)' : 'fixture-expected MISMATCH (unknown provenance)');
    }
    if (roundTrip.method === 'none') {
      if (p.text === o.g1) roundTrip = { value: 'unchanged', method: 'text-identity' };
      else {
        const g = genTreeOf.get(i)!;
        if (!compAccepted || g.err) roundTrip = { value: 'unknown', method: 'structural-tree', detail: `detector rejected ${!compAccepted ? 'input' : 'output'}` };
        else {
          const c = structuralCompare(inTrees[i], g.tree);
          roundTrip = { value: c.value, method: 'structural-tree', detail: c.detail };
        }
      }
    }
    // detector calibration on cases already decided by golden
    if (roundTrip.method === 'golden' && p.text !== o.g1) {
      const g = genTreeOf.get(i)!;
      calibration = !compAccepted || g.err ? { value: 'unknown', detail: 'detector rejected ' + (!compAccepted ? 'input' : 'output') } : structuralCompare(inTrees[i], g.tree);
    }
  }

  const structure = !o.ok ? 'unsupported' : (o.spans!.length === 0 ? 'structured' : 'partially-structured');
  const stmtFails = stmtJobs.filter(j => j.pkg === i).map(j => ({ stmt: j.stmt, err: stmtErr.get(j.file) ?? '' }));
  return {
    id: p.id, source: p.source, provenance: p.provenance, sha: sha(p.text),
    statementCount: o.statements ?? getBatchStatementSpans(p.text).length, unionMemberCount: o.unionMembers,
    ours: { accepted: o.ok, error: o.error },
    competitor: { tool: 'tree-sitter-bsl', sha: '5752667f4d40879a533c4ffe3005da10ff0b5e29', accepted: compAccepted, firstError: cErr || undefined, errorSnippet: cErr && p.source !== 'ext-tree-sitter-bsl' && p.source !== 'ext-bsl-parser' ? errorSnippet(p.text, cErr) : undefined, failingStatements: stmtFails.filter(s => s.err).map(s => s.stmt) },
    acceptance,
    roundTrip: { ...roundTrip, idempotentText: o.idempotentText, idempotentModel: o.idempotentModel },
    detectorCalibration: calibration,
    structure: { value: structure, opaqueSpanCount: o.spans?.length ?? 0, corpusRawFallbackHits: o.rawFallbackHits, slots: o.spans ? countBy(o.spans.map(s => s.slot)) : undefined, constructs: o.spans ? countBy(o.spans.flatMap(s => constructsOf(s.text))) : undefined },
    unsafeVirtualTables: o.unsafeVT?.length ? o.unsafeVT : undefined,
    evidence,
    ...(p.storeText ? {
      construct: p.construct, key: p.key, text: p.text, generated: o.g1, oursError: o.error,
      keyInOpaqueSpan: o.spans ? o.spans.some(sp => sp.text.toUpperCase().includes(p.key!.toUpperCase())) : undefined,
      opaqueSpans: o.spans,
    } : {}),
  };
});
function countBy(xs: string[]): Record<string, number> { const r: Record<string, number> = {}; for (const x of xs) r[x] = (r[x] ?? 0) + 1; return r; }

const OUT = path.join(ROOT, 'docs/development/audits/stage-0');
const corpusRows = results.filter(r => r.source !== 'construct-probe');
const probeRows = results.filter(r => r.source === 'construct-probe');
fs.writeFileSync(path.join(OUT, 'results.jsonl'), corpusRows.map(r => JSON.stringify(r)).join('\n') + '\n');
fs.writeFileSync(path.join(OUT, 'construct-probes.jsonl'), probeRows.map(r => JSON.stringify(r)).join('\n') + '\n');
console.error(`wrote ${corpusRows.length} corpus rows and ${probeRows.length} probe rows`);
