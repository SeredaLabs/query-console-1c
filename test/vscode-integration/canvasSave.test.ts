import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { createCanvasPanel } from '../../src/extension/canvasPanel';
import { normalizeLocale } from '../../src/shared/locale';
import { t } from '../../src/webview-canvas/i18n';
import { FIXTURE_CF, REPO_ROOT, waitUntil } from './testUtil';

describe('Extension Host: Canvas load → edit → Save → source document', () => {
  for (const nested of [false, true]) it(`production Canvas ${nested ? 'nested source edit/back' : 'field alias edit'} replaces only the captured BSL literal through the real bridge`, async function () {
    this.timeout(25000);
    const config = vscode.workspace.getConfiguration('queryConsole');
    const previous = config.inspect<boolean>('openInNewWindow')?.globalValue;
    await config.update('openInNewWindow', false, vscode.ConfigurationTarget.Global);
    const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'qc-canvas-save-'));
    const channel = vscode.window.createOutputChannel('Canvas save integration');
    let panel: vscode.WebviewPanel | undefined;
    try {
      const query = nested
        ? 'ВЫБРАТЬ П.Код ИЗ (ВЫБРАТЬ В.Ссылка КАК Код, В.Ссылка КАК Дополнительное ИЗ Справочник.Тест КАК В) КАК П'
        : 'ВЫБРАТЬ В.Ссылка КАК Код ИЗ Справочник.Тест КАК В';
      const prefix = 'Процедура Тест()\nЗапрос.Текст = ';
      const suffix = ';\nХ = 1;\nКонецПроцедуры';
      const original = `${prefix}"${query}"${suffix}`;
      const doc = await vscode.workspace.openTextDocument({ language: 'plaintext', content: original });
      const editor = await vscode.window.showTextDocument(doc);
      const context = {
        extensionUri: vscode.Uri.file(REPO_ROOT),
        globalStorageUri: vscode.Uri.file(storage),
      } as vscode.ExtensionContext;
      panel = createCanvasPanel(context, FIXTURE_CF, channel, {
        document: doc, selection: editor.selection, documentVersion: doc.version,
        queryRange: { start: prefix.length, end: prefix.length + query.length + 2 },
        wrapAsBslString: true,
      }, query);
      let disposed = false;
      panel.onDidDispose(() => { disposed = true; });

      // Drive DOM controls inside the real VS Code webview. Keep its production
      // bundle, CSP and acquireVsCodeApi; never manufacture an insertText message.
      const html = panel.webview.html;
      const nonce = /<script nonce="([^"]+)"/.exec(html)![1];
      const locale = normalizeLocale(vscode.env.language);
      const labels = JSON.stringify({
        fields: t(locale, 'workspaceFields'), alias: t(locale, 'fieldsWorkspaceAliasPlaceholder'),
        save: t(locale, 'save'), nested,
      });
      panel.webview.html = html.replace('</body>', `<script nonce="${nonce}">
        const labels = ${labels};
        let step = 0;
        const timer = setInterval(() => {
          if (document.querySelector('[data-testid="canvas-loading-overlay"]')) return;
          const nestedEditor = document.querySelector('[data-testid="canvas-source-query-editor"]');
          const scope = nestedEditor || document;
          const buttons = [...scope.querySelectorAll('button')];
          if (labels.nested && step === 0 && !nestedEditor) {
            const card = document.querySelector('[data-source-alias="П"]');
            const enter = document.querySelector('[data-testid="canvas-edit-source"]');
            if (enter) enter.click(); else if (card) card.click();
            return;
          }
          if (step === 0) {
            const fields = buttons.find(b => b.textContent.trim() === labels.fields);
            if (fields) { fields.click(); step = 1; }
          } else if (step === 1) {
            const alias = [...scope.querySelectorAll('input')].find(i => i.placeholder === labels.alias);
            if (!alias || alias.value !== 'Код') return;
            const target = labels.nested ? [...scope.querySelectorAll('input')].find(i => i.placeholder === labels.alias && i.value === 'Дополнительное') : alias;
            if (!target) return;
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(target, 'КодИзCanvas');
            target.dispatchEvent(new Event('input', { bubbles: true }));
            step = 2;
          } else if (labels.nested && nestedEditor) {
            const back = nestedEditor.querySelector('[data-testid="canvas-source-back"]');
            if (back && !back.disabled) back.click();
          } else {
            const save = buttons.find(b => b.textContent.trim() === labels.save);
            if (save && !save.disabled) { clearInterval(timer); save.click(); }
          }
        }, 50);
      </script></body>`);

      assert.ok(await waitUntil(() => disposed, 15000), 'Canvas did not complete Save through the host bridge');
      const result = doc.getText();
      assert.notStrictEqual(result, original);
      assert.ok(result.startsWith(`${prefix}"`), result);
      assert.ok(result.endsWith(`"${suffix}`), result);
      assert.ok(result.includes('В.Ссылка КАК КодИзCanvas'), result);
      assert.ok(result.includes('Справочник.Тест КАК В'), result);
    } finally {
      panel?.dispose();
      channel.dispose();
      await config.update('openInNewWindow', previous, vscode.ConfigurationTarget.Global);
      fs.rmSync(storage, { recursive: true, force: true });
    }
  });
});
