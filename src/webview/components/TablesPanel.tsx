import * as React from 'react';
import type { MetaTable, MetaField } from '../../core/metadata/types';
import type { SelectedTable } from '../../core/query/queryModel';
import { defaultTableAlias } from '../../core/query/queryModel';
import type { RefId } from '../../shared/messages';
import { accumPeriodFields } from '../../core/query/accumVirtualFields';
import { IconButton } from './IconButton';
import { Chevron } from './Chevron';
import { MetaKindIcon } from './MetaKindIcon';
import { SECTION_HEADER } from '../sharedStyles';

interface Props {
  metaTables: MetaTable[];
  selectedTables: SelectedTable[];
  focusedSelectedTableId: string | null;
  expandedRefs: Map<string, MetaField[]>;
  onAddTable: (table: MetaTable) => void;
  onRemoveTable: (tableId: string) => void;
  onFocusTable: (id: string) => void;
  onExpandRef: (ref: RefId) => void;
  onOpenVirtualParams: (tableId: string) => void;
  /** 7.8.8: создать источник-вложенный запрос. */
  onAddSubquery: () => void;
  /** 7.8.9: создать описание временной таблицы. */
  onAddTempTable: () => void;
  /** 7.8.17: перетаскивание ВТ из группы «Временные таблицы» дерева → источник-ВТ. */
  onAddTempTableSource: (name: string, fields: string[]) => void;
  /** 7.8.16: двойной клик по строке таблицы — добавить все её поля (любой источник). */
  onActivateTable: (tableId: string) => void;
  /** 7.8.14/7.8.15: «Редактирование» — открыть окно ВТ / вложенный конструктор для
   * выделенного источника (активна только для ВТ/подзапроса). */
  onEditTable: (tableId: string) => void;
}

function FieldRow({ tableFullName, field, depth, expandedRefs, onExpandRef }: {
  tableFullName: string;
  field: MetaField;
  depth: number;
  expandedRefs: Map<string, MetaField[]>;
  onExpandRef: (ref: RefId) => void;
}): React.ReactElement {
  const [localExpanded, setLocalExpanded] = React.useState(false);
  const ref = field.types.find(t => t.ref)?.ref ?? null;
  const refKey = ref ? `${ref.kind}.${ref.name}` : null;
  const fetched = refKey ? expandedRefs.has(refKey) : false;
  const expanded = localExpanded && fetched && refKey ? true : false;

  function handleToggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (!ref || !refKey) return;
    if (!fetched) onExpandRef(ref);
    setLocalExpanded(prev => !prev);
  }

  return (
    <>
      <div
        draggable
        className="qc-row"
        onDragStart={e => {
          e.dataTransfer.setData('text/plain', JSON.stringify({ kind: 'field', tableFullName, fieldPath: field.name }));
          e.dataTransfer.effectAllowed = 'copy';
        }}
        style={{
          paddingLeft: 8 + depth * 16,
          paddingTop: 1,
          paddingBottom: 1,
          fontSize: 12,
          color: 'var(--vscode-descriptionForeground, #aaa)',
          userSelect: 'none',
          cursor: 'default',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        {ref ? <Chevron expanded={expanded} onClick={handleToggle} /> : <span style={{ width: 14, flexShrink: 0 }} />}
        <span className={`codicon codicon-${ref ? 'references' : 'symbol-field'}`} style={{ fontSize: 13, opacity: 0.75, flexShrink: 0 }} />
        <span>{field.name}</span>
      </div>
      {expanded && refKey && expandedRefs.get(refKey)?.map(subField => (
        <FieldRow
          key={`${field.name}.${subField.name}`}
          tableFullName={tableFullName}
          field={{ ...subField, name: `${field.name}.${subField.name}` }}
          depth={depth + 1}
          expandedRefs={expandedRefs}
          onExpandRef={onExpandRef}
        />
      ))}
    </>
  );
}

export function TablesPanel({ metaTables, selectedTables, focusedSelectedTableId, expandedRefs, onAddTable, onRemoveTable, onFocusTable, onExpandRef, onOpenVirtualParams, onAddSubquery, onAddTempTable, onAddTempTableSource, onActivateTable, onEditTable }: Props): React.ReactElement {
  const [expandedTableIds, setExpandedTableIds] = React.useState<Set<string>>(new Set());
  const [expandedTsSections, setExpandedTsSections] = React.useState<Set<string>>(new Set());
  const [isDragOver, setIsDragOver] = React.useState(false);

  function toggleExpand(id: string) {
    setExpandedTableIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleTs(key: string) {
    setExpandedTsSections(prev => {
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
      if (data.kind === 'table') {
        const meta = metaTables.find(t => t.fullName === data.tableFullName);
        if (meta) onAddTable(meta);
      } else if (data.kind === 'tabularsection') {
        // Add ТЧ as separate table
        const meta = metaTables.find(t => t.fullName === data.tsFullName);
        if (meta) onAddTable(meta);
      } else if (data.kind === 'temptable') {
        // 7.8.17: ВТ из группы «Временные таблицы» дерева → источник-ВТ (`врем КАК врем`).
        if (typeof data.name === 'string') onAddTempTableSource(data.name, Array.isArray(data.fields) ? data.fields : []);
      }
    } catch {
      // ignore malformed drag data
    }
  }

  const focusedTable = selectedTables.find(t => t.id === focusedSelectedTableId);
  const focusedMeta = focusedTable ? metaTables.find(m => m.fullName === focusedTable.fullName) : undefined;
  const focusedIsVirtual = !!focusedMeta?.virtual;
  // 7.8.14/7.8.15: «Редактирование» активно только для ВТ/подзапроса.
  const focusedIsEditable = !!focusedTable && (!!focusedTable.subquery || !!focusedTable.tempTable);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={SECTION_HEADER}>Таблицы</div>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, padding: 4, gap: 4 }}>
      <div style={{ display: 'flex', gap: 2 }}>
        <IconButton
          icon="close"
          title="Убрать таблицу"
          disabled={!focusedSelectedTableId}
          onClick={() => focusedSelectedTableId && onRemoveTable(focusedSelectedTableId)}
        />
        <IconButton
          icon="gear"
          title="Параметры виртуальной таблицы"
          disabled={!focusedIsVirtual}
          onClick={() => focusedSelectedTableId && onOpenVirtualParams(focusedSelectedTableId)}
        />
        <IconButton
          testId="add-subquery"
          icon="list-tree"
          title="Создать вложенный запрос (ВЗ)"
          onClick={onAddSubquery}
        />
        <IconButton
          testId="add-temp-table"
          icon="table"
          title="Создать описание временной таблицы"
          onClick={onAddTempTable}
        />
        <IconButton
          testId="edit-source"
          icon="edit"
          title="Редактирование"
          disabled={!focusedIsEditable}
          onClick={() => focusedSelectedTableId && onEditTable(focusedSelectedTableId)}
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
        {selectedTables.map(t => {
          const isSelected = focusedSelectedTableId === t.id;
          const isExpanded = expandedTableIds.has(t.id);
          const meta = metaTables.find(m => m.fullName === t.fullName);
          return (
            <div key={t.id}>
              <div
                data-table-id={t.id}
                data-table-alias={defaultTableAlias(t)}
                draggable
                onDragStart={e => {
                  // 7.8.6: перетаскивание выбранной таблицы в список «Поля» → все её поля.
                  e.dataTransfer.setData('text/plain', JSON.stringify({ kind: 'table', tableFullName: t.fullName }));
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                onClick={() => { onFocusTable(t.id); toggleExpand(t.id); }}
                onDoubleClick={() => onActivateTable(t.id)}
                className="qc-row"
                style={{
                  padding: '2px 6px',
                  cursor: 'default',
                  background: isSelected ? 'var(--vscode-list-activeSelectionBackground, #094771)' : undefined,
                  color: isSelected ? 'var(--vscode-list-activeSelectionForeground, #fff)' : 'inherit',
                  userSelect: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <Chevron expanded={isExpanded} />
                <MetaKindIcon kind={meta?.kind ?? null} />
                <span title={t.fullName}>{defaultTableAlias(t)}</span>
              </div>
              {isExpanded && meta && (
                <>
                  {(
                    meta.virtual && ['Обороты', 'ОборотыДтКт', 'ОстаткиИОбороты'].includes(meta.virtual.slice)
                      ? [...accumPeriodFields(t.virtual?.periodicity), ...meta.fields]
                      : meta.fields
                  ).map(field => (
                    <FieldRow
                      key={field.name}
                      tableFullName={t.fullName}
                      field={field}
                      depth={1}
                      expandedRefs={expandedRefs}
                      onExpandRef={onExpandRef}
                    />
                  ))}
                  {meta.tabularSections?.map(ts => {
                    const tsKey = `${t.id}:${ts.name}`;
                    const isTsExpanded = expandedTsSections.has(tsKey);
                    return (
                      <div key={ts.name}>
                        <div
                          draggable
                          onDragStart={e => {
                            e.dataTransfer.setData('text/plain', JSON.stringify({
                              kind: 'tabularsection',
                              parentTableFullName: t.fullName,
                              tsName: ts.name,
                              tsFullName: ts.fullName,
                              tsFields: ts.fields.map(f => f.name),
                            }));
                            e.dataTransfer.effectAllowed = 'copy';
                          }}
                          onClick={() => toggleTs(tsKey)}
                          className="qc-row"
                          title="Табличная часть"
                          style={{
                            paddingLeft: 24,
                            paddingTop: 1,
                            paddingBottom: 1,
                            fontSize: 12,
                            color: 'var(--vscode-descriptionForeground, #888)',
                            userSelect: 'none',
                            cursor: 'default',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <Chevron expanded={isTsExpanded} />
                          <MetaKindIcon kind="ТабличнаяЧасть" />
                          <span>{ts.name}</span>
                        </div>
                        {isTsExpanded && ts.fields.map(field => (
                          <div
                            key={field.name}
                            draggable
                            onDragStart={e => {
                              e.dataTransfer.setData('text/plain', JSON.stringify({
                                kind: 'field',
                                tableFullName: ts.fullName,
                                fieldPath: field.name,
                              }));
                              e.dataTransfer.effectAllowed = 'copy';
                            }}
                            className="qc-row"
                            style={{
                              paddingLeft: 48,
                              paddingTop: 1,
                              paddingBottom: 1,
                              fontSize: 12,
                              color: 'var(--vscode-descriptionForeground, #aaa)',
                              userSelect: 'none',
                              cursor: 'default',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <span className="codicon codicon-symbol-field" style={{ fontSize: 13, opacity: 0.75, flexShrink: 0 }} />
                            {field.name}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
}
