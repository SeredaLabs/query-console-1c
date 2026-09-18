import type * as React from 'react';

/**
 * New Builder shell — геометрія з .claude/new_builder_visual_spec.md (§3, §16).
 * Тримати константи в одному місці, щоб компоненти Phase 1 не розходились
 * у цифрах при подальших фазах.
 */
export const DIMENSIONS = {
  documentBar: 44,
  // Phase 3E: компактна package-стрічка над WorkspaceNav (замінює Sidebar → Пакет).
  packageNav: 32,
  workspaceNav: 40,
  inspector: { default: 300, min: 260, max: 380 },
  sdbl: { collapsed: 36, default: 180, min: 120, max: 400 },
  resizeHandle: 6,
} as const;

/**
 * Семантичні кольорові токени (§7 visual spec) — жодного хардкодженого hex:
 * усе через `--vscode-*` змінні, які VS Code сам підставляє під активну тему.
 * Це і є "light/dark theme foundation" Phase 1 — окремої CSS-теми не потрібно,
 * достатньо ніколи не писати колір напряму.
 */
export const TOKENS: Record<string, string> = {
  background: 'var(--vscode-editor-background)',
  surface1: 'var(--vscode-sideBar-background, var(--vscode-editor-background))',
  surface2: 'var(--vscode-editorGroupHeader-tabsBackground, var(--vscode-sideBar-background))',
  surfaceHover: 'var(--vscode-list-hoverBackground)',
  surfaceSelected: 'var(--vscode-list-activeSelectionBackground)',
  border: 'var(--vscode-panel-border, var(--vscode-widget-border))',
  borderStrong: 'var(--vscode-contrastActiveBorder, var(--vscode-focusBorder))',
  /**
   * Phase 3D — низькоконтрастний токен ЛИШЕ для dot-grid канви (§5 gap
   * analysis): `--vscode-editorIndentGuide-background` семантично точно те
   * саме призначення (subtle структурний маркер), що й потрібно тут, і вже
   * навмисно приглушений у будь-якій темі — на відміну від `border`, який
   * використовується і для реальних меж карток/панелей.
   */
  borderSubtle: 'var(--vscode-editorIndentGuide-background, var(--vscode-panel-border))',
  text: 'var(--vscode-foreground)',
  textSecondary: 'var(--vscode-descriptionForeground)',
  textMuted: 'var(--vscode-disabledForeground, var(--vscode-descriptionForeground))',
  accent: 'var(--vscode-focusBorder)',
  danger: 'var(--vscode-errorForeground)',
  warning: 'var(--vscode-editorWarning-foreground)',
  success: 'var(--vscode-terminal-ansiGreen, var(--vscode-charts-green))',
  /**
   * JOIN-kind color identity (INNER/LEFT/FULL) — навмисно НЕ ті самі токени,
   * що selection (`accent`) чи inclusion (`success`, зарезервований лише
   * для field/source checkbox-семантики): три різні `--vscode-charts-*`
   * кольори дають кожному типу з'єднання власну ідентичність без конфлікту
   * з уже зафіксованими семантиками.
   */
  chartBlue: 'var(--vscode-charts-blue, var(--vscode-focusBorder))',
  chartOrange: 'var(--vscode-charts-orange, var(--vscode-editorWarning-foreground))',
  chartPurple: 'var(--vscode-charts-purple, var(--vscode-descriptionForeground))',
};

/** Кореневий inline-стиль App: базові фон/текст/шрифт з токенів вище. */
export const ROOT_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  width: '100%',
  overflow: 'hidden',
  background: TOKENS.background,
  color: TOKENS.text,
  fontSize: 13,
  lineHeight: '18px',
  fontFamily: 'var(--vscode-font-family)',
};

/** §6 typography — секційні заголовки (11px, 600, uppercase). */
export const SECTION_LABEL: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  color: TOKENS.textSecondary,
};
