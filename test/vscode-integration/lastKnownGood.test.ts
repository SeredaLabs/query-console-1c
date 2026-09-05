/**
 * Extension Host integration: last-known-good заменяет прежний legacy-фолбэк
 * `cfParser.ts` (см. git history, docs/ROADMAP.md). Реально ломает ОБА
 * современных пути разом — direct-снимок И его собственный YAML-откат — тем
 * же способом, что описан в исходном анализе: `outPath` (общий родитель
 * `snapshot/` и YAML-генерации, см. panel.ts) заменяется на обычный ФАЙЛ, так
 * что ни `commitMetadataSnapshot`, ни `parseConfiguration` не могут создать
 * под ним поддиректории — оба бросают исключение по-настоящему, а не просто
 * "тихо" возвращают пустую модель.
 *
 * Что это НЕ проверяет: содержимое модели, которую в итоге получил webview
 * (публичный `vscode` API не даёт тестовому коду доступ к payload сообщений
 * уже созданной панели, см. metadataPipeline.test.ts). Проверяется: команда
 * не падает необработанным исключением, панель всё равно открывается, и
 * заблокированный `outPath` остаётся файлом (значит, новый снимок поверх него
 * закоммитить НЕ удалось — путь к last-known-good ветке в panel.ts реально
 * пройден, а не просто "повезло" со случайным успехом).
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { FIXTURE_CF, waitUntil } from './testUtil';

describe('Extension Host: last-known-good при полном отказе direct-пути и YAML-отката', () => {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) throw new Error('тестовая рабочая область не открыта');

  const outDir = path.join(workspaceFolder.uri.fsPath, 'tmp', 'lkg-parser-data');
  const snapshotFile = path.join(outDir, 'snapshot', 'cf', 'metadata-snapshot.json');

  before(async () => {
    const config = vscode.workspace.getConfiguration('queryConsole');
    await config.update('metadataPath', FIXTURE_CF, vscode.ConfigurationTarget.Global);
    await config.update('parserOutputPath', 'tmp/lkg-parser-data', vscode.ConfigurationTarget.Global);
    await config.update('openInNewWindow', false, vscode.ConfigurationTarget.Global);
    fs.rmSync(outDir, { recursive: true, force: true });
  });

  after(async () => {
    const config = vscode.workspace.getConfiguration('queryConsole');
    await config.update('metadataPath', undefined, vscode.ConfigurationTarget.Global);
    await config.update('parserOutputPath', undefined, vscode.ConfigurationTarget.Global);
    await config.update('openInNewWindow', undefined, vscode.ConfigurationTarget.Global);
    fs.rmSync(outDir, { recursive: true, force: true });
  });

  async function openSampleQuery(): Promise<number> {
    const bslUri = vscode.Uri.joinPath(workspaceFolder!.uri, 'sample.bsl');
    const doc = await vscode.workspace.openTextDocument(bslUri);
    const editor = await vscode.window.showTextDocument(doc);
    const text = doc.getText();
    const offset = text.indexOf('Валюты.Код');
    const pos = doc.positionAt(offset);
    editor.selection = new vscode.Selection(pos, pos);

    const tabsBefore = vscode.window.tabGroups.all.flatMap(g => g.tabs).length;
    await vscode.commands.executeCommand('1c.queryConstructor');
    return tabsBefore;
  }

  it('первое открытие строит снимок нормально — наполняет last-known-good', async function () {
    this.timeout(20000);
    const tabsBefore = await openSampleQuery();
    const gotTab = await waitUntil(
      () => vscode.window.tabGroups.all.flatMap(g => g.tabs).length > tabsBefore,
      15000
    );
    assert.ok(gotTab, 'ожидалась новая вкладка при первом (здоровом) открытии');
    const gotSnapshot = await waitUntil(() => fs.existsSync(snapshotFile), 15000);
    assert.ok(gotSnapshot, 'первый снимок должен успешно закоммититься');
  });

  it('второе открытие с заблокированным outPath не падает и не может закоммитить новый снимок', async function () {
    this.timeout(20000);

    fs.rmSync(outDir, { recursive: true, force: true });
    fs.writeFileSync(outDir, 'заблокировано намеренно для теста last-known-good');

    const tabsBefore = await openSampleQuery();

    const gotTab = await waitUntil(
      () => vscode.window.tabGroups.all.flatMap(g => g.tabs).length > tabsBefore,
      15000
    );
    assert.ok(gotTab, 'панель всё равно должна открыться через last-known-good, а не упасть');

    // Дать время на попытку сборки/фолбэка — оба современных пути должны
    // провалиться (ENOTDIR при попытке создать поддиректории под файлом), но
    // не бросить необработанное исключение наружу (иначе metadataReady
    // навсегда завис бы в rejected-состоянии — см. panel.ts's createPanel).
    await new Promise(r => setTimeout(r, 2000));
    assert.ok(
      fs.statSync(outDir).isFile(),
      'outPath должен был остаться заблокированным файлом — значит, ни снимок, ни YAML не смогли закоммититься поверх него, и ветка сработала по-настоящему, а не случайно'
    );
  });
});
