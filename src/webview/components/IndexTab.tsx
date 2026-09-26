import * as React from 'react';
import type { SelectedField, Indexing, FieldRef } from '../../core/query/queryModel';
import { distinctFieldRefs } from '../fieldSource';
import { ResizeHandle, clampPaneWidth } from './ResizeHandle';
import { PanelHeader } from './PanelHeader';
import { IconButton } from './IconButton';
import { useFieldDragDrop } from '../hooks/useFieldDragDrop';
import { SECTION_HEADER, COLUMN_HEADER, EMPTY_HINT, panelBox, ROW } from '../sharedStyles';
import { t } from '../i18n';

interface Props {
  selectedFields: SelectedField[];
  indexing: Indexing;
  onAddIndex: () => void;
  onCopyIndex: (index: number) => void;
  onRemoveIndex: (index: number) => void;
  onMoveIndex: (index: number, dir: 'up' | 'down') => void;
  onSetUnique: (index: number, unique: boolean) => void;
  onAddField: (index: number, tableId: string, path: string) => void;
  onAddAllFields: (index: number, fields: FieldRef[]) => void;
  onRemoveField: (index: number, tableId: string, path: string) => void;
  onClearFields: (index: number) => void;
  onMoveField: (index: number, tableId: string, path: string, dir: 'up' | 'down') => void;
}

function keyOf(tableId: string, path: string): string {
  return `${tableId}|${path}`;
}

export function IndexTab(props: Props): React.ReactElement {
  const {
    selectedFields, indexing,
    onAddIndex, onCopyIndex, onRemoveIndex, onMoveIndex, onSetUnique,
    onAddField, onAddAllFields, onRemoveField, onClearFields, onMoveField,
  } = props;

  const indexes = indexing.indexes;
  const [leftWidth, setLeftWidth] = React.useState(260);
  const [current, setCurrent] = React.useState(0);
  const [middleSel, setMiddleSel] = React.useState<string | null>(null);
  const [rightSel, setRightSel] = React.useState<string | null>(null);

  const hasIndexes = indexes.length > 0;
  const currentIdx = hasIndexes ? Math.min(current, indexes.length - 1) : -1;
  const currentIndex = currentIdx >= 0 ? indexes[currentIdx] : null;

  // Источник: обычные поля выборки (не выражения, не ТЧ).
  const sourceFields = distinctFieldRefs(selectedFields);

  // Псевдоним поля выборки: явный alias, иначе последний сегмент пути.
  function labelFor(tableId: string, path: string): string {
    const match = selectedFields.find(f => f.tableId === tableId && f.path === path);
    if (match?.alias) return match.alias;
    return path.split('.').pop() ?? path;
  }

  function inCurrent(tableId: string, path: string): boolean {
    if (!currentIndex) return false;
    return currentIndex.fields.some(f => f.tableId === tableId && f.path === path);
  }

  // Поля, ещё не добавленные в текущий индекс.
  const availableFields: FieldRef[] = currentIndex
    ? sourceFields
        .filter(f => !inCurrent(f.tableId, f.path!))
        .map(f => ({ tableId: f.tableId, path: f.path! }))
    : [];

  const { dragStart, parseDrop, allowDrop, dropZone } = useFieldDragDrop();

  const emptyHint = EMPTY_HINT;

  function parseSel(key: string | null): { tableId: string; path: string } | null {
    if (!key) return null;
    const i = key.indexOf('|');
    if (i < 0) return null;
    return { tableId: key.slice(0, i), path: key.slice(i + 1) };
  }

  const middle = parseSel(middleSel);
  const right = parseSel(rightSel);

  // Индекс правого выделенного поля в текущем индексе (для ↑↓).
  const rightFieldIdx = currentIndex && right
    ? currentIndex.fields.findIndex(f => f.tableId === right.tableId && f.path === right.path)
    : -1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: 4, gap: 4, overflow: 'hidden' }}>
      <div style={{ display: 'flex', flex: 1, gap: 4, overflow: 'hidden' }}>
        {/* Панель 1: Индексы */}
        <div style={{ ...panelBox, width: leftWidth, flexShrink: 0 }}>
          <PanelHeader title={t('tabs.indexes')}>
            <IconButton icon="add" tone="add" title={t('indexes.add')} onClick={onAddIndex} />
            <IconButton icon="copy" title={t('indexes.copy')} disabled={currentIdx < 0} onClick={() => currentIdx >= 0 && onCopyIndex(currentIdx)} />
            <IconButton icon="close" tone="remove" title={t('indexes.delete')} disabled={currentIdx < 0} onClick={() => currentIdx >= 0 && onRemoveIndex(currentIdx)} />
            <IconButton icon="arrow-up" title={t('actions.moveUp')} disabled={currentIdx <= 0} onClick={() => { if (currentIdx > 0) { onMoveIndex(currentIdx, 'up'); setCurrent(currentIdx - 1); } }} />
            <IconButton icon="arrow-down" title={t('actions.moveDown')} disabled={currentIdx < 0 || currentIdx >= indexes.length - 1} onClick={() => { if (currentIdx >= 0 && currentIdx < indexes.length - 1) { onMoveIndex(currentIdx, 'down'); setCurrent(currentIdx + 1); } }} />
          </PanelHeader>
          <div style={{ display: 'flex', ...COLUMN_HEADER, padding: 0 }}>
            <div style={{ flex: 1, padding: '3px 8px' }}>{t('common.name')}</div>
            <div style={{ width: 90, flexShrink: 0, padding: '3px 0', textAlign: 'center' }}>{t('indexes.unique')}</div>
          </div>
          <div style={dropZone} className="qc-list" tabIndex={-1}>
            {indexes.map((idx, i) => (
              <div
                key={i}
                onClick={() => setCurrent(i)}
                className={i === currentIdx ? 'qc-row qc-row--selected' : 'qc-row'}
                aria-selected={i === currentIdx}
                style={{ ...ROW, cursor: 'pointer', justifyContent: 'space-between' }}
              >
                <span style={{ flex: 1 }}>{t('indexes.number', { number: i + 1 })}</span>
                <span style={{ width: 90, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
                  <input
                    type="checkbox"
                    checked={idx.unique}
                    onClick={e => e.stopPropagation()}
                    onChange={e => onSetUnique(i, e.target.checked)}
                  />
                </span>
              </div>
            ))}
            {!hasIndexes && (
              <div style={emptyHint}>{t('indexes.empty')}</div>
            )}
          </div>
        </div>

        <ResizeHandle onResize={d => setLeftWidth(w => clampPaneWidth(w + d, 140, 420))} />

        {/* Панель 2: Поля */}
        <div style={{ ...panelBox, flex: 1, minWidth: 0 }}>
          <div style={SECTION_HEADER}>{t('common.fields')}</div>
          <div style={dropZone} data-field-source="index-source" className="qc-list" tabIndex={-1}>
            {currentIndex && availableFields.map(f => {
              const k = keyOf(f.tableId, f.path);
              return (
                <div
                  key={k}
                  data-field-item
                  draggable
                  onDragStart={e => dragStart(e, f.tableId, f.path)}
                  onClick={() => setMiddleSel(k)}
                  className={k === middleSel ? 'qc-row qc-row--selected' : 'qc-row'}
                  aria-selected={k === middleSel}
                  style={{ ...ROW, cursor: 'grab', justifyContent: 'flex-start' }}
                >
                  <span>{labelFor(f.tableId, f.path)}</span>
                </div>
              );
            })}
            {currentIndex && availableFields.length === 0 && (
              <div style={emptyHint}>{t('indexes.allFieldsAdded')}</div>
            )}
            {!currentIndex && (
              <div style={emptyHint}>{t('indexes.addHint')}</div>
            )}
          </div>
        </div>

        {/* Колонка кнопок переноса */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4 }}>
          <IconButton
            icon="chevron-right"
            tone="add"
            title={t('indexes.addSelected')}
            disabled={!currentIndex || !middle || !availableFields.some(f => f.tableId === middle.tableId && f.path === middle.path)}
            onClick={() => { if (currentIdx >= 0 && middle) onAddField(currentIdx, middle.tableId, middle.path); }}
          />
          <IconButton
            icon="arrow-right"
            tone="add"
            title={t('indexes.addAll')}
            disabled={!currentIndex || availableFields.length === 0}
            onClick={() => { if (currentIdx >= 0) onAddAllFields(currentIdx, availableFields); }}
          />
          <IconButton
            icon="chevron-left"
            tone="remove"
            title={t('indexes.removeSelected')}
            disabled={!currentIndex || rightFieldIdx < 0}
            onClick={() => { if (currentIdx >= 0 && right) onRemoveField(currentIdx, right.tableId, right.path); }}
          />
          <IconButton
            icon="arrow-left"
            tone="remove"
            title={t('indexes.removeAll')}
            disabled={!currentIndex || currentIndex.fields.length === 0}
            onClick={() => { if (currentIdx >= 0) onClearFields(currentIdx); }}
          />
        </div>

        {/* Панель 3: Поле (поля индекса) */}
        <div style={{ ...panelBox, flex: 2, minWidth: 0 }}>
          <PanelHeader title={t('common.field')}>
            <IconButton
              icon="arrow-up"
              title={t('actions.moveUp')}
              disabled={!currentIndex || rightFieldIdx <= 0}
              onClick={() => { if (currentIdx >= 0 && right) onMoveField(currentIdx, right.tableId, right.path, 'up'); }}
            />
            <IconButton
              icon="arrow-down"
              title={t('actions.moveDown')}
              disabled={!currentIndex || rightFieldIdx < 0 || (currentIndex !== null && rightFieldIdx >= currentIndex.fields.length - 1)}
              onClick={() => { if (currentIdx >= 0 && right) onMoveField(currentIdx, right.tableId, right.path, 'down'); }}
            />
          </PanelHeader>
          <div
            className="qc-list"
            tabIndex={-1}
            style={dropZone}
            onDragOver={allowDrop}
            onDrop={e => {
              e.preventDefault();
              if (currentIdx < 0) return;
              const d = parseDrop(e);
              if (d) onAddField(currentIdx, d.tableId, d.path);
            }}
          >
            {currentIndex && currentIndex.fields.map(f => {
              const k = keyOf(f.tableId, f.path);
              return (
                <div
                  key={k}
                  onClick={() => setRightSel(k)}
                  className={k === rightSel ? 'qc-row qc-row--selected' : 'qc-row'}
                  aria-selected={k === rightSel}
                  style={{ ...ROW, cursor: 'pointer', justifyContent: 'flex-start' }}
                >
                  <span>{labelFor(f.tableId, f.path)}</span>
                </div>
              );
            })}
            {currentIndex && currentIndex.fields.length === 0 && (
              <div style={emptyHint}>{t('indexes.dragFields')}</div>
            )}
            {!currentIndex && (
              <div style={emptyHint}>{t('indexes.addHint')}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
