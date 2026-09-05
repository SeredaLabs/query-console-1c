/**
 * Extension Host integration: «1C: Rebuild metadata index» (`1c.parseMetadata`)
 * теперь использует тот же dual-path (`loadMetadataWithFallback`), что и
 * кнопка «Обновить кэш» внутри конструктора — раньше эта команда вызывала
 * ТОЛЬКО legacy YAML-путь напрямую (см. parseCommand.ts, git history).
 * Проверяет, что команда реально коммитит JSON-снимок из настоящего XML
 * (не мок) и не бросает исключение, работая без активного текстового
 * редактора (в отличие от «1c.queryConstructor», ей редактор не нужен).
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { FIXTURE_CF, waitUntil } from './testUtil';

describe('Extension Host: «1C: Rebuild metadata index» использует dual-path', () => {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) throw new Error('тестовая рабочая область не открыта');

  const outDir = path.join(workspaceFolder.uri.fsPath, 'tmp', 'parse-command-parser-data');
  const snapshotFile = path.join(outDir, 'snapshot', 'cf', 'metadata-snapshot.json');

  before(async () => {
    const config = vscode.workspace.getConfiguration('queryConsole');
    await config.update('metadataPath', FIXTURE_CF, vscode.ConfigurationTarget.Global);
    await config.update('parserOutputPath', 'tmp/parse-command-parser-data', vscode.ConfigurationTarget.Global);
    fs.rmSync(outDir, { recursive: true, force: true });
  });

  after(async () => {
    const config = vscode.workspace.getConfiguration('queryConsole');
    await config.update('metadataPath', undefined, vscode.ConfigurationTarget.Global);
    await config.update('parserOutputPath', undefined, vscode.ConfigurationTarget.Global);
    fs.rmSync(outDir, { recursive: true, force: true });
  });

  it('коммитит реальный JSON-снимок метаданных и не бросает исключение без активного редактора', async function () {
    this.timeout(20000);

    await assert.doesNotReject(() => Promise.resolve(vscode.commands.executeCommand('1c.parseMetadata')));

    const gotSnapshot = await waitUntil(() => fs.existsSync(snapshotFile), 15000);
    assert.ok(gotSnapshot, `ожидался закоммиченный снимок метаданных: ${snapshotFile}`);

    const snapshot = JSON.parse(fs.readFileSync(snapshotFile, 'utf8')) as { model: { tables: unknown[] } };
    assert.ok(snapshot.model.tables.length > 0, 'снимок должен содержать таблицы из реального fixture XML');
  });
});
