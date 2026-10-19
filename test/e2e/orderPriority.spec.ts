import { test, expect, type Page } from '@playwright/test';
import { parseBatch } from '../../src/core/query/sdblParser';

type Surface = 'classic' | 'canvas';
const input = 'ВЫБРАТЬ Т.Код КАК Код, Т.Наименование КАК Имя ИЗ Справочник.Валюты КАК Т УПОРЯДОЧИТЬ ПО // keep\nКод УБЫВ, Имя АВТОУПОРЯДОЧИВАНИЕ';
async function open(page: Page, surface: Surface, text: string) {
  await page.goto(`http://localhost:5555/?surface=${surface}`);
  await expect(page.getByTestId(surface === 'canvas' ? 'canvas-loading-overlay' : 'loading-overlay')).toBeHidden();
  await page.evaluate(text => window.dispatchEvent(new MessageEvent('message', { data: { type: 'loadModel', text } })), text);
  if (surface === 'canvas') await page.getByRole('button', { name: /Сортировка$/ }).click();
  else await page.getByRole('tab', { name: 'Порядок', exact: true }).click();
}
async function save(page: Page, surface: Surface) {
  await page.getByRole('button', { name: surface === 'canvas' ? 'Сохранить' : 'ОК', exact: true }).click();
  const inserted = () => page.evaluate(() => (window as unknown as { __webviewMessages: { type: string; text?: string }[] }).__webviewMessages.filter(m => m.type === 'insertText').map(m => m.text!));
  await expect.poll(async () => (await inserted()).length).toBe(1);
  return (await inserted())[0];
}
for (const surface of ['classic', 'canvas'] as const) for (const union of [false, true]) {
  test(`${surface} UNION=${union}: reorder sorting keys, preserve direction/comments and reopen`, async ({ page }) => {
    const query = union ? input.replace(' УПОРЯДОЧИТЬ', ' ОБЪЕДИНИТЬ ВСЕ ВЫБРАТЬ Б.Код, Б.Наименование ИЗ Справочник.Валюты КАК Б УПОРЯДОЧИТЬ') : input;
    await open(page, surface, query);
    const rows = page.getByTestId('order-priority-row');
    await expect(rows).toHaveCount(2);
    await expect(rows.first().getByRole('button', { name: 'Переместить вверх', exact: true })).toBeDisabled();
    await expect(rows.last().getByRole('button', { name: 'Переместить вниз', exact: true })).toBeDisabled();
    await rows.last().getByRole('button', { name: 'Переместить вверх', exact: true }).click();
    await expect(rows.first().locator('select')).toHaveValue('asc');
    const output = await save(page, surface);
    expect(output).toContain('УПОРЯДОЧИТЬ ПО\n\t// keep\n\tИмя,\n\tКод УБЫВ');
    expect(output).toContain('АВТОУПОРЯДОЧИВАНИЕ');
    await open(page, surface, output);
    expect(await save(page, surface)).toBe(output);
  });
}
test('Canvas filtered sorting moves the original row, not the visible index', async ({ page }) => {
  await open(page, 'canvas', input);
  await page.getByPlaceholder('Поиск полей сортировки...').fill('Наименование');
  const rows = page.getByTestId('order-priority-row');
  await expect(rows).toHaveCount(1);
  await rows.getByRole('button', { name: 'Переместить вверх', exact: true }).click();
  await expect(rows.getByRole('button', { name: 'Переместить вверх', exact: true })).toBeDisabled();
  const output = await save(page, 'canvas');
  expect(parseBatch(output).members[0].members[0].model.order!.fields.map(f => f.selectAlias)).toEqual(['Имя', 'Код']);
});
