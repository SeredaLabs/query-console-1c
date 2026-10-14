import { test, expect } from '@playwright/test';

for (const cycle of [false, true]) {
  test(`Database references expand only requested paths (cycle=${cycle})`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://localhost:5555/');
    await expect(page.getByTestId('loading-overlay')).toBeHidden();
    await page.evaluate(() => {
      const refField = (name: string, target: string) => ({ name, kind: 'attribute', types: [{ ref: { kind: 'Справочник', name: target } }] });
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'metadataTree', tables: [
        { kind: 'Справочник', name: 'А', fullName: 'Справочник.А', fields: [refField('Ссылка', 'А'), refField('Другая', 'А')] },
        { kind: 'Справочник', name: 'Б', fullName: 'Справочник.Б', fields: [refField('Ссылка', 'А')] },
      ] } }));
    });
    await page.getByText('Справочники', { exact: true }).click();
    const table = page.locator('[data-table-fullname="Справочник.А"]');
    await table.click();
    const tree = table.locator('..');
    const row = (path: string) => tree.locator(`[data-field-path="${path}"]`);
    await row('Ссылка').locator('.codicon-chevron-right').click();
    await page.evaluate(cycle => {
      const fields = [{ name: 'Код', kind: 'standard', types: [] }, ...(cycle ? [
        { name: 'Ссылка', kind: 'standard', types: [{ ref: { kind: 'Справочник', name: 'А' } }] },
        { name: 'Другой', kind: 'attribute', types: [{ ref: { kind: 'Справочник', name: 'Б' } }] },
      ] : [])];
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'refFields', ref: { kind: 'Справочник', name: 'А' }, fields } }));
    }, cycle);
    await expect(row('Ссылка.Код')).toBeVisible();
    await expect(row('Другая.Код')).toHaveCount(0);
    await expect(row('Ссылка.Ссылка.Код')).toHaveCount(0);
    if (cycle) {
      await row('Ссылка.Ссылка').locator('.codicon-chevron-right').click();
      await expect(row('Ссылка.Ссылка.Код')).toBeVisible();
      await expect(row('Ссылка.Ссылка.Ссылка.Код')).toHaveCount(0);
      await row('Ссылка.Другой').locator('.codicon-chevron-right').click();
      await page.evaluate(() => window.dispatchEvent(new MessageEvent('message', { data: {
        type: 'refFields', ref: { kind: 'Справочник', name: 'Б' },
        fields: [{ name: 'Назад', kind: 'attribute', types: [{ ref: { kind: 'Справочник', name: 'А' } }] }],
      } })));
      await expect(row('Ссылка.Другой.Назад')).toBeVisible();
      await expect(row('Ссылка.Другой.Назад.Код')).toHaveCount(0);
      await row('Ссылка.Другой.Назад').locator('.codicon-chevron-right').click();
      await expect(row('Ссылка.Другой.Назад.Код')).toBeVisible();
    }
    const data = await row('Ссылка.Код').evaluate(el => {
      const dt = new DataTransfer();
      el.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
      return JSON.parse(dt.getData('text/plain'));
    });
    expect(data).toEqual({ kind: 'field', tableFullName: 'Справочник.А', fieldPath: 'Ссылка.Код' });
    await row('Ссылка').locator('.codicon-chevron-down').click();
    await expect(row('Ссылка.Код')).toHaveCount(0);
    await row('Другая').locator('.codicon-chevron-right').click();
    await expect(row('Другая.Код')).toBeVisible();
    await expect(row('Ссылка.Код')).toHaveCount(0);
    const other = page.locator('[data-table-fullname="Справочник.Б"]');
    await other.click();
    await expect(other.locator('..').locator('[data-field-path="Ссылка.Код"]')).toHaveCount(0);
    await row('Ссылка').locator('.codicon-chevron-right').click();
    await expect(row('Ссылка.Код')).toBeVisible();
    await page.locator('[data-tab="Группировка"]').click();
    await expect(page.locator('[data-tab="Группировка"]')).toHaveAttribute('aria-selected', 'true');
    expect(errors).toEqual([]);
  });
}
