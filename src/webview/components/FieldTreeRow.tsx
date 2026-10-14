import * as React from 'react';
import type { MetaField } from '../../core/metadata/types';
import type { RefId } from '../../shared/messages';
import { Chevron } from './Chevron';
import { FieldSourceRow } from './FieldSourceRow';

interface Props {
  field: MetaField;
  depth: number;
  expandedRefs: Map<string, MetaField[]>;
  onExpandRef: (ref: RefId) => void;
  onDragStart: (e: React.DragEvent, path: string) => void;
  /** Путь родительского поля — для составных путей ссылочных полей (Поле.Подполе). */
  pathPrefix?: string;
  titlePrefix?: string;
}

/**
 * Строка поля метаданных с иконкой (обычное/ссылочное) и раскрытием ссылочных
 * полей в дерево — общий вид для панелей «Поля» на разных вкладках
 * («Таблицы и поля», «Условия», ...).
 */
export function FieldTreeRow({ field, depth, expandedRefs, onExpandRef, onDragStart, pathPrefix, titlePrefix }: Props): React.ReactElement {
  const [localExpanded, setLocalExpanded] = React.useState(false);
  const ref = field.types.find(t => t.ref)?.ref ?? null;
  const refKey = ref ? `${ref.kind}.${ref.name}` : null;
  const fetched = refKey ? expandedRefs.has(refKey) : false;
  const expanded = localExpanded && fetched;
  const path = pathPrefix ? `${pathPrefix}.${field.name}` : field.name;

  function handleToggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (!ref || !refKey) return;
    if (!fetched) onExpandRef(ref);
    setLocalExpanded(prev => !prev);
  }

  return (
    <>
      <FieldSourceRow label={field.name} title={titlePrefix ? `${titlePrefix}.${path}` : path} depth={depth} isReference={!!ref}
        onDragStart={e => onDragStart(e, path)}
        leading={ref ? <Chevron expanded={expanded} onClick={handleToggle} /> : undefined} />
      {expanded && refKey && expandedRefs.get(refKey)?.map(subField => (
        <FieldTreeRow
          key={`${path}.${subField.name}`}
          field={subField}
          depth={depth + 1}
          expandedRefs={expandedRefs}
          onExpandRef={onExpandRef}
          onDragStart={onDragStart}
          pathPrefix={path}
          titlePrefix={titlePrefix}
        />
      ))}
    </>
  );
}
