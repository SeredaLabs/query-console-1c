import * as React from 'react';
import type { QueryMeta } from '../state/queryStore';
import type { UnionColumn } from '../../core/query/unionModel';
import { ResizeHandle, clampPaneWidth } from './ResizeHandle';
import { PanelHeader } from './PanelHeader';
import { IconButton } from './IconButton';
import { BTN, DIALOG_PANEL, COLUMN_HEADER, GRID_ROW_BORDER, panelBox, ROW_PADDING_Y } from '../sharedStyles';
import { t } from '../i18n';
import { highlightParts } from '../expressionEditor/highlightedCode';

const ALIAS_RE = /^[A-Za-zА-Яа-яЁё_][A-Za-zА-Яа-яЁё0-9_]*$/;

interface Props {
  queryList: QueryMeta[];
  activeQuery: number;
  columns: UnionColumn[];
  onAddQuery: () => void;
  onRemoveQuery: (index: number) => void;
  onSetActiveQuery: (index: number) => void;
  onRenameQuery: (index: number, name: string) => void;
  onSetQueryDistinct: (index: number, distinct: boolean) => void;
  onSetColumnAlias: (alias: string, newAlias: string) => void;
  onMoveColumn: (index: number, dir: 'up' | 'down') => void;
}

// Инпуты этой вкладки живут внутри ячеек таблицы и должны заполнять её
// целиком (width:100% + border-box) — этим они отличаются от обычного
// sharedStyles.INPUT (авто-ширина), это оправданный отдельный вариант,
// а не забытый дубликат.
const INPUT: React.CSSProperties = {
  background: 'var(--vscode-input-background, #3c3c3c)',
  color: 'var(--vscode-input-foreground, #ccc)',
  border: '1px solid var(--qc-border)',
  borderRadius: 3,
  fontSize: 12,
  padding: '1px 4px',
  width: '100%',
  boxSizing: 'border-box',
};

// Заголовок колонки таблицы — общий COLUMN_HEADER (как в BatchTab/«Условиях»):
// легче заголовка панели, чтобы шапка не спорила с содержимым.
const TH: React.CSSProperties = { ...COLUMN_HEADER, fontWeight: 600 };

const TD: React.CSSProperties = {
  fontSize: 12,
  padding: `${ROW_PADDING_Y}px 6px`,
  borderBottom: GRID_ROW_BORDER,
};

export function UnionsTab({
  queryList, activeQuery, columns,
  onAddQuery, onRemoveQuery, onSetActiveQuery,
  onRenameQuery, onSetQueryDistinct, onSetColumnAlias, onMoveColumn,
}: Props): React.ReactElement {
  const [selectedRow, setSelectedRow] = React.useState(activeQuery);
  const [aliasError, setAliasError] = React.useState<string | null>(null);
  // 8.3.1: выбранная колонка (поле) в «Списке полей» — для кнопок Вверх/Вниз.
  const [selectedCol, setSelectedCol] = React.useState(0);
  // 8.3.7: перетаскиваемая граница ширины «Списка запросов».
  const [queryListWidth, setQueryListWidth] = React.useState(280);
  // Локальные значения полей ввода псевдонимов (по индексу колонки), чтобы при
  // невалидном вводе откатить отображаемый текст к исходному псевдониму.
  const [aliasDrafts, setAliasDrafts] = React.useState<Record<number, string>>({});

  React.useEffect(() => {
    if (selectedRow >= queryList.length) setSelectedRow(queryList.length - 1);
  }, [queryList.length, selectedRow]);

  React.useEffect(() => {
    if (selectedCol >= columns.length) setSelectedCol(Math.max(0, columns.length - 1));
  }, [columns.length, selectedCol]);

  // Выделение следует за перемещаемой колонкой, чтобы стрелки продолжали её двигать.
  function moveColumn(dir: 'up' | 'down') {
    const target = dir === 'up' ? selectedCol - 1 : selectedCol + 1;
    if (target < 0 || target >= columns.length) return;
    onMoveColumn(selectedCol, dir);
    setSelectedCol(target);
  }

  function selectRow(index: number) {
    setSelectedRow(index);
    onSetActiveQuery(index);
  }

  function commitAlias(colIdx: number, alias: string, draft: string) {
    const next = draft.trim();
    if (next === alias) {
      setAliasDrafts(d => { const { [colIdx]: _omit, ...rest } = d; return rest; });
      return;
    }
    if (!ALIAS_RE.test(next)) {
      setAliasError(t('unions.aliasError'));
      // Откатить отображаемый текст к исходному псевдониму.
      setAliasDrafts(d => { const { [colIdx]: _omit, ...rest } = d; return rest; });
      return;
    }
    onSetColumnAlias(alias, next);
    setAliasDrafts(d => { const { [colIdx]: _omit, ...rest } = d; return rest; });
  }

  return (
    <div style={{ display: 'flex', flex: 1, gap: 4, padding: 4, overflow: 'hidden' }}>
      {/* Список запросов */}
      <div style={{ ...panelBox, width: queryListWidth, flexShrink: 0 }}>
        <PanelHeader title={t('unions.queryList')}>
          <IconButton icon="add" tone="add" title={t('unions.addQuery')} onClick={onAddQuery} />
          <IconButton
            icon="close"
            tone="remove"
            title={t('unions.deleteQuery')}
            disabled={queryList.length <= 1}
            onClick={() => onRemoveQuery(selectedRow)}
          />
        </PanelHeader>
        <div className="qc-list" tabIndex={-1} style={{ overflow: 'auto', flex: 1 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={TH}>{t('common.name')}</th>
                <th style={{ ...TH, width: 90, textAlign: 'center' }}>{t('unions.distinct')}</th>
              </tr>
            </thead>
            <tbody>
              {queryList.map((q, i) => (
                <tr
                  key={i}
                  onClick={() => selectRow(i)}
                  className={i === selectedRow ? 'qc-row qc-row--selected' : 'qc-row'}
                  aria-selected={i === selectedRow}
                  style={{ cursor: 'pointer' }}
                >
                  <td style={TD}>
                    <input
                      style={INPUT}
                      value={q.name}
                      onChange={e => onRenameQuery(i, e.target.value)}
                      onClick={e => e.stopPropagation()}
                    />
                  </td>
                  <td style={{ ...TD, textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={q.distinct}
                      onChange={e => onSetQueryDistinct(i, e.target.checked)}
                      onClick={e => e.stopPropagation()}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ResizeHandle onResize={d => setQueryListWidth(w => clampPaneWidth(w + d, 160, 320))} />

      {/* Список полей */}
      <div style={{ ...panelBox, flex: 1, minWidth: 0 }}>
        <PanelHeader title={t('unions.fieldList')}>
          <IconButton
            icon="arrow-up"
            title={t('actions.moveUp')}
            disabled={selectedCol <= 0}
            onClick={() => moveColumn('up')}
          />
          <IconButton
            icon="arrow-down"
            title={t('actions.moveDown')}
            disabled={selectedCol >= columns.length - 1}
            onClick={() => moveColumn('down')}
          />
        </PanelHeader>
        <div className="qc-list" tabIndex={-1} style={{ overflow: 'auto', flex: 1 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={TH}>{t('common.field')}</th>
                {queryList.map((q, i) => (
                  <th key={i} style={TH}>{q.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {columns.map((col, colIdx) => {
                const draft = aliasDrafts[colIdx];
                const value = draft !== undefined ? draft : col.alias;
                return (
                  <tr
                    key={col.alias}
                    onClick={() => setSelectedCol(colIdx)}
                    className={colIdx === selectedCol ? 'qc-row qc-row--selected' : 'qc-row'}
                    aria-selected={colIdx === selectedCol}
                    style={{ cursor: 'pointer' }}
                  >
                    <td style={TD}>
                      <input
                        style={INPUT}
                        value={value}
                        onChange={e => setAliasDrafts(d => ({ ...d, [colIdx]: e.target.value }))}
                        onBlur={() => commitAlias(colIdx, col.alias, value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                          else if (e.key === 'Escape') {
                            setAliasDrafts(d => { const { [colIdx]: _omit, ...rest } = d; return rest; });
                          }
                        }}
                      />
                    </td>
                    {col.cells.map((cell, i) => (
                      <td key={i} style={{ ...TD, color: cell === null ? 'var(--vscode-descriptionForeground, #888)' : 'inherit', fontStyle: cell === null ? 'italic' : 'normal' }}>
                        {/* Выражение колонки — тем же токенизатором и палитрой, что и в
                            редакторе произвольного выражения (функции, операторы, литералы). */}
                        {cell === null
                          ? t('unions.missing')
                          : highlightParts(cell).map((p, k) => (p.style ? <span key={k} style={p.style}>{p.text}</span> : p.text))}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Сообщение валидации псевдонима */}
      {aliasError !== null && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
          onClick={() => setAliasError(null)}
        >
          <div
            style={{
              ...DIALOG_PANEL,
              padding: 16,
              minWidth: 360,
              maxWidth: '60vw',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
            onClick={e => e.stopPropagation()}
          >
            <span style={{ fontSize: 13 }}>{aliasError}</span>
            <button style={{ ...BTN, alignSelf: 'center', padding: '5px 20px' }} onClick={() => setAliasError(null)}>{t('actions.ok')}</button>
          </div>
        </div>
      )}
    </div>
  );
}
