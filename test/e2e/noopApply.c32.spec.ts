/**
 * C32 Safe Apply / No-op Apply, webview side: once per host load (`loadModel.loadId`)
 * the designer reports `baseline` — the text Apply would write right after the open.
 * Without edits, OK / Save sends exactly that text (the host then closes without
 * writing); any real change, including the Classic "Save comments" choice, sends a
 * different one. Host behaviour: test/vscode-integration/noopApply.test.ts; the
 * comment-loss consent path: test/unit/designerSession.baseline.c32.test.ts.
 */
import { test, expect, type Page } from '@playwright/test';

type Surface = 'classic' | 'canvas';
type Msg = { type: string; text?: string; loadId?: number };
const BASE = 'http://localhost:5555';

const SIMPLE = 'ВЫБРАТЬ В.Код КАК Код,\n   В.Наименование ИЗ Справочник.Валюты КАК В ГДЕ В.Код = &Код';
const UNION = 'ВЫБРАТЬ В.Код КАК Код ИЗ Справочник.Валюты КАК В ОБЪЕДИНИТЬ ВСЕ ВЫБРАТЬ Б.Ссылка ИЗ Справочник.Бригады КАК Б';
const BATCH = 'ВЫБРАТЬ В.Код КАК Код ПОМЕСТИТЬ ВТ ИЗ Справочник.Валюты КАК В;\nВЫБРАТЬ ВТ.Код КАК Код ИЗ ВТ КАК ВТ';
const COMMENTED = 'ВЫБРАТЬ\n\tВ.Код КАК Код // код валюты\nИЗ\n\tСправочник.Валюты КАК В';

async function open(page: Page, surface: Surface, text: string, loadId: number | null = 1): Promise<void> {
  await page.goto(`${BASE}/?surface=${surface}`);
  await expect(page.getByTestId(surface === 'canvas' ? 'canvas-loading-overlay' : 'loading-overlay')).toBeHidden();
  await page.evaluate(({ text, loadId }) => {
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'loadModel', text, ...(loadId === null ? {} : { loadId }) } }));
  }, { text, loadId });
}

const messages = (page: Page): Promise<Msg[]> =>
  page.evaluate(() => (window as unknown as { __webviewMessages: Msg[] }).__webviewMessages);

async function baselines(page: Page): Promise<Msg[]> {
  return (await messages(page)).filter(m => m.type === 'baseline');
}

async function onlyBaseline(page: Page, loadId = 1): Promise<string> {
  await expect.poll(async () => (await baselines(page)).length).toBe(1);
  const [b] = await baselines(page);
  expect(b.loadId).toBe(loadId);
  return b.text!;
}

async function apply(page: Page, surface: Surface): Promise<string> {
  await page.getByRole('button', { name: surface === 'canvas' ? 'Сохранить' : 'ОК', exact: true }).click();
  await expect.poll(async () => (await messages(page)).filter(m => m.type === 'insertText').length).toBe(1);
  return (await messages(page)).find(m => m.type === 'insertText')!.text!;
}

async function editAlias(page: Page, surface: Surface, alias: string): Promise<void> {
  if (surface === 'canvas') {
    await page.getByRole('button', { name: /Поля$/ }).click();
    await page.getByPlaceholder('Псевдоним', { exact: true }).first().fill(alias);
  } else {
    await page.locator('[data-tab="Объединения/Псевдонимы"]').click();
    const input = page.locator('input').filter({ visible: true }).last();
    await input.fill(alias);
    await input.press('Tab');
  }
}

for (const surface of ['classic', 'canvas'] as const) {
  test.describe(`C32 ${surface}`, () => {
    for (const [name, text] of [['a simple query', SIMPLE], ['UNION', UNION], ['a batch with a temp table', BATCH]] as const) {
      test(`${name}: an unchanged Apply sends exactly the reported baseline`, async ({ page }) => {
        await open(page, surface, text);
        const baseline = await onlyBaseline(page);
        expect(baseline).not.toBe(text);
        expect(await apply(page, surface)).toBe(baseline);
        expect(await baselines(page)).toHaveLength(1);
      });
    }

    test('an edit sends a text different from the baseline', async ({ page }) => {
      await open(page, surface, SIMPLE);
      const baseline = await onlyBaseline(page);
      await editAlias(page, surface, 'КодИзменён');
      const applied = await apply(page, surface);
      expect(applied).not.toBe(baseline);
      expect(applied).toContain('КодИзменён');
    });

    test('a load without an id reports nothing (the host then keeps the current Apply)', async ({ page }) => {
      await open(page, surface, SIMPLE, null);
      await expect(page.getByRole('button', { name: surface === 'canvas' ? 'Сохранить' : 'ОК', exact: true })).toBeEnabled();
      expect(await baselines(page)).toHaveLength(0);
    });

    test('a load that fails to open reports nothing', async ({ page }) => {
      await open(page, surface, 'ВЫБРАТЬ ИЗ ИЗ');
      await expect(page.getByTestId(surface === 'canvas' ? 'canvas-load-error' : 'load-error')).toBeVisible();
      expect(await baselines(page)).toHaveLength(0);
    });

    // Comment loss (consent, then load) is reached only with a simulated renderer
    // regression: test/unit/designerSession.baseline.c32.test.ts.

    test('a second host load reports again under its own id', async ({ page }) => {
      await open(page, surface, SIMPLE, 1);
      await onlyBaseline(page, 1);
      await page.evaluate(text => {
        window.dispatchEvent(new MessageEvent('message', { data: { type: 'loadModel', text, loadId: 2 } }));
      }, UNION);
      await expect.poll(async () => (await baselines(page)).map(b => b.loadId)).toEqual([1, 2]);
    });
  });
}

test.describe('C32 classic', () => {
  test('navigating batch queries and union members is not a change', async ({ page }) => {
    await open(page, 'classic', `${UNION};\n${BATCH}`);
    const baseline = await onlyBaseline(page);
    const side = page.getByTestId('side-strip').locator('> *');
    const count = await side.count();
    for (let i = count - 1; i >= 0; i--) await side.nth(i).click();
    const members = page.locator('[data-union-query]');
    for (let i = (await members.count()) - 1; i >= 0; i--) await members.nth(i).click();
    expect(await apply(page, 'classic')).toBe(baseline);
  });

  test('"Save comments": off is a change, back on is not', async ({ page }) => {
    await open(page, 'classic', COMMENTED);
    const baseline = await onlyBaseline(page);
    expect(baseline).toContain('// код валюты');
    await page.locator('[data-tab="Дополнительно"]').click();
    const checkbox = page.getByRole('checkbox', { name: /комментари/i });
    await checkbox.uncheck();
    await checkbox.check();
    expect(await apply(page, 'classic')).toBe(baseline);
  });

  test('"Save comments" off sends the text without comments', async ({ page }) => {
    await open(page, 'classic', COMMENTED);
    const baseline = await onlyBaseline(page);
    await page.locator('[data-tab="Дополнительно"]').click();
    await page.getByRole('checkbox', { name: /комментари/i }).uncheck();
    const applied = await apply(page, 'classic');
    expect(applied).not.toBe(baseline);
    expect(applied).not.toContain('// код валюты');
  });
});
