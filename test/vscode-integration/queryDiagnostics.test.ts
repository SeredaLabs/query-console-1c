/**
 * Extension Host integration (діагностика зламаних запитів): перевіряє, що
 * реєстрація в `activate()` (`registerQueryDiagnostics`, `extension.ts`) реально
 * публікує `vscode.Diagnostic` через справжні події `vscode.workspace` — на
 * відміну від hover/completion, тут немає `vscode.executeXProvider`-команди:
 * діагностика публікується проактивно (`onDidOpenTextDocument`/
 * `onDidChangeTextDocument`), тож перевіряємо, що `vscode.languages.getDiagnostics`
 * реально відображає стан після реальної відкритої/зміненої вкладки, з реальною
 * активацією розширення (`ext.activate()`) — той самий урок Ctrl/Cmd+Click- і
 * hover-розслідувань, що й у queryHover.test.ts/queryCompletion.test.ts.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { waitUntil } from './testUtil';

const DIAGNOSTIC_SOURCE = 'queryConsole1c';

async function openLooseBsl(content: string): Promise<vscode.TextDocument> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diagnostics-bsl-'));
  const filePath = path.join(dir, 'diagnostics.bsl');
  fs.writeFileSync(filePath, content, 'utf8');
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
  await vscode.window.showTextDocument(doc);
  return doc;
}

function ourDiagnostics(uri: vscode.Uri): vscode.Diagnostic[] {
  return vscode.languages.getDiagnostics(uri).filter((d) => d.source === DIAGNOSTIC_SOURCE);
}

describe('Extension Host: діагностика запитів, які не розбирає конструктор', () => {
  before(async () => {
    const ext = vscode.extensions.getExtension('SeredaLabs.query-console-1c');
    await ext?.activate();
  });

  it('показує попередження на реально зламаному запиті після відкриття .bsl-файлу', async function () {
    this.timeout(20000);
    const content = 'Запрос.Текст = "ВЫБРАТЬ ИЗ Справочник.Тест КАК Т";\n'; // пустой список выборки
    const doc = await openLooseBsl(content);

    const found = await waitUntil(() => ourDiagnostics(doc.uri).length > 0, 5000);
    assert.ok(found, 'очікувалась хоча б одна діагностика від queryConsole1c');

    const diag = ourDiagnostics(doc.uri)[0];
    assert.strictEqual(diag.severity, vscode.DiagnosticSeverity.Warning);
    assert.ok(diag.message.length > 0);
    const range = diag.range;
    assert.strictEqual(doc.getText(range), 'ВЫБРАТЬ', `діапазон мав вказувати на ключове слово, отримано: "${doc.getText(range)}"`);
  });

  it('не показує нічого для коректного запиту', async function () {
    this.timeout(20000);
    const content = 'Запрос.Текст = "ВЫБРАТЬ Т.Активен ИЗ Справочник.Тест КАК Т";\n';
    const doc = await openLooseBsl(content);

    // Даём дебаунсу шанс сработать и убеждаемся, что диагностик так и не появилось.
    await new Promise((r) => setTimeout(r, 700));
    assert.strictEqual(ourDiagnostics(doc.uri).length, 0);
  });

  it('очищує діагностику, коли текст запиту виправлено', async function () {
    this.timeout(20000);
    const broken = 'Запрос.Текст = "ВЫБРАТЬ ИЗ Справочник.Тест КАК Т";\n';
    const doc = await openLooseBsl(broken);
    const foundBroken = await waitUntil(() => ourDiagnostics(doc.uri).length > 0, 5000);
    assert.ok(foundBroken, 'очікувалась діагностика на зламаному запиті перед виправленням');

    const editor = await vscode.window.showTextDocument(doc);
    const fixed = 'Запрос.Текст = "ВЫБРАТЬ Т.Активен ИЗ Справочник.Тест КАК Т";\n';
    await editor.edit((builder) => {
      builder.replace(new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length)), fixed);
    });

    const cleared = await waitUntil(() => ourDiagnostics(doc.uri).length === 0, 5000);
    assert.ok(cleared, 'діагностика мала зникнути після виправлення тексту запиту');
  });

  it('поважає налаштування queryConsole.queryDiagnosticsEnabled=false', async function () {
    this.timeout(20000);
    const config = vscode.workspace.getConfiguration('queryConsole');
    await config.update('queryDiagnosticsEnabled', false, vscode.ConfigurationTarget.Global);
    try {
      const content = 'Запрос.Текст = "ВЫБРАТЬ ИЗ Справочник.Тест КАК Т";\n';
      const doc = await openLooseBsl(content);
      await new Promise((r) => setTimeout(r, 700));
      assert.strictEqual(ourDiagnostics(doc.uri).length, 0, 'з вимкненим налаштуванням діагностик бути не повинно');
    } finally {
      await config.update('queryDiagnosticsEnabled', undefined, vscode.ConfigurationTarget.Global);
    }
  });
});
