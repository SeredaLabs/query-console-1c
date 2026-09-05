import * as React from 'react';
import type { SelectedTable, Selection, QueryType } from '../../core/query/queryModel';
import type { RefreshState } from '../App';
import { BTN, FIELDSET, LEGEND, CHECK_LABEL, RADIO_LABEL, INPUT, SECTION_HEADER, REMOVE_BTN, ROW, panelBox } from '../sharedStyles';
import { MetaKindIcon } from './MetaKindIcon';
import { t, type MessageKey } from '../i18n';

interface Props {
  selectedTables: SelectedTable[];
  selection: Selection;
  queryType: QueryType;
  tempTableName: string;
  lockForUpdate: string[];
  lockEnabled: boolean;
  onSetTop: (top: number | undefined) => void;
  onSetDistinct: (distinct: boolean) => void;
  onSetAllowed: (allowed: boolean) => void;
  onSetQueryType: (queryType: QueryType) => void;
  onSetTempTableName: (name: string) => void;
  onSetLockEnabled: (enabled: boolean) => void;
  onAddLockTable: (fullName: string) => void;
  onRemoveLockTable: (fullName: string) => void;
  /** Блок «Кэш метаданных» — не показывается во вложенном конструкторе подзапроса. */
  refreshState?: RefreshState;
  onRefreshCache?: () => void;
  preserveComments?: boolean;
  onSetPreserveComments?: (value: boolean) => void;
}

const dropZone: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  fontSize: 13,
  minHeight: 80,
};

const QUERY_TYPES: { value: QueryType; label: MessageKey }[] = [
  { value: 'select', label: 'additional.select' },
  { value: 'createTemp', label: 'additional.createTemp' },
  { value: 'appendTemp', label: 'additional.appendTemp' },
  { value: 'dropTemp', label: 'additional.dropTemp' },
];

function objectName(fullName: string): string {
  return fullName.split('.')[1] ?? fullName;
}

export function AdditionalTab(props: Props): React.ReactElement {
  const {
    selectedTables, selection, queryType, tempTableName, lockForUpdate, lockEnabled,
    onSetTop, onSetDistinct, onSetAllowed, onSetQueryType, onSetTempTableName,
    onSetLockEnabled, onAddLockTable, onRemoveLockTable,
    refreshState, onRefreshCache, preserveComments, onSetPreserveComments,
  } = props;
  const showCacheBlock = onRefreshCache != null && onSetPreserveComments != null;

  const topEnabled = selection.top !== undefined;
  const tempNameEnabled = queryType !== 'select';

  // Таблицы выборки, ещё не добавленные в «для изменения».
  const availableTables = selectedTables.filter(t => !lockForUpdate.includes(t.fullName));

  function dragStart(e: React.DragEvent, fullName: string) {
    e.dataTransfer.setData('text/plain', JSON.stringify({ fullName }));
    e.dataTransfer.effectAllowed = 'copy';
  }

  function parseDrop(e: React.DragEvent): string | null {
    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
      if (data && typeof data.fullName === 'string') return data.fullName;
    } catch { /* ignore */ }
    return null;
  }

  function allowDrop(e: React.DragEvent) {
    if (!lockEnabled) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 8, padding: 8, overflow: 'auto' }}>
      {/* Выборка записей */}
      <fieldset style={FIELDSET}>
        <legend style={LEGEND}>{t('additional.records')}</legend>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={CHECK_LABEL}>
            <input
              type="checkbox"
              checked={topEnabled}
              onChange={e => onSetTop(e.target.checked ? (selection.top ?? 1) : undefined)}
            />
            {t('additional.first')}
          </label>
          <input
            type="number"
            min={1}
            disabled={!topEnabled}
            value={topEnabled ? selection.top : ''}
            onChange={e => {
              const n = parseInt(e.target.value, 10);
              onSetTop(Number.isNaN(n) ? undefined : n);
            }}
            style={{ ...INPUT, width: 80, opacity: topEnabled ? 1 : 0.5 }}
          />
        </div>
        <label style={CHECK_LABEL}>
          <input
            type="checkbox"
            checked={selection.distinct ?? false}
            onChange={e => onSetDistinct(e.target.checked)}
          />
          {t('additional.distinct')}
        </label>
        <label style={CHECK_LABEL}>
          <input
            type="checkbox"
            checked={selection.allowed ?? false}
            onChange={e => onSetAllowed(e.target.checked)}
          />
          {t('additional.allowed')}
        </label>
      </fieldset>

      {/* Тип запроса */}
      <fieldset style={FIELDSET}>
        <legend style={LEGEND}>{t('additional.queryType')}</legend>
        {QUERY_TYPES.map(qt => (
          <label key={qt.value} style={RADIO_LABEL}>
            <input
              type="radio"
              name="query-type"
              checked={queryType === qt.value}
              onChange={() => onSetQueryType(qt.value)}
            />
            {t(qt.label)}
          </label>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <span style={{ fontSize: 13, opacity: tempNameEnabled ? 1 : 0.5 }}>{t('additional.tempName')}:</span>
          <input
            type="text"
            disabled={!tempNameEnabled}
            value={tempTableName}
            onChange={e => onSetTempTableName(e.target.value)}
            style={{ ...INPUT, flex: 1, minWidth: 0, opacity: tempNameEnabled ? 1 : 0.5 }}
          />
        </div>
      </fieldset>

      {/* Блокировка */}
      <fieldset style={FIELDSET}>
        <label style={CHECK_LABEL}>
          <input
            type="checkbox"
            checked={lockEnabled}
            onChange={e => onSetLockEnabled(e.target.checked)}
          />
          {t('additional.lockForUpdate')}
        </label>
        <div style={{ display: 'flex', gap: 8, opacity: lockEnabled ? 1 : 0.5, pointerEvents: lockEnabled ? 'auto' : 'none' }}>
          {/* Таблицы */}
          <div style={panelBox}>
            <div style={SECTION_HEADER}>{t('common.tables')}</div>
            <div style={dropZone}>
              {availableTables.map(t => (
                <div
                  key={t.id}
                  draggable={lockEnabled}
                  onDragStart={e => dragStart(e, t.fullName)}
                  style={{ ...ROW, cursor: lockEnabled ? 'grab' : 'default', justifyContent: 'flex-start', gap: 4 }}
                >
                  <MetaKindIcon kind={t.fullName.split('.')[0] ?? null} />
                  <span>{objectName(t.fullName)}</span>
                </div>
              ))}
              {availableTables.length === 0 && (
                <div style={{ padding: 6, color: 'var(--vscode-descriptionForeground, #888)', fontSize: 12 }}>
                  {t('empty.noAvailableTables')}
                </div>
              )}
            </div>
          </div>

          {/* Таблицы для изменения */}
          <div
            style={panelBox}
            onDragOver={allowDrop}
            onDrop={e => {
              if (!lockEnabled) return;
              e.preventDefault();
              const fullName = parseDrop(e);
              if (fullName) onAddLockTable(fullName);
            }}
          >
            <div style={SECTION_HEADER}>{t('additional.updateTables')}</div>
            <div style={dropZone}>
              {lockForUpdate.map(fullName => (
                <div key={fullName} style={{ ...ROW, gap: 4 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <MetaKindIcon kind={fullName.split('.')[0] ?? null} />
                    {objectName(fullName)}
                  </span>
                  <button
                    style={REMOVE_BTN}
                    title={t('actions.remove')}
                    onClick={() => onRemoveLockTable(fullName)}
                  >
                    ✕
                  </button>
                </div>
              ))}
              {lockForUpdate.length === 0 && (
                <div style={{ padding: 6, color: 'var(--vscode-descriptionForeground, #888)', fontSize: 12 }}>
                  {t('empty.dragTableHere')}
                </div>
              )}
            </div>
          </div>
        </div>
      </fieldset>

      {/* Кэш метаданных — не показывается во вложенном конструкторе подзапроса. */}
      {showCacheBlock && (
        <fieldset style={FIELDSET}>
          <legend style={LEGEND}>{t('additional.metadataCache')}</legend>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              style={{ ...BTN, opacity: refreshState === 'loading' ? 0.6 : 1 }}
              onClick={onRefreshCache}
              disabled={refreshState === 'loading'}
            >
              {refreshState === 'loading' ? t('refresh.loading') : t('actions.refreshCache')}
            </button>
            {typeof refreshState === 'object' && refreshState != null && (
              <span style={{ fontSize: 12, color: refreshState.ok ? 'var(--vscode-terminal-ansiGreen, #4caf50)' : 'var(--vscode-errorForeground, #f44747)' }}>
                {refreshState.message}
              </span>
            )}
          </div>
          <label style={CHECK_LABEL}>
            <input
              type="checkbox"
              checked={preserveComments ?? false}
              onChange={e => onSetPreserveComments?.(e.target.checked)}
            />
            {t('constructor.preserveComments')}
          </label>
        </fieldset>
      )}
    </div>
  );
}
