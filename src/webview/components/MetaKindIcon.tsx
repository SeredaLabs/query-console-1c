import * as React from 'react';
import { METADATA_KIND_ICONS } from './metadataKindIcons';

interface Props {
  /** Вид метаданных (Справочник, Документ, ...) или null для общего вида. */
  kind: string | null;
  size?: number;
}

/**
 * Иконка вида метаданных — те же контуры, что в других 1С-расширениях для
 * VS Code (см. metadataKindIcons.ts), а не generic codicon. Для неизвестного
 * вида (например «ВременнаяТаблица», которой нет в реальных метаданных 1С)
 * откатывается на обычную иконку таблицы.
 */
export function MetaKindIcon({ kind, size = 13 }: Props): React.ReactElement {
  const icon = kind ? METADATA_KIND_ICONS[kind] : undefined;
  if (!icon) {
    return <span className="codicon codicon-table" style={{ fontSize: size, opacity: 0.75, flexShrink: 0 }} />;
  }
  return (
    <svg
      viewBox={icon.viewBox}
      width={size}
      height={size}
      fill="currentColor"
      style={{ opacity: 0.75, flexShrink: 0 }}
    >
      <path d={icon.d} />
    </svg>
  );
}
