import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { createPanel } from '../../src/extension/panel';
import { normalizeLocale } from '../../src/shared/locale';
import { t } from '../../src/webview-canvas/i18n';
import { FIXTURE_CF, REPO_ROOT, waitUntil } from './testUtil';

/** Append a driver script to the panel's current production HTML (same nonce/CSP). */
function inject(panel: vscode.WebviewPanel, script: string): void {
  const html = panel.webview.html;
  const nonce = /<script nonce="([^"]+)"/.exec(html)![1];
  panel.webview.html = html.replace('</body>', `<script nonce="${nonce}">${script}</script></body>`);
}

describe('Extension Host: Classic → Canvas toggle in one designer panel', () => {
  it('reloads the same panel with Canvas and the current query; Save writes the original literal', async function () {
    this.timeout(30000);
    const config = vscode.workspace.getConfiguration('queryConsole');
    const previousWindow = config.inspect<boolean>('openInNewWindow')?.globalValue;
    const previousPreview = config.inspect<boolean>('enableNewBuilderPreview')?.globalValue;
    await config.update('openInNewWindow', false, vscode.ConfigurationTarget.Global);
    await config.update('enableNewBuilderPreview', true, vscode.ConfigurationTarget.Global);
    const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'qc-designer-switch-'));
    const channel = vscode.window.createOutputChannel('Designer switch integration');
    let panel: vscode.WebviewPanel | undefined;
    try {
      const query = 'ВЫБРАТЬ В.Ссылка КАК Код ИЗ Справочник.Тест КАК В';
      const prefix = 'Процедура Тест()\nЗапрос.Текст = ';
      const suffix = ';\nХ = 1;\nКонецПроцедуры';
      const original = `${prefix}"${query}"${suffix}`;
      const doc = await vscode.workspace.openTextDocument({ language: 'plaintext', content: original });
      const editor = await vscode.window.showTextDocument(doc);
      const context = {
        extensionUri: vscode.Uri.file(REPO_ROOT),
        globalStorageUri: vscode.Uri.file(storage),
        extensionMode: vscode.ExtensionMode.Test,
      } as vscode.ExtensionContext;
      panel = createPanel(context, FIXTURE_CF, channel, {
        document: doc, selection: editor.selection, documentVersion: doc.version,
        queryRange: { start: prefix.length, end: prefix.length + query.length + 2 },
        wrapAsBslString: true,
      }, query);
      const classicTitle = panel.title;
      let disposed = false;
      panel.onDidDispose(() => { disposed = true; });

      // Classic: once the query is loaded, click the Canvas segment of the toggle.
      inject(panel, `
        const timer = setInterval(() => {
          if (document.querySelector('[data-testid="loading-overlay"]')) return;
          const canvas = document.querySelector('[data-testid="designer-mode-canvas"]');
          const ok = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'ОК' || b.textContent.trim() === 'OK');
          if (!canvas || !ok || ok.disabled) return;
          clearInterval(timer);
          canvas.click();
        }, 50);`);
      const switched = await waitUntil(() => panel!.webview.html.includes('canvasApp.js'), 15000);
      assert.ok(switched, 'the panel was not reloaded with the Canvas bundle');
      assert.notStrictEqual(panel.title, classicTitle);
      assert.strictEqual(disposed, false, 'switching must keep the same panel');
      assert.strictEqual(doc.getText(), original, 'switching must not write the document');

      // Canvas in the same panel: the switched query is loaded; edit an alias and Save.
      const locale = normalizeLocale(vscode.env.language);
      const labels = JSON.stringify({ fields: t(locale, 'workspaceFields'), alias: t(locale, 'fieldsWorkspaceAliasPlaceholder'), save: t(locale, 'save') });
      inject(panel, `
        const labels = ${labels};
        let step = 0;
        const timer = setInterval(() => {
          if (document.querySelector('[data-testid="canvas-loading-overlay"]')) return;
          const buttons = [...document.querySelectorAll('button')];
          if (step === 0) {
            const fields = buttons.find(b => b.textContent.trim() === labels.fields);
            if (fields) { fields.click(); step = 1; }
          } else if (step === 1) {
            const alias = [...document.querySelectorAll('input')].find(i => i.placeholder === labels.alias);
            if (!alias || alias.value !== 'Код') return;
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(alias, 'КодПослеПереключения');
            alias.dispatchEvent(new Event('input', { bubbles: true }));
            step = 2;
          } else {
            const save = buttons.find(b => b.textContent.trim() === labels.save);
            if (save && !save.disabled) { clearInterval(timer); save.click(); }
          }
        }, 50);`);
      assert.ok(await waitUntil(() => disposed, 15000), 'Canvas did not complete Save after switching');
      const result = doc.getText();
      assert.ok(result.startsWith(`${prefix}"`), result);
      assert.ok(result.endsWith(`"${suffix}`), result);
      assert.ok(result.includes('В.Ссылка КАК КодПослеПереключения'), result);
      assert.ok(result.includes('Справочник.Тест КАК В'), result);
    } finally {
      panel?.dispose();
      channel.dispose();
      await config.update('openInNewWindow', previousWindow, vscode.ConfigurationTarget.Global);
      await config.update('enableNewBuilderPreview', previousPreview, vscode.ConfigurationTarget.Global);
      fs.rmSync(storage, { recursive: true, force: true });
    }
  });
});
