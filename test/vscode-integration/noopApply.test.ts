/**
 * C32 Safe Apply / No-op Apply in a real Extension Host: OK / Save without a change
 * closes the Designer without writing the document — no re-encoded literal (the
 * original keeps its own `|` indentation), no clipboard fallback, also when the
 * document changed meanwhile; a change made before a Classic → Canvas switch is
 * still written. Webview side: test/e2e/noopApply.c32.spec.ts.
 */
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

/**
 * Classic: run `action` (has `ok` = the OK button) at the first DOM update that shows
 * the loaded query with OK enabled — from a MutationObserver, i.e. as early as any
 * click could happen, before React's passive effects.
 */
const classicReady = (action: string): string => `
  let done = false;
  const tryRun = () => {
    if (done || document.querySelector('[data-testid="loading-overlay"]')) return;
    const ok = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'ОК' || b.textContent.trim() === 'OK');
    if (!ok || ok.disabled) return;
    done = true;
    observer.disconnect();
    ${action}
  };
  const observer = new MutationObserver(tryRun);
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
  tryRun();`;

const CLICK_OK = 'ok.click();';
const SWITCH_TO_CANVAS = 'document.querySelector(\'[data-testid="designer-mode-canvas"]\').click();';

/** A literal laid out by hand, not as the generator prints it. */
const PREFIX = 'Процедура Тест()\n\tЗапрос = Новый Запрос;\n\tЗапрос.Текст =\n\t\t';
const LITERAL = '"ВЫБРАТЬ В.Ссылка КАК Код\n\t\t|   ИЗ Справочник.Тест КАК В // справочник\n\t\t|ГДЕ В.Ссылка = &Ссылка"';
const QUERY = 'ВЫБРАТЬ В.Ссылка КАК Код\n   ИЗ Справочник.Тест КАК В // справочник\nГДЕ В.Ссылка = &Ссылка';
const SUFFIX = ';\n\tХ = 1;\nКонецПроцедуры\n';
const SENTINEL = 'C32 clipboard sentinel';

describe('Extension Host: C32 an unchanged Apply does not write', () => {
  let storage: string;
  let channel: vscode.OutputChannel;
  let panel: vscode.WebviewPanel | undefined;
  const config = () => vscode.workspace.getConfiguration('queryConsole');
  let previousWindow: boolean | undefined;
  let previousPreview: boolean | undefined;

  beforeEach(async () => {
    previousWindow = config().inspect<boolean>('openInNewWindow')?.globalValue;
    previousPreview = config().inspect<boolean>('enableNewBuilderPreview')?.globalValue;
    await config().update('openInNewWindow', false, vscode.ConfigurationTarget.Global);
    await config().update('enableNewBuilderPreview', true, vscode.ConfigurationTarget.Global);
    storage = fs.mkdtempSync(path.join(os.tmpdir(), 'qc-noop-apply-'));
    channel = vscode.window.createOutputChannel('C32 integration');
    await vscode.env.clipboard.writeText(SENTINEL);
  });

  afterEach(async () => {
    panel?.dispose();
    panel = undefined;
    channel.dispose();
    await config().update('openInNewWindow', previousWindow, vscode.ConfigurationTarget.Global);
    await config().update('enableNewBuilderPreview', previousPreview, vscode.ConfigurationTarget.Global);
    fs.rmSync(storage, { recursive: true, force: true });
  });

  async function openClassic(literal = LITERAL, query = QUERY) {
    const original = `${PREFIX}${literal}${SUFFIX}`;
    const doc = await vscode.workspace.openTextDocument({ language: 'plaintext', content: original });
    const editor = await vscode.window.showTextDocument(doc);
    const context = {
      extensionUri: vscode.Uri.file(REPO_ROOT),
      globalStorageUri: vscode.Uri.file(storage),
      extensionMode: vscode.ExtensionMode.Test,
    } as vscode.ExtensionContext;
    panel = createPanel(context, FIXTURE_CF, channel, {
      document: doc, selection: editor.selection, documentVersion: doc.version,
      queryRange: { start: PREFIX.length, end: PREFIX.length + literal.length },
      wrapAsBslString: true,
    }, query);
    let disposed = false;
    panel.onDidDispose(() => { disposed = true; });
    const messages: Array<{ type: string; text?: string; loadId?: number }> = [];
    panel.webview.onDidReceiveMessage(m => messages.push(m));
    return { doc, editor, original, messages, isDisposed: () => disposed };
  }

  async function switchToCanvas(p: vscode.WebviewPanel, doc: vscode.TextDocument, original: string): Promise<void> {
    inject(p, classicReady(SWITCH_TO_CANVAS));
    assert.ok(await waitUntil(() => p.webview.html.includes('canvasApp.js'), 15000), 'the panel was not reloaded with Canvas');
    assert.strictEqual(doc.getText(), original, 'switching must not write the document');
  }

  function canvasSave(p: vscode.WebviewPanel): void {
    const save = JSON.stringify(t(normalizeLocale(vscode.env.language), 'save'));
    inject(p, `
      const timer = setInterval(() => {
        if (document.querySelector('[data-testid="canvas-loading-overlay"]')) return;
        const save = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${save});
        if (save && !save.disabled) { clearInterval(timer); save.click(); }
      }, 50);`);
  }

  it('Classic OK without a change: the document and the clipboard stay as they were', async function () {
    this.timeout(30000);
    const { doc, original, isDisposed } = await openClassic();
    inject(panel!, classicReady(CLICK_OK));
    assert.ok(await waitUntil(isDisposed, 15000), 'OK did not close the Designer');
    assert.strictEqual(doc.getText(), original);
    assert.strictEqual(await vscode.env.clipboard.readText(), SENTINEL);
  });

  it('a batch with UNION: OK without a change does not write', async function () {
    this.timeout(30000);
    const literal = '"ВЫБРАТЬ В.Ссылка КАК Код ПОМЕСТИТЬ ВТ ИЗ Справочник.Тест КАК В;\n\t\t|ВЫБРАТЬ ВТ.Код ИЗ ВТ КАК ВТ ОБЪЕДИНИТЬ ВСЕ ВЫБРАТЬ В.Ссылка ИЗ Справочник.Тест КАК В"';
    const query = 'ВЫБРАТЬ В.Ссылка КАК Код ПОМЕСТИТЬ ВТ ИЗ Справочник.Тест КАК В;\nВЫБРАТЬ ВТ.Код ИЗ ВТ КАК ВТ ОБЪЕДИНИТЬ ВСЕ ВЫБРАТЬ В.Ссылка ИЗ Справочник.Тест КАК В';
    const { doc, original, isDisposed } = await openClassic(literal, query);
    inject(panel!, classicReady(CLICK_OK));
    assert.ok(await waitUntil(isDisposed, 15000), 'OK did not close the Designer');
    assert.strictEqual(doc.getText(), original);
  });

  it('the document changed meanwhile: an unchanged OK neither writes nor copies', async function () {
    this.timeout(30000);
    const { doc, editor, isDisposed } = await openClassic();
    await editor.edit(b => b.insert(new vscode.Position(0, 0), '// правка пользователя\n'));
    const edited = doc.getText();
    inject(panel!, classicReady(CLICK_OK));
    assert.ok(await waitUntil(isDisposed, 15000), 'OK did not close the Designer');
    assert.strictEqual(doc.getText(), edited);
    assert.strictEqual(await vscode.env.clipboard.readText(), SENTINEL);
  });

  it('Classic → Canvas, Save without a change: the document stays as it was', async function () {
    this.timeout(40000);
    const { doc, original, isDisposed } = await openClassic();
    await switchToCanvas(panel!, doc, original);
    canvasSave(panel!);
    assert.ok(await waitUntil(isDisposed, 15000), 'Save did not close the Designer');
    assert.strictEqual(doc.getText(), original);
    assert.strictEqual(await vscode.env.clipboard.readText(), SENTINEL);
  });

  it('an edit made in Classic before the switch is written by an otherwise unchanged Canvas Save', async function () {
    this.timeout(40000);
    const { doc, original, messages, isDisposed } = await openClassic();
    // Classic: tick "distinct" on the additional tab (a model edit), then switch.
    const distinct = JSON.stringify(['ru', 'en', 'uk'].map(l =>
      JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'src/webview/i18n', `${l}.json`), 'utf8'))['additional.distinct']));
    inject(panel!, classicReady(`
      document.querySelector('[data-tab="Дополнительно"]').click();
      const labels = ${distinct};
      const edit = setInterval(() => {
        const label = [...document.querySelectorAll('label')].find(l => labels.includes(l.textContent.trim()));
        const box = label && label.querySelector('input[type="checkbox"]');
        if (!box) return;
        clearInterval(edit);
        box.click();
        setTimeout(() => { ${SWITCH_TO_CANVAS} }, 200);
      }, 50);`));
    assert.ok(await waitUntil(() => panel!.webview.html.includes('canvasApp.js'), 15000), 'the panel was not reloaded with Canvas');
    assert.strictEqual(doc.getText(), original, 'switching must not write the document');
    canvasSave(panel!);
    assert.ok(await waitUntil(isDisposed, 15000), 'Save did not close the Designer');
    const switched = messages.find(m => m.type === 'switchDesigner');
    assert.ok(switched?.text?.includes('РАЗЛИЧНЫЕ'), `the Classic edit did not reach the switch: ${JSON.stringify(messages)}`);
    const result = doc.getText();
    assert.ok(result.includes('ВЫБРАТЬ РАЗЛИЧНЫЕ'), result);
    assert.ok(result.startsWith(PREFIX) && result.endsWith(SUFFIX), result);
  });
});
