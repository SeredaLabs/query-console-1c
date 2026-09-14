/**
 * Extension Host integration (ТЗ п.4 "закрыть integration gap", ROADMAP.md).
 *
 * В отличие от test/e2e/webview.spec.ts (Playwright, статический HTML-харнесс с
 * мок `acquireVsCodeApi`), здесь расширение реально активируется настоящим
 * VS Code (`@vscode/test-cli`/`@vscode/test-electron`) — команды регистрируются
 * и выполняются через настоящий `vscode` API, не через мок.
 */
import * as assert from 'assert';
import * as vscode from 'vscode';
import { waitUntil } from './testUtil';

const COMMAND_IDS = ['1c.queryConstructor', '1c.queryConstructorWithResult', '1c.parseMetadata', '1c.queryConstructorCanvas'];

describe('Extension Host: активация и регистрация команд', () => {
  it('расширение находится и активируется', async () => {
    const ext = vscode.extensions.getExtension('SeredaLabs.query-console-1c');
    assert.ok(ext, 'расширение SeredaLabs.query-console-1c не найдено среди установленных — проверьте publisher/name в package.json');
    await ext!.activate();
    assert.strictEqual(ext!.isActive, true);
  });

  it('все команды из package.json реально зарегистрированы после активации', async () => {
    const commands = await vscode.commands.getCommands(true);
    for (const id of COMMAND_IDS) {
      assert.ok(commands.includes(id), `команда "${id}" не зарегистрирована`);
    }
  });

  it('«1c.queryConstructor» без активного текстового редактора не бросает исключение (показывает предупреждение и завершается)', async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await assert.doesNotReject(
      () => Promise.resolve(vscode.commands.executeCommand('1c.queryConstructor')),
      'команда не должна падать, когда нет активного редактора — только предупреждение (см. extension.ts)'
    );
  });

  it('«1c.queryConstructorCanvas» (Phase 1 shell) открывает панель без активного редактора и без исключений', async function () {
    this.timeout(15000);
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    const tabsBefore = vscode.window.tabGroups.all.flatMap(g => g.tabs).length;
    await assert.doesNotReject(
      () => Promise.resolve(vscode.commands.executeCommand('1c.queryConstructorCanvas')),
      'Phase 1 shell не требует активного редактора и не должен падать (см. canvasPanel.ts)'
    );
    const gotNewTab = await waitUntil(
      () => vscode.window.tabGroups.all.flatMap(g => g.tabs).length > tabsBefore,
      10000
    );
    assert.ok(gotNewTab, 'команда должна была открыть новую панель/вкладку New Builder');
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });
});
