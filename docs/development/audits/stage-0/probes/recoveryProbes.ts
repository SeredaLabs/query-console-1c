// Stage 0a scratch probe: recovery baseline of the EXISTING pipeline.
// Replicates the pure part of queryCompletionProvider / queryHoverProvider /
// queryDiagnostics on a BSL source (no vscode). Not part of the repository.
// Markers: ¦ = completion cursor, § = hover cursor (inside the hovered word).
// Run: npx tsx <this file> <repoRoot>
import * as path from 'path';

const ROOT = process.argv[2];
const r = (p: string) => require(path.join(ROOT, p));
const { findQueryAt, rawOffsetToQueryTextOffset } = r('src/extension/queryAtCursor.ts');
const { findChainAt, findChainForCompletion, describeChain, resolveCompletionTarget } = r('src/extension/hoverFieldInfo.ts');
const { computeQueryParseProblems } = r('src/extension/queryDiagnostics.ts');
const { buildSemanticSnapshotFromText } = r('src/core/semantic/buildSemanticSnapshot.ts');
const { hasTrustworthyPositions } = r('src/core/semantic/semanticSnapshot.ts');
const { tryParseBatch } = r('src/core/query/validateBatch.ts');
const { repairSelectListsForRecovery } = r('src/core/query/selectListRepair.ts');
const { buildResolverFromTables } = r('src/core/metadata/buildModelResolver.ts');

const KONTR = { kind: 'Справочник', name: 'Контрагенты', fullName: 'Справочник.Контрагенты', fields: [
  { name: 'Ссылка', kind: 'standard', types: [{ ref: { kind: 'Справочник', name: 'Контрагенты' } }] },
  { name: 'Наименование', kind: 'standard', types: [{ primitive: 'Строка' }] },
] };
const TOVARY = { kind: 'Справочник', name: 'Товары', fullName: 'Справочник.Товары', fields: [
  { name: 'Ссылка', kind: 'standard', types: [{ ref: { kind: 'Справочник', name: 'Товары' } }] },
  { name: 'Наименование', kind: 'standard', types: [{ primitive: 'Строка' }] },
  { name: 'Контрагент', kind: 'standard', types: [{ ref: { kind: 'Справочник', name: 'Контрагенты' } }] },
] };
const resolver = buildResolverFromTables([TOVARY, KONTR]);

interface Case { id: string; cls: string; q: string }
const FROM = 'ИЗ\n\tСправочник.Товары КАК Т';
const cases: Case[] = [
  { id: 'C00', cls: 'control: complete query', q: `ВЫБРАТЬ\n\tТ.§Ссылка,\n\tТ.¦Наименование\n${FROM}` },
  { id: 'C01', cls: 'user example (Latin T): trailing "T."', q: 'ВЫБРАТЬ\n\tT.§Ссылка,\n\tT.¦\nИЗ\n\tСправочник.Товары КАК T' },
  { id: 'C02', cls: 'same, Cyrillic Т', q: `ВЫБРАТЬ\n\tТ.§Ссылка,\n\tТ.¦\n${FROM}` },
  { id: 'C03', cls: 'only field is "Т."', q: `ВЫБРАТЬ\n\tТ.¦\n${FROM}\nГДЕ\n\tТ.§Наименование = ""Х""` },
  { id: 'C04', cls: 'broken SELECT expression (dangling +)', q: `ВЫБРАТЬ\n\tТ.§Ссылка,\n\tТ.¦ +\n${FROM}` },
  { id: 'C05', cls: 'missing comma', q: `ВЫБРАТЬ\n\tТ.§Ссылка\n\tТ.¦Наименование\n${FROM}` },
  { id: 'C06', cls: 'unfinished function', q: `ВЫБРАТЬ\n\tТ.§Ссылка,\n\tПОДСТРОКА(Т.¦\n${FROM}` },
  { id: 'C07', cls: 'unfinished CASE', q: `ВЫБРАТЬ\n\tТ.§Ссылка,\n\tВЫБОР КОГДА Т.¦\n${FROM}` },
  { id: 'C08', cls: 'unfinished JOIN condition', q: `ВЫБРАТЬ\n\tТ.§Ссылка\n${FROM}\n\t\tЛЕВОЕ СОЕДИНЕНИЕ Справочник.Контрагенты КАК К\n\t\tПО Т.¦` },
  { id: 'C09', cls: 'broken WHERE (dangling =)', q: `ВЫБРАТЬ\n\tТ.§Ссылка\n${FROM}\nГДЕ\n\tТ.¦ =` },
  { id: 'C10', cls: 'broken WHERE (missing operand before И)', q: `ВЫБРАТЬ\n\tТ.§Ссылка\n${FROM}\nГДЕ\n\tТ.Наименование = И Т.¦` },
  { id: 'C11', cls: 'unfinished subquery (unclosed)', q: `ВЫБРАТЬ\n\tТ.§Ссылка\n${FROM}\nГДЕ\n\tТ.Контрагент В (ВЫБРАТЬ К.¦ ИЗ Справочник.Контрагенты КАК К` },
  { id: 'C12', cls: 'subquery with broken select list (closed)', q: `ВЫБРАТЬ\n\tТ.§Ссылка\n${FROM}\nГДЕ\n\tТ.Контрагент В (ВЫБРАТЬ К.¦ ИЗ Справочник.Контрагенты КАК К)` },
  { id: 'C13', cls: 'unmatched parenthesis in SELECT', q: `ВЫБРАТЬ\n\tТ.§Ссылка,\n\t(Т.¦Наименование\n${FROM}` },
  { id: 'C14', cls: 'package: stmt2 broken SELECT, hover in stmt1', q: `ВЫБРАТЬ\n\tТ.§Ссылка\n${FROM}\n;\nВЫБРАТЬ\n\tТ.¦\n${FROM}` },
  { id: 'C15', cls: 'package: stmt2 broken WHERE, hover in stmt1', q: `ВЫБРАТЬ\n\tТ.§Ссылка\n${FROM}\n;\nВЫБРАТЬ\n\tТ.Ссылка\n${FROM}\nГДЕ\n\tТ.¦ =` },
  { id: 'C16', cls: 'package: temp table, stmt2 broken SELECT on ВТ', q: `ВЫБРАТЬ\n\tТ.§Ссылка КАК Ссылка\nПОМЕСТИТЬ ВТ\n${FROM}\n;\nВЫБРАТЬ\n\tВ.¦\nИЗ\n\tВТ КАК В` },
  { id: 'C17', cls: 'control: complete temp table package', q: `ВЫБРАТЬ\n\tТ.§Ссылка КАК Ссылка\nПОМЕСТИТЬ ВТ\n${FROM}\n;\nВЫБРАТЬ\n\tВ.¦Ссылка\nИЗ\n\tВТ КАК В` },
  { id: 'C18', cls: 'broken ORDER BY', q: `ВЫБРАТЬ\n\tТ.§Ссылка\n${FROM}\nУПОРЯДОЧИТЬ ПО\n\tТ.¦ ,` },
  { id: 'C19', cls: 'broken GROUP BY', q: `ВЫБРАТЬ\n\tТ.§Ссылка\n${FROM}\nСГРУППИРОВАТЬ ПО\n\tТ.¦ ,` },
  { id: 'C20', cls: 'UNION: member2 broken SELECT, hover in member1', q: `ВЫБРАТЬ\n\tТ.§Ссылка\n${FROM}\n\nОБЪЕДИНИТЬ ВСЕ\n\nВЫБРАТЬ\n\tТ.¦\n${FROM}` },
  { id: 'C21', cls: 'control: complete, subquery in WHERE В (...)', q: `ВЫБРАТЬ\n\tТ.§Ссылка\n${FROM}\nГДЕ\n\tТ.Контрагент В (ВЫБРАТЬ К.¦Ссылка ИЗ Справочник.Контрагенты КАК К)` },
  { id: 'C22', cls: 'control: complete, subquery in FROM', q: `ВЫБРАТЬ\n\tП.§Ссылка\nИЗ\n\t(ВЫБРАТЬ К.¦Ссылка КАК Ссылка ИЗ Справочник.Контрагенты КАК К) КАК П` },
  { id: 'C23', cls: 'FROM subquery with broken select list', q: `ВЫБРАТЬ\n\tП.Ссылка\nИЗ\n\t(ВЫБРАТЬ К.¦ ИЗ Справочник.Контрагенты КАК К) КАК П\n\t\tЛЕВОЕ СОЕДИНЕНИЕ Справочник.Товары КАК Т\n\t\tПО Т.§Контрагент = П.Ссылка` },
  { id: 'C24', cls: 'control: complete, JOIN; hover in ON', q: `ВЫБРАТЬ\n\tТ.Ссылка\n${FROM}\n\t\tЛЕВОЕ СОЕДИНЕНИЕ Справочник.Контрагенты КАК К\n\t\tПО Т.§Контрагент = К.¦Ссылка` },
];

function toBsl(q: string): string {
  return 'Запрос = Новый Запрос;\nЗапрос.Текст = "' + q.split('\n').join('\n\t|') + '";\n';
}
function strip(src: string): { source: string; comp?: number; hover?: number } {
  let comp: number | undefined, hover: number | undefined, out = '';
  for (const ch of src) {
    if (ch === '¦') { comp = out.length; continue; }
    if (ch === '§') { hover = out.length; continue; }
    out += ch;
  }
  return { source: out, comp, hover };
}

const rows: unknown[] = [];
for (const c of cases) {
  const { source, comp, hover } = strip(toBsl(c.q));
  const hit = findQueryAt(source, comp ?? hover!);
  const queryText: string = hit.text;
  const parse = tryParseBatch(queryText);
  const repaired = repairSelectListsForRecovery(queryText);
  const snap = buildSemanticSnapshotFromText(1, queryText, resolver);

  let completion: string[] | string = 'no-probe';
  if (comp !== undefined) {
    const chain = findChainForCompletion(source, comp);
    if (!chain) completion = 'no-chain';
    else {
      const headPosition = rawOffsetToQueryTextOffset(source, hit, chain[0].start);
      const t = resolveCompletionTarget(queryText, resolver, chain.map((s: any) => s.text), headPosition);
      completion = t ? t.meta.fields.map((f: any) => f.name) : 'none';
    }
  }
  let hoverRes: string = 'no-probe';
  if (hover !== undefined) {
    const chain = findChainAt(source, hover);
    if (!chain) hoverRes = 'no-chain';
    else {
      const headPosition = rawOffsetToQueryTextOffset(source, hit, chain.segments[0].start);
      const d = describeChain(queryText, resolver, chain.segments.map((s: any) => s.text), headPosition);
      hoverRes = d.tableFullName ? `${d.tableFullName}${d.resolution ? ' / ' + d.resolution.resolved.map((x: any) => x.field.name).join('.') : ''}` : 'none';
    }
  }
  const diag = computeQueryParseProblems(source).map((p: any) => p.kind + (p.message ? ': ' + p.message : ''));
  rows.push({
    id: c.id, cls: c.cls,
    parseOk: parse.ok, parseError: parse.ok ? undefined : parse.error,
    repairApplied: repaired !== undefined,
    completeness: snap.completeness, trustworthyPositions: hasTrustworthyPositions(snap),
    symbols: snap.index.symbolsById.size, scopes: snap.index.scopesById.size, references: snap.index.referencesBySymbolId.size,
    completion, hover: hoverRes, diagnostics: diag,
  });
}
console.log(JSON.stringify(rows, null, 1));
