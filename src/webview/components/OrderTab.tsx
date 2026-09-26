import * as React from 'react';
import type { SelectedTable, SelectedField, Order, OrderField, SortDirection } from '../../core/query/queryModel';
import { defaultTableAlias } from '../../core/query/queryModel';
import { distinctFieldRefs } from '../fieldSource';
import { ResizeHandle, clampPaneWidth } from './ResizeHandle';
import { RowRemoveButton } from './RowRemoveButton';
import { useFieldDragDrop } from '../hooks/useFieldDragDrop';
import { SECTION_HEADER, ROW, INPUT, EMPTY_HINT, panelBox, ROW_PADDING_Y, TREE_ROW_GAP } from '../sharedStyles';
import { t } from '../i18n';

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
          <div style={SECTION_HEADER}>{t('common.fields')}</div>
          <div style={dropZone} data-field-source="order-source">
            {sourceFields.map((f, i) => (
              <div
                key={`${f.tableId}:${f.path}:${i}`}
                data-field-item
                draggable
                onDragStart={e => dragStart(e, f.tableId, f.path!)}
                className="qc-row"
                style={{ ...ROW, cursor: 'grab', justifyContent: 'flex-start', gap: TREE_ROW_GAP }}
              >
                <span className="codicon codicon-symbol-field" style={{ fontSize: 13, opacity: 0.75, flexShrink: 0 }} />
                <span>{labelFor(f.tableId, f.path!)}</span>
              </div>
            ))}
            {sourceFields.length === 0 && (
              <div style={EMPTY_HINT}>
                {t('empty.noFieldsAdd')}
              </div>
            )}
          </div>
        </div>

        <ResizeHandle onResize={d => setLeftWidth(w => clampPaneWidth(w + d, 140, 320, w))} />

        {/* Правый список: Сортировка */}
        <div style={{ ...panelBox, flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex' }}>
            <div style={{ ...SECTION_HEADER, flex: 1 }}>{t('common.field')}</div>
            <div style={{ ...SECTION_HEADER, width: 180, flexShrink: 0 }}>{t('tabs.order')}</div>
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
              <div key={`${f.tableId}:${f.path}`} className="qc-row" style={{ display: 'flex', alignItems: 'center', padding: `${ROW_PADDING_Y}px 4px ${ROW_PADDING_Y}px 8px`, gap: 4 }}>
                <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: TREE_ROW_GAP }}>
                  <span className="codicon codicon-symbol-field" style={{ fontSize: 13, opacity: 0.75, flexShrink: 0 }} />
                  {labelFor(f.tableId, f.path)}
                </span>
                <select
                  value={f.direction}
                  onChange={e => onSetOrderDirection(f.tableId, f.path, e.target.value as SortDirection)}
                  style={{ ...INPUT, width: 150, flexShrink: 0 }}
                >
                  <option value="asc">{t('order.ascending')}</option>
                  <option value="desc">{t('order.descending')}</option>
                </select>
                <RowRemoveButton title={t('actions.remove')} onClick={() => onRemoveOrderField(f.tableId, f.path)} />
              </div>
            ))}
            {order.fields.length === 0 && <div style={EMPTY_HINT}>{t('empty.dropFieldsHere')}</div>}
          </div>
        </div>
      </div>

      {/* Автоупорядочивание */}
      <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '2px 8px' }}>
        <input
          type="checkbox"
          checked={order.auto}
          onChange={e => onSetOrderAuto(e.target.checked)}
        />
        {t('order.autoOrder')}
      </label>
    </div>
  );
}
