import { test, expect, type Page, type Locator } from '@playwright/test';

async function openFields(page: Page) {
  await page.goto('http://localhost:5555/?locale=uk');
  await expect(page.getByTestId('loading-overlay')).toBeHidden();
  await page.evaluate(() => {
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'metadataTree', tables: [{
      kind: 'Справочник', name: 'Аптеки', fullName: 'Справочник.Аптеки', fields: [
        { name: 'Ссылка', kind: 'standard', types: [{ ref: { kind: 'Справочник', name: 'Аптеки' } }] },
        { name: 'Код', kind: 'standard', types: [{ primitive: 'Строка' }] },
        { name: 'ОченьДлинноеНазваниеПоляДляПроверкиОбрезания', kind: 'attribute', types: [] },
      ],
    }] } }));
  });
  await page.evaluate(() => window.dispatchEvent(new MessageEvent('message', { data: { type: 'loadModel',
    text: 'ВЫБРАТЬ А.Ссылка КАК Аптека, А.Код, А.ОченьДлинноеНазваниеПоляДляПроверкиОбрезания, Б.Код КАК ВторойКод ИЗ Справочник.Аптеки КАК А, Справочник.Аптеки КАК Б',
  } })));
  await expect(page.locator('[data-field-idx="0"]')).toBeVisible();
}

async function payload(row: Locator) {
  return row.evaluate(el => {
    const dt = new DataTransfer();
    el.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    return JSON.parse(dt.getData('text/plain'));
  });
}

test('Classic field sources share table groups, row geometry and preserve drag identities', async ({ page }, info) => {
  await openFields(page);
  await page.getByRole('button', { name: 'Запит', exact: true }).click();
  const before = await page.locator('[data-testid="query-text-editor"] .cm-content').textContent();
  await page.locator('button[title="Закрити"]').click();
  let referencePayload: unknown;
  let geometry: unknown;
  for (const [tab, source] of [
    ['Группировка', 'grouping-source'], ['Порядок', 'order-source'], ['Итоги', 'totals-source'],
    ['Условия', 'conditions-source:А'], ['Построитель', 'builder-source'],
  ]) {
    await page.locator(`[data-tab="${tab}"]`).click();
    const panel = page.locator(`[data-field-source="${source}"]`);
    const group = panel.locator('[data-field-group="А"]');
    const row = group.locator('[data-field-item][title="А.Ссылка"]');
    await expect(row).toBeVisible();
    await expect(row.locator('.codicon-references')).toBeVisible();
    await expect(row).toContainText(tab === 'Построитель' ? 'Аптека' : 'Ссылка');
    const currentGeometry = await row.evaluate(el => {
      const style = getComputedStyle(el);
      return [style.paddingLeft, style.paddingTop, style.paddingBottom, style.gap, style.fontSize, style.height];
    });
    if (geometry) expect(currentGeometry).toEqual(geometry);
    else geometry = currentGeometry;
    const data = await payload(row);
    if (tab === 'Построитель') expect(data).toEqual({ ref: 'Аптека', isRef: true });
    else if (referencePayload) expect(data).toEqual(referencePayload);
    else referencePayload = data;
    if (tab === 'Условия') {
      await row.locator('.codicon-chevron-right').click();
      await page.evaluate(() => window.dispatchEvent(new MessageEvent('message', { data: {
        type: 'refFields', ref: { kind: 'Справочник', name: 'Аптеки' },
        fields: [{ name: 'Код', kind: 'standard', types: [{ primitive: 'Строка' }] }],
      } })));
      const nested = group.locator('[data-field-item][title="А.Ссылка.Код"]');
      await expect(nested).toBeVisible();
      expect(await payload(nested)).toEqual({ ...data, path: 'Ссылка.Код' });
    }
    const heading = group.getByRole('button', { name: 'А', exact: true });
    await heading.focus();
    await heading.press('ArrowLeft');
    await expect(row).toBeHidden();
    await heading.press('ArrowRight');
    await expect(row).toBeVisible();
    const long = group.locator('[data-field-item][title="А.ОченьДлинноеНазваниеПоляДляПроверкиОбрезания"]');
    await expect(long).toBeVisible();
    await expect(long.locator('span').filter({ hasText: 'ОченьДлинное' })).toHaveCSS('text-overflow', 'ellipsis');
    await page.screenshot({ path: info.outputPath(`${source.replace(':', '-')}.png`) });
  }
  await page.locator('[data-tab="Таблицы и поля"]').click();
  await expect(page.locator('[data-field-idx]')).toHaveCount(4);
  await page.getByRole('button', { name: 'Запит', exact: true }).click();
  const text = page.getByTestId('query-text-editor');
  await expect(text).toContainText('А.Ссылка КАК Аптека');
  await expect(text).toContainText('Б.Код КАК ВторойКод');
  expect(await text.locator('.cm-content').textContent()).toBe(before);
});

test('Classic Builder keeps alias addressing on add and qualified addressing in conditions', async ({ page }) => {
  await openFields(page);
  await page.locator('[data-tab="Построитель"]').click();
  const row = page.locator('[data-field-source="builder-source"] [title="А.Ссылка"]');
  await row.getByRole('button', { name: 'Додати', exact: true }).click();
  await page.locator('[data-subtab="conditions"]').click();
  expect(await payload(row)).toEqual({ ref: 'А.Ссылка', isRef: true });
  await row.getByRole('button', { name: 'Додати', exact: true }).click();
  await page.getByRole('button', { name: 'Запит', exact: true }).click();
  const text = page.getByTestId('query-text-editor');
  await expect(text).toContainText(/\{ВЫБРАТЬ\s+Аптека/);
  await expect(text).toContainText(/\{ГДЕ\s+А\.Ссылка/);
});

test('Classic index field tree preserves selection and transfer', async ({ page }) => {
  await openFields(page);
  await page.evaluate(() => window.dispatchEvent(new MessageEvent('message', { data: { type: 'loadModel',
    text: 'ВЫБРАТЬ А.Ссылка КАК Аптека, А.Код ПОМЕСТИТЬ ВТ ИЗ Справочник.Аптеки КАК А',
  } })));
  await page.locator('[data-tab="Индексы"]').click();
  await page.getByRole('button', { name: 'Додати індекс', exact: true }).click();
  const source = page.locator('[data-field-source="index-source"]');
  const row = source.locator('[data-field-item][title="А.Ссылка"]');
  await expect(row).toContainText('Аптека');
  await expect(row.locator('.codicon-references')).toBeVisible();
  await row.click();
  await expect(row).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Додати вибране поле', exact: true }).click();
  await expect(row).toHaveCount(0);
  await page.getByRole('button', { name: 'Запит', exact: true }).click();
  await expect(page.getByTestId('query-text-editor')).toContainText('ИНДЕКСИРОВАТЬ ПО');
  await expect(page.getByTestId('query-text-editor')).toContainText('Аптека');
});
