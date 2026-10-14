import * as React from 'react';
import type { MetaTable } from '../../core/metadata/types';
import type { SelectedField, SelectedTable } from '../../core/query/queryModel';
import { defaultTableAlias } from '../../core/query/queryModel';
import { FieldSourceGroup } from './FieldSourceGroup';
import { FieldSourceRow } from './FieldSourceRow';

interface Props {
  onSelect?: (field: SelectedField) => void;
  isSelected?: (field: SelectedField) => boolean;
  fields: SelectedField[];
  tables: SelectedTable[];
  metadata: MetaTable[];
  onDragStart: (e: React.DragEvent, field: SelectedField) => void;
  labelFor?: (field: SelectedField) => string;
  actionFor?: (field: SelectedField) => React.ReactNode;
}

/** Groups the caller's eligible fields without changing their identities or aliases. */
export function SelectedFieldsTree({ fields, tables, metadata, onDragStart, labelFor, actionFor, onSelect, isSelected }: Props): React.ReactElement {
  const groups = new Map<string, SelectedField[]>();
  for (const field of fields) {
    const group = groups.get(field.tableId);
    if (group) group.push(field);
    else groups.set(field.tableId, [field]);
  }
  return <>{Array.from(groups, ([tableId, entries]) => {
    const table = tables.find(t => t.id === tableId);
    const meta = metadata.find(m => m.fullName === table?.fullName);
    const alias = table ? defaultTableAlias(table) : '';
    const rows = entries.map((field, index) => {
      // A reference owner does not prove the type of a nested leaf.
      const definition = meta?.fields.find(f => f.name === field.path);
      return <FieldSourceRow key={`${field.path}:${index}`} depth={table ? 1 : 0}
        label={labelFor?.(field) ?? field.path}
        title={alias ? `${alias}.${field.path}` : field.path}
        isReference={definition?.types.some(t => !!t.ref)}
        onDragStart={e => onDragStart(e, field)} action={actionFor?.(field)}
        onSelect={onSelect ? () => onSelect(field) : undefined} selected={isSelected?.(field)} />;
    });
    return table
      ? <FieldSourceGroup key={tableId} label={alias} title={table.fullName} kind={meta?.kind ?? null}>{rows}</FieldSourceGroup>
      : <React.Fragment key={tableId}>{rows}</React.Fragment>;
  })}</>;
}
