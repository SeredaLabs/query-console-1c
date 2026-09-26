import * as React from 'react';

// Единый набор стилей форм-элементов для всех вкладок конструктора — раньше
// каждая вкладка копипастила собственную (слегка отличающуюся) копию этих
// констант, из-за чего внешний вид расходился от вкладки к вкладке.

/** Единая высота однострочных контролов (поле ввода, select) во всех вкладках. */
export const CONTROL_HEIGHT = 24;

export const BTN: React.CSSProperties = {
  padding: '3px 12px',
  cursor: 'pointer',
  background: 'var(--vscode-button-background, #0e639c)',
  color: 'var(--vscode-button-foreground, #fff)',
  // --vscode-button-border задают высококонтрастные темы (там фон кнопки = фону
  // формы, и без рамки кнопка — просто текст); в обычных темах рамка прозрачна.
  border: '1px solid var(--vscode-button-border, transparent)',
  borderRadius: 4,
  fontSize: 12,
  lineHeight: '16px',
};

export const BTN_SECONDARY: React.CSSProperties = {
  ...BTN,
  background: 'var(--vscode-button-secondaryBackground, #3a3d41)',
  color: 'var(--vscode-button-secondaryForeground, #ccc)',
};

export const FIELDSET: React.CSSProperties = {
  border: '1px solid var(--qc-border)',
  borderRadius: 6,
  padding: '10px 12px',
  margin: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  // «Бумага» карточки-секции на фоне рамки формы (см. ConstructorView root).
  background: 'var(--vscode-editor-background, #1e1e1e)',
};

export const LEGEND: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  color: 'var(--vscode-descriptionForeground, #aaa)',
  padding: '0 4px',
};

export const CHECK_LABEL: React.CSSProperties = {
  fontSize: 13,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  cursor: 'pointer',
};

export const RADIO_LABEL: React.CSSProperties = {
  fontSize: 13,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  cursor: 'pointer',
};

export const INPUT: React.CSSProperties = {
  height: CONTROL_HEIGHT,
  boxSizing: 'border-box',
  background: 'var(--vscode-input-background, #3c3c3c)',
  color: 'var(--vscode-input-foreground, #ccc)',
  // --vscode-input-border напрямую — не берём: некоторые темы (как и с
  // --vscode-panel-border, см. GLOBAL_FORM_CSS) задают его тем же цветом,
  // что и фон поля ввода, — рамка исчезает целиком. --qc-border гарантированно
  // виден в любой теме.
  border: '1px solid var(--qc-border)',
  borderRadius: 3,
  fontSize: 12,
  padding: '3px 6px',
};

/** Инпут в модалках-диалогах (ВТ, параметры виртуальной таблицы) — та же тема,
 * что и INPUT, но заполняет строку «подпись + поле» (flex: 1). */
export const MODAL_INPUT: React.CSSProperties = {
  ...INPUT,
  flex: 1,
  padding: '2px 4px',
};

/** Заголовок панели (уровень 2). Фиксированная минимальная высота — чтобы
 * заголовки соседних панелей стояли на одной линии независимо от того, есть ли
 * в них кнопки команд (`PanelHeader`) или только подпись. */
export const SECTION_HEADER: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  minHeight: 28,
  boxSizing: 'border-box',
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: 0.3,
  padding: '0 8px',
  background: 'var(--vscode-editorGroupHeader-tabsBackground, #2d2d2d)',
  borderBottom: '1px solid var(--qc-border)',
  color: 'var(--vscode-descriptionForeground, #aaa)',
};

/** Заголовок колонки таблицы/сетки (уровень 5) — заметно легче заголовка
 * панели: без фона-полосы и капса, только приглушённая подпись и тонкая
 * линия снизу, чтобы шапка не была тяжелее самого содержимого. */
export const COLUMN_HEADER: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  padding: '3px 6px',
  color: 'var(--vscode-descriptionForeground, #aaa)',
  borderBottom: '1px solid var(--qc-border-subtle)',
  textAlign: 'left',
  whiteSpace: 'nowrap',
};

/** Компактная подсказка пустого списка / зоны приёма перетаскивания. */
export const EMPTY_HINT: React.CSSProperties = {
  padding: '6px 8px',
  fontSize: 12,
  lineHeight: 1.4,
  color: 'var(--vscode-descriptionForeground, #888)',
};

/** Разделитель строк сетки (условия, связи, таблицы) — тоньше рамки панели. */
export const GRID_ROW_BORDER = '1px solid var(--qc-border-subtle)';

export const panelBox: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  border: '1px solid var(--qc-border)',
  borderRadius: 6,
  overflow: 'hidden',
  // «Бумага» подпанели — как panelStyle в ConstructorView.
  background: 'var(--vscode-editor-background, #1e1e1e)',
};

/** Панель модального диалога — тот же фон виджета и рамка, что у редактора
 * выражений (визуальный эталон), без собственной раскладки. */
export const DIALOG_PANEL: React.CSSProperties = {
  background: 'var(--vscode-editorWidget-background, var(--vscode-editor-background, #1e1e1e))',
  border: '1px solid var(--qc-border)',
  borderRadius: 6,
  boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
};

/** Заголовок диалога (уровень 1 внутри модалки). */
export const DIALOG_TITLE: React.CSSProperties = { fontWeight: 600, fontSize: 14, flex: 1 };

/** Единый вертикальный отступ строк списков (поля/таблицы/условия и т.д.) —
 * раньше он расходился от вкладки к вкладке (1px/2px/3px), из-за чего текст
 * в панелях «Поля» выглядел «сжатым» по сравнению с остальной формой. */
export const ROW_PADDING_Y = 4;

/** Зазор «шеврон — иконка — подпись» в строках деревьев (как в деревьях редактора выражений). */
export const TREE_ROW_GAP = 6;

export const ROW: React.CSSProperties = {
  padding: `${ROW_PADDING_Y}px 8px`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  userSelect: 'none',
};

export const REMOVE_BTN: React.CSSProperties = {
  padding: '0 4px',
  cursor: 'pointer',
  background: 'transparent',
  // Тот же «цвет намерения», что у IconButton tone="remove" — единая семантика
  // удаления (как git-декорация удалённого файла) по всему конструктору.
  color: 'var(--vscode-gitDecoration-deletedResourceForeground, #c74e39)',
  border: 'none',
  borderRadius: 3,
  fontSize: 10,
  lineHeight: 1,
  flexShrink: 0,
};

/**
 * Глобальные CSS-правила (общий вид форм-контролов для всей формы
 * конструктора): вставляются один раз в корне ConstructorView. Часть правил
 * с `!important` — сознательно, чтобы перебить точечные инлайн-стили во
 * вкладках, которые ещё не переведены на константы выше.
 */
export const GLOBAL_FORM_CSS = `
  :root {
    /* Некоторые популярные темы (напр. Material Theme) задают
       --vscode-panel-border и --vscode-sideBar-background визуально не
       отличимыми от --vscode-editor-background — тогда границы панелей
       пропадают целиком. Поэтому граница и фон рамки формы вычисляются
       из foreground/editor-background самой темы через color-mix(), а не
       берутся из чужих токенов напрямую — гарантированно видны в любой
       теме, а не только в тех, что явно развели эти токены.
       Высококонтрастные темы отдают свой --vscode-contrastBorder первым. */
    --qc-border: var(--vscode-contrastBorder, color-mix(in srgb, var(--vscode-foreground, #cccccc) 24%, transparent));
    --qc-frame-bg: color-mix(in srgb, var(--vscode-editor-background, #1e1e1e) 92%, #808080 8%);
    /* Внутренние разделители (строки сетки, шапки колонок) — вдвое тише рамки
       панели; в высококонтрастных темах — та же контрастная граница. */
    --qc-border-subtle: var(--vscode-contrastBorder, color-mix(in srgb, var(--vscode-foreground, #cccccc) 12%, transparent));
  }

  .qc-row { background: transparent; }
  .qc-row:hover { background: var(--vscode-list-hoverBackground, rgba(255,255,255,0.06)); }

  /* Выделение строки списка: selected != focused (как списки VS Code).
     Пока фокус не в этом списке — «неактивное» выделение; когда фокус внутри
     (.qc-list получает его по клику, tabIndex=-1) — активное. Селекторы
     специфичнее .qc-row:hover, чтобы наведение не перекрашивало выделенную
     строку. Пунктирный контур виден только в высококонтрастных темах. */
  .qc-row.qc-row--selected {
    background: var(--vscode-list-inactiveSelectionBackground, rgba(128,128,128,0.22));
    color: var(--vscode-list-inactiveSelectionForeground, inherit);
    outline: 1px dashed var(--vscode-contrastActiveBorder, transparent);
    outline-offset: -1px;
  }
  .qc-list:focus-within .qc-row.qc-row--selected {
    background: var(--vscode-list-activeSelectionBackground, #094771);
    color: var(--vscode-list-activeSelectionForeground, #fff);
  }
  .qc-list:focus { outline: none; }

  /* Вторичная колонка строки дерева (тип поля) — приглушена и первой уходит
     в многоточие; на узкой панели скрывается целиком (тот же приём, что в
     деревьях редактора выражений, TREE_CSS). */
  .qc-tree-scope { container-type: inline-size; }
  .qc-row-detail {
    flex: 1 1 0;
    min-width: 0;
    padding-left: 12px;
    text-align: right;
    font-size: 12px;
    color: var(--vscode-descriptionForeground, #9d9d9d);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  @container (max-width: 220px) { .qc-row-detail { display: none; } }
  .qc-row--selected .qc-row-detail { color: inherit; opacity: 0.8; }

  /* Удаление строки: приглушённый крестик, «цвет намерения» — только при наведении. */
  .qc-row-remove {
    display: inline-flex; align-items: center; justify-content: center;
    /* Отрицательные поля по вертикали — кнопка не увеличивает высоту строки
       (плотность списков та же, что с прежним текстовым «✕»). */
    width: 20px; height: 18px; margin: -2px 0; padding: 0; flex-shrink: 0;
    border: none; border-radius: 3px; background: transparent; cursor: pointer;
    font-size: 14px;
    color: var(--vscode-icon-foreground, #c5c5c5);
    opacity: 0.55;
  }
  .qc-row-remove:hover, .qc-row-remove:focus-visible {
    opacity: 1;
    color: var(--vscode-gitDecoration-deletedResourceForeground, #c74e39);
    background: var(--vscode-toolbar-hoverBackground, rgba(90,93,94,0.31));
  }

  /* Поле поиска с иконкой и кнопками внутри рамки — фокус подсвечивает рамку. */
  .qc-search:focus-within { border-color: var(--vscode-focusBorder, #007fd4) !important; }

  /* Разделитель панелей: невидим в покое, тонкая линия при наведении/перетаскивании. */
  .qc-sash { position: relative; }
  .qc-sash::after {
    content: ''; position: absolute; transition: background-color 0.1s 0.1s;
  }
  .qc-sash[aria-orientation="vertical"]::after { top: 0; bottom: 0; left: 50%; width: 2px; margin-left: -1px; }
  .qc-sash[aria-orientation="horizontal"]::after { left: 0; right: 0; top: 50%; height: 2px; margin-top: -1px; }
  .qc-sash:hover::after, .qc-sash:active::after { background: var(--vscode-sash-hoverBorder, var(--vscode-focusBorder, #007fd4)); }

  button:focus-visible, [role="tab"]:focus-visible {
    outline: 1px solid var(--vscode-focusBorder, #007fd4);
    outline-offset: -1px;
  }

  input::placeholder { color: var(--vscode-input-placeholderForeground, rgba(204,204,204,0.5)); }

  input[type="checkbox"], input[type="radio"] {
    accent-color: var(--vscode-button-background, #0e639c);
    width: 14px;
    height: 14px;
    cursor: pointer;
    flex-shrink: 0;
  }

  button {
    transition: filter 0.1s, background-color 0.1s;
  }
  button:not(:disabled):hover {
    filter: brightness(1.15);
  }
  button:not(:disabled):active {
    filter: brightness(0.85);
  }
  button:disabled {
    cursor: default;
  }

  input[type="text"]:focus-visible,
  input[type="number"]:focus-visible,
  select:focus-visible,
  textarea:focus-visible {
    outline: 1px solid var(--vscode-focusBorder, #007fd4);
    outline-offset: -1px;
  }

  fieldset {
    border-radius: 6px !important;
  }
`;
