import { test, expect, type Page } from '@playwright/test';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import type { MetaTable } from '../../src/core/metadata/types';

type Surface = 'classic' | 'canvas';
const BASE = 'http://localhost:5555';
const query = 'ВЫБРАТЬ В.Код КАК Код, В.Наименование КАК Название ИЗ Справочник.Валюты КАК В ГДЕ В.Код = &Код УПОРЯДОЧИТЬ ПО В.Код';

async function open(page: Page, surface: Surface, text: string, tables?: MetaTable[]): Promise<void> {
  await page.goto(`${BASE}/?surface=${surface}`);
  await expect(page.getByTestId(surface === 'canvas' ? 'canvas-loading-overlay' : 'loading-overlay')).toBeHidden();
  await page.evaluate(({ text, tables }) => {
    if (tables) window.dispatchEvent(new MessageEvent('message', { data: { type: 'metadataTree', tables } }));
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'loadModel', text } }));
  }, { text, tables });
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
    test(`${surface}: arithmetic ORDER keys survive alias edit and save/reopen (C21)`, async ({ page }) => {
      const tables: MetaTable[] = [{
        kind: 'РегистрНакопления', name: 'Продажи', fullName: 'РегистрНакопления.Продажи',
        fields: ['Количество', 'Сумма'].map(name => ({ name, kind: 'resource', types: [{ primitive: 'Число' }] })),
      }];
      const input = 'ВЫБРАТЬ Т.Количество КАК Количество ИЗ РегистрНакопления.Продажи КАК Т ' +
        'УПОРЯДОЧИТЬ ПО Т.Количество + 1 УБЫВ, Т.Количество * Т.Сумма, (Т.Количество + 1), -Т.Количество УБЫВ';
      await open(page, surface, input, tables);
      if (surface === 'canvas') {
        await page.getByRole('button', { name: /Поля$/ }).click();
        await page.getByPlaceholder('Псевдоним', { exact: true }).first().fill('НовоеКоличество');
      } else {
        await page.locator('[data-tab="Объединения/Псевдонимы"]').click();
        const alias = page.locator('input').filter({ visible: true }).last();
        await alias.fill('НовоеКоличество');
        await alias.press('Tab');
      }
      const output = await save(page, surface);
      const model = parseBatch(output).members[0].members[0].model;
      expect(model.fields[0].alias).toBe('НовоеКоличество');
      expect(model.order!.fields).toEqual([
        { tableId: '', path: '', expression: 'Т.Количество + 1', direction: 'desc' },
        { tableId: '', path: '', expression: 'Т.Количество * Т.Сумма', direction: 'asc' },
        // The existing formatter removes redundant outer parentheses.
        { tableId: '', path: '', expression: 'Т.Количество + 1', direction: 'asc' },
        { tableId: '', path: '', expression: '-Т.Количество', direction: 'desc' },
      ]);
      await open(page, surface, output, tables);
      expect(await save(page, surface)).toBe(output);
    });
  }

  for (const surface of ['classic', 'canvas'] as const) {
    for (const property of ['trailingFields', 'characteristics'] as const) {
      test(`${surface}: ${property} survives alias edit and save/reopen (C10)`, async ({ page }) => {
        const tables: MetaTable[] = [{
          kind: 'Справочник', name: 'Заказы', fullName: 'Справочник.Заказы',
          fields: [
            { name: 'Ссылка', kind: 'standard', types: [] },
            { name: 'Предопределенный', kind: 'standard', types: [{ primitive: 'Булево' }] },
          ],
          tabularSections: [{
            kind: 'ТабличнаяЧасть', name: 'Товары', fullName: 'Справочник.Заказы.Товары',
            fields: [{ name: 'Количество', kind: 'attribute', types: [{ primitive: 'Число' }] }],
          }],
        }];
        const input = property === 'trailingFields'
          ? 'ВЫБРАТЬ З.Ссылка КАК Ссылка, З.Товары.(Количество) КАК Товары, З.Предопределенный КАК Хвост ИЗ Справочник.Заказы КАК З'
          : 'ВЫБРАТЬ 1 КАК Число {ХАРАКТЕРИСТИКИ ТИП(Справочник.Валюты)}';
        await open(page, surface, input, tables);
        if (surface === 'canvas') {
          await page.getByRole('button', { name: /Поля$/ }).click();
          await page.getByPlaceholder('Псевдоним', { exact: true }).first().fill('НовоеИмя');
        } else {
          await page.locator('[data-tab="Объединения/Псевдонимы"]').click();
          const alias = page.locator('input').filter({ visible: true }).last();
          await alias.fill('НовоеИмя');
          await alias.press('Tab');
        }
        const expected = parseBatch(input);
        expect(expected.members[0].members[0].model[property]).toBeDefined();
        expected.members[0].members[0].model.fields[0].alias = 'НовоеИмя';
        const output = await save(page, surface);
        expect(output).toBe(generateBatch(expected));
        await open(page, surface, output, tables);
        expect(await save(page, surface)).toBe(output);
      });
    }
  }

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

test.describe('C12: unterminated characteristics never reach Apply', () => {
  for (const surface of ['classic', 'canvas'] as const) {
    for (const block of [
      '{ХАРАКТЕРИСТИКИ ТИП(Справочник.Валюты)',
      '{ХАРАКТЕРИСТИКИ {ТИП(Справочник.Валюты)}',
    ]) {
      test(`${surface}: rejects ${block}`, async ({ page }) => {
        await open(page, surface, 'ВЫБРАТЬ 1 КАК Число ' + block);
        await expect(page.getByText(/ожидался символ «}»/)).toBeVisible();
        expect(await insertions(page)).toEqual([]);
        await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
        const messages = await page.evaluate(() => (window as any).__webviewMessages.map((m: any) => m.type));
        expect(messages).toContain('cancel');
        expect(messages).not.toContain('insertText');
      });
    }
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

test.describe('C11: malformed VT and ПЕРИОДАМИ slots disable Apply with an explanation', () => {
  const CLASSIC_REASON = 'Произвольное условие или выражение выглядит синтаксически некорректным. Применение заблокировано';
  const CANVAS_REASON = 'Произвольное условие или выражение выглядит синтаксически некорректным. Сохранение заблокировано';
  for (const surface of ['classic', 'canvas'] as const) {
    for (const [name, input] of [
      ['VT condition', 'ВЫБРАТЬ Т.Период ИЗ РегистрСведений.Курсы.СрезПоследних(, Код = = &Код) КАК Т'],
      ['ПЕРИОДАМИ', 'ВЫБРАТЬ 1 КАК Число ИТОГИ ПО Число ПЕРИОДАМИ(Месяц, &А = = 1, &Б)'],
    ] as const) {
      test(`${surface}: ${name} stays disabled with a reason and no insertText`, async ({ page }) => {
        await open(page, surface, input);
        if (surface === 'classic') {
          const err = page.locator('[data-testid="ok-error"]');
          await expect(err).toBeVisible();
          await expect(err).toContainText(CLASSIC_REASON);
          await expect(page.getByRole('button', { name: 'ОК', exact: true })).toBeDisabled();
        } else {
          const saveBtn = page.getByRole('button', { name: 'Сохранить', exact: true });
          await expect(saveBtn).toBeDisabled();
          await expect(saveBtn).toHaveAttribute('title', new RegExp(CANVAS_REASON));
        }
        expect(await insertions(page)).toEqual([]);
      });
    }
  }
});


test.describe('Canvas feature baseline: source editing', () => {
  async function enter(page: Page, alias: string) {
    await page.locator(`[data-testid="canvas-source-card"][data-source-alias="${alias}"]:visible`).click({ position: { x: 80, y: 20 } });
    await page.getByTestId('canvas-edit-source').filter({ visible: true }).last().click();
    return page.getByTestId('canvas-source-query-editor').filter({ visible: true }).last();
  }

  test('Classic → Canvas recursive source/JOIN edit → back → Save → reopen', async ({ page }) => {
    const input = 'ВЫБРАТЬ П.Код КАК Код ИЗ (ВЫБРАТЬ В.Код КАК Код ИЗ (ВЫБРАТЬ А.Код КАК Код ИЗ Справочник.Валюты КАК А ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Валюты КАК Б ПО А.Код = Б.Код ГДЕ А.Код = &Код) КАК В) КАК П';
    await open(page, 'classic', input);
    const classic = await save(page, 'classic');
    await open(page, 'canvas', classic);
    const parentCard = page.locator('[data-source-alias="П"]');
    await parentCard.click({ position: { x: 80, y: 20 } });
    const before = await parentCard.boundingBox();
    let nested = await enter(page, 'П');
    await expect(nested.getByTestId('package-switcher')).toHaveCount(0);
    nested = await enter(page, 'В');
    await nested.getByRole('button', { name: /Условия$/ }).click();
    await nested.getByLabel('Использовать как произвольное выражение').check();
    await nested.locator('textarea:visible').fill('А.Код = &ИзCanvas');
    await nested.getByTestId('canvas-source-back').click();
    await page.getByTestId('canvas-source-query-editor').getByTestId('canvas-source-back').click();
    await expect(page.getByTestId('canvas-edit-source')).toBeVisible();
    expect(await parentCard.boundingBox()).toEqual(before);
    const output = await save(page, 'canvas');
    const inner = parseBatch(output).members[0].members[0].model.tables[0].subquery!.members[0].model.tables[0].subquery!.members[0].model;
    expect(inner.conditions![0]).toEqual(expect.objectContaining({ path: 'Код', param: '&ИзCanvas' }));
    expect(inner.joins).toHaveLength(1);
    await open(page, 'canvas', output);
    expect(await save(page, 'canvas')).toBe(output);
    await open(page, 'classic', output);
    expect(await save(page, 'classic')).toBe(output);
  });

  test('cancel preserves parent; malformed nested edit refuses back and produces no insertion', async ({ page }) => {
    const input = 'ВЫБРАТЬ П.Код ИЗ (ВЫБРАТЬ В.Код КАК Код ИЗ Справочник.Валюты КАК В ГДЕ В.Код = &Код) КАК П';
    await open(page, 'canvas', input);
    const nested = await enter(page, 'П');
    await nested.getByRole('button', { name: /Условия$/ }).click();
    await nested.locator('textarea:visible').fill('В.Код = = &Код');
    await expect(nested.getByTestId('canvas-source-back')).toBeDisabled();
    expect(await insertions(page)).toEqual([]);
    await nested.getByRole('button', { name: 'Отмена', exact: true }).click();
    expect(await save(page, 'canvas')).toBe(generateBatch(parseBatch(input)));
  });

  test('referenced exported columns cannot be silently pruned by Back', async ({ page }) => {
    const input = 'ВЫБРАТЬ П.Код ИЗ (ВЫБРАТЬ В.Код КАК Код ИЗ Справочник.Валюты КАК В) КАК П';
    await open(page, 'canvas', input);
    const nested = await enter(page, 'П');
    await nested.getByRole('button', { name: /Поля$/ }).click();
    await nested.getByPlaceholder('Псевдоним', { exact: true }).fill('ДругойКод');
    await nested.getByTestId('canvas-source-back').click();
    await expect(nested.getByRole('alert')).toContainText('Родительский запрос использует удаляемые столбцы');
    expect(await insertions(page)).toEqual([]);
    await nested.getByRole('button', { name: 'Отмена', exact: true }).click();
    expect(await save(page, 'canvas')).toBe(generateBatch(parseBatch(input)));
  });

  test('unchanged navigation columns survive nested Back and Save/reopen (C19)', async ({ page }) => {
    const input = 'ВЫБРАТЬ П.Ссылка.Код КАК Код ИЗ (ВЫБРАТЬ В.Ссылка КАК Ссылка ИЗ Справочник.Валюты КАК В) КАК П';
    await open(page, 'canvas', input);
    const nested = await enter(page, 'П');
    await nested.getByRole('button', { name: /Дополнительно$/ }).click();
    await nested.getByLabel('Только разрешённые записи (РАЗРЕШЕННЫЕ)').check();
    await nested.getByTestId('canvas-source-back').click();
    const output = await save(page, 'canvas');
    expect(parseBatch(output).members[0].members[0].model.fields[0].path).toBe('Ссылка.Код');
    await open(page, 'canvas', output);
    expect(await save(page, 'canvas')).toBe(output);
  });

  test('nested UNION in a package survives a condition edit and Save/reopen', async ({ page }) => {
    const input = 'ВЫБРАТЬ П.Код КАК Код ПОМЕСТИТЬ ВТ ИЗ (ВЫБРАТЬ В.Код КАК Код ИЗ Справочник.Валюты КАК В ГДЕ В.Код = &Код ОБЪЕДИНИТЬ ВСЕ ВЫБРАТЬ Б.Код ИЗ Справочник.Валюты КАК Б) КАК П; ВЫБРАТЬ Т.Код ИЗ ВТ КАК Т; УНИЧТОЖИТЬ ВТ';
    await open(page, 'canvas', input);
    const nested = await enter(page, 'П');
    await nested.getByRole('button', { name: /Условия$/ }).click();
    await nested.locator('textarea:visible').fill('В.Код = &Пакет');
    await nested.getByTestId('canvas-source-back').click();
    const output = await save(page, 'canvas');
    const batch = parseBatch(output);
    expect(batch.members).toHaveLength(3);
    const producer = batch.members[0].members[0].model;
    expect(producer.queryType).toBe('createTemp');
    expect(producer.tables[0].subquery!.members).toHaveLength(2);
    expect(producer.tables[0].subquery!.members[0].model.conditions![0].expression).toBe('В.Код = &Пакет');
    await open(page, 'canvas', output);
    expect(await save(page, 'canvas')).toBe(output);
  });

  test('create a source subquery and a manual temp description through the source browser', async ({ page }) => {
    await open(page, 'canvas', 'ВЫБРАТЬ 1 КАК Число');
    await page.getByRole('button', { name: /Источник$/, exact: false }).click();
    await page.getByRole('button', { name: 'Новый подзапрос', exact: true }).click();
    const nested = page.getByTestId('canvas-source-query-editor');
    await nested.getByRole('button', { name: /Поля$/ }).click();
    await nested.getByRole('button', { name: /Добавить выражение$/ }).click();
    await nested.locator('textarea:visible').fill('2');
    await nested.getByTestId('canvas-source-back').click();
    await page.getByRole('button', { name: /Источник$/, exact: false }).click();
    await page.getByRole('button', { name: 'Описать временную таблицу', exact: true }).click();
    await page.getByTestId('tt-name').fill('ВнешняяВТ');
    await page.getByTestId('tt-field-name-0').fill('Код');
    await page.getByTestId('tt-ok').click();
    const output = await save(page, 'canvas');
    const model = parseBatch(output).members[0].members[0].model;
    expect(model.tables).toHaveLength(2);
    expect(model.tables[0].subquery!.members[0].model.fields[0].expression).toBe('2');
    expect(model.tables[1].fullName).toBe('ВнешняяВТ');
    await open(page, 'canvas', output);
    expect(await save(page, 'canvas')).toBe(output);
  });

  test('nested Fields, Grouping, Sorting and Additional use shared actions', async ({ page }) => {
    const input = 'ВЫБРАТЬ П.Код ИЗ (ВЫБРАТЬ В.Код КАК Код, В.Наименование КАК Название ИЗ Справочник.Валюты КАК В СГРУППИРОВАТЬ ПО В.Код, В.Наименование УПОРЯДОЧИТЬ ПО В.Код) КАК П';
    await open(page, 'canvas', input);
    const nested = await enter(page, 'П');
    await nested.getByRole('button', { name: /Поля$/ }).click();
    await nested.getByPlaceholder('Псевдоним', { exact: true }).nth(1).fill('Описание');
    await nested.getByRole('button', { name: /Группировка$/ }).click();
    await expect(nested.locator('table:visible tbody tr')).toHaveCount(2);
    await nested.getByRole('button', { name: /Сортировка$/ }).click();
    await nested.locator('table:visible select').selectOption('desc');
    await nested.getByRole('button', { name: /Дополнительно$/ }).click();
    await nested.getByLabel('Только разрешённые записи (РАЗРЕШЕННЫЕ)').check();
    await expect(nested.getByText('Тип запроса', { exact: true })).toHaveCount(0);
    await nested.getByTestId('canvas-source-back').click();
    const output = await save(page, 'canvas');
    const model = parseBatch(output).members[0].members[0].model.tables[0].subquery!.members[0].model;
    expect(model.fields[1].alias).toBe('Описание');
    expect(model.selection!.allowed).toBe(true);
    expect(model.grouping!.groupFields).toHaveLength(2);
    expect(model.order!.fields[0].direction).toBe('desc');
    await open(page, 'classic', output);
    expect(await save(page, 'classic')).toBe(output);
  });

  test('manual temporary source edit uses the existing description and reopens', async ({ page }) => {
    const input = 'ВЫБРАТЬ Т.Код КАК Код ИЗ ВнешняяВТ КАК Т';
    await open(page, 'canvas', input);
    await page.locator('[data-source-alias="Т"]').click({ position: { x: 80, y: 20 } });
    await page.getByTestId('canvas-edit-source').click();
    await page.getByTestId('tt-name').fill('НоваяВТ');
    await page.getByTestId('tt-add-row').click();
    await page.getByTestId('tt-field-name-1').fill('Описание');
    await page.getByTestId('tt-ok').click();
    const output = await save(page, 'canvas');
    const model = parseBatch(output).members[0].members[0].model;
    expect(model.tables[0].fullName).toBe('НоваяВТ');
    expect(model.tables[0].alias).toBe('Т');
    expect(model.fields[0].path).toBe('Код');
    await open(page, 'canvas', output);
    expect(await save(page, 'canvas')).toBe(output);
  });
});


const conditionCommentQuery = 'ВЫБРАТЬ Т.Код КАК Код, КОЛИЧЕСТВО(*) КАК Н ИЗ Справочник.Валюты КАК Т ' +
  'ГДЕ\n// where leading\nТ.Код = &А // where first\nИ Т.Код = &Б // repeated\n' +
  'СГРУППИРОВАТЬ ПО Т.Код ИМЕЮЩИЕ\n// having leading\nКОЛИЧЕСТВО(*) > 1 // having first\nИ СУММА(1) > 0 // repeated\nУПОРЯДОЧИТЬ ПО Т.Код';

for (const surface of ['classic', 'canvas'] as const) {
  test(`${surface}: C17 WHERE/HAVING comments survive alias edit, Save and reopen without consent`, async ({ page }) => {
    await open(page, surface, conditionCommentQuery);
    await expect(page.getByTestId('comment-loss-confirm')).toBeHidden();
    if (surface === 'canvas') {
      await page.getByRole('button', { name: /Поля$/ }).click();
      await page.getByPlaceholder('Псевдоним', { exact: true }).first().fill('НовыйКод');
    } else {
      await page.locator('[data-tab="Объединения/Псевдонимы"]').click();
      const alias = page.getByRole('table').nth(1).getByRole('textbox').first();
      await alias.fill('НовыйКод');
      await alias.press('Tab');
    }
    const output = await save(page, surface);
    for (const text of ['// where leading', '// where first', '// having leading', '// having first']) {
      expect(output.split(text)).toHaveLength(2);
      expect(output).toContain(`\n\t${text}`);
    }
    expect(output).toContain('ГДЕ\n\t// where leading\n\tТ.Код = &А');
    expect(output).toContain('ИМЕЮЩИЕ\n\t// having leading\n\tКОЛИЧЕСТВО(*) > 1');
    expect(output.split('// repeated')).toHaveLength(3);
    expect(parseBatch(output).members[0].members[0].model.fields[0].alias).toBe('НовыйКод');
    await open(page, surface, output);
    await expect(page.getByTestId('comment-loss-confirm')).toBeHidden();
    expect(await save(page, surface)).toBe(output);
  });
}

for (const v2 of [false, true]) {
  test(`Classic text v2=${v2}: C17 WHERE/HAVING Apply preserves comments without consent`, async ({ page }) => {
    await open(page, 'classic', query);
    if (v2) await page.evaluate(() => window.dispatchEvent(new MessageEvent('message', { data: { type: 'init', hasInitialQuery: false, queryTextEditorV2: true, locale: 'ru' } })));
    await page.getByRole('button', { name: 'Запрос', exact: true }).click();
    const editor = page.locator('[data-testid="query-text-editor"] .cm-content');
    await editor.fill(conditionCommentQuery);
    await page.getByRole('button', { name: 'Применить', exact: true }).click();
    await expect(editor).toBeHidden();
    await expect(page.getByTestId('comment-loss-confirm')).toBeHidden();
    expect(await insertions(page)).toEqual([]);
    expect(await save(page, 'classic')).toBe(generateBatch(parseBatch(conditionCommentQuery, undefined, { preserveComments: true })));
  });
}

for (const surface of ['classic', 'canvas'] as const) {
  test(`${surface}: C17 blank raw-condition continuation has no slot whitespace after three Save/reopens`, async ({ page }) => {
    const input = 'ВЫБРАТЬ Т.Код КАК А ИЗ Справочник.Валюты КАК Т ' +
      'ГДЕ Т.Код = 2 // c2\n \t\nИЛИ Т.Код = 3';
    await open(page, surface, input);
    const first = await save(page, surface);
    expect(first).toContain('// c2\n\n\tИЛИ Т.Код = 3)');
    expect(first).not.toMatch(/\n[ \t]+\n/u);
    for (let reopen = 0; reopen < 3; reopen++) {
      await open(page, surface, first);
      expect(await save(page, surface)).toBe(first);
    }
  });
  const inner = 'ВЫБРАТЬ Т.Код КАК А ИЗ Справочник.Валюты КАК Т ГДЕ\n' +
    '// leading\nТ.Код = 2 // c2\nИЛИ Т.Код = 3 // trailing\n';
  for (const context of ['source', 'condition'] as const) {
    test(`${surface}: C17 ${context} subquery raw comments stay stable through three Save/reopens`, async ({ page }) => {
      const input = context === 'source'
        ? `ВЫБРАТЬ П.А КАК А ИЗ (${inner}) КАК П`
        : `ВЫБРАТЬ Т.Код КАК А ИЗ Справочник.Валюты КАК Т ГДЕ Т.Код В (${inner})`;
      await open(page, surface, input);
      await expect(page.getByTestId('comment-loss-confirm')).toBeHidden();
      const first = await save(page, surface);
      for (const comment of ['// leading', '// c2', '// trailing']) expect(first.split(comment)).toHaveLength(2);
      for (let reopen = 0; reopen < 3; reopen++) {
        await open(page, surface, first);
        await expect(page.getByTestId('comment-loss-confirm')).toBeHidden();
        expect(await save(page, surface)).toBe(first);
      }
    });
  }
}

// A comment on the ПОМЕСТИТЬ line remains unsupported; consent still protects it.
const commentLossQuery = '// bound\nВЫБРАТЬ В.Код КАК Код ПОМЕСТИТЬ ВТ // lost\nИЗ Справочник.Валюты КАК В ГДЕ В.Код = 1';

for (const surface of ['classic', 'canvas'] as const) {
  for (const cancel of ['button', 'Escape'] as const) {
    test(`${surface}: C17 warning ${cancel} keeps original text untouched`, async ({ page }) => {
      await open(page, surface, commentLossQuery);
      await expect(page.getByTestId('comment-loss-confirm')).toBeVisible();
      await expect(page.getByTestId('comment-loss-list').locator('pre')).toHaveText(['// lost']);
      await expect(page.getByTestId('comment-loss-cancel')).toBeFocused();
      await expect(page.getByRole('button', { name: surface === 'canvas' ? 'Сохранить' : 'ОК', exact: true })).toBeDisabled();
      await page.keyboard.press('Shift+Tab');
      await expect(page.getByTestId('comment-loss-continue')).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.getByTestId('comment-loss-cancel')).toBeFocused();
      expect(await insertions(page)).toEqual([]);
      if (cancel === 'Escape') await page.keyboard.press('Escape');
      else await page.getByTestId('comment-loss-cancel').click();
      expect(await insertions(page)).toEqual([]);
      expect(await page.evaluate(() => (window as unknown as { __webviewMessages: { type: string }[] }).__webviewMessages.filter(m => m.type === 'cancel').length)).toBe(1);
    });
  }
  test(`${surface}: C17 loads only after confirmation, writes only on Save`, async ({ page }) => {
    await open(page, surface, commentLossQuery);
    await page.getByTestId('comment-loss-continue').click();
    await expect(page.getByTestId('comment-loss-confirm')).toBeHidden();
    expect(await insertions(page)).toEqual([]);
    const output = await save(page, surface);
    expect(output).toBe(generateBatch(parseBatch(commentLossQuery, undefined, { preserveComments: true })));
    expect(output).toContain('// bound');
    expect(output).not.toContain('// lost');
    await open(page, surface, output);
    await expect(page.getByTestId('comment-loss-confirm')).toBeHidden();
    expect(await save(page, surface)).toBe(output);
  });
  test(`${surface}: C17 confirmation does not bypass malformed Save guard`, async ({ page }) => {
    await open(page, surface, commentLossQuery.replace('В.Код = 1', 'В.Код = = 1'));
    await page.getByTestId('comment-loss-continue').click();
    await expect(page.getByRole('button', { name: surface === 'canvas' ? 'Сохранить' : 'ОК', exact: true })).toBeDisabled();
    expect(await insertions(page)).toEqual([]);
  });
  test(`${surface}: C17 pending candidate is superseded by a new host load`, async ({ page }) => {
    await open(page, surface, commentLossQuery);
    await page.evaluate(text => window.dispatchEvent(new MessageEvent('message', { data: { type: 'loadModel', text } })), query);
    await expect(page.getByTestId('comment-loss-confirm')).toBeHidden();
    expect(await save(page, surface)).toBe(generateBatch(parseBatch(query)));
  });
}

for (const v2 of [false, true]) {
  for (const proceed of [false, true]) {
    test(`Classic text v2=${v2}: C17 ${proceed ? 'confirm' : 'cancel'} keeps model until consent`, async ({ page }) => {
      await open(page, 'classic', query);
      if (v2) await page.evaluate(() => window.dispatchEvent(new MessageEvent('message', { data: { type: 'init', hasInitialQuery: false, queryTextEditorV2: true, locale: 'ru' } })));
      await page.getByRole('button', { name: 'Запрос', exact: true }).click();
      const editor = page.locator('[data-testid="query-text-editor"] .cm-content');
      await editor.fill(commentLossQuery);
      await page.getByRole('button', { name: 'Применить', exact: true }).click();
      await expect(page.getByTestId('comment-loss-confirm')).toBeVisible();
      await expect(page.getByTestId('comment-loss-list').locator('pre')).toHaveText(['// lost']);
      expect(await insertions(page)).toEqual([]);
      if (proceed) {
        await page.getByTestId('comment-loss-continue').click();
        await expect(editor).toBeHidden();
      } else {
        await page.keyboard.press('Escape');
        await expect(page.getByTestId('comment-loss-confirm')).toBeHidden();
        await expect(editor).toBeVisible();
        expect(await editor.innerText()).toBe(commentLossQuery);
        if (v2) {
          await page.getByTestId('query-text-cancel').click();
          await page.getByRole('button', { name: 'Закрыть без сохранения', exact: true }).click();
        } else await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
      }
      const output = await save(page, 'classic');
      expect(output).toBe(generateBatch(parseBatch(proceed ? commentLossQuery : query, undefined, { preserveComments: true })));
    });
  }
}

for (const surface of ['classic', 'canvas'] as const) {
  test(`${surface}: C17 displays the first five lost comments literally and the remaining count`, async ({ page }) => {
    const lost = ['//  first  ', '// repeat', '// <b>literal</b>', '// repeat', '// fifth', '// sixth', '// seventh'];
    const input = '// repeat\nВЫБРАТЬ В.Код КАК А ПОМЕСТИТЬ ВТ ' + lost.join('\n') + '\nИЗ Справочник.Валюты КАК В';
    await open(page, surface, input);
    const list = page.getByTestId('comment-loss-list');
    await expect(list.locator('pre')).toHaveCount(5);
    expect(await list.locator('pre').allTextContents()).toEqual(lost.slice(0, 5));
    await expect(list.locator('b')).toHaveCount(0);
    await expect(list.locator('pre').first()).toHaveCSS('font-family', /monospace/);
    await expect(page.getByTestId('comment-loss-more')).toHaveText('Ещё 2');
    await expect(page.getByTestId('comment-loss-cancel')).toBeFocused();
    expect(await insertions(page)).toEqual([]);
    await page.evaluate(text => window.dispatchEvent(new MessageEvent('message', { data: { type: 'loadModel', text } })), commentLossQuery);
    await expect(list.locator('pre')).toHaveText(['// lost']);
    await expect(page.getByTestId('comment-loss-more')).toBeHidden();
    await page.getByTestId('comment-loss-continue').click();
    expect(await save(page, surface)).toBe(generateBatch(parseBatch(commentLossQuery, undefined, { preserveComments: true })));
  });
}

test.describe('Canvas feature baseline: contextual editors and preservation', () => {
  test('virtual parameters edit retains argument comments and Save/reopen', async ({ page }) => {
    const input = 'ВЫБРАТЬ Т.Период КАК Период ИЗ РегистрСведений.Курсы.СрезПоследних(&Дата, ИСТИНА // keep\n) КАК Т';
    await open(page, 'canvas', input);
    await page.locator('[data-source-alias="Т"]').click({ position: { x: 80, y: 20 } });
    await page.getByTestId('canvas-edit-source').click();
    await page.getByTestId('vt-period').fill('&НоваяДата');
    await page.getByTestId('vt-ok').click();
    const output = await save(page, 'canvas');
    expect(output).toContain('// keep');
    expect(parseBatch(output).members[0].members[0].model.tables[0].virtual!.period).toBe('&НоваяДата');
    await open(page, 'canvas', output);
    expect(await save(page, 'canvas')).toBe(output);
  });

  test('virtual parameter confirmation retains unsafe argument guard', async ({ page }) => {
    const input = 'ВЫБРАТЬ Т.Период ИЗ РегистрНакопления.Продажи.Обороты(&Начало, &Конец, Месяц, ИСТИНА, 1) КАК Т';
    await open(page, 'canvas', input);
    await expect(page.getByRole('button', { name: 'Сохранить', exact: true })).toBeDisabled();
    await page.locator('[data-source-alias="Т"]').click({ position: { x: 80, y: 20 } });
    await page.getByTestId('canvas-edit-source').click();
    await page.getByTestId('vt-start').fill('&НовыйНачало');
    await page.getByTestId('vt-ok').click();
    await expect(page.getByRole('button', { name: 'Сохранить', exact: true })).toBeDisabled();
    expect(await insertions(page)).toEqual([]);
  });

  test('manual temp confirmation refuses implicit deletion of referenced fields', async ({ page }) => {
    await open(page, 'canvas', 'ВЫБРАТЬ Т.Код ИЗ ВнешняяВТ КАК Т');
    await page.locator('[data-source-alias="Т"]').click({ position: { x: 80, y: 20 } });
    await page.getByTestId('canvas-edit-source').click();
    await page.getByTestId('tt-field-name-0').fill('ДругойКод');
    await page.getByTestId('tt-ok').click();
    await expect(page.getByRole('alert')).toBeVisible();
    await page.getByTestId('tt-cancel').click();
    const output = await save(page, 'canvas');
    expect(parseBatch(output).members[0].members[0].model.fields[0].path).toBe('Код');
  });

  test('TOTALS editing changes grand total and preserves ПЕРИОДАМИ', async ({ page }) => {
    const input = 'ВЫБРАТЬ 1 КАК Число ИТОГИ ПО ОБЩИЕ, Число ПЕРИОДАМИ(Месяц, 1, 2)';
    await open(page, 'canvas', input);
    await page.getByRole('button', { name: /Группировка$/ }).click();
    await page.getByTestId('canvas-open-totals').click();
    await page.getByLabel('Общие итоги').uncheck();
    const output = await save(page, 'canvas');
    const model = parseBatch(output).members[0].members[0].model;
    expect(model.totals!.grand).toBe(false);
    expect(output).toContain('ПЕРИОДАМИ(МЕСЯЦ, 1, 2)');
    await open(page, 'canvas', output);
    expect(await save(page, 'canvas')).toBe(output);
  });

  test('package producer index editing preserves consume/append/drop and reopens', async ({ page }) => {
    const input = 'ВЫБРАТЬ В.Код КАК Код ПОМЕСТИТЬ ВТ ИЗ Справочник.Валюты КАК В ИНДЕКСИРОВАТЬ ПО НАБОРАМ ((Код), (Код)); ВЫБРАТЬ Б.Код КАК Код ДОБАВИТЬ ВТ ИЗ Справочник.Валюты КАК Б; ВЫБРАТЬ Т.Код ИЗ ВТ КАК Т; УНИЧТОЖИТЬ ВТ';
    await open(page, 'canvas', input);
    await page.getByRole('button', { name: /Дополнительно$/ }).click();
    await page.getByTestId('canvas-open-indices').click();
    await page.locator('input[type="checkbox"]:visible').first().check();
    const output = await save(page, 'canvas');
    const batch = parseBatch(output);
    expect(batch.members.map(q => q.members[0].model.queryType ?? 'select')).toEqual(['createTemp', 'appendTemp', 'select', 'dropTemp']);
    expect(batch.members[0].members[0].model.indexing!.indexes[0].unique).toBe(true);
    await open(page, 'canvas', output);
    expect(await save(page, 'canvas')).toBe(output);
  });

  test('UNION ORDER/TOTALS/INDEX edits use the shared tail slot from member 0 (C20)', async ({ page }) => {
    const input = 'ВЫБРАТЬ А.Код КАК Первый ПОМЕСТИТЬ ВТ ИЗ Справочник.Валюты КАК А ОБЪЕДИНИТЬ ВСЕ ВЫБРАТЬ Б.Наименование ИЗ Справочник.Валюты КАК Б УПОРЯДОЧИТЬ ПО Первый ИТОГИ КОЛИЧЕСТВО(Первый) ПО ОБЩИЕ, Первый ИНДЕКСИРОВАТЬ ПО НАБОРАМ ((Первый), (Первый)); ВЫБРАТЬ Т.Первый ИЗ ВТ КАК Т';
    await open(page, 'classic', input);
    const classic = await save(page, 'classic');
    await open(page, 'canvas', classic);
    await page.getByRole('button', { name: /Сортировка$/ }).click();
    await page.locator('table:visible select').selectOption('desc');
    await page.getByRole('button', { name: /Группировка$/ }).click();
    await page.getByTestId('canvas-open-totals').click();
    await page.getByLabel('Общие итоги').uncheck();
    await page.getByRole('button', { name: /Дополнительно$/ }).click();
    await page.getByTestId('canvas-open-indices').click();
    await page.locator('input[type="checkbox"]:visible').first().check();
    const output = await save(page, 'canvas');
    const batch = parseBatch(output);
    const first = batch.members[0].members[0].model;
    const last = batch.members[0].members[1].model;
    expect(first.queryType).toBe('createTemp');
    expect(first.fields[0].alias).toBe('Первый');
    expect(last.indexing!.indexes[0].unique).toBe(true);
    expect(last.totals!.grand).toBe(false);
    expect(last.order!.fields[0].direction).toBe('desc');
    expect(output).toContain('КОЛИЧЕСТВО(Первый)');
    await open(page, 'classic', output);
    expect(await save(page, 'classic')).toBe(output);
    await open(page, 'canvas', output);
    expect(await save(page, 'canvas')).toBe(output);
  });

  const preserved = [
    ['grouping sets', 'ВЫБРАТЬ В.Код КАК Код ИЗ Справочник.Валюты КАК В СГРУППИРОВАТЬ ПО ГРУППИРУЮЩИМ НАБОРАМ ((В.Код), (В.Наименование))', 'ГРУППИРУЮЩИМ НАБОРАМ'],
    ['dynamic builder', 'ВЫБРАТЬ В.Код КАК Код {ВЫБРАТЬ В.Код} ИЗ Справочник.Валюты КАК В {ГДЕ В.Код} {УПОРЯДОЧИТЬ ПО Код} {ИТОГИ ПО Код}', '{ВЫБРАТЬ'],
    ['condition subquery', 'ВЫБРАТЬ Т.Код КАК Код ИЗ Справочник.Валюты КАК Т ГДЕ НЕ Т.Ссылка В ИЕРАРХИИ (ВЫБРАТЬ Б.Ссылка ИЗ Справочник.Банки КАК Б)', 'В ИЕРАРХИИ'],
    ['raw order and totals', 'ВЫБРАТЬ В.Код КАК Код ИЗ Справочник.Валюты КАК В УПОРЯДОЧИТЬ ПО &Сортировка ИТОГИ КОЛИЧЕСТВО(Код) ПО ОБЩИЕ', '&Сортировка'],
    ['calculation VT', 'ВЫБРАТЬ Т.Период КАК Период ИЗ РегистрРасчета.Начисления.БазаЗарплата(&Начало, &Конец, (Организация), (Организация)) КАК Т', 'БазаЗарплата'],
  ];
  for (const [name, input, marker] of preserved) test(`preserve-only ${name}: unrelated edit → Save → reopen`, async ({ page }) => {
    await open(page, 'canvas', input);
    await page.getByRole('button', { name: /Дополнительно$/ }).click();
    await page.getByLabel('Разрешенные').check();
    const expected = parseBatch(input);
    expected.members[0].members[0].model.selection = { ...expected.members[0].members[0].model.selection, allowed: true };
    const output = await save(page, 'canvas');
    expect(output).toContain(marker);
    expect(output).toBe(generateBatch(expected));
    await open(page, 'canvas', output);
    expect(await save(page, 'canvas')).toBe(output);
  });
});

test.describe('Canvas roadmap reconciliation', () => {
  test('advanced UNION projections are preserve-only in mapping', async ({ page }) => {
    await page.setViewportSize({ width: 1500, height: 1000 });
    const tables: MetaTable[] = [{ kind: 'Справочник', name: 'Заказы', fullName: 'Справочник.Заказы',
      fields: [{ name: 'Ссылка', kind: 'standard', types: [] }, { name: 'Код', kind: 'attribute', types: [] }],
      tabularSections: [{ kind: 'ТабличнаяЧасть', name: 'Товары', fullName: 'Справочник.Заказы.Товары',
        fields: [{ name: 'Количество', kind: 'attribute', types: [] }] }] }];
    const input = 'ВЫБРАТЬ З.Ссылка КАК Ссылка, З.Товары.(Количество) КАК Товары, З.Код КАК Хвост ИЗ Справочник.Заказы КАК З ОБЪЕДИНИТЬ ВСЕ ВЫБРАТЬ Б.Ссылка, Б.Товары.(Количество), Б.Код ИЗ Справочник.Заказы КАК Б';
    await open(page, 'canvas', input, tables);
    await page.getByTitle('Маппинг полей (псевдонимы и порядок)', { exact: true }).filter({ visible: true }).click();
    const mapping = page.getByRole('dialog', { name: 'Маппинг полей (псевдонимы и порядок)' });
    await expect(mapping.getByText(/Сложные проекции/)).toBeVisible();
    await expect(mapping.locator('input')).toHaveCount(0);
    await expect(mapping.getByTitle('Переместить столбец вниз')).toHaveCount(0);
    await mapping.getByTitle('Закрыть', { exact: true }).click();
    await page.getByRole('button', { name: /Дополнительно$/ }).click();
    await page.getByLabel('Только разрешённые записи (РАЗРЕШЕННЫЕ)').check();
    const expected = parseBatch(input);
    expected.members[0].members[0].model.selection = { allowed: true };
    const output = await save(page, 'canvas');
    expect(output).toBe(generateBatch(expected));
    await open(page, 'classic', output, tables);
    expect(await save(page, 'classic')).toBe(output);
  });

  test('source JOIN overview and minimap support Enter and Space', async ({ page }) => {
    await open(page, 'canvas', 'ВЫБРАТЬ А.Код КАК Код ИЗ Справочник.Валюты КАК А ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Валюты КАК Б ПО А.Код = Б.Код');
    const source = page.getByRole('button', { name: 'А (Справочник.Валюты)', exact: true });
    await source.focus();
    await source.press('Enter');
    await expect(source).toHaveAttribute('aria-pressed', 'true');
    const field = page.getByRole('button', { name: 'А.Код', exact: true });
    await expect(field).toHaveAttribute('aria-pressed', 'true');
    await field.press('Space');
    await expect(field).toHaveAttribute('aria-pressed', 'false');
    await field.press('Enter');
    await expect(field).toHaveAttribute('aria-pressed', 'true');
    const join = page.getByRole('button', { name: 'А ↔ Б (LEFT)', exact: true });
    await join.focus();
    await join.press('Space');
    await expect(join).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: /Связи/ }).first().click();
    const overview = page.getByRole('button', { name: 'А ↔ Б (LEFT)', exact: true }).first();
    await overview.focus();
    await overview.press('Enter');
    await expect(page.getByRole('button', { name: 'А ↔ Б (LEFT)', exact: true })).toHaveCount(1);
    await page.setViewportSize({ width: 650, height: 500 });
    const minimap = page.getByRole('button', { name: 'Центрировать по миникарте', exact: true });
    await minimap.focus();
    await minimap.press('Space');
    expect(parseBatch(await save(page, 'canvas')).members[0].members[0].model.joins).toHaveLength(1);
  });
});

test.describe('Canvas roadmap reconciliation controls', () => {
  test('scalar UNION alias order and ALL edits save in both members', async ({ page }) => {
    await page.setViewportSize({ width: 1500, height: 1000 });
    await open(page, 'canvas', 'ВЫБРАТЬ 1 КАК Первый, 2 КАК Второй ОБЪЕДИНИТЬ ВСЕ ВЫБРАТЬ 3 КАК Первый, 4 КАК Второй');
    await page.getByTitle('Маппинг полей (псевдонимы и порядок)', { exact: true }).filter({ visible: true }).click();
    const mapping = page.getByRole('dialog', { name: 'Маппинг полей (псевдонимы и порядок)' });
    await mapping.locator('input').first().fill('Общий');
    await mapping.locator('input').first().press('Enter');
    await mapping.getByTitle('Переместить столбец вниз').first().click();
    await expect(mapping.locator('input').nth(1)).toHaveValue('Общий');
    await mapping.getByTitle('Закрыть', { exact: true }).click();
    await page.getByRole('button', { name: 'ОБЪЕДИНИТЬ ВСЕ ▾', exact: true }).filter({ visible: true }).click();
    const output = await save(page, 'canvas');
    const members = parseBatch(output).members[0].members;
    expect(members.map(m => m.model.fields.map(f => f.expression))).toEqual([['2', '1'], ['4', '3']]);
    expect(members[0].model.fields.map(f => f.alias)).toEqual(['Второй', 'Общий']);
    expect(output).not.toContain('ОБЪЕДИНИТЬ ВСЕ');
    await open(page, 'classic', output);
    expect(await save(page, 'classic')).toBe(output);
  });

  test('creating and removing the first UNION keeps the shell working', async ({ page }) => {
    await page.setViewportSize({ width: 1500, height: 1000 });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await open(page, 'canvas', 'ВЫБРАТЬ 1 КАК Первый');
    await page.getByTitle('Добавить SELECT в объединение', { exact: true }).filter({ visible: true }).click();
    await page.getByTitle('Удалить SELECT 2', { exact: true }).filter({ visible: true }).click();
    expect(await save(page, 'canvas')).toContain('1 КАК Первый');
    expect(errors).toEqual([]);
  });

  test('SDBL dock is read-only highlighted copyable resizable and keyboard collapsible', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await open(page, 'canvas', 'ВЫБРАТЬ 1 КАК Число');
    const toggle = page.getByRole('button', { name: '{ } SDBL', exact: true });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.press('Enter');
    const editor = page.locator('.cm-content').filter({ visible: true });
    await expect(editor).toHaveAttribute('aria-readonly', 'true');
    const text = await editor.innerText();
    expect(text).toContain('ВЫБРАТЬ');
    const keyword = editor.locator('span').filter({ hasText: /^ВЫБРАТЬ$/ });
    await expect(keyword).toBeVisible();
    await expect(keyword).toHaveAttribute('class', /.+/);
    await editor.click();
    await page.keyboard.type('BREAK');
    await expect(editor).toHaveText(text);
    await page.getByRole('button', { name: 'Копировать', exact: true }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(text);
    const separator = page.getByRole('separator').filter({ visible: true }).last();
    const before = await editor.boundingBox();
    const bounds = await separator.boundingBox();
    await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
    await page.mouse.down();
    await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y - 60);
    await page.mouse.up();
    expect((await editor.boundingBox())!.height).toBeGreaterThan(before!.height);
    await page.getByRole('button', { name: /Поля$/ }).click();
    await page.getByPlaceholder('Псевдоним', { exact: true }).first().fill('НовоеЧисло');
    await expect(editor).toContainText('НовоеЧисло');
    await toggle.press('Space');
    await expect(editor).toBeHidden();
    await toggle.press('Enter');
    expect(await editor.innerText()).toBe(await save(page, 'canvas'));
  });

  test('expression helper applies field WHERE and JOIN text through existing actions', async ({ page }) => {
    await open(page, 'canvas', 'ВЫБРАТЬ А.Код + 1 КАК Значение ИЗ Справочник.Валюты КАК А ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Валюты КАК Б ПО А.Код + 1 = Б.Код ГДЕ А.Код + 1 = &Код');
    const applyExpression = async (value: string) => {
      await page.getByRole('button', { name: 'Редактор выражения', exact: true }).click();
      await expect(page.getByTestId('expr-fields-pane')).toContainText('А');
      await page.locator('[data-testid="expr-editor"] .cm-content').fill(value);
      await page.getByTestId('expr-ok').click();
      await expect(page.getByTestId('expr-dialog')).toBeHidden();
    };
    await page.getByRole('button', { name: /Поля$/ }).click();
    await page.getByPlaceholder('Псевдоним', { exact: true }).first().click();
    await applyExpression('А.Код + 2');
    await page.getByRole('button', { name: /Условия$/ }).click();
    await page.locator('textarea:visible').click();
    await applyExpression('А.Код + 2 = &ДругойКод');
    await page.getByRole('button', { name: /Структура$/ }).click();
    await page.getByRole('button', { name: 'А ↔ Б (LEFT)', exact: true }).press('Enter');
    await applyExpression('А.Код + 2 = Б.Код');
    const output = await save(page, 'canvas');
    expect(output).toContain('А.Код + 2 КАК Значение');
    expect(output).toContain('&ДругойКод');
    expect(output).toContain('А.Код + 2 = Б.Код');
    await open(page, 'classic', output);
    expect(await save(page, 'classic')).toBe(output);
  });

  test('expression Cancel retains parent and malformed confirmation is Apply blocked', async ({ page }) => {
    await open(page, 'canvas', 'ВЫБРАТЬ 1 КАК Число');
    await page.getByRole('button', { name: /Поля$/ }).click();
    await page.getByPlaceholder('Псевдоним', { exact: true }).first().click();
    const trigger = page.getByRole('button', { name: 'Редактор выражения', exact: true });
    await trigger.click();
    await page.locator('[data-testid="expr-editor"] .cm-content').fill('999');
    await page.getByTestId('expr-cancel').click();
    expect(await save(page, 'canvas')).toContain('1 КАК Число');
    await trigger.click();
    await page.locator('[data-testid="expr-editor"] .cm-content').fill('1 = = 2');
    await page.getByTestId('expr-ok').click();
    await expect(page.getByRole('button', { name: 'Сохранить', exact: true })).toBeDisabled();
    await trigger.click();
    await page.locator('[data-testid="expr-editor"] .cm-content').fill('2');
    await page.getByTestId('expr-ok').click();
    expect(await save(page, 'canvas')).toContain('2 КАК Число');
  });
});

test.describe('Canvas roadmap reconciliation expression contexts', () => {
  test('nested expression Escape and OK leave the parent draft recoverable', async ({ page }) => {
    await open(page, 'canvas', 'ВЫБРАТЬ П.Число ИЗ (ВЫБРАТЬ 1 КАК Число) КАК П');
    await page.locator('[data-testid="canvas-source-card"][data-source-alias="П"]').click({ position: { x: 80, y: 20 } });
    await page.getByTestId('canvas-edit-source').filter({ visible: true }).click();
    const nested = page.getByTestId('canvas-source-query-editor');
    await nested.getByRole('button', { name: /Поля$/ }).click();
    await nested.getByPlaceholder('Псевдоним', { exact: true }).first().click();
    await nested.getByRole('button', { name: 'Редактор выражения', exact: true }).click();
    await page.locator('[data-testid="expr-editor"] .cm-content').press('Escape');
    await expect(page.getByTestId('expr-dialog')).toBeHidden();
    await expect(nested).toBeVisible();
    await nested.getByRole('button', { name: 'Редактор выражения', exact: true }).click();
    await page.locator('[data-testid="expr-editor"] .cm-content').fill('3');
    await page.getByTestId('expr-ok').click();
    await nested.getByTestId('canvas-source-back').click();
    expect(await save(page, 'canvas')).toContain('3 КАК Число');
  });

  test('JOIN creation reuses expression context and then edits the resulting conjunct', async ({ page }) => {
    await open(page, 'canvas', 'ВЫБРАТЬ А.Код ИЗ Справочник.Валюты КАК А, Справочник.Валюты КАК Б');
    await page.getByRole('button', { name: /Связи/ }).first().click();
    await page.getByRole('button', { name: 'Произвольное выражение', exact: true }).click();
    await page.getByRole('button', { name: 'Редактор выражения', exact: true }).click();
    await page.locator('[data-testid="expr-editor"] .cm-content').fill('А.Код + 2 = Б.Код');
    await page.getByTestId('expr-ok').click();
    await page.getByRole('button', { name: 'Создать', exact: true }).click();
    const output = await save(page, 'canvas');
    expect(output).toContain('А.Код + 2 = Б.Код');
    expect(parseBatch(output).members[0].members[0].model.joins).toHaveLength(1);
  });
});

test.describe('Canvas roadmap reconciliation focus', () => {
  test('source focus stops at neighbors and JOIN focus uses only its endpoints', async ({ page }) => {
    const input = 'ВЫБРАТЬ А.Код ИЗ Справочник.Валюты КАК А ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Валюты КАК Б ПО А.Код = Б.Код ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Валюты КАК Г ПО Б.Код = Г.Код, Справочник.Валюты КАК Д';
    await open(page, 'canvas', input);
    const card = (alias: string) => page.locator(`[data-testid="canvas-source-card"][data-source-alias="${alias}"]`);
    await page.getByRole('button', { name: 'А (Справочник.Валюты)', exact: true }).press('Enter');
    await expect(card('А')).toHaveCSS('opacity', '1');
    await expect(card('Б')).toHaveCSS('opacity', '1');
    await expect(card('Г')).toHaveCSS('opacity', '0.45');
    await expect(card('Д')).toHaveCSS('opacity', '0.45');
    const otherJoin = page.getByRole('button', { name: 'Б ↔ Г (LEFT)', exact: true });
    await expect(otherJoin.locator('xpath=preceding-sibling::*[local-name()="path"][1]')).toHaveAttribute('opacity', '0.35');
    await otherJoin.press('Space');
    await expect(card('А')).toHaveCSS('opacity', '0.45');
    await expect(card('Б')).toHaveCSS('opacity', '1');
    await expect(card('Г')).toHaveCSS('opacity', '1');
    await expect(card('Д')).toHaveCSS('opacity', '0.45');
    await expect(page.getByRole('button', { name: 'А ↔ Б (LEFT)', exact: true })
      .locator('xpath=preceding-sibling::*[local-name()="path"][1]')).toHaveAttribute('opacity', '0.35');
    expect(await save(page, 'canvas')).toBe(generateBatch(parseBatch(input)));
  });
});

test.describe('Classic / Canvas designer toggle', () => {
  const switches = (page: Page) => page.evaluate(() => (window as unknown as {
    __webviewMessages: { type: string; target?: string; text?: string }[];
  }).__webviewMessages.filter(m => m.type === 'switchDesigner'));

  async function openWithToggle(page: Page, surface: Surface, text: string): Promise<void> {
    await page.goto(`${BASE}/?surface=${surface}&canvas=1`);
    await expect(page.getByTestId(surface === 'canvas' ? 'canvas-loading-overlay' : 'loading-overlay')).toBeHidden();
    await page.evaluate(t => window.dispatchEvent(new MessageEvent('message', { data: { type: 'loadModel', text: t } })), text);
  }

  test('Classic footer: Query, then the toggle; Cancel before the primary OK', async ({ page }) => {
    await openWithToggle(page, 'classic', query);
    const classic = page.getByTestId('designer-mode-classic');
    const canvas = page.getByTestId('designer-mode-canvas');
    await expect(classic).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas).toHaveAttribute('aria-pressed', 'false');
    await expect(classic).toHaveAttribute('title', 'Классический режим');
    await expect(canvas).toHaveAttribute('title', 'Канвас');
    const order = await page.evaluate(() => {
      const bar = document.querySelector('[data-testid="designer-mode-classic"]')!.closest('div[role="group"]')!.parentElement!;
      return [...bar.querySelectorAll('button')].map(b => b.dataset.testid ?? b.textContent!.trim());
    });
    expect(order).toEqual(['Запрос', 'designer-mode-classic', 'designer-mode-canvas', 'Отмена', 'ОК']);
  });

  test('without the Canvas preview the Classic toggle is hidden', async ({ page }) => {
    await open(page, 'classic', query);
    await expect(page.getByTestId('designer-mode-canvas')).toHaveCount(0);
  });

  test('switching carries the current model both ways without changing it', async ({ page }) => {
    await openWithToggle(page, 'classic', query);
    await page.getByTestId('designer-mode-classic').click();
    expect(await switches(page)).toEqual([]);
    await page.getByTestId('designer-mode-canvas').click();
    const [toCanvas] = await switches(page);
    expect(toCanvas).toEqual({ type: 'switchDesigner', target: 'canvas', text: generateBatch(parseBatch(query)) });
    expect(await insertions(page)).toEqual([]);

    // The host reloads the panel with Canvas and that text; switching back returns it unchanged.
    await openWithToggle(page, 'canvas', toCanvas.text!);
    await expect(page.getByTestId('designer-mode-canvas')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('designer-mode-classic').click();
    expect(await switches(page)).toEqual([{ type: 'switchDesigner', target: 'classic', text: toCanvas.text }]);
    expect(await insertions(page)).toEqual([]);
  });

  test('a pending comment-loss confirmation disables switching', async ({ page }) => {
    await openWithToggle(page, 'classic', commentLossQuery);
    await expect(page.getByTestId('comment-loss-confirm')).toBeVisible();
    await expect(page.getByTestId('designer-mode-canvas')).toBeDisabled();
  });

  test('switching carries C21 arithmetic ORDER keys both ways', async ({ page }) => {
    const input = query.replace('УПОРЯДОЧИТЬ ПО В.Код',
      'УПОРЯДОЧИТЬ ПО В.Код + 1 УБЫВ, (В.Код + 1) * 2, -В.Код УБЫВ');
    await openWithToggle(page, 'classic', input);
    await page.getByTestId('designer-mode-canvas').click();
    const [toCanvas] = await switches(page);
    expect(toCanvas.target).toBe('canvas');
    expect(parseBatch(toCanvas.text!).members[0].members[0].model.order!.fields).toEqual([
      { tableId: '', path: '', expression: 'В.Код + 1', direction: 'desc' },
      { tableId: '', path: '', expression: '(В.Код + 1) * 2', direction: 'asc' },
      { tableId: '', path: '', expression: '-В.Код', direction: 'desc' },
    ]);
    expect(await insertions(page)).toEqual([]);
    await openWithToggle(page, 'canvas', toCanvas.text!);
    await page.getByTestId('designer-mode-classic').click();
    expect(await switches(page)).toEqual([{ type: 'switchDesigner', target: 'classic', text: toCanvas.text }]);
    expect(await insertions(page)).toEqual([]);
  });
});

for (const surface of ['classic', 'canvas'] as const) {
  for (const nested of [false, true]) {
    test(`${surface}: C17 JOIN comments survive edit and three Save/reopens (nested=${nested})`, async ({ page }) => {
      const inner = 'ВЫБРАТЬ Т.Код КАК А ИЗ Справочник.Валюты КАК Т ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Валюты КАК Б ПО // leading\nТ.Код = Б.Код // internal\nИЛИ Т.Код = &Код // trailing\n';
      await open(page, surface, nested ? `ВЫБРАТЬ П.А КАК А ИЗ (${inner}) КАК П` : inner);
      await expect(page.getByTestId('comment-loss-confirm')).toBeHidden();
      if (surface === 'canvas') {
        await page.getByRole('button', { name: /Поля$/ }).click();
        await page.getByPlaceholder('Псевдоним', { exact: true }).first().fill('НовыйКод');
      } else {
        await page.locator('[data-tab="Объединения/Псевдонимы"]').click();
        const alias = page.getByRole('table').nth(1).getByRole('textbox').first();
        await alias.fill('НовыйКод');
        await alias.press('Tab');
      }
      const first = await save(page, surface);
      expect(first).toContain('КАК НовыйКод');
      for (const comment of ['// leading', '// internal', '// trailing']) expect(first.split(comment)).toHaveLength(2);
      for (let pass = 0; pass < 3; pass++) {
        await open(page, surface, first);
        await expect(page.getByTestId('comment-loss-confirm')).toBeHidden();
        expect(await save(page, surface)).toBe(first);
      }
    });
  }
}

for (const slot of ['SELECT', 'GROUP'] as const) for (const surface of ['classic', 'canvas'] as const) {
  test(`${surface}: C17 ${slot} comments survive unrelated edit and three Save/reopens`, async ({ page }) => {
    const input = slot === 'SELECT'
      ? 'ВЫБРАТЬ Т.Код КАК А, Т.Код // field\n+ 1 КАК Б ИЗ Справочник.Валюты КАК Т'
      : 'ВЫБРАТЬ Т.Код КАК А ИЗ Справочник.Валюты КАК Т СГРУППИРОВАТЬ ПО Т.Код // field';
    await open(page, surface, input);
    await expect(page.getByTestId('comment-loss-confirm')).toBeHidden();
    if (surface === 'canvas') {
      await page.getByRole('button', { name: /Поля$/ }).click();
      await page.getByPlaceholder('Псевдоним', { exact: true }).first().fill('НовыйКод');
    } else {
      await page.locator('[data-tab="Объединения/Псевдонимы"]').click();
      const alias = page.getByRole('table').nth(1).getByRole('textbox').first();
      await alias.fill('НовыйКод');
      await alias.press('Tab');
    }
    const output = await save(page, surface);
    expect(output).toContain('КАК НовыйКод');
    expect(output.split('// field')).toHaveLength(2);
    for (let pass = 0; pass < 3; pass++) {
      await open(page, surface, output);
      await expect(page.getByTestId('comment-loss-confirm')).toBeHidden();
      expect(await save(page, surface)).toBe(output);
    }
  });
}
