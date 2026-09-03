import * as React from 'react';
import type { SelectedField, Indexing, FieldRef } from '../../core/query/queryModel';
import { distinctFieldRefs } from '../fieldSource';
import { ResizeHandle } from './ResizeHandle';
import { IconButton } from './IconButton';
import { useFieldDragDrop } from '../hooks/useFieldDragDrop';
import { SECTION_HEADER, panelBox, ROW } from '../sharedStyles';

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

const SELECTED_BG = 'var(--vscode-list-activeSelectionBackground, #094771)';

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

  const emptyHint: React.CSSProperties = {
    padding: 6,
    color: 'var(--vscode-descriptionForeground, #888)',
    fontSize: 12,
  };

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
          <div style={{ display: 'flex', gap: 2, padding: '2px 4px', borderBottom: '1px solid var(--qc-border)' }}>
            <IconButton icon="add" tone="add" title="Добавить индекс" onClick={onAddIndex} />
            <IconButton icon="copy" title="Скопировать индекс" disabled={currentIdx < 0} onClick={() => currentIdx >= 0 && onCopyIndex(currentIdx)} />
            <IconButton icon="close" tone="remove" title="Удалить индекс" disabled={currentIdx < 0} onClick={() => currentIdx >= 0 && onRemoveIndex(currentIdx)} />
            <IconButton icon="arrow-up" title="Вверх" disabled={currentIdx <= 0} onClick={() => { if (currentIdx > 0) { onMoveIndex(currentIdx, 'up'); setCurrent(currentIdx - 1); } }} />
            <IconButton icon="arrow-down" title="Вниз" disabled={currentIdx < 0 || currentIdx >= indexes.length - 1} onClick={() => { if (currentIdx >= 0 && currentIdx < indexes.length - 1) { onMoveIndex(currentIdx, 'down'); setCurrent(currentIdx + 1); } }} />
          </div>
          <div style={{ display: 'flex' }}>
            <div style={{ ...SECTION_HEADER, flex: 1 }}>Имя</div>
            <div style={{ ...SECTION_HEADER, width: 90, flexShrink: 0 }}>Уникальный</div>
          </div>
          <div style={dropZone}>
            {indexes.map((idx, i) => (
              <div
                key={i}
                onClick={() => setCurrent(i)}
                style={{ ...ROW, cursor: 'pointer', justifyContent: 'space-between', background: i === currentIdx ? SELECTED_BG : 'transparent' }}
              >
                <span style={{ flex: 1 }}>{`Индекс ${i + 1}`}</span>
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
              <div style={emptyHint}>Нет индексов. Нажмите «+», чтобы добавить.</div>
            )}
          </div>
        </div>

        <ResizeHandle onResize={d => setLeftWidth(w => Math.max(140, w + d))} />

        {/* Панель 2: Поля */}
        <div style={{ ...panelBox, flex: 1, minWidth: 0 }}>
          <div style={SECTION_HEADER}>Поля</div>
          <div style={dropZone} data-field-source="index-source">
            {currentIndex && availableFields.map(f => {
              const k = keyOf(f.tableId, f.path);
              return (
                <div
                  key={k}
                  data-field-item
                  draggable
                  onDragStart={e => dragStart(e, f.tableId, f.path)}
                  onClick={() => setMiddleSel(k)}
                  style={{ ...ROW, cursor: 'grab', justifyContent: 'flex-start', background: k === middleSel ? SELECTED_BG : 'transparent' }}
                >
                  <span>{labelFor(f.tableId, f.path)}</span>
                </div>
              );
            })}
            {currentIndex && availableFields.length === 0 && (
              <div style={emptyHint}>Все поля добавлены.</div>
            )}
            {!currentIndex && (
              <div style={emptyHint}>Добавьте индекс.</div>
            )}
          </div>
        </div>

        {/* Колонка кнопок переноса */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4 }}>
          <IconButton
            icon="chevron-right"
            tone="add"
            title="Добавить выбранное поле"
            disabled={!currentIndex || !middle || !availableFields.some(f => f.tableId === middle.tableId && f.path === middle.path)}
            onClick={() => { if (currentIdx >= 0 && middle) onAddField(currentIdx, middle.tableId, middle.path); }}
          />
          <IconButton
            icon="arrow-right"
            tone="add"
            title="Добавить все поля"
            disabled={!currentIndex || availableFields.length === 0}
            onClick={() => { if (currentIdx >= 0) onAddAllFields(currentIdx, availableFields); }}
          />
          <IconButton
            icon="chevron-left"
            tone="remove"
            title="Убрать выбранное поле"
            disabled={!currentIndex || rightFieldIdx < 0}
            onClick={() => { if (currentIdx >= 0 && right) onRemoveField(currentIdx, right.tableId, right.path); }}
          />
          <IconButton
            icon="arrow-left"
            tone="remove"
            title="Убрать все поля"
            disabled={!currentIndex || currentIndex.fields.length === 0}
            onClick={() => { if (currentIdx >= 0) onClearFields(currentIdx); }}
          />
        </div>

        {/* Панель 3: Поле (поля индекса) */}
        <div style={{ ...panelBox, flex: 2, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 2, padding: '2px 4px', borderBottom: '1px solid var(--qc-border)' }}>
            <IconButton
              icon="arrow-up"
              title="Вверх"
              disabled={!currentIndex || rightFieldIdx <= 0}
              onClick={() => { if (currentIdx >= 0 && right) onMoveField(currentIdx, right.tableId, right.path, 'up'); }}
            />
            <IconButton
              icon="arrow-down"
              title="Вниз"
              disabled={!currentIndex || rightFieldIdx < 0 || (currentIndex !== null && rightFieldIdx >= currentIndex.fields.length - 1)}
              onClick={() => { if (currentIdx >= 0 && right) onMoveField(currentIdx, right.tableId, right.path, 'down'); }}
            />
          </div>
          <div style={SECTION_HEADER}>Поле</div>
          <div
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
                  style={{ ...ROW, cursor: 'pointer', justifyContent: 'flex-start', background: k === rightSel ? SELECTED_BG : 'transparent' }}
                >
                  <span>{labelFor(f.tableId, f.path)}</span>
                </div>
              );
            })}
            {currentIndex && currentIndex.fields.length === 0 && (
              <div style={emptyHint}>Перетащите поля из списка «Поля».</div>
            )}
            {!currentIndex && (
              <div style={emptyHint}>Добавьте индекс.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
