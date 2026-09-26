import * as React from 'react';

export const TOOLBAR_SEPARATOR: React.CSSProperties = { width: 1, alignSelf: 'stretch', background: 'var(--qc-border)', margin: '4px 4px' };

interface ToolbarButtonProps {
  /** Имя codicon без префикса (см. node_modules/@vscode/codicons для полного списка). */
  icon: string;
  label?: string;
  active?: boolean;
  disabled?: boolean;
  title: string;
  onClick?: () => void;
  /** Разворот глифа (нет отдельной иконки «отменить» в codicons — берём «redo» зеркально). */
  mirrorIcon?: boolean;
  testId?: string;
}

/**
 * Кнопка тулбара «иконка (+ подпись)» в стиле нативных VS Code toolbar-кнопок —
 * тот же hover-фон, что и у `IconButton`, плюс `active`-подсветка для кнопок-тумблеров
 * (Параметры/Структура). Раньше тулбар был из голого текста — по просьбе пользователя
 * заменён на codicon-иконки, как в остальном UI конструктора.
 */
export function ToolbarButton({ icon, label, active, disabled, title, onClick, mirrorIcon, testId }: ToolbarButtonProps): React.ReactElement {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      title={title}
      data-testid={testId}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        background: active
          ? 'var(--vscode-toolbar-activeBackground, rgba(90,93,94,0.55))'
          : hover && !disabled ? 'var(--vscode-toolbar-hoverBackground, rgba(90,93,94,0.4))' : 'transparent',
        border: 'none',
        borderRadius: 4,
        padding: '4px 8px',
        fontSize: 12,
        color: disabled ? 'var(--vscode-disabledForeground, #6b6b6b)' : 'var(--vscode-foreground, #ccc)',
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      <span
        className={`codicon codicon-${icon}`}
        style={{ fontSize: 14, transform: mirrorIcon ? 'scaleX(-1)' : undefined }}
      />
      {label && <span>{label}</span>}
    </button>
  );
}
