/**
 * C24 completion: a UNION of kept wildcards opens in Classic and Canvas and is
 * written without `КАК Т.*` (a platform syntax error), unchanged otherwise.
 */
import { test, expect, type Page } from '@playwright/test';

type Surface = 'classic' | 'canvas';
const BASE = 'http://localhost:5555';
const QUERY = 'ВЫБРАТЬ Т.*, 1 КАК Х ИЗ Справочник.Валюты КАК Т ОБЪЕДИНИТЬ ВСЕ ВЫБРАТЬ Т2.*, 2 ИЗ Справочник.Валюты КАК Т2';

async function open(page: Page, surface: Surface, text: string): Promise<void> {
  await page.goto(`${BASE}/?surface=${surface}`);
  await expect(page.getByTestId(surface === 'canvas' ? 'canvas-loading-overlay' : 'loading-overlay')).toBeHidden();
  await page.evaluate(t => window.dispatchEvent(new MessageEvent('message', { data: { type: 'loadModel', text: t } })), text);
}

const inserts = (page: Page) => page.evaluate(() =>
  (window as unknown as { __webviewMessages: { type: string; text?: string }[] }).__webviewMessages.filter(m => m.type === 'insertText').map(m => m.text!));

for (const surface of ['classic', 'canvas'] as const) {
  test(`${surface}: a UNION of kept wildcards is written without a wildcard alias`, async ({ page }) => {
    await open(page, surface, QUERY);
    await page.getByRole('button', { name: surface === 'canvas' ? 'Сохранить' : 'ОК', exact: true }).click();
    await expect.poll(async () => (await inserts(page)).length).toBe(1);
    const text = (await inserts(page))[0];
    expect(text).not.toMatch(/КАК Т2?\.\*/u);
    expect(text).toBe('ВЫБРАТЬ\n\tТ.*,\n\t1 КАК Х\nИЗ\n\tСправочник.Валюты КАК Т\n\nОБЪЕДИНИТЬ ВСЕ\n\nВЫБРАТЬ\n\tТ2.*,\n\t2\nИЗ\n\tСправочник.Валюты КАК Т2');
  });
}
