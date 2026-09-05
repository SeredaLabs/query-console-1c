import * as React from 'react';

// Единый набор стилей форм-элементов для всех вкладок конструктора — раньше
// каждая вкладка копипастила собственную (слегка отличающуюся) копию этих
// констант, из-за чего внешний вид расходился от вкладки к вкладке.

export const BTN: React.CSSProperties = {
  padding: '5px 14px',
  cursor: 'pointer',
  background: 'var(--vscode-button-background, #0e639c)',
  color: 'var(--vscode-button-foreground, #fff)',
  border: 'none',
  borderRadius: 4,
  fontSize: 12,
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

export const SECTION_HEADER: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: 0.3,
  padding: '5px 8px',
  background: 'var(--vscode-editorGroupHeader-tabsBackground, #2d2d2d)',
  borderBottom: '1px solid var(--qc-border)',
  color: 'var(--vscode-descriptionForeground, #aaa)',
};

export const panelBox: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  border: '1px solid var(--qc-border)',
  borderRadius: 6,
  overflow: 'hidden',
  // «Бумага» подпанели — как panelStyle в ConstructorView.
  background: 'var(--vscode-editor-background, #1e1e1e)',
};

/** Единый вертикальный отступ строк списков (поля/таблицы/условия и т.д.) —
 * раньше он расходился от вкладки к вкладке (1px/2px/3px), из-за чего текст
 * в панелях «Поля» выглядел «сжатым» по сравнению с остальной формой. */
export const ROW_PADDING_Y = 4;

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
  }

  .qc-row { background: transparent; }
  .qc-row:hover { background: var(--vscode-list-hoverBackground, rgba(255,255,255,0.06)); }

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
