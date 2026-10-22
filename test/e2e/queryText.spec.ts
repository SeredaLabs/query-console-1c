import { test, expect, type Locator, type Page } from '@playwright/test';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';

// Query Text parity baseline (Phase 1 of the v1 removal). Every scenario runs
// with the legacy modal (v2=false) and with QueryTextDialog (v2=true): the
// expectations are the shared contract that must survive deleting v1. Only the
// way of closing without Apply differs — v2 asks before discarding an edit.

const BASE = 'http://localhost:5555';
const query = 'ВЫБРАТЬ В.Код КАК Код, В.Наименование КАК Название ИЗ Справочник.Валюты КАК В ' +
  'ГДЕ В.Код = &Код // keep\nУПОРЯДОЧИТЬ ПО В.Код';
const otherQuery = 'ВЫБРАТЬ\n\tВалюты.Наименование КАК Наименование\nИЗ\n\tСправочник.Валюты КАК Валюты';

type Scope = Page | Locator;

async function openClassic(page: Page, text: string, v2: boolean, canvas = false): Promise<void> {
  await page.goto(`${BASE}/?surface=classic${canvas ? '&canvas=1' : ''}`);
  await expect(page.getByTestId('loading-overlay')).toBeHidden();
  await page.evaluate(({ text, v2, canvas }) => {
    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'init', hasInitialQuery: false, queryTextEditorV2: v2, locale: 'ru', canvasAvailable: canvas },
    }));
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'loadModel', text } }));
  }, { text, v2, canvas });
}

async function messages(page: Page, type: string): Promise<{ type: string; text?: string; target?: string }[]> {
  return page.evaluate(t => (window as unknown as {
    __webviewMessages: { type: string; text?: string; target?: string }[];
  }).__webviewMessages.filter(m => m.type === t), type);
}

async function save(page: Page): Promise<string> {
  const before = (await messages(page, 'insertText')).length;
  await page.getByRole('button', { name: 'ОК', exact: true }).click();
  await expect.poll(async () => (await messages(page, 'insertText')).length).toBe(before + 1);
  return (await messages(page, 'insertText'))[before].text!;
}

function editorOf(scope: Scope): Locator {
  return scope.locator('[data-testid="query-text-editor"] .cm-content');
}

async function showQueryText(scope: Scope): Promise<Locator> {
  await scope.getByRole('button', { name: 'Запрос', exact: true }).last().click();
  const editor = editorOf(scope);
  await expect(editor).toBeVisible();
  return editor;
}

async function editorText(editor: Locator): Promise<string> {
  return (await editor.locator('.cm-line').allTextContents()).join('\n');
}

async function apply(scope: Scope): Promise<void> {
  await scope.getByRole('button', { name: 'Применить', exact: true }).last().click();
}

/** Close an edited dialog without Apply: v1 closes on ×, v2 confirms first. */
async function discardEdit(scope: Scope, v2: boolean): Promise<void> {
  if (v2) {
    await scope.getByTestId('query-text-cancel').click();
    const confirm = scope.getByTestId('query-text-close-confirm');
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: 'Закрыть без сохранения', exact: true }).click();
  } else {
    await scope.locator('button[title="Закрыть"]').last().click();
  }
  await expect(editorOf(scope)).toHaveCount(0);
}

for (const v2 of [false, true]) {
  test.describe(`Query Text parity v2=${v2}`, () => {
    test('Apply without changes keeps the model and writes nothing to the host', async ({ page }) => {
      await openClassic(page, query, v2);
      const baseline = await save(page);
      const editor = await showQueryText(page);
      expect(await editorText(editor)).toBe(baseline);
      const writes = (await messages(page, 'insertText')).length;
      await apply(page);
      await expect(editor).toBeHidden();
      // Apply only reloads the Designer model; the host write stays with OK.
      expect(await messages(page, 'insertText')).toHaveLength(writes);
      expect(await save(page)).toBe(baseline);
    });

    test('closing an unchanged dialog needs no confirmation and keeps the model', async ({ page }) => {
      await openClassic(page, query, v2);
      const baseline = await save(page);
      await showQueryText(page);
      await page.locator('button[title="Закрыть"]').last().click();
      await expect(page.getByTestId('query-text-close-confirm')).toHaveCount(0);
      await expect(editorOf(page)).toHaveCount(0);
      expect(await save(page)).toBe(baseline);
    });

    test('closing an edited dialog without Apply keeps the model', async ({ page }) => {
      await openClassic(page, query, v2);
      const baseline = await save(page);
      const editor = await showQueryText(page);
      await editor.fill(otherQuery);
      await discardEdit(page, v2);
      expect(await save(page)).toBe(baseline);
      // Reopening shows the model's text, not the discarded edit.
      expect(await editorText(await showQueryText(page))).toBe(baseline);
    });

    for (const [name, text] of [['empty', ''], ['whitespace-only', '  \n\t\n ']] as const) {
      test(`${name} text: Apply is refused and the model is kept`, async ({ page }) => {
        await openClassic(page, query, v2);
        const baseline = await save(page);
        const editor = await showQueryText(page);
        await editor.fill(text);
        await apply(page);
        await expect(page.getByText('Текст запроса пуст — нечего применять.').last()).toBeVisible();
        await expect(editor).toBeVisible();
        await discardEdit(page, v2);
        expect(await save(page)).toBe(baseline);
      });
    }

    test('invalid text: Apply shows the error, keeps the author text and the model', async ({ page }) => {
      await openClassic(page, query, v2);
      const baseline = await save(page);
      const editor = await showQueryText(page);
      const invalid = 'ВЫБРАТЬ В.Код КАК Код\nИЗ';
      await editor.fill(invalid);
      await apply(page);
      // The Apply banner (both layouts), separate from the v2 status bar.
      await expect(page.locator('div[style*="white-space: pre-wrap"]').filter({ hasText: 'Ошибка разбора' })).toBeVisible();
      await expect(editor).toBeVisible();
      expect(await editorText(editor)).toBe(invalid);
      expect(await messages(page, 'insertText')).toHaveLength(1);
      await discardEdit(page, v2);
      expect(await save(page)).toBe(baseline);
    });

    test('batch with a temp table, UNION, comments and parameters applies into the model', async ({ page }) => {
      const batch = '// batch head\n' +
        'ВЫБРАТЬ В.Код КАК Код ПОМЕСТИТЬ ВТ ИЗ Справочник.Валюты КАК В ГДЕ В.Код = &Код; // after temp\n' +
        'ВЫБРАТЬ ВТ.Код КАК Код ИЗ ВТ КАК ВТ\n' +
        'ОБЪЕДИНИТЬ ВСЕ\n' +
        'ВЫБРАТЬ В.Наименование ИЗ Справочник.Валюты КАК В ГДЕ В.Наименование = &Имя';
      await openClassic(page, query, v2);
      const editor = await showQueryText(page);
      await editor.fill(batch);
      await apply(page);
      await expect(editor).toBeHidden();
      await expect(page.getByTestId('comment-loss-confirm')).toHaveCount(0);
      const output = await save(page);
      expect(output).toBe(generateBatch(parseBatch(batch, undefined, { preserveComments: true })));
      expect(parseBatch(output).members).toHaveLength(2);
      // The applied batch reopens unchanged and survives a second no-op Apply.
      expect(await editorText(await showQueryText(page))).toBe(output);
      await apply(page);
      expect(await save(page)).toBe(output);
    });

    test('nested designer: Apply updates the subquery, discarding keeps it', async ({ page }) => {
      const outer = (inner: string) => `ВЫБРАТЬ П.Код КАК Код ИЗ (${inner}) КАК П`;
      const original = outer('ВЫБРАТЬ В.Код КАК Код ИЗ Справочник.Валюты КАК В');
      const edited = 'ВЫБРАТЬ В.Наименование КАК Код ИЗ Справочник.Валюты КАК В ГДЕ В.Код = &Код';
      await openClassic(page, original, v2);
      const baseline = await save(page);
      const nested = page.getByTestId('subquery-constructor');
      const openNested = async () => {
        await page.locator('[data-table-alias="П"]').click();
        await page.getByTestId('edit-source').click();
        await expect(nested).toBeVisible();
      };

      await openNested();
      await (await showQueryText(nested)).fill(edited);
      await discardEdit(nested, v2);
      await nested.getByRole('button', { name: 'ОК', exact: true }).click();
      await expect(nested).toBeHidden();
      expect(await save(page)).toBe(baseline);

      await openNested();
      const editor = await showQueryText(nested);
      await editor.fill(edited);
      await apply(nested);
      await expect(editor).toBeHidden();
      await nested.getByRole('button', { name: 'ОК', exact: true }).click();
      await expect(nested).toBeHidden();
      expect(await save(page)).toBe(generateBatch(parseBatch(outer(edited), undefined, { preserveComments: true })));
    });

    test('after Classic → Canvas → Classic the dialog shows and applies the carried text', async ({ page }) => {
      await openClassic(page, query, v2, true);
      await page.getByTestId('designer-mode-canvas').click();
      const [toCanvas] = await messages(page, 'switchDesigner');
      expect(toCanvas.target).toBe('canvas');
      // The harness stands in for the host: it reloads the panel with the other UI.
      await page.goto(`${BASE}/?surface=canvas&canvas=1`);
      await expect(page.getByTestId('canvas-loading-overlay')).toBeHidden();
      await page.evaluate(t => window.dispatchEvent(new MessageEvent('message', { data: { type: 'loadModel', text: t } })), toCanvas.text!);
      await page.getByTestId('designer-mode-classic').click();
      const [toClassic] = await messages(page, 'switchDesigner');
      expect(toClassic).toEqual({ type: 'switchDesigner', target: 'classic', text: toCanvas.text });

      await openClassic(page, toClassic.text!, v2, true);
      const baseline = await save(page);
      expect(baseline).toBe(toCanvas.text);
      const editor = await showQueryText(page);
      expect(await editorText(editor)).toBe(baseline);
      await apply(page);
      await expect(editor).toBeHidden();
      expect(await save(page)).toBe(baseline);
    });
  });
}
