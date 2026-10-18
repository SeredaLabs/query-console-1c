/**
 * C24 step 1b: the explicit "expand `*`" command in Classic and Canvas. It is
 * disabled without a wildcard, asks for confirmation with the incompleteness
 * warning, changes nothing on cancel, and after confirming every column written by
 * Apply is a visible row of the field list.
 */
import { test, expect, type Page } from '@playwright/test';
import type { MetaTable } from '../../src/core/metadata/types';

type Surface = 'classic' | 'canvas';
const BASE = 'http://localhost:5555';
const std = (name: string) => ({ name, kind: 'standard' as const, types: [] });
const TABLES: MetaTable[] = [{
  kind: 'Справочник', name: 'Валюты', fullName: 'Справочник.Валюты',
  fields: [std('Ссылка'), std('Код'), std('Наименование'), { name: 'Символ', kind: 'attribute', types: [] }, std('Предопределенный'), std('ИмяПредопределенныхДанных')],
}] as MetaTable[];

async function open(page: Page, surface: Surface, text: string): Promise<void> {
  await page.goto(`${BASE}/?surface=${surface}`);
  await expect(page.getByTestId(surface === 'canvas' ? 'canvas-loading-overlay' : 'loading-overlay')).toBeHidden();
  await page.evaluate(({ text, tables }) => {
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'metadataTree', tables } }));
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'loadModel', text } }));
  }, { text, tables: TABLES });
  if (surface === 'canvas') await page.getByRole('button', { name: /Поля$/ }).click();
}

const inserts = (page: Page) => page.evaluate(() =>
  (window as unknown as { __webviewMessages: { type: string; text?: string }[] }).__webviewMessages.filter(m => m.type === 'insertText').map(m => m.text!));

async function apply(page: Page, surface: Surface): Promise<string> {
  await page.getByRole('button', { name: surface === 'canvas' ? 'Сохранить' : 'ОК', exact: true }).click();
  await expect.poll(async () => (await inserts(page)).length).toBe(1);
  return (await inserts(page))[0];
}

const rows = (page: Page, surface: Surface) => surface === 'canvas'
  ? page.getByPlaceholder('Псевдоним', { exact: true })
  : page.locator('[data-field-idx]');

for (const surface of ['classic', 'canvas'] as const) {
  test(`${surface}: disabled without a wildcard`, async ({ page }) => {
    await open(page, surface, 'ВЫБРАТЬ В.Код КАК Код ИЗ Справочник.Валюты КАК В');
    await expect(page.getByTestId('expand-wildcards')).toBeDisabled();
  });

  test(`${surface}: cancel leaves the wildcard`, async ({ page }) => {
    await open(page, surface, 'ВЫБРАТЬ * ИЗ Справочник.Валюты КАК В');
    await page.getByTestId('expand-wildcards').click();
    await expect(page.getByTestId('expand-wildcards-confirm')).toContainText('неполным');
    await page.getByTestId('expand-wildcards-cancel').click();
    await expect(page.getByTestId('expand-wildcards-confirm')).toBeHidden();
    await expect(rows(page, surface)).toHaveCount(1);
  });

  test(`${surface}: confirmed expansion writes only columns the list shows`, async ({ page }) => {
    await open(page, surface, 'ВЫБРАТЬ * ИЗ Справочник.Валюты КАК В');
    await page.getByTestId('expand-wildcards').click();
    await page.getByTestId('expand-wildcards-continue').click();
    await expect(rows(page, surface)).toHaveCount(6);
    await expect(page.getByTestId('expand-wildcards')).toBeDisabled();
    const text = await apply(page, surface);
    expect(text).not.toContain('*');
    const written = (text.match(/ КАК /gu) ?? []).length - 1; // minus the source alias
    expect(written).toBe(6);
    expect(text).toContain('В.ИмяПредопределенныхДанных КАК ИмяПредопределенныхДанных');
  });
}
