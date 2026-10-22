import { test, expect, type Locator, type Page } from '@playwright/test';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';

// Query Text (QueryTextDialog) regression baseline: Apply, Cancel and the
// unsaved-changes guard must never change the Designer model or write to the
// host without the user's consent. Started as the v1/v2 parity suite that gated
// removing the legacy modal; every scenario of that suite is kept.

const BASE = 'http://localhost:5555';
const query = 'ВЫБРАТЬ В.Код КАК Код, В.Наименование КАК Название ИЗ Справочник.Валюты КАК В ' +
  'ГДЕ В.Код = &Код // keep\nУПОРЯДОЧИТЬ ПО В.Код';
const otherQuery = 'ВЫБРАТЬ\n\tВалюты.Наименование КАК Наименование\nИЗ\n\tСправочник.Валюты КАК Валюты';

type Scope = Page | Locator;

async function openClassic(page: Page, text: string, canvas = false): Promise<void> {
  await page.goto(`${BASE}/?surface=classic${canvas ? '&canvas=1' : ''}`);
  await expect(page.getByTestId('loading-overlay')).toBeHidden();
  await page.evaluate(t => window.dispatchEvent(new MessageEvent('message', { data: { type: 'loadModel', text: t } })), text);
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

/** Close an edited dialog without Apply: Cancel, then confirm the discard. */
async function discardEdit(scope: Scope): Promise<void> {
  await scope.getByTestId('query-text-cancel').click();
  const confirm = scope.getByTestId('query-text-close-confirm');
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Закрыть без сохранения', exact: true }).click();
  await expect(editorOf(scope)).toHaveCount(0);
}

test.describe('Query Text', () => {
  test('Apply without changes keeps the model and writes nothing to the host', async ({ page }) => {
    await openClassic(page, query);
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
    await openClassic(page, query);
    const baseline = await save(page);
    await showQueryText(page);
    await page.locator('button[title="Закрыть"]').last().click();
    await expect(page.getByTestId('query-text-close-confirm')).toHaveCount(0);
    await expect(editorOf(page)).toHaveCount(0);
    expect(await save(page)).toBe(baseline);
  });

  test('closing an edited dialog without Apply keeps the model', async ({ page }) => {
    await openClassic(page, query);
    const baseline = await save(page);
    const editor = await showQueryText(page);
    await editor.fill(otherQuery);
    await discardEdit(page);
    expect(await save(page)).toBe(baseline);
    // Reopening shows the model's text, not the discarded edit.
    expect(await editorText(await showQueryText(page))).toBe(baseline);
  });

  for (const [name, text] of [['empty', ''], ['whitespace-only', '  \n\t\n ']] as const) {
    test(`${name} text: Apply is refused and the model is kept`, async ({ page }) => {
      await openClassic(page, query);
      const baseline = await save(page);
      const editor = await showQueryText(page);
      await editor.fill(text);
      await apply(page);
      await expect(page.getByText('Текст запроса пуст — нечего применять.').last()).toBeVisible();
      await expect(editor).toBeVisible();
      await discardEdit(page);
      expect(await save(page)).toBe(baseline);
    });
  }

  test('invalid text: Apply shows the error, keeps the author text and the model', async ({ page }) => {
    await openClassic(page, query);
    const baseline = await save(page);
    const editor = await showQueryText(page);
    const invalid = 'ВЫБРАТЬ В.Код КАК Код\nИЗ';
    await editor.fill(invalid);
    await apply(page);
    // The Apply banner, separate from the status bar's own diagnostic.
    await expect(page.locator('div[style*="white-space: pre-wrap"]').filter({ hasText: 'Ошибка разбора' })).toBeVisible();
    await expect(editor).toBeVisible();
    expect(await editorText(editor)).toBe(invalid);
    expect(await messages(page, 'insertText')).toHaveLength(1);
    await discardEdit(page);
    expect(await save(page)).toBe(baseline);
  });

  // C44: the parser keeps these as custom text, which OK / Save refuses
  // (`malformedCustom`); the dialog must not show "✓" or load them into the model.
  for (const [name, broken, fixed] of [
    ['incomplete comparison', 'ГДЕ В.Код = ', 'ГДЕ В.Код = &Код'],
    ['unclosed parenthesis', 'ГДЕ (В.Код = 1', 'ГДЕ (В.Код = 1)'],
  ] as const) {
    test(`C44 ${name}: status and Apply refuse it; after the fix Apply works`, async ({ page }) => {
      const head = 'ВЫБРАТЬ В.Код КАК Код ИЗ Справочник.Валюты КАК В ';
      const malformed = 'Произвольное условие или выражение выглядит синтаксически некорректным.';
      await openClassic(page, query);
      const baseline = await save(page);
      const editor = await showQueryText(page);
      const status = page.getByTestId('query-text-status');
      await editor.fill(head + broken);
      await page.getByTitle('Проверить сейчас', { exact: true }).click();
      await expect(status).toContainText(malformed);
      await expect(status).not.toContainText('✓');
      await apply(page);
      await expect(page.locator('div[style*="white-space: pre-wrap"]').filter({ hasText: malformed })).toBeVisible();
      await expect(editor).toBeVisible();
      expect(await editorText(editor)).toBe(head + broken);
      expect(await messages(page, 'insertText')).toHaveLength(1);
      // The refused Apply left the Designer model untouched.
      await discardEdit(page);
      expect(await save(page)).toBe(baseline);

      await showQueryText(page);
      await editor.fill(head + fixed);
      await page.getByTitle('Проверить сейчас', { exact: true }).click();
      await expect(status).toContainText('✓');
      await apply(page);
      await expect(editor).toBeHidden();
      const output = await save(page);
      expect(output).not.toBe(baseline);
      expect(output).toBe(generateBatch(parseBatch(head + fixed, undefined, { preserveComments: true })));
    });
  }

  test('batch with a temp table, UNION, comments and parameters applies into the model', async ({ page }) => {
    const batch = '// batch head\n' +
      'ВЫБРАТЬ В.Код КАК Код ПОМЕСТИТЬ ВТ ИЗ Справочник.Валюты КАК В ГДЕ В.Код = &Код; // after temp\n' +
      'ВЫБРАТЬ ВТ.Код КАК Код ИЗ ВТ КАК ВТ\n' +
      'ОБЪЕДИНИТЬ ВСЕ\n' +
      'ВЫБРАТЬ В.Наименование ИЗ Справочник.Валюты КАК В ГДЕ В.Наименование = &Имя';
    await openClassic(page, query);
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
    await openClassic(page, original);
    const baseline = await save(page);
    const nested = page.getByTestId('subquery-constructor');
    const openNested = async () => {
      await page.locator('[data-table-alias="П"]').click();
      await page.getByTestId('edit-source').click();
      await expect(nested).toBeVisible();
    };

    await openNested();
    await (await showQueryText(nested)).fill(edited);
    await discardEdit(nested);
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
    await openClassic(page, query, true);
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

    await openClassic(page, toClassic.text!, true);
    const baseline = await save(page);
    expect(baseline).toBe(toCanvas.text);
    const editor = await showQueryText(page);
    expect(await editorText(editor)).toBe(baseline);
    await apply(page);
    await expect(editor).toBeHidden();
    expect(await save(page)).toBe(baseline);
  });
});
