import * as React from 'react';

interface Props {
  title: string;
  onClick: (e: React.MouseEvent) => void;
}

/**
 * Удаление строки списка/сетки. Раньше — красный текстовый «✕» в каждой строке,
 * из-за чего справа по всему списку тянулась красная колонка. Теперь — тот же
 * codicon, что и у остальных команд, приглушённый; красный только при наведении
 * (стили `.qc-row-remove` в `GLOBAL_FORM_CSS`).
 */
export function RowRemoveButton({ title, onClick }: Props): React.ReactElement {
  return (
    <button
      type="button"
      className="qc-row-remove codicon codicon-close"
      title={title}
      aria-label={title}
      onClick={onClick}
    />
  );
}
