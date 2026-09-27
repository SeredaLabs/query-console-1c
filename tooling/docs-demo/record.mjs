#!/usr/bin/env node
// Record the built Classic WebView, using the existing E2E host/metadata fixture.
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, mkdtemp, copyFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const checkOnly = process.argv.includes('--check');
const localeArg = process.argv.find(arg => arg.startsWith('--locale='))?.slice(9);
const locales = localeArg ? [localeArg] : ['en', 'uk', 'ru'];
assert(locales.every(locale => ['en', 'uk', 'ru'].includes(locale)), 'Use --locale=en, uk or ru');
const python = process.env.PYTHON || 'python3';
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} failed: ${result.error?.message || result.stderr || result.stdout}`);
  }
}
if (!checkOnly) run(python, ['-c', 'from PIL import Image']);

const captions = JSON.parse(await readFile(new URL('./captions.json', import.meta.url), 'utf8'));
const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const assets = new Map(await Promise.all([
  ['/harness', 'test/e2e/harness/index.html', 'text/html'],
  ['/main.js', 'out/webview/main.js', 'text/javascript'],
  ['/codicon.css', 'out/webview/codicon.css', 'text/css'],
  ['/codicon.ttf', 'out/webview/codicon.ttf', 'font/ttf'],
].map(async ([url, file, type]) => [url, { body: await readFile(path.join(root, file)), type }])));

function shell(locale) {
  const text = captions[locale];
  return `<!doctype html><html lang="${locale}"><meta charset="utf-8">
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #181818; color: #eee; font-family: Arial, sans-serif; }
      header { height: 116px; padding: 13px 24px; border-bottom: 2px solid #397fd8; }
      .meta { display: flex; justify-content: space-between; color: #9ecbff; font-size: 12px; }
      h1 { margin: 9px 0 6px; font-size: 23px; line-height: 28px; }
      p { margin: 0; font-size: 16px; line-height: 22px; color: #d1d5db; }
      iframe { display: block; border: 0; width: 100vw; height: calc(100vh - 116px); }
    </style>
    <header><div class="meta"><span id="label">${text.label} · v${version}</span><span id="fixture">${text.fixture}</span></div>
    <h1>1/${text.scenes.length}  ${text.scenes[0][0]}</h1><p>${text.scenes[0][1]}</p></header>
    <iframe title="Query Designer" src="/harness?locale=${locale}"></iframe></html>`;
}

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/') {
    const locale = url.searchParams.get('locale');
    if (!locales.includes(locale)) { res.writeHead(400).end(); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(shell(locale));
    return;
  }
  const asset = assets.get(url.pathname);
  if (!asset) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': asset.type }).end(asset.body);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
await mkdir(path.join(root, 'output/docs-demo'), { recursive: true });
const staging = await mkdtemp(path.join(root, 'output/docs-demo/run-'));
let browser;
const outputs = [];
try {
  browser = await chromium.launch();
  for (const locale of locales) {
    console.log(`Checking${checkOnly ? '' : ' and recording'} ${locale}…`);
    const dir = path.join(staging, locale);
    await mkdir(dir);
    const viewport = { width: 1200, height: 800 };
    const context = await browser.newContext({
      viewport, deviceScaleFactor: 1, locale,
      ...(checkOnly ? {} : { recordVideo: { dir, size: viewport } }),
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}/?locale=${locale}`);
    const app = page.frameLocator('iframe');
    const ui = JSON.parse(await readFile(path.join(root, `src/webview/i18n/${locale}.json`), 'utf8'));
    const button = key => app.getByRole('button', { name: ui[key], exact: true });
    const toolbar = key => app.getByTitle(ui[key], { exact: true });
    const tab = key => app.getByRole('tab', { name: ui[key], exact: true });
    const editor = app.getByTestId('query-text-editor').locator('.cm-content');
    const queryText = async () => (await editor.locator('.cm-line').allTextContents()).join('\n');
    await expect(app.getByText(ui['tree.catalogs'], { exact: true })).toBeVisible();
    await expect(app.getByTestId('loading-overlay')).toBeHidden();
    // Match the host message when queryConsole.queryTextEditorV2 is enabled.
    // Keep the shared E2E fixture's default unchanged for legacy-editor tests.
    await app.locator('body').evaluate((_, locale) => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'init', hasInitialQuery: false, queryTextEditorV2: true, locale },
      }));
    }, locale);
    await app.locator('body').evaluate(body => {
      // VS Code normally supplies the font. Keep the standalone fixture readable.
      body.style.fontFamily = 'Arial, sans-serif';
      body.style.setProperty('--vscode-font-family', 'Arial, sans-serif');
      body.style.setProperty('--vscode-editor-font-family', 'Menlo, Consolas, monospace');
    });
    const frames = [];
    async function caption(index) {
      await page.evaluate(({ text, index, version }) => {
        document.querySelector('#label').textContent = `${text.label} · v${version}`;
        document.querySelector('#fixture').textContent = text.fixture;
        document.querySelector('h1').textContent = `${index + 1}/${text.scenes.length}  ${text.scenes[index][0]}`;
        document.querySelector('p').textContent = text.scenes[index][1];
      }, { text: captions[locale], index, version });
    }
    async function hold(duration = 3000) {
      assert(await page.locator('header').evaluate(header => {
        const bounds = header.getBoundingClientRect();
        return [...header.querySelectorAll('span, h1, p')].every(element => {
          const rect = element.getBoundingClientRect();
          return rect.right <= bounds.right && rect.bottom <= bounds.bottom && element.scrollWidth <= element.clientWidth;
        });
      }), `Caption overflow in ${locale}`);
      if (checkOnly) return;
      // These pauses set the reading pace; assertions, not delays, establish readiness.
      await page.waitForTimeout(150);
      const file = `${String(frames.length).padStart(2, '0')}.png`;
      await page.screenshot({ path: path.join(dir, file) });
      frames.push({ file, duration });
      await page.waitForTimeout(duration);
    }

    await caption(0);
    await hold();
    await caption(1);
    const search = app.getByPlaceholder(ui['tree.searchPlaceholder']);
    await search.fill('Валюты Наим');
    const field = app.locator('[data-field-path="Наименование"]');
    await expect(field).toBeVisible();
    await expect(app.locator('[data-table-fullname]')).toHaveCount(1);
    await hold();

    await caption(2);
    await field.dragTo(app.locator('.qc-list[style*="min-height: 40px"]').nth(1));
    const table = app.locator('[data-table-alias="Валюты"]');
    await expect(table).toBeVisible();
    await expect(app.locator('[data-field-idx]')).toHaveCount(1);
    await hold();

    await caption(3);
    await search.fill('');
    await table.dblclick();
    await expect(app.locator('[data-field-idx]')).toHaveCount(5);
    await hold();

    await caption(4);
    await button('fields.addExpression').click();
    const expression = app.getByTestId('expr-editor').locator('.cm-content');
    const expressionText = async () => (await expression.locator('.cm-line').allTextContents()).join('\n');
    await expect(app.getByTestId('expr-dialog')).toBeVisible();
    await app.getByTestId('expr-fields-search').fill('Наим');
    await app.locator('[data-row-key="s:Валюты/Наименование"]').dblclick();
    await expect.poll(expressionText).toBe('Валюты.Наименование');
    await expect(app.getByTestId('expr-status-state')).toContainText(ui['exprEditor.valid']);
    await expect(app.getByTestId('expr-result-type')).toContainText('Строка');
    await hold(4000);

    await caption(5);
    await expression.press('ControlOrMeta+a');
    await app.getByTestId('expr-functions-search').fill('ЕСТЬNULL');
    await app.locator('[data-row-key="c:conditional/ЕСТЬNULL"]').dblclick();
    await expect.poll(expressionText).toBe('ЕСТЬNULL(Выражение, ЗначениеЗамены)');
    await expect(app.getByTestId('expr-function-doc')).toContainText('ЕСТЬNULL(<Выражение>, <ЗначениеЗамены>)');
    await hold(4000);

    await caption(6);
    await page.keyboard.type('Валюты.', { delay: 70 });
    const completion = app.locator('.cm-tooltip-autocomplete');
    await expect(completion).toBeVisible();
    await expect(completion).toContainText('Наименование');
    await hold(4000);
    await completion.getByRole('option').filter({ hasText: 'Наименование' }).click();
    await expression.press('Tab');
    await page.keyboard.type('"-"');
    const customExpression = 'ЕСТЬNULL(Валюты.Наименование, "-")';
    await expect.poll(expressionText).toBe(customExpression);

    await caption(7);
    await expression.fill('ЕСТЬNULL(');
    await expect(app.getByTestId('expr-status-state')).toContainText(ui['exprEditor.syntaxError']);
    await expect(app.getByTestId('expr-format')).toBeDisabled();
    // Diagnostics are advisory in this dialog; do not imply that OK is disabled.
    await expect(app.getByTestId('expr-ok')).toBeEnabled();
    await hold(4000);

    await caption(8);
    await expression.fill(customExpression);
    await expect(app.getByTestId('expr-status-state')).toContainText(ui['exprEditor.valid']);
    await expect(app.getByTestId('expr-format')).toBeEnabled();
    await hold(4000);
    await app.getByTestId('expr-ok').click();
    await expect(app.getByTestId('expr-dialog')).toBeHidden();
    await expect(app.locator('[data-field-idx]')).toHaveCount(6);
    await expect(app.locator('[data-field-idx="5"]')).toContainText(customExpression);

    await caption(9);
    await button('common.query').click();
    await expect(editor).toContainText('Справочник.Валюты');
    // Fail recording if it ever falls back to the simple query-text dialog.
    await expect(app.getByTestId('query-text-status')).toContainText(ui['status.valid']);
    await toolbar('dialog.queryText.structure').click();
    await expect(app.getByTestId('query-text-structure-panel')).toContainText(customExpression);
    const generated = await queryText();
    assert(generated.includes('ВЫБРАТЬ'));
    assert(generated.includes('Наименование КАК Наименование1'));
    assert(generated.includes(customExpression));
    await hold();

    await caption(10);
    await toolbar('dialog.queryText.structure').click();
    const edited = `${generated}\nГДЕ Валюты.Код = &Код УПОРЯДОЧИТЬ ПО Валюты.Наименование УБЫВ`;
    await editor.fill(edited);
    await toolbar('actions.format').click();
    await toolbar('dialog.queryText.validateNow').click();
    await expect(editor).toContainText('&Код');
    await expect.poll(queryText).toMatch(/УПОРЯДОЧИТЬ ПО\n/);
    await expect(app.getByTestId('query-text-status')).toContainText(ui['status.valid']);
    await hold(4000);

    await caption(11);
    await toolbar('dialog.queryText.parameters').click();
    const parameters = app.getByTestId('query-text-parameters-panel');
    await expect(parameters).toContainText('&Код');
    await expect(parameters).toContainText(ui['parameters.uses'].replace('{count}', '1'));
    await parameters.getByText('&Код', { exact: true }).click();
    await expect(editor).toBeFocused();
    await expect(app.locator('.cm-activeLine')).toContainText('&Код');
    await hold(4000);
    await button('actions.apply').click();
    await expect(editor).toBeHidden();

    await caption(12);
    await tab('tabs.conditions').click();
    await expect(app.locator('input[type="text"]')).toHaveValue('&Код');
    await hold();
    await caption(13);
    await tab('tabs.order').click();
    await expect(app.locator('select')).toHaveValue('desc');
    await hold();

    await caption(14);
    await button('common.query').click();
    const valid = await queryText();
    await editor.fill('ВЫБРАТЬ\n\tОшибка.Код\nИЗ\n\tСправочник.НесуществующаяТаблица КАК Ошибка');
    await toolbar('dialog.queryText.validateNow').click();
    const errorText = ui['diagnostic.tableNotFound'].replace('{table}', 'Справочник.НесуществующаяТаблица');
    await expect(app.getByTestId('query-text-status')).toContainText(errorText);
    await expect(app.locator('.cm-lintRange-error')).toBeVisible();
    await button('actions.apply').click();
    await expect(editor).toBeVisible();
    await hold(4000);

    await caption(15);
    await button('actions.close').click();
    await expect(app.getByTestId('query-text-close-confirm')).toContainText(ui['dialog.queryText.unsavedTitle']);
    await hold(4000);
    await button('actions.closeWithoutSaving').click();
    await expect(editor).toBeHidden();

    await caption(16);
    await button('common.query').click();
    await expect.poll(queryText).toBe(valid);
    await expect(app.getByTestId('query-text-status')).toContainText(ui['status.valid']);
    await hold();
    await caption(17);
    await hold(4000);
    await button('actions.close').click();
    await button('actions.ok').click();
    const inserted = await app.locator('body').evaluate(() =>
      window.__webviewMessages.filter(message => message.type === 'insertText'));
    assert.equal(inserted.length, 1);
    assert.equal(inserted[0].text.replace(/\r\n?/g, '\n'), valid);
    assert.deepEqual(errors, [], 'The recording must not hide browser errors');
    const video = page.video();
    await context.close();

    if (!checkOnly) {
      await writeFile(path.join(dir, 'frames.json'), JSON.stringify(frames, null, 2));
      run(python, [fileURLToPath(new URL('./encode-gif.py', import.meta.url)), dir]);
      const gifName = locale === 'en' ? 'query-constructor-demo.gif' : `query-constructor-demo.${locale}.gif`;
      outputs.push([path.join(dir, 'demo.gif'), path.join(root, 'docs/images', gifName)]);
      outputs.push([await video.path(), path.join(root, `docs/videos/query-constructor-demo.${locale}.webm`)]);
    }
    console.log(`${locale}: all ${captions[locale].scenes.length} scenes verified`);
  }
  // Leave published media alone unless every requested locale has passed and encoded.
  for (const [source, target] of outputs) {
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(source, target);
  }
  console.log(checkOnly ? 'Demo scenarios passed; published media unchanged.' : 'Localized GIFs and WebM videos generated.');
  console.log(`Review frames and recordings: ${staging}`);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
