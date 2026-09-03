import * as React from 'react';
import type { SelectedTable, SelectedField, Order, OrderField, SortDirection } from '../../core/query/queryModel';
import { defaultTableAlias } from '../../core/query/queryModel';
import { distinctFieldRefs } from '../fieldSource';
import { ResizeHandle } from './ResizeHandle';
import { useFieldDragDrop } from '../hooks/useFieldDragDrop';
import { SECTION_HEADER, REMOVE_BTN, ROW, panelBox } from '../sharedStyles';

interface Props {
  selectedTables: SelectedTable[];
  selectedFields: SelectedField[];
  order: Order;
  onAddOrderField: (tableId: string, path: string) => void;
  onRemoveOrderField: (tableId: string, path: string) => void;
  onSetOrderDirection: (tableId: string, path: string, direction: SortDirection) => void;
  onSetOrderAuto: (auto: boolean) => void;
}

export function OrderTab(props: Props): React.ReactElement {
  const {
    selectedTables, selectedFields, order,
    onAddOrderField, onRemoveOrderField, onSetOrderDirection, onSetOrderAuto,
  } = props;

  // Источник: обычные поля выборки (не выражения, не ТЧ).
  const sourceFields = distinctFieldRefs(selectedFields);
  // 8.3.7: перетаскиваемая граница ширины левого списка «Поля».
  const [leftWidth, setLeftWidth] = React.useState(260);

  function labelFor(tableId: string, path: string): string {
    const table = selectedTables.find(t => t.id === tableId);
    return table ? `${defaultTableAlias(table)}.${path}` : path;
  }

  const { dragStart, parseDrop, allowDrop, dropZone } = useFieldDragDrop();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: 4, gap: 4, overflow: 'hidden' }}>
      <div style={{ display: 'flex', flex: 1, gap: 4, overflow: 'hidden' }}>
        {/* Левый список: Поля */}
        <div style={{ ...panelBox, width: leftWidth, flexShrink: 0 }}>
          <div style={SECTION_HEADER}>Поля</div>
          <div style={dropZone} data-field-source="order-source">
            {sourceFields.map((f, i) => (
              <div
                key={`${f.tableId}:${f.path}:${i}`}
                data-field-item
                draggable
                onDragStart={e => dragStart(e, f.tableId, f.path!)}
                style={{ ...ROW, cursor: 'grab', justifyContent: 'flex-start', gap: 4 }}
              >
                <span className="codicon codicon-symbol-field" style={{ fontSize: 13, opacity: 0.75, flexShrink: 0 }} />
                <span>{labelFor(f.tableId, f.path!)}</span>
              </div>
            ))}
            {sourceFields.length === 0 && (
              <div style={{ padding: 6, color: 'var(--vscode-descriptionForeground, #888)', fontSize: 12 }}>
                Нет полей. Добавьте поля на вкладке «Таблицы и поля».
              </div>
            )}
          </div>
        </div>

        <ResizeHandle onResize={d => setLeftWidth(w => Math.max(140, w + d))} />

        {/* Правый список: Сортировка */}
        <div style={{ ...panelBox, flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex' }}>
            <div style={{ ...SECTION_HEADER, flex: 1 }}>Поле</div>
            <div style={{ ...SECTION_HEADER, width: 180, flexShrink: 0 }}>Сортировка</div>
          </div>
          <div
            style={dropZone}
            onDragOver={allowDrop}
            onDrop={e => {
              e.preventDefault();
              const d = parseDrop(e);
              if (d) onAddOrderField(d.tableId, d.path);
            }}
          >
            {order.fields.map((f: OrderField) => (
              <div key={`${f.tableId}:${f.path}`} style={{ display: 'flex', alignItems: 'center', padding: '2px 6px', gap: 4 }}>
                <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span className="codicon codicon-symbol-field" style={{ fontSize: 13, opacity: 0.75, flexShrink: 0 }} />
                  {labelFor(f.tableId, f.path)}
                </span>
                <select
                  value={f.direction}
                  onChange={e => onSetOrderDirection(f.tableId, f.path, e.target.value as SortDirection)}
                  style={{
                    width: 150,
                    flexShrink: 0,
                    background: 'var(--vscode-input-background, #3c3c3c)',
                    color: 'var(--vscode-input-foreground, #ccc)',
                    border: '1px solid var(--qc-border)',
                    fontSize: 12,
                  }}
                >
                  <option value="asc">Возрастание</option>
                  <option value="desc">Убывание</option>
                </select>
                <button style={REMOVE_BTN} title="Убрать" onClick={() => onRemoveOrderField(f.tableId, f.path)}>✕</button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Автоупорядочивание */}
      <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', padding: '2px 6px' }}>
        <input
          type="checkbox"
          checked={order.auto}
          onChange={e => onSetOrderAuto(e.target.checked)}
        />
        Автоупорядочивание
      </label>
    </div>
  );
}
