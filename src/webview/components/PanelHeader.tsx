import * as React from 'react';
import { SECTION_HEADER } from '../sharedStyles';

interface Props {
  title: React.ReactNode;
  /** Кнопки команд панели (`IconButton`) — сразу за подписью, как командная
   * строка секции «Выражение» в редакторе выражений. */
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

/**
 * Заголовок панели вместе с её командами — одна полоса вместо прежних двух
 * («ТАБЛИЦЫ» + отдельная строка кнопок под ней). Кнопки остаются в верхнем
 * левом углу панели, где их привыкли искать.
 */
export function PanelHeader({ title, children, style }: Props): React.ReactElement {
  return (
    <div style={{ ...SECTION_HEADER, paddingRight: 4, ...style }}>
      <span style={{ marginRight: children ? 6 : 0, whiteSpace: 'nowrap' }}>{title}</span>
      {children}
    </div>
  );
}
