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
  border: '1px solid var(--vscode-panel-border, #444)',
  borderRadius: 6,
  padding: '10px 12px',
  margin: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  background: 'var(--vscode-sideBar-background, rgba(255,255,255,0.02))',
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
  border: '1px solid var(--vscode-input-border, #555)',
  borderRadius: 3,
  fontSize: 12,
  padding: '3px 6px',
};

export const SECTION_HEADER: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: 0.3,
  padding: '5px 8px',
  background: 'var(--vscode-editorGroupHeader-tabsBackground, #2d2d2d)',
  borderBottom: '1px solid var(--vscode-panel-border, #444)',
  color: 'var(--vscode-descriptionForeground, #aaa)',
};

export const ROW: React.CSSProperties = {
  padding: '3px 8px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  userSelect: 'none',
};

export const REMOVE_BTN: React.CSSProperties = {
  padding: '0 4px',
  cursor: 'pointer',
  background: 'transparent',
  color: 'var(--vscode-descriptionForeground, #888)',
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
