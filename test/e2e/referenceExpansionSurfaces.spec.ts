import { test, expect, type Page } from '@playwright/test';

async function prepare(page: Page) {
  await page.goto('http://localhost:5555/');
  await expect(page.getByTestId('loading-overlay')).toBeHidden();
  await page.evaluate(() => {
    const ref = (name: string, target: string) => ({ name, kind: 'attribute', types: [{ ref: { kind: 'Справочник', name: target } }] });
    const a = [ref('Ссылка', 'А'), ref('Другой', 'Б'), { name: 'Код', kind: 'standard', types: [{ primitive: 'Строка' }] }];
    const b = [ref('Назад', 'А')];
    const send = (data: unknown) => window.dispatchEvent(new MessageEvent('message', { data }));
    send({ type: 'metadataTree', tables: [
      { kind: 'Справочник', name: 'А', fullName: 'Справочник.А', fields: a,
        tabularSections: [{ kind: 'ТабличнаяЧасть', name: 'Строки', fullName: 'Справочник.А.Строки', fields: [ref('Владелец', 'А')] }] },
      { kind: 'Справочник', name: 'Б', fullName: 'Справочник.Б', fields: b },
    ] });
    send({ type: 'loadModel', text: 'ВЫБРАТЬ А.Код ИЗ Справочник.А КАК А' });
    // Cache may already be populated by another tab or constructor.
    send({ type: 'refFields', ref: { kind: 'Справочник', name: 'А' }, fields: a });
    send({ type: 'refFields', ref: { kind: 'Справочник', name: 'Б' }, fields: b });
  });
  await expect(page.locator('[data-field-idx="0"]')).toBeVisible();
}

for (const tab of ['Таблицы и поля', 'Условия']) {
  test(`Reference rows remain lazy with cyclic cached types: ${tab}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await prepare(page);
    if (tab === 'Таблицы и поля') await page.locator('[data-table-alias="А"]').click();
    else await page.locator('[data-tab="Условия"]').click();
    const row = (path: string) => page.locator(`[data-field-item][title="А.${path}"]`);
    await expect(row('Ссылка')).toBeVisible();
    await expect(row('Ссылка.Код')).toHaveCount(0);
    await row('Ссылка').locator('.codicon-chevron-right').click();
    await expect(row('Ссылка.Код')).toBeVisible();
    await expect(row('Ссылка.Ссылка.Код')).toHaveCount(0);
    await row('Ссылка.Ссылка').locator('.codicon-chevron-right').click();
    await expect(row('Ссылка.Ссылка.Код')).toBeVisible();
    await expect(row('Ссылка.Ссылка.Ссылка.Код')).toHaveCount(0);
    await row('Другой').locator('.codicon-chevron-right').click();
    await row('Другой.Назад').locator('.codicon-chevron-right').click();
    await expect(row('Другой.Назад.Код')).toBeVisible();
    await expect(row('Другой.Назад.Другой.Назад')).toHaveCount(0);
    await row('Ссылка').locator('.codicon-chevron-down').click();
    await expect(row('Ссылка.Код')).toHaveCount(0);
    await expect(row('Другой.Назад.Код')).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('Nested constructor and tabular sections do not auto-expand cached reference cycles', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await prepare(page);
  await page.getByTestId('add-subquery').click();
  const nested = page.getByTestId('subquery-constructor');
  await nested.getByText('Справочники', { exact: true }).click();
  await nested.locator('[data-table-fullname="Справочник.А"]').click();
  const row = (path: string) => nested.locator(`[data-field-path="${path}"]`);
  await expect(row('Ссылка')).toBeVisible();
  await expect(row('Ссылка.Код')).toHaveCount(0);
  await row('Ссылка').locator('.codicon-chevron-right').click();
  await expect(row('Ссылка.Код')).toBeVisible();
  await expect(row('Ссылка.Ссылка.Код')).toHaveCount(0);
  await nested.getByText('Строки', { exact: true }).click();
  await row('Владелец').locator('.codicon-chevron-right').click();
  await expect(row('Владелец.Код')).toBeVisible();
  await expect(row('Владелец.Ссылка.Код')).toHaveCount(0);
  await row('Владелец').locator('.codicon-chevron-down').click();
  await expect(row('Владелец.Код')).toHaveCount(0);
  await expect(row('Ссылка.Код')).toBeVisible();
  await nested.getByRole('button', { name: 'Отмена', exact: true }).click();
  await expect(nested).toBeHidden();
  expect(errors).toEqual([]);
});

test('Expression tree expands self and mutual references only along explicit paths', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await prepare(page);
  await page.locator('button[title="Добавить поле (произвольное выражение)"]').click();
  const tree = page.getByTestId('expr-fields-tree');
  const row = (path: string) => tree.locator(`[data-row-key="s:А/${path}"]`);
  await expect(row('Ссылка')).toBeVisible();
  await expect(row('Ссылка/Код')).toHaveCount(0);
  await row('Ссылка').locator('[data-chevron]').click();
  await row('Ссылка/Ссылка').locator('[data-chevron]').click();
  await expect(row('Ссылка/Ссылка/Код')).toBeVisible();
  await expect(row('Ссылка/Ссылка/Ссылка/Код')).toHaveCount(0);
  await row('Другой').locator('[data-chevron]').click();
  await row('Другой/Назад').locator('[data-chevron]').click();
  await expect(row('Другой/Назад/Код')).toBeVisible();
  await expect(row('Другой/Назад/Другой/Назад')).toHaveCount(0);
  await row('Другой/Назад/Код').dblclick();
  await expect(page.getByTestId('expr-editor')).toContainText('А.Другой.Назад.Код');
  await page.getByTestId('expr-fields-search').fill('Код');
  await expect(row('Код')).toBeVisible();
  await expect(row('Ссылка/Код')).toHaveCount(0);
  await page.getByTestId('expr-fields-search').fill('');
  await row('Ссылка').locator('[data-chevron]').click();
  await expect(row('Ссылка/Код')).toHaveCount(0);
  await expect(row('Другой/Назад/Код')).toBeVisible();
  expect(errors).toEqual([]);
});
