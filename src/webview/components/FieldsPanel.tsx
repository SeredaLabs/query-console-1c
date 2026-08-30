import * as React from 'react';
import type { SelectedTable, SelectedField, SelectedTabSectionField } from '../../core/query/queryModel';
import { defaultTableAlias } from '../../core/query/queryModel';
import { IconButton } from './IconButton';
import { Chevron } from './Chevron';
import { MetaKindIcon } from './MetaKindIcon';
import { SECTION_HEADER } from '../sharedStyles';

interface Props {
  selectedTables: SelectedTable[];
  selectedFields: SelectedField[];
  tabSectionFields: SelectedTabSectionField[];
  focusedSelectedFieldIdx: number | null;
  onDropField: (tableFullName: string, fieldPath: string) => void;
  onDropTabSection: (parentTableFullName: string, tsName: string, tsFullName: string, tsFields: string[]) => void;
  onRemoveField: (fieldIdx: number) => void;
  onRemoveTabSection: (tableId: string, tsName: string) => void;
  onRemoveTabSectionSubField: (tableId: string, tsName: string, fieldName: string) => void;
  onFocusField: (idx: number) => void;
  canAddExpression: boolean;
  onAddExpression: () => void;
  /** 7.8.5: двойной клик по полю — правка как произвольного выражения. */
  onEditField: (idx: number) => void;
  /** 7.8.6: перетаскивание таблицы в список — добавить все её поля. */
  onDropTable: (tableFullName: string) => void;
}

const REMOVE_BTN: React.CSSProperties = {
  padding: '0 4px',
  cursor: 'pointer',
  background: 'transparent',
  color: 'var(--vscode-descriptionForeground, #888)',
  border: 'none',
  fontSize: 10,
  lineHeight: 1,
  flexShrink: 0,
};

export function FieldsPanel({
  selectedTables, selectedFields, tabSectionFields, focusedSelectedFieldIdx,
  onDropField, onDropTabSection, onRemoveField, onRemoveTabSection, onRemoveTabSectionSubField,
  onFocusField, canAddExpression, onAddExpression, onEditField, onDropTable,
}: Props): React.ReactElement {
  const [isDragOver, setIsDragOver] = React.useState(false);
  const [expandedTs, setExpandedTs] = React.useState<Set<string>>(new Set(
    // start all ТЧ expanded
  ));

  // Auto-expand newly added ТЧ sections
  React.useEffect(() => {
    setExpandedTs(prev => {
      const next = new Set(prev);
      for (const ts of tabSectionFields) {
        const key = `${ts.tableId}:${ts.tsName}`;
        next.add(key);
      }
      return next;
    });
  }, [tabSectionFields]);

  function toggleTs(key: string) {
    setExpandedTs(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragOver(true);
  }

  function handleDragLeave() {
    setIsDragOver(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
      if (data.kind === 'field') {
        onDropField(data.tableFullName, data.fieldPath);
      } else if (data.kind === 'tabularsection') {
        onDropTabSection(data.parentTableFullName, data.tsName, data.tsFullName, data.tsFields);
      } else if (data.kind === 'table') {
        // 7.8.6: таблица брошена в список «Поля» → добавить все её поля.
        onDropTable(data.tableFullName);
      }
    } catch {
      // ignore malformed drag data
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={SECTION_HEADER}>Поля</div>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, padding: 4, gap: 4 }}>
      <div style={{ display: 'flex', gap: 2 }}>
        <IconButton
          icon="close"
          title="Убрать поле"
          disabled={focusedSelectedFieldIdx === null}
          onClick={() => focusedSelectedFieldIdx !== null && onRemoveField(focusedSelectedFieldIdx)}
        />
        <IconButton
          icon="add"
          title="Добавить поле (произвольное выражение)"
          disabled={!canAddExpression}
          onClick={onAddExpression}
        />
      </div>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          flex: 1,
          overflowY: 'auto',
          fontSize: 13,
          border: isDragOver ? '1px dashed var(--vscode-focusBorder, #007fd4)' : '1px dashed transparent',
          borderRadius: 2,
          transition: 'border-color 0.1s',
          minHeight: 40,
        }}
      >
        {/* Regular fields */}
        {selectedFields.map((f, i) => {
          const table = selectedTables.find(t => t.id === f.tableId);
          const label = f.expression
            ? f.expression.replace(/\s+/g, ' ').trim()
            : (table ? `${defaultTableAlias(table)}.${f.path}` : f.path);
          return (
            <div
              key={f.expression ? `${f.tableId}:expr:${i}` : `${f.tableId}:${f.path}`}
              data-field-idx={i}
              onClick={() => onFocusField(i)}
              onDoubleClick={() => onEditField(i)}
              title="Двойной клик — править как произвольное выражение"
              className="qc-row"
              style={{
                padding: '2px 6px',
                cursor: 'default',
                background: focusedSelectedFieldIdx === i ? 'var(--vscode-list-activeSelectionBackground, #094771)' : undefined,
                color: focusedSelectedFieldIdx === i ? 'var(--vscode-list-activeSelectionForeground, #fff)' : 'inherit',
                userSelect: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span
                title={f.expression ?? label}
                style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <span className={`codicon codicon-${f.expression ? 'symbol-operator' : 'symbol-field'}`} style={{ fontSize: 13, opacity: 0.75, flexShrink: 0 }} />
                {label}
              </span>
              <button style={REMOVE_BTN} onClick={e => { e.stopPropagation(); onRemoveField(i); }}>✕</button>
            </div>
          );
        })}

        {/* Tabular section fields */}
        {tabSectionFields.map(ts => {
          const table = selectedTables.find(t => t.id === ts.tableId);
          const tableAlias = table?.fullName.split('.')[1] ?? ts.tableId;
          const label = `${tableAlias}.${ts.tsName}`;
          const tsKey = `${ts.tableId}:${ts.tsName}`;
          const isExpanded = expandedTs.has(tsKey);
          return (
            <div key={tsKey}>
              <div
                className="qc-row"
                style={{
                  padding: '2px 6px',
                  cursor: 'default',
                  userSelect: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <Chevron expanded={isExpanded} onClick={() => toggleTs(tsKey)} />
                <MetaKindIcon kind="ТабличнаяЧасть" />
                <span style={{ flex: 1 }}>{label}</span>
                <button
                  style={REMOVE_BTN}
                  title="Убрать табличную часть"
                  onClick={() => onRemoveTabSection(ts.tableId, ts.tsName)}
                >
                  ✕
                </button>
              </div>
              {isExpanded && ts.fields.map(fieldName => (
                <div
                  key={fieldName}
                  className="qc-row"
                  style={{
                    paddingLeft: 24,
                    paddingTop: 1,
                    paddingBottom: 1,
                    fontSize: 12,
                    color: 'var(--vscode-descriptionForeground, #aaa)',
                    userSelect: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingRight: 6,
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span className="codicon codicon-symbol-field" style={{ fontSize: 13, opacity: 0.75, flexShrink: 0 }} />
                    {fieldName}
                  </span>
                  <button
                    style={REMOVE_BTN}
                    onClick={() => onRemoveTabSectionSubField(ts.tableId, ts.tsName, fieldName)}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
}
