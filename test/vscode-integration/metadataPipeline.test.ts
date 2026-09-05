/**
 * Extension Host integration (ТЗ п.4 "закрыть integration gap", ROADMAP.md):
 * выполнение «1c.queryConstructor» на реальном .bsl-документе через настоящий
 * vscode API, до самого конца — включая реальный XML-парсинг metadata
 * (`test/fixtures/cf`) и реальный commit JSON-снимка на диск
 * (`src/core/metadata/parser/snapshotBuilder.ts`).
 *
 * Что это НЕ проверяет: содержимое сообщений host↔webview (`ready`/`metadataTree`)
 * — реальный `vscode` API не даёт тестовому коду доступ к уже созданной
 * `WebviewPanel` другого вызова команды, а `OutputChannel` не имеет публичного
 * API для чтения уже записанного текста. Появление новой вкладки доказывает,
 * что панель (и её webview) была создана; сам payload host↔webview остаётся
 * покрыт только мок-харнессом test/e2e/webview.spec.ts (см. ROADMAP.md).
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { FIXTURE_CF, waitUntil } from './testUtil';

describe('Extension Host: конструктор + реальная сборка metadata из XML', () => {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) throw new Error('тестовая рабочая область не открыта (см. .vscode-test.mjs)');

  const outDir = path.join(workspaceFolder.uri.fsPath, 'tmp', 'parser_data');
  const snapshotFile = path.join(outDir, 'snapshot', 'cf', 'metadata-snapshot.json');

  before(async () => {
    const config = vscode.workspace.getConfiguration('queryConsole');
    await config.update('metadataPath', FIXTURE_CF, vscode.ConfigurationTarget.Global);
    // Не открывать реальное отдельное окно ОС при каждом запуске команды —
    // не имеет отношения к тому, что здесь проверяется, и создаёт лишнюю
    // нестабильность в headless CI (см. extension/panel.ts).
    await config.update('openInNewWindow', false, vscode.ConfigurationTarget.Global);
    // гарантируем ХОЛОДНУЮ сборку — не тёплое чтение снимка от предыдущего запуска
    fs.rmSync(outDir, { recursive: true, force: true });
  });

  after(async () => {
    const config = vscode.workspace.getConfiguration('queryConsole');
    await config.update('metadataPath', undefined, vscode.ConfigurationTarget.Global);
    await config.update('openInNewWindow', undefined, vscode.ConfigurationTarget.Global);
  });

  it('открывает панель конструктора на литерале запроса и коммитит реальный JSON-снимок metadata', async function () {
    this.timeout(25000);

    const bslUri = vscode.Uri.joinPath(workspaceFolder.uri, 'sample.bsl');
    const doc = await vscode.workspace.openTextDocument(bslUri);
    const editor = await vscode.window.showTextDocument(doc);

    const text = doc.getText();
    const offset = text.indexOf('Валюты.Код');
    assert.ok(offset >= 0, 'sample.bsl должен содержать фикстуру запроса (см. queryConstructorPlan.test.ts)');
    const pos = doc.positionAt(offset);
    editor.selection = new vscode.Selection(pos, pos);

    const tabsBefore = vscode.window.tabGroups.all.flatMap(g => g.tabs).length;
    await vscode.commands.executeCommand('1c.queryConstructor');

    const gotNewTab = await waitUntil(
      () => vscode.window.tabGroups.all.flatMap(g => g.tabs).length > tabsBefore,
      15000
    );
    assert.ok(gotNewTab, 'ожидалась новая вкладка — панель конструктора не была создана');

    const gotSnapshot = await waitUntil(() => fs.existsSync(snapshotFile), 15000);
    assert.ok(gotSnapshot, `ожидался закоммиченный снимок metadata: ${snapshotFile}`);

    const snapshot = JSON.parse(fs.readFileSync(snapshotFile, 'utf8')) as { model: { tables: unknown[] } };
    assert.ok(snapshot.model.tables.length > 0, 'снимок должен содержать таблицы из реального fixture XML, а не пустую модель');
  });
});
