/**
 * U1: Apply is refused when the Designer would change the text around a `#Имя`
 * template marker (BSL replaces the marker with arbitrary text); a template whose
 * markers keep their surroundings is written as usual.
 */
import { test, expect, type Page } from '@playwright/test';

type Surface = 'classic' | 'canvas';
const BASE = 'http://localhost:5555';

async function open(page: Page, surface: Surface, text: string): Promise<void> {
  await page.goto(`${BASE}/?surface=${surface}`);
  await expect(page.getByTestId(surface === 'canvas' ? 'canvas-loading-overlay' : 'loading-overlay')).toBeHidden();
  await page.evaluate(t => window.dispatchEvent(new MessageEvent('message', { data: { type: 'loadModel', text: t, loadId: 1 } })), text);
}

const inserts = (page: Page) => page.evaluate(() =>
  (window as unknown as { __webviewMessages: { type: string; text?: string }[] }).__webviewMessages.filter(m => m.type === 'insertText').map(m => m.text!));

for (const surface of ['classic', 'canvas'] as const) {
  const button = surface === 'canvas' ? 'Сохранить' : 'ОК';

  test(`${surface}: an unaliased marker source is not rewritten`, async ({ page }) => {
    await open(page, surface, 'ВЫБРАТЬ * ИЗ #Таблица');
    await page.getByRole('button', { name: button, exact: true }).click();
    await expect(page.getByText(/шаблонного маркера "#Таблица"/u)).toBeVisible();
    expect(await inserts(page)).toEqual([]);
  });

  test(`${surface}: a marker that keeps its surroundings is applied`, async ({ page }) => {
    await open(page, surface, 'ВЫБРАТЬ Т.Код КАК Код ИЗ #Таблица КАК Т');
    await page.getByRole('button', { name: button, exact: true }).click();
    await expect.poll(async () => (await inserts(page)).length).toBe(1);
    expect((await inserts(page))[0]).toContain('#Таблица КАК Т');
  });
}
