import * as React from 'react';
import { ROW_PADDING_Y, TREE_ROW_GAP } from '../sharedStyles';

interface Props {
  onSelect?: () => void;
  selected?: boolean;
  label: string;
  title: string;
  depth: number;
  isReference?: boolean;
  leading?: React.ReactNode;
  action?: React.ReactNode;
  onDragStart: (e: React.DragEvent) => void;
}

/** Shared visual row; each tab retains its own field eligibility and drag payload. */
export function FieldSourceRow({ label, title, depth, isReference, leading, action, onDragStart, onSelect, selected }: Props): React.ReactElement {
  return (
    <div data-field-item draggable onDragStart={onDragStart} className={selected ? "qc-row qc-row--selected" : "qc-row"} title={title}
      onClick={onSelect} aria-selected={selected}
      style={{ padding: `${ROW_PADDING_Y}px 8px`, paddingLeft: 8 + depth * 16,
        minHeight: 24, lineHeight: '16px', boxSizing: 'border-box', userSelect: 'none', cursor: 'grab',
        display: 'flex', alignItems: 'center', gap: TREE_ROW_GAP, whiteSpace: 'nowrap' }}>
      {leading ?? <span style={{ width: 14, flexShrink: 0 }} />}
      <span className={`codicon codicon-${isReference ? 'references' : 'symbol-field'}`}
        style={{ fontSize: 13, opacity: 0.75, flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      {action && <span style={{ height: 16, flexShrink: 0, display: 'flex', alignItems: 'center' }}>{action}</span>}
    </div>
  );
}
