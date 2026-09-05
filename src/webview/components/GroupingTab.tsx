import * as React from 'react';
import type { MetaTable, MetaField } from '../../core/metadata/types';
import type { SelectedTable, SelectedField, Grouping, AggregateFunction, FieldRef, SummableField } from '../../core/query/queryModel';
import { defaultTableAlias } from '../../core/query/queryModel';
import { distinctFieldRefs } from '../fieldSource';
import { ResizeHandle } from './ResizeHandle';
import { IconButton } from './IconButton';
import { useFieldDragDrop } from '../hooks/useFieldDragDrop';
import { SECTION_HEADER, REMOVE_BTN, ROW, panelBox } from '../sharedStyles';
import { t } from '../i18n';

const ALL_FUNCS: AggregateFunction[] = ['Сумма', 'Количество', 'КоличествоРазличных', 'Максимум', 'Минимум', 'Среднее'];
const NON_NUMERIC_FUNCS: AggregateFunction[] = ['КоличествоРазличных', 'Количество', 'Максимум', 'Минимум'];

interface Props {
  selectedTables: SelectedTable[];
  selectedFields: SelectedField[];
  metaTables: MetaTable[];
  grouping: Grouping;
  onSetMultiple: (multiple: boolean) => void;
  onAddGroupField: (tableId: string, path: string) => void;
  onRemoveGroupField: (tableId: string, path: string) => void;
  onAddSummableField: (tableId: string, path: string, func: AggregateFunction) => void;
  onRemoveSummableField: (tableId: string, path: string) => void;
  onSetSummableFunc: (tableId: string, path: string, func: AggregateFunction) => void;
  onAddGroupSet: () => void;
  onRemoveGroupSet: (index: number) => void;
  onAddFieldToSet: (index: number, tableId: string, path: string) => void;
  onRemoveFieldFromSet: (index: number, tableId: string, path: string) => void;
}

/** Найти MetaField исходного поля выборки. */
export function findMetaField(
  metaTables: MetaTable[],
  selectedTables: SelectedTable[],
  tableId: string,
  path: string,
): MetaField | undefined {
  const sel = selectedTables.find(t => t.id === tableId);
  if (!sel) return undefined;
  const meta = metaTables.find(m => m.fullName === sel.fullName);
  if (!meta) return undefined;
  // path может быть составным (Поле.Подполе) — берём первый сегмент для верхнего поля.
  const top = path.split('.')[0];
  return meta.fields.find(f => f.name === top);
}

export function isNumericField(field: MetaField | undefined): boolean {
  if (!field || !field.types) return false;
  return field.types.some(t => t.primitive === 'Число');
}

/** Поле ссылочного типа (тип содержит `ref`) — для предложения иерархических итогов. */
export function isRefField(field: MetaField | undefined): boolean {
  if (!field || !field.types) return false;
  return field.types.some(t => !!t.ref);
}

function allowedFuncs(numeric: boolean): AggregateFunction[] {
  return numeric ? ALL_FUNCS : NON_NUMERIC_FUNCS;
}

export function GroupingTab(props: Props): React.ReactElement {
  const {
    selectedTables, selectedFields, metaTables, grouping,
    onSetMultiple, onAddGroupField, onRemoveGroupField,
    onAddSummableField, onRemoveSummableField, onSetSummableFunc,
    onAddGroupSet, onRemoveGroupSet, onAddFieldToSet, onRemoveFieldFromSet,
  } = props;

  const [leftWidth, setLeftWidth] = React.useState(260);

  // Источник: обычные поля выборки (не выражения, не ТЧ).
  const sourceFields = distinctFieldRefs(selectedFields);

  function labelFor(tableId: string, path: string): string {
    const table = selectedTables.find(t => t.id === tableId);
    return table ? `${defaultTableAlias(table)}.${path}` : path;
  }

  const { dragStart, parseDrop, allowDrop, dropZone } = useFieldDragDrop();

  return (
    <div style={{ display: 'flex', flex: 1, gap: 4, padding: 4, overflow: 'hidden' }}>
      {/* Левый список: Поля */}
      <div style={{ ...panelBox, width: leftWidth, flexShrink: 0 }}>
        <div style={SECTION_HEADER}>{t('common.fields')}</div>
        <div style={dropZone} data-field-source="grouping-source">
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
              {t('empty.noFieldsAdd')}
            </div>
          )}
        </div>
      </div>

      <ResizeHandle onResize={d => setLeftWidth(w => Math.max(140, w + d))} />

      {/* Правая колонка */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, gap: 4 }}>
        {/* Поле группировки */}
        <div style={{ ...panelBox, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 6px', borderBottom: '1px solid var(--qc-border)' }}>
            <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={grouping.multiple}
                onChange={e => onSetMultiple(e.target.checked)}
              />
              {t('grouping.multiple')}
            </label>
            {grouping.multiple && (
              <IconButton icon="add" tone="add" title={t('grouping.addSet')} onClick={onAddGroupSet} />
            )}
          </div>
          <div style={SECTION_HEADER}>{t('grouping.groupFields')}</div>

          {!grouping.multiple ? (
            <div
              style={dropZone}
              onDragOver={allowDrop}
              onDrop={e => {
                e.preventDefault();
                const d = parseDrop(e);
                if (d) onAddGroupField(d.tableId, d.path);
              }}
            >
              {grouping.groupFields.map((f: FieldRef) => (
                <div key={`${f.tableId}:${f.path}`} style={ROW}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span className="codicon codicon-symbol-field" style={{ fontSize: 13, opacity: 0.75, flexShrink: 0 }} />
                    {labelFor(f.tableId, f.path)}
                  </span>
                  <button style={REMOVE_BTN} title={t('actions.remove')} onClick={() => onRemoveGroupField(f.tableId, f.path)}>✕</button>
                </div>
              ))}
            </div>
          ) : (
            <div style={dropZone}>
              {grouping.groupSets.map((set, idx) => (
                <div key={idx} style={{ borderBottom: '1px solid var(--qc-border)' }}>
                  <div
                    style={{ ...ROW, background: 'var(--vscode-list-hoverBackground, #2a2d2e)' }}
                    onDragOver={allowDrop}
                    onDrop={e => {
                      e.preventDefault();
                      const d = parseDrop(e);
                      if (d) onAddFieldToSet(idx, d.tableId, d.path);
                    }}
                  >
                    <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span className="codicon codicon-list-flat" style={{ fontSize: 13, opacity: 0.75, flexShrink: 0 }} />
                      {t('grouping.setNumber', { number: idx + 1 })}
                    </span>
                    <button style={REMOVE_BTN} title={t('grouping.deleteSet')} onClick={() => onRemoveGroupSet(idx)}>✕</button>
                  </div>
                  {set.map((f: FieldRef) => (
                    <div key={`${f.tableId}:${f.path}`} style={{ ...ROW, paddingLeft: 24 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span className="codicon codicon-symbol-field" style={{ fontSize: 13, opacity: 0.75, flexShrink: 0 }} />
                        {labelFor(f.tableId, f.path)}
                      </span>
                      <button style={REMOVE_BTN} title={t('actions.remove')} onClick={() => onRemoveFieldFromSet(idx, f.tableId, f.path)}>✕</button>
                    </div>
                  ))}
                </div>
              ))}
              {grouping.groupSets.length === 0 && (
                <div style={{ padding: 6, color: 'var(--vscode-descriptionForeground, #888)', fontSize: 12 }}>
                  {t('grouping.addHint')}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Суммируемое поле | Функция */}
        <div style={{ ...panelBox, flex: 1 }}>
          <div style={{ display: 'flex' }}>
            <div style={{ ...SECTION_HEADER, flex: 1 }}>{t('grouping.aggregateFields')}</div>
            <div style={{ ...SECTION_HEADER, width: 180, flexShrink: 0 }}>{t('grouping.function')}</div>
          </div>
          <div
            style={dropZone}
            onDragOver={allowDrop}
            onDrop={e => {
              e.preventDefault();
              const d = parseDrop(e);
              if (!d) return;
              const numeric = isNumericField(findMetaField(metaTables, selectedTables, d.tableId, d.path));
              onAddSummableField(d.tableId, d.path, numeric ? 'Сумма' : 'Количество');
            }}
          >
            {grouping.aggregates.map((a: SummableField) => {
              const numeric = isNumericField(findMetaField(metaTables, selectedTables, a.tableId, a.path));
              const funcs = allowedFuncs(numeric);
              return (
                <div key={`${a.tableId}:${a.path}`} style={{ display: 'flex', alignItems: 'center', padding: '2px 6px', gap: 4 }}>
                  <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span className="codicon codicon-symbol-field" style={{ fontSize: 13, opacity: 0.75, flexShrink: 0 }} />
                    {labelFor(a.tableId, a.path)}
                  </span>
                  <select
                    value={a.func}
                    onChange={e => onSetSummableFunc(a.tableId, a.path, e.target.value as AggregateFunction)}
                    style={{
                      width: 150,
                      flexShrink: 0,
                      background: 'var(--vscode-input-background, #3c3c3c)',
                      color: 'var(--vscode-input-foreground, #ccc)',
                      border: '1px solid var(--qc-border)',
                      fontSize: 12,
                    }}
                  >
                    {funcs.map(fn => <option key={fn} value={fn}>{fn}</option>)}
                  </select>
                  <button style={REMOVE_BTN} title={t('actions.remove')} onClick={() => onRemoveSummableField(a.tableId, a.path)}>✕</button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
