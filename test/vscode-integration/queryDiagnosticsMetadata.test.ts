/**
 * Extension Host integration (C41 stage 1b): editor diagnostics use metadata that is
 * ALREADY loaded into `metadataResolverCache` (hover/completion/the designer panel) and
 * never start a load themselves. A cache change re-checks open documents without an
 * edit. The test drives its own controller (own `source`) and this module graph's cache:
 * the activated extension bundle holds a separate copy of the cache module.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { registerQueryDiagnostics } from '../../src/extension/queryDiagnosticsController';
import {
  getMetadataResolver, setMetadataResolver, offerMetadataResolver, peekMetadataResolver,
  retainMetadataResolverFor, onDidChangeMetadataResolver,
} from '../../src/extension/metadataResolverCache';
import { buildResolverFromTables } from '../../src/core/metadata/buildModelResolver';
import type { MetadataResolver } from '../../src/core/query/metadataResolver';
import type { MetaTable } from '../../src/core/metadata/types';
import { waitUntil } from './testUtil';

const SOURCE = 'queryConsole1c-test-metadata';
const CF = '/nonexistent/c41-diagnostics-metadata';
const OTHER_CF = '/nonexistent/c41-diagnostics-metadata-other';

const table = (fields: string[]): MetaTable => ({
  kind: 'Справочник', name: 'Тест', fullName: 'Справочник.Тест',
  fields: fields.map(name => ({ name, kind: 'standard' as const, types: [{ primitive: 'Строка' as const }] })),
});

async function openLooseBsl(content: string): Promise<vscode.TextDocument> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diagnostics-metadata-'));
  const filePath = path.join(dir, 'query.bsl');
  fs.writeFileSync(filePath, content, 'utf8');
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
  await vscode.window.showTextDocument(doc);
  return doc;
}

const fieldDiagnostics = (uri: vscode.Uri) =>
  vscode.languages.getDiagnostics(uri).filter(d => d.source === SOURCE && d.code === 'designer-field-not-found');

const QUERY = 'Запрос.Текст = "ВЫБРАТЬ Т.Нет КАК Х ИЗ Справочник.Тест КАК Т";\n';

describe('Extension Host: diagnostics with already loaded metadata (C41 stage 1b)', () => {
  let controller: vscode.Disposable;
  beforeEach(() => {
    retainMetadataResolverFor(OTHER_CF); // start without metadata for CF
    retainMetadataResolverFor(CF);
    controller = registerQueryDiagnostics(SOURCE);
  });
  afterEach(() => {
    controller.dispose();
    retainMetadataResolverFor(OTHER_CF);
  });

  it('without metadata: no field diagnostic, and no metadata load is started', async function () {
    this.timeout(20000);
    const doc = await openLooseBsl(QUERY);
    await new Promise(r => setTimeout(r, 700));
    assert.strictEqual(fieldDiagnostics(doc.uri).length, 0);
    assert.strictEqual(peekMetadataResolver(), undefined, 'diagnostics must not load metadata');
  });

  it('a cache change re-checks the open document without an edit, both ways', async function () {
    this.timeout(20000);
    const doc = await openLooseBsl(QUERY);
    await new Promise(r => setTimeout(r, 500));
    const version = doc.version;

    setMetadataResolver(CF, buildResolverFromTables([table(['Код'])]));
    assert.ok(await waitUntil(() => fieldDiagnostics(doc.uri).length === 1, 5000), 'field diagnostic expected after the load');
    const diag = fieldDiagnostics(doc.uri)[0];
    assert.strictEqual(diag.severity, vscode.DiagnosticSeverity.Warning);
    assert.ok(diag.message.includes('Поле "Нет" не найдено в "Справочник.Тест"'), diag.message);
    assert.strictEqual(doc.getText(diag.range), 'ВЫБРАТЬ');

    setMetadataResolver(CF, buildResolverFromTables([table(['Код', 'Нет'])]));
    assert.ok(await waitUntil(() => fieldDiagnostics(doc.uri).length === 0, 5000), 'diagnostic expected to clear with new metadata');

    setMetadataResolver(CF, buildResolverFromTables([table(['Код'])]));
    assert.ok(await waitUntil(() => fieldDiagnostics(doc.uri).length === 1, 5000));
    retainMetadataResolverFor(OTHER_CF); // metadata path changed: back to no metadata
    assert.ok(await waitUntil(() => fieldDiagnostics(doc.uri).length === 0, 5000), 'diagnostic expected to clear without metadata');
    assert.strictEqual(doc.version, version, 'no edit was made');
  });

  it('an unchanged document and resolver are not checked again', async function () {
    this.timeout(20000);
    let lookups = 0;
    const base = buildResolverFromTables([table(['Код'])]);
    const counting: MetadataResolver = { ...base, tableByFullName: (name: string) => { lookups++; return base.tableByFullName(name); } };
    const doc = await openLooseBsl(QUERY);
    setMetadataResolver(CF, counting);
    assert.ok(await waitUntil(() => fieldDiagnostics(doc.uri).length === 1, 5000));
    const after = lookups;
    setMetadataResolver(CF, counting); // the same resolver again: an event, nothing new
    await new Promise(r => setTimeout(r, 500));
    assert.strictEqual(lookups, after, 'the check ran again for the same version and resolver');
    assert.strictEqual(fieldDiagnostics(doc.uri).length, 1);
  });
});

describe('Extension Host: metadataResolverCache lifecycle (C41 stage 1b)', () => {
  const fakeContext = { globalStorageUri: vscode.Uri.file(os.tmpdir()) } as unknown as vscode.ExtensionContext;
  const fakeChannel = { appendLine: () => {} } as unknown as vscode.OutputChannel;
  // An empty metadata path skips the rebuild branch of `loadMetadata`: the load writes
  // nothing and returns quickly (an empty or committed model).
  afterEach(() => retainMetadataResolverFor(OTHER_CF));

  it('a load replaced before it finishes neither overwrites the newer resolver nor fires', async function () {
    this.timeout(20000);
    retainMetadataResolverFor(OTHER_CF);
    const loading = getMetadataResolver('', fakeContext, fakeChannel);
    const newer = buildResolverFromTables([table(['Код'])]);
    setMetadataResolver(OTHER_CF, newer);
    let fired = 0;
    const sub = onDidChangeMetadataResolver(() => fired++);
    try {
      await loading;
      await new Promise(r => setTimeout(r, 50));
      assert.strictEqual(peekMetadataResolver(), newer);
      assert.strictEqual(fired, 0, 'a stale load must not re-check the documents');
    } finally {
      sub.dispose();
    }
  });

  it('a finished load fires the change event', async function () {
    this.timeout(20000);
    retainMetadataResolverFor(OTHER_CF);
    let fired = 0;
    const sub = onDidChangeMetadataResolver(() => fired++);
    try {
      const resolver = await getMetadataResolver('', fakeContext, fakeChannel);
      assert.strictEqual(peekMetadataResolver(), resolver);
      assert.ok(await waitUntil(() => fired > 0, 2000));
    } finally {
      sub.dispose();
    }
  });

  it('the panel offer seeds an empty cache and never replaces an existing entry', () => {
    retainMetadataResolverFor(OTHER_CF);
    const first = buildResolverFromTables([table(['Код'])]);
    offerMetadataResolver(CF, () => first);
    assert.strictEqual(peekMetadataResolver(), first);
    offerMetadataResolver(CF, () => buildResolverFromTables([table(['Код', 'Нет'])]));
    assert.strictEqual(peekMetadataResolver(), first, 'an existing entry for the same path stays');
  });

  it('a changed metadata path drops the cached resolver', () => {
    setMetadataResolver(CF, buildResolverFromTables([table(['Код'])]));
    retainMetadataResolverFor(CF);
    assert.ok(peekMetadataResolver(), 'the same path keeps it');
    retainMetadataResolverFor(OTHER_CF);
    assert.strictEqual(peekMetadataResolver(), undefined);
  });
});
