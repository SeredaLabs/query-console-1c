import { test, expect, type Page } from '@playwright/test';
import { parseBatch } from '../../src/core/query/sdblParser';

type Surface = 'classic' | 'canvas';
const BASE = 'http://localhost:5555';
const query = 'ВЫБРАТЬ В.Код КАК Код, В.Наименование КАК Название ИЗ Справочник.Валюты КАК В ГДЕ В.Код = &Код УПОРЯДОЧИТЬ ПО В.Код';

async function open(page: Page, surface: Surface, text: string): Promise<void> {
  await page.goto(`${BASE}/?surface=${surface}`);
  await expect(page.getByTestId(surface === 'canvas' ? 'canvas-loading-overlay' : 'loading-overlay')).toBeHidden();
  await page.evaluate(text => {
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'loadModel', text } }));
  }, text);
}

async function insertions(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as {
    __webviewMessages: { type: string; text?: string }[];
  }).__webviewMessages.filter(m => m.type === 'insertText').map(m => m.text!));
}

async function save(page: Page, surface: Surface): Promise<string> {
  const before = (await insertions(page)).length;
  await page.getByRole('button', { name: surface === 'canvas' ? 'Сохранить' : 'ОК', exact: true }).click();
  await expect.poll(async () => (await insertions(page)).length).toBe(before + 1);
  return (await insertions(page))[before];
}

test.describe('Classic / Canvas browser parity', () => {
  for (const surface of ['classic', 'canvas'] as const) {
    test(`${surface}: HAVING survives an unrelated alias edit and save/reopen (C9)`, async ({ page }) => {
      const input = 'ВЫБРАТЬ В.Код КАК Код ИЗ Справочник.Валюты КАК В СГРУППИРОВАТЬ ПО В.Код ИМЕЮЩИЕ В.Код <> ""';
      await open(page, surface, input);
      if (surface === 'canvas') {
        await page.getByRole('button', { name: /Поля$/ }).click();
        await page.getByPlaceholder('Псевдоним', { exact: true }).first().fill('НовыйКод');
      } else {
        await page.locator('[data-tab="Объединения/Псевдонимы"]').click();
        const alias = page.locator('input').filter({ visible: true }).last();
        await alias.fill('НовыйКод');
        await alias.press('Tab');
      }
      const output = await save(page, surface);
      const model = parseBatch(output).members[0].members[0].model;
      expect(model.fields[0].alias).toBe('НовыйКод');
      expect(model.having).toEqual(parseBatch(input).members[0].members[0].model.having);
      await open(page, surface, output);
      expect(await save(page, surface)).toBe(output);
    });
  }

  for (const surface of ['classic', 'canvas'] as const) {
    test(`${surface}: preserves entered hierarchy on a string field through load/save (C3)`, async ({ page }) => {
      await open(page, surface, query + ' ИЕРАРХИЯ УБЫВ');
      const output = await save(page, surface);
      expect(output).toContain('В.Код ИЕРАРХИЯ УБЫВ');
      await open(page, surface, output);
      expect(await save(page, surface)).toBe(output);
    });
  }
  const cases = [
    ['fields, condition and order', query],
    ['grouping and aggregate', 'ВЫБРАТЬ В.Код КАК Код, КОЛИЧЕСТВО(В.Ссылка) КАК Количество ИЗ Справочник.Валюты КАК В СГРУППИРОВАТЬ ПО В.Код'],
    ['source subquery', 'ВЫБРАТЬ В.Код ИЗ (ВЫБРАТЬ Валюты.Код КАК Код ИЗ Справочник.Валюты КАК Валюты) КАК В'],
    ['condition subquery', 'ВЫБРАТЬ В.Код ИЗ Справочник.Валюты КАК В ГДЕ В.Ссылка В (ВЫБРАТЬ Б.Ссылка ИЗ Справочник.Банки КАК Б)'],
    ['union', 'ВЫБРАТЬ В.Код КАК Код ИЗ Справочник.Валюты КАК В ОБЪЕДИНИТЬ ВСЕ ВЫБРАТЬ Б.Код ИЗ Справочник.Валюты КАК Б'],
    ['temporary table package', 'ВЫБРАТЬ В.Код КАК Код ПОМЕСТИТЬ ВТ ИЗ Справочник.Валюты КАК В; ВЫБРАТЬ Т.Код ИЗ ВТ КАК Т'],
  ];
  for (const [name, input] of cases) {
    test(`${name}: both production UIs save the same text and reopen it`, async ({ page }) => {
      await open(page, 'classic', input);
      const classic = await save(page, 'classic');
      await open(page, 'canvas', input);
      expect(await save(page, 'canvas')).toBe(classic);
      await open(page, 'canvas', classic);
      expect(await save(page, 'canvas')).toBe(classic);
    });
  }
});

test.describe('Canvas editing and save guards', () => {
  test('incomplete lexical input survives editing and blocks Save until corrected', async ({ page }) => {
    await open(page, 'canvas', query);
    await page.getByRole('button', { name: /Условия$/ }).click();
    const editor = page.locator('textarea:visible');
    for (const expression of ['В.Код = & И В.Наименование = "x"', 'В.Код = "unfinished', 'НЕ (В.Код = §)']) {
      await editor.fill(expression);
      await expect(editor).toHaveValue(expression);
      await expect(page.getByRole('button', { name: 'Сохранить', exact: true })).toBeDisabled();
      await page.getByRole('button', { name: /Поля$/ }).click();
      await page.getByRole('button', { name: /Условия$/ }).click();
      await expect(editor).toHaveValue(expression);
      expect(await insertions(page)).toEqual([]);
    }
    await editor.fill('В.Код = &Исправлено');
    expect(await save(page, 'canvas')).toContain('В.Код = &Исправлено');
  });

  test('edits alias, condition and sorting through Canvas controls; Classic reopens the result', async ({ page }) => {
    await open(page, 'canvas', query);
    await page.getByRole('button', { name: /Поля$/ }).click();
    await page.getByPlaceholder('Псевдоним', { exact: true }).first().fill('КодВалюты');
    await page.getByRole('button', { name: /Условия$/ }).click();
    await page.locator('textarea:visible').fill('В.Код = &НовыйКод');
    await page.getByRole('button', { name: /Сортировка$/ }).click();
    await page.locator('table:visible select').selectOption('desc');
    const output = await save(page, 'canvas');
    const model = parseBatch(output).members[0].members[0].model;
    expect(model.fields.map(f => f.alias)).toEqual(['КодВалюты', 'Название']);
    expect(model.conditions[0].expression).toBe('В.Код = &НовыйКод');
    expect(model.order.fields[0].direction).toBe('desc');
    expect(model.tables[0].fullName).toBe('Справочник.Валюты');
    await open(page, 'classic', output);
    expect(await save(page, 'classic')).toBe(output);
  });

  test('duplicate alias introduced in Canvas prevents insertion; correcting it permits save', async ({ page }) => {
    await open(page, 'canvas', query);
    await page.getByRole('button', { name: /Поля$/ }).click();
    const aliases = page.getByPlaceholder('Псевдоним', { exact: true });
    await aliases.nth(1).fill('Код');
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(page.getByTestId('canvas-save-error')).toBeVisible();
    expect(await insertions(page)).toEqual([]);
    await aliases.nth(1).fill('ИмяВалюты');
    await expect(page.getByTestId('canvas-save-error')).toBeHidden();
    expect(await save(page, 'canvas')).toContain('ИмяВалюты');
  });

  for (const [name, input] of [
    ['unsafe VT arguments', 'ВЫБРАТЬ Т.Период ИЗ РегистрРасчета.Начисления.ДанныеГрафика(&А, &Б) КАК Т'],
    ['malformed expression', 'ВЫБРАТЬ В.Код ИЗ Справочник.Валюты КАК В ГДЕ В.Код = = &Код'],
  ]) {
    test(`${name}: Save stays disabled without emitting insertText`, async ({ page }) => {
      await open(page, 'canvas', input);
      await expect(page.getByRole('button', { name: 'Сохранить', exact: true })).toBeDisabled();
      expect(await insertions(page)).toEqual([]);
    });
  }

  test('failed load offers Close and never emits replacement text', async ({ page }) => {
    await open(page, 'canvas', 'ВЫБРАТЬ ИЗ');
    const error = page.getByTestId('canvas-load-error');
    await expect(error).toBeVisible();
    await error.getByRole('button').click();
    const types = await page.evaluate(() => (window as any).__webviewMessages.map((m: any) => m.type));
    expect(types).toContain('cancel');
    expect(types).not.toContain('insertText');
  });
});
