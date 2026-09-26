import * as React from 'react';
import type { MetaTable, MetaField } from '../../core/metadata/types';
import type { SelectedTable, Join, JoinCondition, ConditionOperator } from '../../core/query/queryModel';
import { defaultTableAlias } from '../../core/query/queryModel';
import { accumPeriodFields } from '../../core/query/accumVirtualFields';
import { fieldsTypeCompatible } from '../../core/query/fieldTypeCompat';
import { IconButton } from './IconButton';
import { PanelHeader } from './PanelHeader';
import { RowRemoveButton } from './RowRemoveButton';
import { COLUMN_HEADER, EMPTY_HINT, GRID_ROW_BORDER, ROW, INPUT, panelBox } from '../sharedStyles';
import { t } from '../i18n';
import { CONDITION_OPERATORS } from '../conditionOperators';


interface Props {
  selectedTables: SelectedTable[];
  metaTables: MetaTable[];
  joins: Join[];
  onAddJoin: () => void;
  onRemoveJoin: (index: number) => void;
  onAddJoinCondition: (index: number) => void;
  onRemoveJoinCondition: (index: number, condIndex: number) => void;
  onSetTable: (index: number, side: 'left' | 'right', tableId: string, condIndex: number) => void;
  onSetAll: (index: number, side: 'left' | 'right', value: boolean) => void;
  onSetCustom: (index: number, custom: boolean, condIndex: number) => void;
  onSetField: (index: number, side: 'left' | 'right', path: string, condIndex: number) => void;
  onSetOperator: (index: number, operator: ConditionOperator, condIndex: number) => void;
  onOpenExpressionBuilder: (index: number, currentText: string, condIndex: number) => void;
}

/**
 * Конъюнкты соединения для отрисовки: из `join.conditions[]` (фаза 6.13), либо —
 * для соединений из UI без поконъюнктной модели — один конъюнкт из
 * верхнеуровневых полей соединения (зеркало conditions[0]).
 */
function joinConjuncts(j: Join): JoinCondition[] {
  if (j.conditions && j.conditions.length > 0) return j.conditions;
  return [{
    custom: j.custom,
    leftTableId: j.leftTableId,
    leftPath: j.leftPath,
    operator: j.operator,
    rightTableId: j.rightTableId,
    rightPath: j.rightPath,
    expression: j.expression,
  }];
}

const dropZone: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  fontSize: 13,
  minHeight: 40,
};

// Ширины колонок (px), кроме «Условие связи» (flex).
const W_NUM = 36;
const W_TABLE = 180;
const W_ALL = 30;
const W_CUSTOM = 24;

/** Поля выборки таблицы (с учётом виртуальных полей периода). */
function tableFields(meta: MetaTable, sel: SelectedTable): MetaField[] {
  const periodFields: MetaField[] =
    meta.virtual && ['Обороты', 'ОборотыДтКт', 'ОстаткиИОбороты'].includes(meta.virtual.slice)
      ? accumPeriodFields(sel.virtual?.periodicity)
      : [];
  return [...periodFields, ...meta.fields];
}

export function ConnectionsTab(props: Props): React.ReactElement {
  const {
    selectedTables, metaTables, joins,
    onAddJoin, onRemoveJoin, onAddJoinCondition, onRemoveJoinCondition,
    onSetTable, onSetAll, onSetCustom, onSetField,
    onSetOperator, onOpenExpressionBuilder,
  } = props;

  /** Поля таблицы по её id. */
  function fieldsMeta(tableId: string): MetaField[] {
    const sel = selectedTables.find(t => t.id === tableId);
    if (!sel) return [];
    const meta = metaTables.find(m => m.fullName === sel.fullName);
    if (!meta) return [];
    return tableFields(meta, sel);
  }

  function fieldMeta(tableId: string, name: string): MetaField | undefined {
    return fieldsMeta(tableId).find(f => f.name === name);
  }

  const tableSelect = (index: number, condIndex: number, side: 'left' | 'right', value: string) => {
    const sel = selectedTables.find(t => t.id === value);
    const label = sel ? defaultTableAlias(sel) : '';
    return (
      <select
        value={value}
        title={label}
        onChange={e => onSetTable(index, side, e.target.value, condIndex)}
        style={{ ...INPUT, width: W_TABLE, flexShrink: 0 }}
      >
        {selectedTables.map(t => (
          <option key={t.id} value={t.id}>{defaultTableAlias(t)}</option>
        ))}
      </select>
    );
  };

  /** `compatibleWith` — поле іншого боку умови (Строка ↔ ДокументСсылка тощо
   * зараз ніде не перевіряється, хоча в 1С така умова впаде тільки при
   * виконанні запиту); заданий лише для правого select'а, щоб не блокувати
   * ще не обране ліве поле. */
  const fieldSelect = (index: number, condIndex: number, side: 'left' | 'right', tableId: string, value: string, compatibleWith?: MetaField) => (
    <select
      value={value}
      onChange={e => onSetField(index, side, e.target.value, condIndex)}
      style={{ ...INPUT, flex: 1, minWidth: 0 }}
      title={compatibleWith ? t('connections.fieldTypeMismatchHint') : undefined}
    >
      <option value=""></option>
      {fieldsMeta(tableId).map(f => (
        <option key={f.name} value={f.name} disabled={!!compatibleWith && !fieldsTypeCompatible(compatibleWith, f)}>{f.name}</option>
      ))}
    </select>
  );

  return (
    <div style={{ display: 'flex', flex: 1, gap: 4, padding: 4, overflow: 'hidden' }}>
      <div style={{ ...panelBox, flex: 1, minWidth: 0 }}>
        {/* Заголовок панели вместе с её командой (раньше — отдельная строка с «+» над ним). */}
        <PanelHeader title={t('connections.title')}>
          <IconButton icon="add" tone="add" title={t('connections.add')} onClick={onAddJoin} />
        </PanelHeader>
        {/* Заголовок столбцов — те же ширины/отступы, что у строк ниже. */}
        <div style={{ display: 'flex', ...COLUMN_HEADER, padding: '3px 8px' }}>
          <div style={{ width: W_NUM, paddingRight: 8, flexShrink: 0, textAlign: 'right' }}>№</div>
          <div style={{ width: W_TABLE, paddingLeft: 6, flexShrink: 0, boxSizing: 'border-box' }}>{t('connections.table1')}</div>
          <div style={{ width: W_ALL, flexShrink: 0, textAlign: 'center' }} title={t('connections.allTable1')}>{t('common.all')}</div>
          <div style={{ width: W_TABLE, paddingLeft: 6, flexShrink: 0, boxSizing: 'border-box' }}>{t('connections.table2')}</div>
          <div style={{ width: W_ALL, flexShrink: 0, textAlign: 'center' }} title={t('connections.allTable2')}>{t('common.all')}</div>
          <div style={{ width: W_CUSTOM, flexShrink: 0, textAlign: 'center' }} title={t('connections.custom')}>C.</div>
          <div style={{ flex: 1, paddingLeft: 6 }}>{t('connections.condition')}</div>
        </div>
        <div style={dropZone}>
          {joins.map((j, i) => {
            const conjuncts = joinConjuncts(j);
            const multi = conjuncts.length > 1;
            return conjuncts.map((c, ci) => {
              // Таблицы конъюнкта: для стандартного — из leftTableId/rightTableId
              // конъюнкта (с откатом на верхнеуровневые поля соединения).
              const leftTableId = c.leftTableId ?? j.leftTableId;
              const rightTableId = c.rightTableId ?? j.rightTableId;
              return (
                <div key={`${i}.${ci}`} className="qc-row" style={{ ...ROW, borderBottom: GRID_ROW_BORDER }}>
                  <span style={{ width: W_NUM, flexShrink: 0, textAlign: 'right', paddingRight: 8, color: 'var(--vscode-descriptionForeground, #aaa)', fontVariantNumeric: 'tabular-nums' }}>
                    {ci === 0 ? i + 1 : ''}
                  </span>
                  {tableSelect(i, ci, 'left', leftTableId)}
                  <input
                    type="checkbox"
                    title={t('connections.allTable1')}
                    checked={j.leftAll}
                    onChange={e => onSetAll(i, 'left', e.target.checked)}
                    style={{ width: W_ALL, flexShrink: 0 }}
                  />
                  {tableSelect(i, ci, 'right', rightTableId)}
                  <input
                    type="checkbox"
                    title={t('connections.allTable2')}
                    checked={j.rightAll}
                    onChange={e => onSetAll(i, 'right', e.target.checked)}
                    style={{ width: W_ALL, flexShrink: 0 }}
                  />
                  <input
                    type="checkbox"
                    title={t('connections.custom')}
                    checked={c.custom}
                    onChange={e => onSetCustom(i, e.target.checked, ci)}
                    style={{ width: W_CUSTOM, flexShrink: 0 }}
                  />
                  {!c.custom ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}>
                      {fieldSelect(i, ci, 'left', leftTableId, c.leftPath ?? '')}
                      <select
                        value={c.operator ?? '='}
                        onChange={e => onSetOperator(i, e.target.value as ConditionOperator, ci)}
                        style={{ ...INPUT, width: 60, flexShrink: 0 }}
                      >
                        {CONDITION_OPERATORS.map(op => <option key={op} value={op}>{op}</option>)}
                      </select>
                      {fieldSelect(i, ci, 'right', rightTableId, c.rightPath ?? '', fieldMeta(leftTableId, c.leftPath ?? ''))}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                      <span
                        title={c.expression || t('connections.custom')}
                        style={{
                          flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          color: c.expression ? 'inherit' : 'var(--vscode-descriptionForeground, #888)',
                        }}
                      >
                        {c.expression || t('connections.custom')}
                      </span>
                      <IconButton
                        icon="ellipsis"
                        title={t('connections.openExpression')}
                        onClick={() => onOpenExpressionBuilder(i, c.expression ?? '', ci)}
                      />
                    </div>
                  )}
                  <IconButton
                    icon="add"
                    tone="add"
                    title={t('connections.addCondition')}
                    onClick={() => onAddJoinCondition(i)}
                  />
                  <RowRemoveButton
                    title={multi ? t('connections.deleteCondition') : t('connections.deleteJoin')}
                    onClick={() => multi ? onRemoveJoinCondition(i, ci) : onRemoveJoin(i)}
                  />
                </div>
              );
            });
          })}
          {joins.length === 0 && (
            <div style={EMPTY_HINT}>
              {t('connections.addHint')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
