import * as React from 'react';
import type { MetaTable, MetaField } from '../../core/metadata/types';
import type { SelectedTable, Condition, ConditionOperator } from '../../core/query/queryModel';
import { defaultTableAlias } from '../../core/query/queryModel';
import { accumPeriodFields } from '../../core/query/accumVirtualFields';
import type { RefId } from '../../shared/messages';
import { ResizeHandle } from './ResizeHandle';
import { MetaKindIcon } from './MetaKindIcon';
import { FieldTreeRow } from './FieldTreeRow';
import { IconButton } from './IconButton';
import { SECTION_HEADER, REMOVE_BTN, ROW, INPUT, panelBox } from '../sharedStyles';

const OPERATORS: ConditionOperator[] = ['=', '<>', '>', '>=', '<', '<=', 'В', 'МЕЖДУ', 'ПОДОБНО'];

interface Props {
  selectedTables: SelectedTable[];
  metaTables: MetaTable[];
  conditions: Condition[];
  expandedRefs: Map<string, MetaField[]>;
  onExpandRef: (ref: RefId) => void;
  onAddCondition: (tableId: string, path: string) => void;
  onRemoveCondition: (index: number) => void;
  onSetCustom: (index: number, custom: boolean) => void;
  onSetOperator: (index: number, operator: ConditionOperator) => void;
  onSetParam: (index: number, param: string) => void;
  onOpenExpressionBuilder: (index: number, currentText: string) => void;
}

const dropZone: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  fontSize: 13,
  minHeight: 40,
};

/** Поля выборки таблицы (с учётом виртуальных полей периода). */
function tableFields(meta: MetaTable, sel: SelectedTable): MetaField[] {
  const periodFields: MetaField[] =
    meta.virtual && ['Обороты', 'ОборотыДтКт', 'ОстаткиИОбороты'].includes(meta.virtual.slice)
      ? accumPeriodFields(sel.virtual?.periodicity)
      : [];
  return [...periodFields, ...meta.fields];
}

export function ConditionsTab(props: Props): React.ReactElement {
  const {
    selectedTables, metaTables, conditions, expandedRefs, onExpandRef,
    onAddCondition, onRemoveCondition, onSetCustom, onSetOperator, onSetParam,
    onOpenExpressionBuilder,
  } = props;

  // 8.3.7: перетаскиваемая граница ширины левого списка «Поля».
  const [leftWidth, setLeftWidth] = React.useState(260);

  function dragStart(e: React.DragEvent, tableId: string, path: string) {
    e.dataTransfer.setData('text/plain', JSON.stringify({ tableId, path }));
    e.dataTransfer.effectAllowed = 'copy';
  }

  function parseDrop(e: React.DragEvent): { tableId: string; path: string } | null {
    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
      if (data && typeof data.tableId === 'string' && typeof data.path === 'string') {
        return { tableId: data.tableId, path: data.path };
      }
    } catch { /* ignore */ }
    return null;
  }

  function allowDrop(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }

  function labelFor(c: Condition): string {
    const table = selectedTables.find(t => t.id === c.tableId);
    return table ? `${defaultTableAlias(table)}.${c.path}` : (c.path ?? '');
  }

  /**
   * Текст произвольного условия для отображения и конструктора выражения.
   * Условие-подзапрос (custom без expression, фаза 6.14.4) показываем из
   * структурных полей: `<поле> <оп> <подзапрос-как-текст>`.
   */
  function customText(c: Condition): string {
    if (c.expression) return c.expression;
    if (c.path) return `${labelFor(c)} ${c.operator ?? '='} ${c.param ?? ''}`.trim();
    return '';
  }

  return (
    <div style={{ display: 'flex', flex: 1, gap: 4, padding: 4, overflow: 'hidden' }}>
      {/* Левый список: Поля */}
      <div style={{ ...panelBox, width: leftWidth, flexShrink: 0 }}>
        <div style={SECTION_HEADER}>Поля</div>
        <div style={dropZone}>
          {selectedTables.map(sel => {
            const meta = metaTables.find(m => m.fullName === sel.fullName);
            if (!meta) return null;
            const alias = defaultTableAlias(sel);
            return (
              <div key={sel.id} data-field-source={`conditions-source:${alias}`}>
                <div style={{ ...ROW, justifyContent: 'flex-start', fontWeight: 600, color: 'var(--vscode-descriptionForeground, #aaa)', gap: 4 }}>
                  <MetaKindIcon kind={meta.kind} />
                  {alias}
                </div>
                {tableFields(meta, sel).map((f: MetaField) => (
                  <FieldTreeRow
                    key={`${sel.id}:${f.name}`}
                    field={f}
                    depth={1}
                    expandedRefs={expandedRefs}
                    onExpandRef={onExpandRef}
                    onDragStart={(e, path) => dragStart(e, sel.id, path)}
                  />
                ))}
              </div>
            );
          })}
          {selectedTables.length === 0 && (
            <div style={{ padding: 6, color: 'var(--vscode-descriptionForeground, #888)', fontSize: 12 }}>
              Нет таблиц. Добавьте таблицы на вкладке «Таблицы и поля».
            </div>
          )}
        </div>
      </div>

      <ResizeHandle onResize={d => setLeftWidth(w => Math.max(140, w + d))} />

      {/* Правая колонка: Условия */}
      <div style={{ ...panelBox, flex: 1, minWidth: 0 }}>
        {/* Тулбар */}
        <div style={SECTION_HEADER}>Условия</div>
        {/* Заголовок столбцов */}
        <div style={{ display: 'flex', ...SECTION_HEADER, padding: 0 }}>
          <div style={{ width: 56, padding: '2px 6px', flexShrink: 0 }}>Номер</div>
          <div style={{ width: 28, padding: '2px 6px', flexShrink: 0 }}>П.</div>
          <div style={{ flex: 1, padding: '2px 6px' }}>Условие</div>
        </div>
        <div
          style={dropZone}
          onDragOver={allowDrop}
          onDrop={e => {
            e.preventDefault();
            const d = parseDrop(e);
            if (d) onAddCondition(d.tableId, d.path);
          }}
        >
          {conditions.map((c, i) => (
            <div key={i} style={{ ...ROW, borderBottom: '1px solid var(--qc-border)', gap: 4 }}>
              <span style={{ width: 56, flexShrink: 0, textAlign: 'right', paddingRight: 8 }}>{i + 1}</span>
              <input
                type="checkbox"
                title="Произвольное условие"
                checked={c.custom}
                onChange={e => onSetCustom(i, e.target.checked)}
                style={{ width: 28, flexShrink: 0 }}
              />
              {!c.custom ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                  <span title={labelFor(c)} style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {labelFor(c)}
                  </span>
                  <select
                    value={c.operator ?? '='}
                    onChange={e => onSetOperator(i, e.target.value as ConditionOperator)}
                    style={{ ...INPUT, width: 90, flexShrink: 0 }}
                  >
                    {OPERATORS.map(op => <option key={op} value={op}>{op}</option>)}
                  </select>
                  <input
                    type="text"
                    value={c.param ?? ''}
                    onChange={e => onSetParam(i, e.target.value)}
                    style={{ ...INPUT, flex: 1, minWidth: 0 }}
                  />
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                  <span
                    title={customText(c) || 'Произвольное условие…'}
                    style={{
                      flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      color: customText(c) ? 'inherit' : 'var(--vscode-descriptionForeground, #888)',
                    }}
                  >
                    {customText(c) || 'Произвольное условие…'}
                  </span>
                  <IconButton
                    icon="ellipsis"
                    title="Открыть конструктор выражения"
                    onClick={() => onOpenExpressionBuilder(i, customText(c))}
                  />
                </div>
              )}
              <button style={REMOVE_BTN} title="Удалить условие" onClick={() => onRemoveCondition(i)}>✕</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
