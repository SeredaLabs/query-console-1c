import * as React from 'react';

/** Смысловая роль команды — красим иконку в её «цвет намерения», как git-декорации
 * (добавлено/изменено/удалено), чтобы ряд из нескольких кнопок читался по цвету, а
 * не только по форме глифа. `default` — нейтральная команда (настройки и т.п.). */
export type IconButtonTone = 'default' | 'add' | 'remove' | 'edit';

const TONE_COLOR: Record<IconButtonTone, string> = {
  default: 'var(--vscode-icon-foreground, #ccc)',
  add: 'var(--vscode-gitDecoration-addedResourceForeground, #81b88b)',
  remove: 'var(--vscode-gitDecoration-deletedResourceForeground, #c74e39)',
  edit: 'var(--vscode-gitDecoration-modifiedResourceForeground, #73c0d4)',
};

interface Props {
  /** Имя иконки codicon без префикса, например "close", "gear", "edit". */
  icon: string;
  title: string;
  onClick?: () => void;
  disabled?: boolean;
  testId?: string;
  /** @default 'default' */
  tone?: IconButtonTone;
}

/**
 * Кнопка тулбара в стиле нативных иконок VS Code (codicon + hover-фон),
 * вместо закрашенного прямоугольника с текстовой подписью.
 */
export function IconButton({ icon, title, onClick, disabled, testId, tone = 'default' }: Props): React.ReactElement {
  const [hover, setHover] = React.useState(false);

  return (
    <button
      className={`codicon codicon-${icon}`}
      title={title}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      data-testid={testId}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 24,
        height: 24,
        padding: 0,
        border: 'none',
        borderRadius: 4,
        cursor: disabled ? 'default' : 'pointer',
        background: hover && !disabled ? 'var(--vscode-toolbar-hoverBackground, rgba(90,93,94,0.4))' : 'transparent',
        color: disabled ? 'var(--vscode-disabledForeground, #666)' : TONE_COLOR[tone],
        opacity: disabled ? 0.5 : 1,
        fontSize: 16,
        flexShrink: 0,
      }}
    />
  );
}
