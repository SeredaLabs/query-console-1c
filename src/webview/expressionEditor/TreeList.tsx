import * as React from 'react';
import { Chevron } from '../components/Chevron';
import { ROW_PADDING_Y } from '../sharedStyles';

export interface TreeRow {
  key: string;
  depth: number;
  expandable: boolean;
  expanded?: boolean;
  /** Чиста група (джерело, категорія): одиночний клік розгортає/згортає. */
  group?: boolean;
  /** codicon без префікса. */
  icon?: string;
  iconColor?: string;
  label: React.ReactNode;
  /** Приглушений текст праворуч (тип поля, кількість функцій). */
  detail?: string;
  title?: string;
  /** Текст для перетягування в редактор (`text/plain`). */
  dragText?: string;
}

interface Props {
  rows: TreeRow[];
  activeKey: string | null;
  onActiveChange: (key: string) => void;
  onToggle: (key: string) => void;
  /** Enter / подвійний клік. */
  onActivate: (key: string) => void;
  emptyText: string;
  ariaLabel: string;
  testId?: string;
}

/**
 * Дерево з «roving» активним рядком — один tab-stop на все дерево, стрілки
 * рухають активний рядок (як дерева VS Code): ↑/↓, Home/End, → розгорнути / до
 * першої дитини, ← згорнути / до батька, Enter — дія рядка. Стан розгортання й
 * активного рядка належить батьківській панелі (рядки — плаский видимий список).
 */
export const TreeList = React.forwardRef<HTMLDivElement, Props>(function TreeList(
  { rows, activeKey, onActiveChange, onToggle, onActivate, emptyText, ariaLabel, testId },
  ref,
) {
  const idPrefix = React.useId();
  const listRef = React.useRef<HTMLDivElement>(null);
  React.useImperativeHandle(ref, () => listRef.current!, []);
  const activeIndex = rows.findIndex(r => r.key === activeKey);

  React.useEffect(() => {
    if (activeIndex < 0) return;
    const node = listRef.current?.querySelector<HTMLElement>(`[data-row-index="${activeIndex}"]`);
    node?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex]);

  function move(index: number) {
    const row = rows[Math.max(0, Math.min(rows.length - 1, index))];
    if (row) onActiveChange(row.key);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (rows.length === 0) return;
    const cur = activeIndex < 0 ? -1 : activeIndex;
    const row = rows[cur];
    let handled = true;
    switch (e.key) {
      case 'ArrowDown': move(cur + 1); break;
      case 'ArrowUp': move(cur < 0 ? 0 : cur - 1); break;
      case 'Home': move(0); break;
      case 'End': move(rows.length - 1); break;
      case 'ArrowRight':
        if (!row) move(0);
        else if (row.expandable && !row.expanded) onToggle(row.key);
        else if (row.expandable && rows[cur + 1]?.depth === row.depth + 1) move(cur + 1);
        break;
      case 'ArrowLeft':
        if (!row) break;
        if (row.expandable && row.expanded) onToggle(row.key);
        else {
          for (let i = cur - 1; i >= 0; i--) {
            if (rows[i].depth < row.depth) { move(i); break; }
          }
        }
        break;
      case 'Enter':
        if (row) onActivate(row.key);
        break;
      default:
        handled = false;
    }
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  return (
    <div
      ref={listRef}
      role="tree"
      aria-label={ariaLabel}
      tabIndex={0}
      data-testid={testId}
      aria-activedescendant={activeIndex >= 0 ? `${idPrefix}-${activeIndex}` : undefined}
      onKeyDown={handleKeyDown}
      onFocus={() => {
        // Без активного рядка — перший «лист» (поле/функція), а не група: ↓ з поля
        // пошуку + Enter одразу вставляє знайдене.
        if (activeIndex < 0 && rows[0]) onActiveChange((rows.find(r => r.depth > 0) ?? rows[0]).key);
      }}
      style={{ flex: 1, minHeight: 0, overflow: 'auto', outline: 'none', paddingBottom: 4, containerType: 'inline-size' }}
      className="qc-expr-tree"
    >
      {rows.length === 0 && (
        <div style={{ padding: '6px 10px', fontSize: 12, color: 'var(--vscode-descriptionForeground, #888)' }}>{emptyText}</div>
      )}
      {rows.map((row, i) => {
        const active = i === activeIndex;
        return (
          <div
            key={row.key}
            id={`${idPrefix}-${i}`}
            role="treeitem"
            aria-level={row.depth + 1}
            aria-expanded={row.expandable ? !!row.expanded : undefined}
            aria-selected={active}
            data-row-index={i}
            data-row-key={row.key}
            className={active ? 'qc-expr-row qc-expr-row-active' : 'qc-expr-row'}
            title={row.title}
            draggable={!!row.dragText}
            onDragStart={row.dragText ? e => { e.dataTransfer.setData('text/plain', row.dragText!); e.dataTransfer.effectAllowed = 'copy'; } : undefined}
            onMouseDown={() => onActiveChange(row.key)}
            onClick={e => { if (row.expandable && (row.group || (e.target as HTMLElement).closest('[data-chevron]'))) onToggle(row.key); }}
            onDoubleClick={row.group ? undefined : () => onActivate(row.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              paddingLeft: 6 + row.depth * 16, paddingRight: 10,
              paddingTop: ROW_PADDING_Y, paddingBottom: ROW_PADDING_Y,
              fontSize: 12, cursor: 'default', userSelect: 'none', whiteSpace: 'nowrap',
            }}
          >
            <span data-chevron style={{ width: 14, display: 'inline-flex', justifyContent: 'center', flexShrink: 0 }}>
              {row.expandable && <Chevron expanded={!!row.expanded} />}
            </span>
            {row.icon && (
              <span className={`codicon codicon-${row.icon}`} style={{ fontSize: 14, flexShrink: 0, color: row.iconColor ?? 'var(--vscode-symbolIcon-fieldForeground, #75beff)' }} />
            )}
            {/* Назва має пріоритет: не стискається, доки не займе ~70% рядка; першим
                обрізається тип праворуч (повний — у підказці рядка). */}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 0, maxWidth: row.detail ? '70%' : undefined, minWidth: 0 }}>{row.label}</span>
            {row.detail && (
              <span
                className="qc-expr-row-detail"
                style={{ flex: '1 1 0', minWidth: 0, paddingLeft: 12, textAlign: 'right', color: 'var(--vscode-descriptionForeground, #9d9d9d)', overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                {row.detail}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
});

/** Стилі рядків дерев редактора виразів (hover/активний рядок) — `<style>` один раз у модалці. */
export const TREE_CSS = `
@container (max-width: 240px) { .qc-expr-row-detail { display: none; } }
.qc-expr-row:hover { background: var(--vscode-list-hoverBackground, rgba(255,255,255,0.05)); }
.qc-expr-tree .qc-expr-row-active { background: var(--vscode-list-inactiveSelectionBackground, rgba(255,255,255,0.08)); }
.qc-expr-tree:focus .qc-expr-row-active {
  background: var(--vscode-list-activeSelectionBackground, #04395e);
  color: var(--vscode-list-activeSelectionForeground, #fff);
  outline: 1px solid var(--vscode-list-focusOutline, #007fd4);
  outline-offset: -1px;
}
`;
