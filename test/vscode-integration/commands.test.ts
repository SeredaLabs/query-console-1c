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

const COMMAND_IDS = ['1c.queryConstructor', '1c.queryConstructorWithResult', '1c.parseMetadata'];

describe('Extension Host: активация и регистрация команд', () => {
  it('расширение находится и активируется', async () => {
    const ext = vscode.extensions.getExtension('SeredaLabs.query-console-1c');
    assert.ok(ext, 'расширение SeredaLabs.query-console-1c не найдено среди установленных — проверьте publisher/name в package.json');
    await ext!.activate();
    assert.strictEqual(ext!.isActive, true);
  });

  it('все три команды из package.json реально зарегистрированы после активации', async () => {
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
});
