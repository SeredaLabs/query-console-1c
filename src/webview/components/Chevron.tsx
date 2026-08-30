import * as React from 'react';

interface Props {
  expanded: boolean;
  onClick?: (e: React.MouseEvent) => void;
  size?: number;
}

/** Индикатор раскрытия узла дерева — заменяет текстовые глифы ▶/▼ иконкой codicon. */
export function Chevron({ expanded, onClick, size = 12 }: Props): React.ReactElement {
  return (
    <span
      className={`codicon codicon-chevron-${expanded ? 'down' : 'right'}`}
      onClick={onClick}
      style={{
        fontSize: size,
        width: 14,
        flexShrink: 0,
        cursor: onClick ? 'pointer' : 'inherit',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    />
  );
}
