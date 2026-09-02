import { test, expect, Page } from '@playwright/test';

const BASE = 'http://localhost:5555';

/** Drag a table from the DB tree into the Tables panel drop zone.
 *
 * Tables are added via drag-and-drop in this UI (no "Добавить таблицу" button).
 * We fire synthetic DragEvents with the correct dataTransfer payload directly on
 * the Tables-panel drop zone, which is identified by its distinctive inline style
 * (border: 1px dashed transparent + min-height: 40px).
 */
async function dragTableToPanel(page: Page, tableFullName: string): Promise<void> {
  const payload = JSON.stringify({ kind: 'table', tableFullName });
  await page.evaluate((payload) => {
    // Find the Tables panel drop zone by its distinctive style.
    // It is the FIRST div matching: overflowY=auto AND minHeight=40px AND border contains 'dashed'.
    const allDivs = Array.from(document.querySelectorAll('div'));
    const dropZone = allDivs.find(d => {
      const s = (d as HTMLElement).style;
      return s.overflowY === 'auto' && s.minHeight === '40px' && s.border.includes('dashed');
    }) as HTMLElement | undefined;
    if (!dropZone) throw new Error('Tables panel drop zone not found');
    const dt = new DataTransfer();
    dt.setData('text/plain', payload);
    dropZone.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    dropZone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  }, payload);
}

/** Drag a field from the DB tree into the Fields panel drop zone.
 *
 * Fields are added via drag-and-drop. The payload shape matches DbTreePanel's
 * handleDragStart: { kind: 'field', tableFullName, fieldPath }.
 * The Fields panel drop zone has the same style signature as the Tables panel
 * (overflowY=auto, minHeight=40px, border dashed) — it is the SECOND such div.
 */
async function dragFieldToPanel(page: Page, tableFullName: string, fieldPath: string): Promise<void> {
  const payload = JSON.stringify({ kind: 'field', tableFullName, fieldPath });
  await page.evaluate((payload) => {
    const allDivs = Array.from(document.querySelectorAll('div'));
    const dropZones = allDivs.filter(d => {
      const s = (d as HTMLElement).style;
      return s.overflowY === 'auto' && s.minHeight === '40px' && s.border.includes('dashed');
    }) as HTMLElement[];
    // Fields panel is the second drop zone (Tables panel is the first).
    const dropZone = dropZones[1];
    if (!dropZone) throw new Error('Fields panel drop zone not found (need at least 2 dashed drop zones)');
    const dt = new DataTransfer();
    dt.setData('text/plain', payload);
    dropZone.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    dropZone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  }, payload);
}

/** Drop an arbitrary drag payload onto the Fields panel drop zone (the 2nd dashed zone). */
async function dropPayloadOnFieldsPanel(page: Page, payload: string): Promise<void> {
  await page.evaluate((payload) => {
    const allDivs = Array.from(document.querySelectorAll('div'));
    const dropZones = allDivs.filter(d => {
      const s = (d as HTMLElement).style;
      return s.overflowY === 'auto' && s.minHeight === '40px' && s.border.includes('dashed');
    }) as HTMLElement[];
    const dropZone = dropZones[1];
    if (!dropZone) throw new Error('Fields panel drop zone not found');
    const dt = new DataTransfer();
    dt.setData('text/plain', payload);
    dropZone.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    dropZone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  }, payload);
}

/** Inject a host→webview `loadModel` message AFTER metadata has loaded.
 *
 * The harness sends `metadataTree` asynchronously; the loading overlay clears once it
 * arrives. Group headers render BEFORE metadata, so waiting on a group label would race
 * `SET_METADATA` (which replaces state.tables and would wipe synthetic temp/subquery
 * tables added by LOAD_BATCH). Mirrors the real host order: metadataTree → loadModel. */
async function loadModelText(page: Page, text: string): Promise<void> {
  await expect(page.locator('[data-testid="loading-overlay"]')).toBeHidden();
  await page.evaluate((t) => {
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'loadModel', text: t } }));
  }, text);
}

test.describe('Query Constructor Webview', () => {
  test('shows Справочники group in DB tree', async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator('text=Справочники')).toBeVisible();
  });

  test('expands Справочники group to show Валюты', async ({ page }) => {
    await page.goto(BASE);
    await page.locator('text=Справочники').click();
    await expect(page.locator('[data-table-fullname="Справочник.Валюты"]')).toBeVisible();
  });

  test('expands Валюты to show fields', async ({ page }) => {
    await page.goto(BASE);
    // First expand the group
    await page.locator('text=Справочники').click();
    // Then click the table to expand it
    await page.locator('[data-table-fullname="Справочник.Валюты"]').click();
    await expect(page.locator('[data-field-path="Код"]')).toBeVisible();
    await expect(page.locator('[data-field-path="Наименование"]')).toBeVisible();
  });

  test('adds table to Tables panel via > button', async ({ page }) => {
    await page.goto(BASE);
    // Expand group and click table to focus it
    await page.locator('text=Справочники').click();
    // Add table via drag-and-drop (no "Добавить таблицу" button in current UI)
    await dragTableToPanel(page, 'Справочник.Валюты');
    await expect(page.locator('[data-table-id]')).toBeVisible();
    // 7.8.12: строка таблицы показывает синоним, а не полное имя.
    await expect(page.locator('[data-table-alias="Валюты"]')).toBeVisible();
  });

  test('7.8.16: двойной клик по таблице добавляет все поля', async ({ page }) => {
    await page.goto(BASE);
    await page.locator('text=Справочники').click();
    await dragTableToPanel(page, 'Справочник.Валюты');
    await page.locator('[data-table-id]').first().dblclick();
    // Валюты имеет поля Код, Наименование, Ссылка и др. → минимум 3 строки полей.
    await expect(page.locator('[data-field-idx]').nth(2)).toBeVisible();
  });

  test('7.8.14: кнопка «Редактирование» переоткрывает окно ВТ; двойной клик добавляет поля', async ({ page }) => {
    await page.goto(BASE);
    // Открыть окно «Временная таблица».
    await page.locator('[data-testid="add-temp-table"]').click();
    await page.locator('[data-testid="tt-name"]').fill('ВТТовары');
    await page.locator('[data-testid="tt-field-name-0"]').fill('Товар');
    await page.locator('[data-testid="tt-add-row"]').click();
    await page.locator('[data-testid="tt-field-name-1"]').fill('Количество');
    await page.locator('[data-testid="tt-ok"]').click();

    // Источник-ВТ появляется в списке «Таблицы» с синонимом = имя ВТ.
    await expect(page.locator('[data-table-alias="ВТТовары"]')).toBeVisible();

    // Выделение ВТ активирует кнопку «Редактирование»; она переоткрывает окно.
    await page.locator('[data-table-alias="ВТТовары"]').click();
    await expect(page.locator('[data-testid="edit-source"]')).toBeEnabled();
    await page.locator('[data-testid="edit-source"]').click();
    await expect(page.locator('[data-testid="tt-name"]')).toHaveValue('ВТТовары');
    await page.locator('[data-testid="tt-cancel"]').click();

    // 7.8.14: двойной клик по синониму ВТ добавляет все её поля в «Поля».
    await page.locator('[data-table-alias="ВТТовары"]').dblclick();
    await expect(page.locator('text=ВТТовары.Товар')).toBeVisible();
    await expect(page.locator('text=ВТТовары.Количество')).toBeVisible();
  });

  test('7.8.14: кнопка «Редактирование» неактивна для обычной таблицы', async ({ page }) => {
    await page.goto(BASE);
    await page.locator('text=Справочники').click();
    await dragTableToPanel(page, 'Справочник.Валюты');
    await page.locator('[data-table-alias="Валюты"]').click();
    await expect(page.locator('[data-testid="edit-source"]')).toBeDisabled();
  });

  test('7.8.15: «Редактирование» открывает вложенный конструктор; двойной клик добавляет поля', async ({ page }) => {
    await page.goto(BASE);
    const TEXT =
      'ВЫБРАТЬ\n\tВложенныйЗапрос.ВерсияДанных КАК ВерсияДанных\n' +
      'ИЗ\n\t(ВЫБРАТЬ\n\t\tАвансовыйОтчет.ВерсияДанных КАК ВерсияДанных\n\tИЗ\n' +
      '\t\tДокумент.АвансовыйОтчет КАК АвансовыйОтчет) КАК ВложенныйЗапрос';
    await loadModelText(page, TEXT);

    // Выделение подзапроса активирует «Редактирование»; она открывает вложенный конструктор.
    await page.locator('[data-table-alias="ВложенныйЗапрос"]').click();
    await expect(page.locator('[data-testid="edit-source"]')).toBeEnabled();
    await page.locator('[data-testid="edit-source"]').click();
    await expect(page.locator('[data-testid="subquery-constructor"]')).toBeVisible();
    await page.locator('button:has-text("Отмена")').last().click();
    await expect(page.locator('[data-testid="subquery-constructor"]')).toBeHidden();

    // 7.8.15: двойной клик по синониму подзапроса добавляет его поля (дубль → idx 1).
    await page.locator('[data-table-alias="ВложенныйЗапрос"]').dblclick();
    await expect(page.locator('[data-field-idx="1"]')).toBeVisible();
  });

  test('7.8.8: кнопка ВЗ открывает вложенный конструктор', async ({ page }) => {
    await page.goto(BASE);
    // Кнопка стала иконочной (codicon), текстовая подпись теперь только в title.
    const btn = page.locator('[data-testid="add-subquery"]');
    await expect(btn).toHaveAttribute('title', 'Создать вложенный запрос (ВЗ)');

    // Клик открывает вложенный рекурсивный конструктор.
    await btn.click();
    const nested = page.locator('[data-testid="subquery-constructor"]');
    await expect(nested).toBeVisible();

    // У вложенной модалки своя нижняя панель — её «Отмена» (последняя на странице) закрывает её.
    await page.locator('button:has-text("Отмена")').last().click();
    await expect(nested).toBeHidden();
  });

  test('adds field to Fields panel via > button after table selected', async ({ page }) => {
    await page.goto(BASE);
    // Expand group, add table to query via drag
    await page.locator('text=Справочники').click();
    await dragTableToPanel(page, 'Справочник.Валюты');
    // Drag field from DB tree into Fields panel drop zone
    await dragFieldToPanel(page, 'Справочник.Валюты', 'Код');

    await expect(page.locator('[data-field-idx="0"]')).toBeVisible();
    await expect(page.locator('text=Валюты.Код')).toBeVisible();
  });

  test('clicking Запрос generates query text', async ({ page }) => {
    await page.goto(BASE);
    // Add table
    await page.locator('text=Справочники').click();
    await dragTableToPanel(page, 'Справочник.Валюты');
    // Add field via drag
    await dragFieldToPanel(page, 'Справочник.Валюты', 'Код');

    await page.locator('button:has-text("Запрос")').click();

    // «Запрос» opens an editable preview modal — assert it's visible with generated SQL.
    await expect(page.locator('text=Текст запроса')).toBeVisible();
    // The generated query must contain the SELECT keyword and reference the table/field
    const editor = page.locator('[data-testid="query-text-editor"]');
    await expect(editor).toContainText(/ВЫБРАТЬ/);
    await expect(editor).toContainText(/Валюты/);
  });

  // Стадия 0 плана «Текст запроса v2»: базовый e2e-снимок ТЕКУЩЕГО поведения модалки
  // редактирования текста запроса — до любых изменений в рамках этой задачи. Служит
  // страховочной сеткой: новый диалог должен вести себя точно так же.
  test('Текст запроса: «Применить» обновляет модель конструктора', async ({ page }) => {
    await page.goto(BASE);
    await page.locator('text=Справочники').click();
    await dragTableToPanel(page, 'Справочник.Валюты');
    await dragFieldToPanel(page, 'Справочник.Валюты', 'Код');

    await page.locator('button:has-text("Запрос")').click();
    const editor = page.locator('[data-testid="query-text-editor"] .cm-content');
    await expect(editor).toContainText(/Код/);

    // Заменяем текст запроса на запрос с ДРУГИМ полем.
    await editor.fill('ВЫБРАТЬ\n\tВалюты.Наименование КАК Наименование\nИЗ\n\tСправочник.Валюты КАК Валюты');
    await page.locator('button:has-text("Применить")').click();

    // Модалка закрылась, конструктор обновлён — поле в «Поля» теперь Наименование.
    await expect(page.locator('text=Текст запроса')).toHaveCount(0);
    await expect(page.locator('[data-field-idx="0"]')).toContainText('Наименование');
  });

  test('Текст запроса: закрытие без «Применить» не меняет модель конструктора', async ({ page }) => {
    await page.goto(BASE);
    await page.locator('text=Справочники').click();
    await dragTableToPanel(page, 'Справочник.Валюты');
    await dragFieldToPanel(page, 'Справочник.Валюты', 'Код');

    await page.locator('button:has-text("Запрос")').click();
    const editor = page.locator('[data-testid="query-text-editor"] .cm-content');
    await editor.fill('ВЫБРАТЬ\n\tВалюты.Наименование КАК Наименование\nИЗ\n\tСправочник.Валюты КАК Валюты');

    // Закрываем крестиком, НЕ применяя правку.
    await page.locator('button[title="Закрыть"]').click();
    await expect(page.locator('text=Текст запроса')).toHaveCount(0);

    // Поле в конструкторе осталось прежним (Код) — правка не применилась.
    await expect(page.locator('[data-field-idx="0"]')).toContainText('Код');
  });

  // Стадия 1 плана «Текст запроса v2»: с включённым флагом рендерится новая раскладка
  // (QueryTextDialog), но Apply/Close используют ТЕ ЖЕ обработчики, что и старая модалка —
  // поведение (что происходит по кнопкам) остаётся тем же, что проверяют тесты выше.
  test('Текст запроса v2: с флагом queryTextEditorV2 — новая раскладка, Apply/Close работают', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'init', hasInitialQuery: false, queryTextEditorV2: true },
      }));
    });
    await page.locator('text=Справочники').click();
    await dragTableToPanel(page, 'Справочник.Валюты');
    await dragFieldToPanel(page, 'Справочник.Валюты', 'Код');

    await page.locator('button:has-text("Запрос")').click();
    // Новая раскладка — виден тулбар с кнопкой «Структура» (её не было в старой модалке).
    await expect(page.locator('button:has-text("Структура")')).toBeVisible();
    const editor = page.locator('[data-testid="query-text-editor"] .cm-content');
    await expect(editor).toContainText(/Код/);

    await editor.fill('ВЫБРАТЬ\n\tВалюты.Наименование КАК Наименование\nИЗ\n\tСправочник.Валюты КАК Валюты');
    await page.locator('button:has-text("Применить")').click();
    await expect(page.locator('text=Текст запроса')).toHaveCount(0);
    await expect(page.locator('[data-field-idx="0"]')).toContainText('Наименование');
  });

  // Стадия 4 плана «Текст запроса v2»: статус-бар и «Проверить» используют один и тот
  // же QueryAnalysisService.analyze() — здесь проверяем видимое поведение статус-бара
  // (design-док, раздел 6/10), а не сам analyze() (уже покрыт queryAnalysisService.test.ts).
  test('Текст запроса v2: статус-бар — ✓ на валидном тексте, ошибка + переход к ней на невалидном', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'init', hasInitialQuery: false, queryTextEditorV2: true },
      }));
    });
    await page.locator('text=Справочники').click();
    await dragTableToPanel(page, 'Справочник.Валюты');
    await dragFieldToPanel(page, 'Справочник.Валюты', 'Код');
    await page.locator('button:has-text("Запрос")').click();

    const status = page.locator('[data-testid="query-text-status"]');
    await expect(status).toContainText('Синтаксис корректен');

    const editor = page.locator('[data-testid="query-text-editor"] .cm-content');
    await editor.fill('ВЫБРАТЬ ИЗ КАК Поле1 ИЗ Справочник.Валюты');
    // «Проверить» форсирует немедленную проверку вместо ожидания дебаунса.
    await page.locator('button[title="Проверить сейчас"]').click();
    await expect(status).toContainText('Ошибка разбора');

    // Клик по ошибке переводит курсор в редактор (сам факт фокуса — минимальная,
    // устойчивая проверка перехода без завязки на внутренние координаты CodeMirror).
    // Кликаем именно по тексту ошибки (кликабельный span), а не по всей полосе статус-бара —
    // та шире самого span, и клик по центру полосы промахивается мимо inline-элемента.
    await status.locator('[role="button"]').click();
    await expect(editor).toBeFocused();
  });

  // Стадия 5 плана «Текст запроса v2»: «Форматировать» переносит секции на отдельные
  // строки, и один Ctrl/Cmd+Z полностью откатывает результат (design-док, раздел 5).
  test('Текст запроса v2: «Форматировать» переносит секции, Ctrl/Cmd+Z откатывает одним шагом', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'init', hasInitialQuery: false, queryTextEditorV2: true },
      }));
    });
    await page.locator('text=Справочники').click();
    await dragTableToPanel(page, 'Справочник.Валюты');
    await dragFieldToPanel(page, 'Справочник.Валюты', 'Код');
    await page.locator('button:has-text("Запрос")').click();

    const editor = page.locator('[data-testid="query-text-editor"] .cm-content');
    const oneLiner = 'ВЫБРАТЬ Валюты.Код КАК Код ИЗ Справочник.Валюты КАК Валюты ГДЕ Валюты.Код = &Код';
    await editor.fill(oneLiner);
    await expect(editor).toHaveText(oneLiner);

    await page.locator('button[title="Форматировать"]').click();
    await expect(editor).toContainText('ВЫБРАТЬ');
    const formattedText = await editor.textContent();
    expect(formattedText).not.toBe(oneLiner);

    await editor.click();
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
    await expect(editor).toHaveText(oneLiner);
  });

  // Стадия 6 плана «Текст запроса v2»: панель «Структура» показывает поля/источники
  // из QueryAnalysisService.analyze() и переводит курсор в текст по клику (design-док,
  // разделы 7-8; навигация — best-effort поиск по тексту, риск п.0.3).
  test('Текст запроса v2: панель «Структура» показывает поля/источники, клик переводит курсор', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'init', hasInitialQuery: false, queryTextEditorV2: true },
      }));
    });
    await page.locator('text=Справочники').click();
    await dragTableToPanel(page, 'Справочник.Валюты');
    await dragFieldToPanel(page, 'Справочник.Валюты', 'Код');
    await page.locator('button:has-text("Запрос")').click();

    await page.locator('button:has-text("Структура")').click();
    const panel = page.locator('[data-testid="query-text-structure-panel"]');
    await expect(panel).toContainText('Поля (1)');
    await expect(panel).toContainText('Источники (1)');
    await expect(panel).toContainText('Валюты.Код');

    const editor = page.locator('[data-testid="query-text-editor"] .cm-content');
    await panel.locator('text=Валюты.Код').click();
    await expect(editor).toBeFocused();
  });

  // Стадия 7 плана «Текст запроса v2»: панель «Параметры» (read-only) и «Структура»
  // делят один слот правой панели, а не открываются одновременно (design-док, раздел 2).
  test('Текст запроса v2: панель «Параметры» показывает имя/использования, делит слот со «Структурой»', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'init', hasInitialQuery: false, queryTextEditorV2: true },
      }));
    });
    await page.locator('text=Справочники').click();
    await dragTableToPanel(page, 'Справочник.Валюты');
    await dragFieldToPanel(page, 'Справочник.Валюты', 'Код');
    await page.locator('button:has-text("Запрос")').click();

    const editor = page.locator('[data-testid="query-text-editor"] .cm-content');
    await editor.fill('ВЫБРАТЬ Валюты.Код КАК Код ИЗ Справочник.Валюты КАК Валюты ГДЕ Валюты.Код = &Код');
    await page.locator('button[title="Проверить сейчас"]').click();

    await page.locator('button:has-text("Параметры")').click();
    const paramsPanel = page.locator('[data-testid="query-text-parameters-panel"]');
    await expect(paramsPanel).toContainText('&Код');
    await expect(paramsPanel).toContainText('Использований: 1');

    // Панель не переполняется горизонтально даже на длинных именах параметров.
    const overflowsX = await paramsPanel.evaluate(el => el.scrollWidth > el.clientWidth);
    expect(overflowsX).toBe(false);

    // Клик по параметру переводит курсор в текст — та же навигация, что и в «Структуре».
    await paramsPanel.locator('text=&Код').click();
    await expect(editor).toBeFocused();

    // Один слот: открытие «Структуры» закрывает «Параметры», а не открывает второй блок.
    await page.locator('button:has-text("Структура")').click();
    await expect(page.locator('[data-testid="query-text-structure-panel"]')).toBeVisible();
    await expect(paramsPanel).toHaveCount(0);
  });

  // Стадия 8 плана «Текст запроса v2» (design-док, раздел 12, риск п.0.7): все ТРИ пути
  // закрытия (×, клик по фону, «Отмена») должны спрашивать подтверждение, если текст
  // менялся с момента открытия, и закрывать сразу, если нет.
  test('Текст запроса v2: dirty-guard — подтверждение на всех трёх путях закрытия, мгновенное закрытие без правок', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'init', hasInitialQuery: false, queryTextEditorV2: true },
      }));
    });
    await page.locator('text=Справочники').click();
    await dragTableToPanel(page, 'Справочник.Валюты');
    await dragFieldToPanel(page, 'Справочник.Валюты', 'Код');

    const dialogTitle = page.locator('text=Текст запроса');
    const confirm = page.locator('[data-testid="query-text-close-confirm"]');
    const editor = page.locator('[data-testid="query-text-editor"] .cm-content');

    // Без правок — закрытие (крестиком) мгновенное, без подтверждения.
    await page.locator('button:has-text("Запрос")').click();
    await page.locator('button[title="Закрыть"]').click();
    await expect(dialogTitle).toHaveCount(0);

    // С правкой — крестик спрашивает подтверждение; «Продолжить редактирование» не закрывает.
    await page.locator('button:has-text("Запрос")').click();
    await editor.fill('ВЫБРАТЬ Валюты.Наименование КАК Наименование ИЗ Справочник.Валюты КАК Валюты');
    await page.locator('button[title="Закрыть"]').click();
    await expect(confirm).toBeVisible();
    await confirm.locator('button:has-text("Продолжить редактирование")').click();
    await expect(confirm).toHaveCount(0);
    await expect(dialogTitle).toBeVisible();

    // Клик по фону — тот же guard.
    await page.locator('div[style*="rgba(0, 0, 0, 0.5)"]').first().click({ position: { x: 5, y: 5 } });
    await expect(confirm).toBeVisible();
    await confirm.locator('button:has-text("Закрыть без сохранения")').click();
    await expect(dialogTitle).toHaveCount(0);
    // Правка не применилась — поле в конструкторе осталось прежним (Код).
    await expect(page.locator('[data-field-idx="0"]')).toContainText('Код');

    // «Отмена» — тот же guard.
    await page.locator('button:has-text("Запрос")').click();
    await editor.fill('ВЫБРАТЬ Валюты.Наименование КАК Наименование ИЗ Справочник.Валюты КАК Валюты');
    await page.locator('[data-testid="query-text-cancel"]').click();
    await expect(confirm).toBeVisible();
    await confirm.locator('button:has-text("Закрыть без сохранения")').click();
    await expect(dialogTitle).toHaveCount(0);
  });

  test('нижняя панель: ОК постит insertText, Отмена постит cancel', async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator('button:has-text("Запрос")')).toBeVisible();
    // ОК is disabled when the constructor is empty (guard against data loss).
    // Add a table and field first so ОК is enabled.
    await page.locator('text=Справочники').click();
    await dragTableToPanel(page, 'Справочник.Валюты');
    await dragFieldToPanel(page, 'Справочник.Валюты', 'Код');
    await page.locator('button:has-text("ОК")').click();
    await page.locator('button:has-text("Отмена")').click();
    const types = await page.evaluate(() => (window as any).__webviewMessages.map((m: any) => m.type));
    expect(types).toContain('insertText');
    expect(types).toContain('cancel');
  });

  test('7.8.10: ОК на некорректном запросе показывает ошибку и не сохраняет', async ({ page }) => {
    await page.goto(BASE);
    await page.locator('text=Справочники').click();
    await dragTableToPanel(page, 'Справочник.Валюты');

    // Добавляем произвольное выражение, дающее некорректный SDBL (ключевое слово «ИЗ»
    // как тело выражения ломает разбор: «ВЫБРАТЬ ИЗ КАК Поле1 ИЗ ...»).
    await page.locator('button[title="Добавить поле (произвольное выражение)"]').click();
    await expect(page.locator('text=Произвольное выражение')).toBeVisible();
    await page.locator('[data-testid="expr-editor"] .cm-content').fill('ИЗ');
    await page.locator('[data-testid="expr-ok"]').click();
    await expect(page.locator('[data-field-idx="0"]')).toBeVisible();

    // Чистим зафиксированные сообщения моста.
    await page.evaluate(() => { (window as any).__webviewMessages = []; });

    // Нижняя панель ОК доступна (текст пакета непустой), но валидация должна заблокировать.
    await page.locator('button:has-text("ОК")').click();

    await expect(page.locator('[data-testid="ok-error"]')).toBeVisible();
    const msgs = await page.evaluate(() => (window as any).__webviewMessages);
    expect(msgs.some((m: any) => m.type === 'insertText')).toBe(false);
  });

  test('Связи: селект таблицы имеет title с полным псевдонимом (anti-clip)', async ({ page }) => {
    await page.goto(BASE);
    // Inject a second table into the metadata so we can add two distinct tables
    // (the reducer deduplicates by fullName, so we need two different entries).
    await page.waitForTimeout(200); // wait for initial metadataTree message to settle
    await page.evaluate(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          type: 'metadataTree',
          tables: [
            {
              kind: 'Справочник', name: 'Валюты', fullName: 'Справочник.Валюты',
              fields: [{ name: 'Ссылка', kind: 'standard', types: [] }],
            },
            {
              kind: 'Справочник', name: 'Организации', fullName: 'Справочник.Организации',
              fields: [{ name: 'Ссылка', kind: 'standard', types: [] }],
            },
          ],
        },
      }));
    });
    await page.waitForTimeout(100);
    // Добавляем две таблицы, чтобы появилась вкладка «Связи».
    await page.locator('text=Справочники').click();
    await dragTableToPanel(page, 'Справочник.Валюты');
    await dragTableToPanel(page, 'Справочник.Организации');
    await page.locator('[data-testid="tabsbar"] [data-tab="Связи"]').click();
    await page.locator('button[title="Добавить связь"]').click();
    const sel = page.locator('select[title]').first();
    await expect(sel).toHaveAttribute('title', /.+/); // непустой тултип полного имени
  });

  // 7.8.4: кнопка «+» в списке «Поля» открывает «Произвольное выражение» и вставляет результат новым полем.
  test('Поля: «+» открывает Произвольное выражение и добавляет новое поле', async ({ page }) => {
    await page.goto(BASE);
    await page.locator('text=Справочники').click();
    await dragTableToPanel(page, 'Справочник.Валюты');
    // «+» доступна, как только есть хотя бы одна таблица (фокус не обязателен).
    await page.locator('button[title="Добавить поле (произвольное выражение)"]').click();
    await expect(page.locator('text=Произвольное выражение')).toBeVisible();
    await page.locator('[data-testid="expr-editor"] .cm-content').fill('1 + 1');
    await page.locator('[data-testid="expr-ok"]').click();
    // Новое поле-выражение появилось в списке «Поля».
    await expect(page.locator('[data-field-idx="0"]')).toBeVisible();
    await expect(page.locator('[data-field-idx="0"]')).toContainText('1 + 1');
  });

  // 7.8.5: двойной клик по полю открывает «Произвольное выражение» для правки этого поля.
  test('Поля: двойной клик открывает Произвольное выражение для правки поля', async ({ page }) => {
    await page.goto(BASE);
    await page.locator('text=Справочники').click();
    await dragTableToPanel(page, 'Справочник.Валюты');
    await dragFieldToPanel(page, 'Справочник.Валюты', 'Код');
    await expect(page.locator('[data-field-idx="0"]')).toContainText('Валюты.Код');
    await page.locator('[data-field-idx="0"]').dblclick();
    await expect(page.locator('text=Произвольное выражение')).toBeVisible();
    // Текст предзаполнен квалифицированным путём редактируемого поля.
    await expect(page.locator('[data-testid="expr-editor"] .cm-content')).toContainText('Валюты.Код');
    await page.locator('[data-testid="expr-editor"] .cm-content').fill('ВЫРАЗИТЬ(Валюты.Код КАК Строка(10))');
    await page.locator('[data-testid="expr-ok"]').click();
    // Поле обновлено на месте (не появилось второе поле).
    await expect(page.locator('[data-field-idx="0"]')).toContainText('ВЫРАЗИТЬ(Валюты.Код КАК Строка(10))');
    await expect(page.locator('[data-field-idx="1"]')).toHaveCount(0);
  });

  // 7.8.6: перетаскивание таблицы в список «Поля» добавляет ВСЕ её поля.
  test('Поля: перетаскивание таблицы добавляет все её поля', async ({ page }) => {
    await page.goto(BASE);
    await page.locator('text=Справочники').click();
    await dragTableToPanel(page, 'Справочник.Валюты');
    // Бросаем саму таблицу в список «Поля» (а не отдельный реквизит).
    await dropPayloadOnFieldsPanel(page, JSON.stringify({ kind: 'table', tableFullName: 'Справочник.Валюты' }));
    // У Валюты в harness 4 поля → индексы 0..3.
    await expect(page.locator('[data-field-idx="0"]')).toBeVisible();
    await expect(page.locator('[data-field-idx="3"]')).toBeVisible();
    await expect(page.locator('[data-field-idx="4"]')).toHaveCount(0);
  });

  test('боковой стрип пакета: появляется при >1 запросе и скроллится по вертикали', async ({ page }) => {
    await page.goto(BASE);
    // Создаём пакет из >1 запроса через вкладку «Пакет запросов» (кнопка «Добавить»),
    // тогда появляется боковой вертикальный стрип имён запросов.
    await page.locator('[data-testid="tabsbar"] [data-tab="Пакет запросов"]').click();
    await page.locator('button[title="Добавить"]').click();
    // Стрип виден только ВНЕ вкладки «Пакет запросов» — переключаемся на «Таблицы и поля».
    await page.locator('[data-testid="tabsbar"] [data-tab="Таблицы и поля"]').click();
    const strip = page.locator('[data-testid="side-strip"]');
    await expect(strip).toBeVisible();
    const overflow = await strip.evaluate(el => getComputedStyle(el).overflowY);
    expect(overflow).toBe('auto');
  });

  test('#ВТ: открытие из текста показывает имя с # в окне ВТ', async ({ page }) => {
    await page.goto(BASE);
    const TEXT =
      'ВЫБРАТЬ\n\tВалюты.Ссылка КАК Ссылка,\n\tВТ.asdfa КАК asdfa\n' +
      'ИЗ\n\tСправочник.Валюты КАК Валюты,\n\t#ВТ КАК ВТ';
    await loadModelText(page, TEXT);
    // Источник-ВТ появился (псевдоним ВТ); выделение + «Редактирование» открывает
    // окно с реальным именем `#ВТ`.
    await page.locator('[data-table-alias="ВТ"]').click();
    await page.locator('[data-testid="edit-source"]').click();
    await expect(page.locator('[data-testid="tt-name"]')).toHaveValue('#ВТ');
  });

  test('7.8.17: группа «Временные таблицы» — врем доступна на запросе врем1 и перетаскивается', async ({ page }) => {
    await page.goto(BASE);
    const TEXT =
      'ВЫБРАТЬ\n\tВалюты.Ссылка КАК Ссылка\nПОМЕСТИТЬ врем\nИЗ\n\tСправочник.Валюты КАК Валюты' +
      '\n;\n\n' + '/'.repeat(80) + '\n' +
      'ВЫБРАТЬ\n\tБригады.Ссылка КАК Ссылка\nДОБАВИТЬ врем1\nИЗ\n\tСправочник.Бригады КАК Бригады';
    await loadModelText(page, TEXT);

    // На первом запросе (врем) группы «Временные таблицы» ещё нет.
    await expect(page.locator('[data-testid="temp-tables-group"]')).toHaveCount(0);

    // Переключаемся на запрос «врем1» (боковая полоса пакета).
    await page.locator('[data-testid="side-strip"] >> text=врем1').click();

    // Группа появилась; раскрываем — видна `врем`.
    const group = page.locator('[data-testid="temp-tables-group"]');
    await expect(group).toBeVisible();
    await group.click();
    await expect(page.locator('[data-temp-table="врем"]')).toBeVisible();

    // Перетаскиваем `врем` в «Таблицы» → добавлен источник-ВТ с синонимом `врем`.
    await page.evaluate(() => {
      const dropZone = Array.from(document.querySelectorAll('div')).find(d => {
        const s = (d as HTMLElement).style;
        return s.overflowY === 'auto' && s.minHeight === '40px' && s.border.includes('dashed');
      }) as HTMLElement;
      const dt = new DataTransfer();
      dt.setData('text/plain', JSON.stringify({ kind: 'temptable', name: 'врем', fields: ['Ссылка'] }));
      dropZone.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
      dropZone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    });
    await expect(page.locator('[data-table-alias="врем"]')).toBeVisible();
  });

  test('7.8.20: участники ОБЪЕДИНЕНИЯ запроса пакета показаны отдельной полосой', async ({ page }) => {
    await page.goto(BASE);
    const TEXT =
      'ВЫБРАТЬ\n\tБанки.Ссылка КАК Ссылка\nПОМЕСТИТЬ Пакет1\nИЗ\n\tСправочник.Банки КАК Банки\n\n' +
      'ОБЪЕДИНИТЬ ВСЕ\n\nВЫБРАТЬ\n\tБанки.Ссылка\nИЗ\n\tСправочник.Банки КАК Банки' +
      '\n;\n\n' + '/'.repeat(80) + '\n' +
      'ВЫБРАТЬ\n\tАдресатыПисем.Ссылка КАК Ссылка\nИЗ\n\tСправочник.АдресатыПисем КАК АдресатыПисем';
    await loadModelText(page, TEXT);

    // Активен «Пакет1» (объединение из 2 участников): видны обе полосы — пакета и участников.
    await expect(page.locator('[data-testid="side-strip"]')).toBeVisible();
    await expect(page.locator('[data-testid="union-strip"]')).toBeVisible();
    await expect(page.locator('[data-union-query="Запрос 1"]')).toBeVisible();
    await expect(page.locator('[data-union-query="Запрос 2"]')).toBeVisible();

    // Переключаемся на 2-й запрос пакета (1 участник) — полоса участников исчезает.
    await page.locator('[data-testid="side-strip"] >> text=Запрос пакета 2').click();
    await expect(page.locator('[data-testid="union-strip"]')).toHaveCount(0);

    // Назад на «Пакет1» — полоса участников снова видна.
    await page.locator('[data-testid="side-strip"] >> text=Пакет1').click();
    await expect(page.locator('[data-testid="union-strip"]')).toBeVisible();
  });

  test('некорректный текст: показывает синтаксическую ошибку, а не пустой конструктор', async ({ page }) => {
    await page.goto(BASE);
    const BAD =
      'ВЫБРАТЬ\n\tВалюты.Ссылка КАК Ссылка\n' +
      'ИЗ\n\tСправочник.Валюты КАК Валюты,\n\t?ВТ КАК ВТ';
    await loadModelText(page, BAD);
    const err = page.locator('[data-testid="load-error"]');
    await expect(err).toBeVisible();
    await expect(err).toContainText('Ошибка разбора 5:'); // строка с `?ВТ`
  });
});
