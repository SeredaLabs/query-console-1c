import * as React from 'react';
import type { MetaTable } from '../../core/metadata/types';
import type { SelectedTable, SelectedField, Totals, TotalGroupField, TotalField, TotalKind, AggregateFunction } from '../../core/query/queryModel';
import { defaultTableAlias } from '../../core/query/queryModel';
import { distinctFieldRefs } from '../fieldSource';
import { findMetaField, isRefField } from './GroupingTab';
import { ResizeHandle } from './ResizeHandle';
import { useFieldDragDrop } from '../hooks/useFieldDragDrop';
import { SECTION_HEADER, REMOVE_BTN, ROW, INPUT, panelBox, ROW_PADDING_Y } from '../sharedStyles';
import { t, type MessageKey } from '../i18n';

interface Props {
  selectedTables: SelectedTable[];
  selectedFields: SelectedField[];
  metaTables: MetaTable[];
  totals: Totals;
  onAddGroupField: (tableId: string, path: string) => void;
  onRemoveGroupField: (tableId: string, path: string) => void;
  onSetGroupKind: (tableId: string, path: string, kind: TotalKind) => void;
  onSetGroupAlias: (tableId: string, path: string, alias: string) => void;
  onAddTotalField: (tableId: string, path: string) => void;
  onRemoveTotalField: (index: number) => void;
  onSetTotalFieldFunc: (index: number, func: AggregateFunction) => void;
  onSetGrand: (grand: boolean) => void;
}

/**
 * 8.3.2: функции простого агрегата ИТОГИ, доступные для выбора в колонке
 * «Выражение». Для нечисловых полей (Наименование, Ссылка) применимы именно эти.
 */
const TOTAL_FUNC_OPTIONS: { value: AggregateFunction; label: string }[] = [
  { value: 'Количество', label: 'Количество' },
  { value: 'КоличествоРазличных', label: 'Количество различные' },
  { value: 'Максимум', label: 'Максимум' },
  { value: 'Минимум', label: 'Минимум' },
];

/** Подпись функции для значений, не входящих в TOTAL_FUNC_OPTIONS (Сумма/Среднее). */
const EXTRA_FUNC_LABEL: Partial<Record<AggregateFunction, string>> = {
  'Сумма': 'Сумма',
  'Среднее': 'Среднее',
};

const KIND_OPTIONS: { value: TotalKind; label: MessageKey }[] = [
  { value: 'elements', label: 'totals.elements' },
  { value: 'hierarchy', label: 'totals.elementsHierarchy' },
  { value: 'onlyHierarchy', label: 'totals.onlyHierarchy' },
];

export function TotalsTab(props: Props): React.ReactElement {
  const {
    selectedTables, selectedFields, metaTables, totals,
    onAddGroupField, onRemoveGroupField, onSetGroupKind, onSetGroupAlias,
    onAddTotalField, onRemoveTotalField, onSetTotalFieldFunc, onSetGrand,
  } = props;

  // Источник: обычные поля выборки (не выражения, не ТЧ).
  const sourceFields = distinctFieldRefs(selectedFields);
  // 8.3.7: перетаскиваемая граница ширины левого списка «Поля».
  const [leftWidth, setLeftWidth] = React.useState(260);

  function labelFor(tableId: string, path: string): string {
    const table = selectedTables.find(t => t.id === tableId);
    return table ? `${defaultTableAlias(table)}.${path}` : path;
  }

  /**
   * 8.3.2: подпись итогового поля. У распарсенного агрегата tableId/path пусты —
   * берём operandAlias (псевдоним колонки-операнда). У добавленного из UI поля
   * operandAlias тоже задан; иначе — квалифицированный путь, иначе текст выражения.
   */
  function totalFieldLabel(f: TotalField): string {
    if (f.operandAlias) return f.operandAlias;
    if (f.tableId) return labelFor(f.tableId, f.path);
    return f.path || (f.expression ?? '');
  }

  const { dragStart, parseDrop, allowDrop, dropZone } = useFieldDragDrop();

  return (
    <div style={{ display: 'flex', flex: 1, gap: 4, padding: 4, overflow: 'hidden' }}>
      {/* Левый список: Поля */}
      <div style={{ ...panelBox, width: leftWidth, flexShrink: 0 }}>
        <div style={SECTION_HEADER}>{t('common.fields')}</div>
        <div style={dropZone} data-field-source="totals-source">
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
        {/* Группировочное поле | Тип итогов | Псевдоним */}
        <div style={{ ...panelBox, flex: 1 }}>
          <div style={{ display: 'flex' }}>
            <div style={{ ...SECTION_HEADER, flex: 1 }}>{t('totals.groupFields')}</div>
            <div style={{ ...SECTION_HEADER, width: 180, flexShrink: 0 }}>{t('totals.type')}</div>
            <div style={{ ...SECTION_HEADER, width: 160, flexShrink: 0 }}>{t('common.alias')}</div>
          </div>
          <div
            style={dropZone}
            onDragOver={allowDrop}
            onDrop={e => {
              e.preventDefault();
              const d = parseDrop(e);
              if (d) onAddGroupField(d.tableId, d.path);
            }}
          >
            {totals.groupFields.map((g: TotalGroupField) => {
              const isRef = isRefField(findMetaField(metaTables, selectedTables, g.tableId, g.path));
              return (
                <div key={`${g.tableId}:${g.path}`} style={{ display: 'flex', alignItems: 'center', padding: `${ROW_PADDING_Y}px 6px`, gap: 4 }}>
                  <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span className={`codicon codicon-${isRef ? 'references' : 'symbol-field'}`} style={{ fontSize: 13, opacity: 0.75, flexShrink: 0 }} />
                    {labelFor(g.tableId, g.path)}
                  </span>
                  {isRef ? (
                    <select
                      value={g.kind}
                      onChange={e => onSetGroupKind(g.tableId, g.path, e.target.value as TotalKind)}
                      style={{ ...INPUT, width: 170, flexShrink: 0 }}
                    >
                      {KIND_OPTIONS.map(o => <option key={o.value} value={o.value}>{t(o.label)}</option>)}
                    </select>
                  ) : (
                    <span style={{ width: 170, flexShrink: 0, fontSize: 12, color: 'var(--vscode-descriptionForeground, #888)' }}>{t('totals.elements')}</span>
                  )}
                  <input
                    type="text"
                    value={g.alias ?? ''}
                    placeholder={t('common.alias')}
                    onChange={e => onSetGroupAlias(g.tableId, g.path, e.target.value)}
                    style={{ ...INPUT, width: 150, flexShrink: 0 }}
                  />
                  <button style={REMOVE_BTN} title={t('actions.remove')} onClick={() => onRemoveGroupField(g.tableId, g.path)}>✕</button>
                </div>
              );
            })}
          </div>
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', padding: '4px 6px', borderTop: '1px solid var(--qc-border)' }}>
            <input
              type="checkbox"
              checked={totals.grand}
              onChange={e => onSetGrand(e.target.checked)}
            />
            {t('totals.general')}
          </label>
        </div>

        {/* Итоговое поле | Выражение */}
        <div style={{ ...panelBox, flex: 1 }}>
          <div style={{ display: 'flex' }}>
            <div style={{ ...SECTION_HEADER, flex: 1 }}>{t('totals.totalFields')}</div>
            <div style={{ ...SECTION_HEADER, width: 220, flexShrink: 0 }}>{t('common.expression')}</div>
          </div>
          <div
            style={dropZone}
            onDragOver={allowDrop}
            onDrop={e => {
              e.preventDefault();
              const d = parseDrop(e);
              // 8.3.2: в итоги можно перетащить ЛЮБОЕ поле (Количество/Максимум/
              // Минимум применимы и к нечисловым), без фильтра по типу.
              if (d) onAddTotalField(d.tableId, d.path);
            }}
          >
            {totals.totalFields.map((f: TotalField, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', padding: `${ROW_PADDING_Y}px 6px`, gap: 4 }}>
                <span className="codicon codicon-symbol-field" style={{ fontSize: 13, opacity: 0.75, flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={totalFieldLabel(f)}>
                  {totalFieldLabel(f)}
                </span>
                {f.func ? (
                  <select
                    value={f.func}
                    onChange={e => onSetTotalFieldFunc(idx, e.target.value as AggregateFunction)}
                    style={{ ...INPUT, width: 200, flexShrink: 0 }}
                  >
                    {TOTAL_FUNC_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    {/* Сохраняем нестандартную функцию (Сумма/Среднее) из распарсенного запроса. */}
                    {!TOTAL_FUNC_OPTIONS.some(o => o.value === f.func) && (
                      <option value={f.func}>{EXTRA_FUNC_LABEL[f.func] ?? f.func}</option>
                    )}
                  </select>
                ) : (
                  // Агрегат-выражение (ВЫБОР…, параметр) — функцией не представим; показываем как есть.
                  <span style={{ width: 200, flexShrink: 0, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--vscode-descriptionForeground, #888)' }} title={f.expression}>
                    {f.expression}
                  </span>
                )}
                <button style={REMOVE_BTN} title={t('actions.remove')} onClick={() => onRemoveTotalField(idx)}>✕</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
