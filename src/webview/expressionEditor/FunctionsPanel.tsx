import * as React from 'react';
import type { FunctionLeaf } from '../../core/query/functionCatalog';
import { tokenizeSearch } from '../metadataTreeModel';
import { highlightMatches } from '../components/highlightMatches';
import { t } from '../i18n';
import { buildFunctionCategories, functionDescription, functionSignature, type FunctionCategoryId } from './functionCatalogView';
import { TreeList, type TreeRow } from './TreeList';
import { PaneSearch } from './PaneSearch';
import { highlightParts } from './highlightedCode';

const HIGHLIGHT_BG = 'var(--vscode-editor-findMatchHighlightBackground, rgba(234,92,0,0.33))';

const CATEGORY_ICON: Record<FunctionCategoryId, string> = {
  frequent: 'star-full',
  conditional: 'symbol-keyword',
  aggregate: 'symbol-numeric',
  string: 'symbol-string',
  date: 'calendar',
  numeric: 'symbol-numeric',
  logical: 'symbol-boolean',
  operators: 'symbol-operator',
  other: 'symbol-misc',
};

const CODE_BOX: React.CSSProperties = {
  margin: 0,
  padding: '6px 8px',
  borderRadius: 4,
  border: '1px solid var(--qc-border)',
  background: 'var(--qc-frame-bg, var(--vscode-editor-background, #1e1e1e))',
  fontFamily: 'var(--vscode-editor-font-family, monospace)',
  fontSize: 12,
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
  tabSize: 4,
};

interface Props {
  onInsertTemplate: (template: string) => void;
  searchRef: React.RefObject<HTMLInputElement>;
}

/** Мінімальна ширина панелі, за якої довідка стоїть праворуч від списку (список
 * тоді зберігає всю висоту); вужче — компактна смужка під списком. */
const SIDE_DOC_MIN_WIDTH = 480;

function highlighted(text: string, placeholders: boolean): React.ReactNode[] {
  return highlightParts(text, placeholders).map((p, i) => (p.style ? <span key={i} style={p.style}>{p.text}</span> : p.text));
}

function Code({ text, placeholders }: { text: string; placeholders: boolean }): React.ReactElement {
  return <pre style={CODE_BOX}>{highlighted(text, placeholders)}</pre>;
}

function FunctionDoc({ leaf, hideTitle }: { leaf: FunctionLeaf | undefined; hideTitle?: boolean }): React.ReactElement {
  if (!leaf) {
    return <div style={{ fontSize: 12, color: 'var(--vscode-descriptionForeground, #888)' }}>{t('exprEditor.selectFunction')}</div>;
  }
  const description = functionDescription(leaf);
  return (
    <div data-testid="expr-function-doc" style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
      {!hideTitle && <div style={{ fontWeight: 600, fontSize: 13 }}>{leaf.label}</div>}
      <Code text={functionSignature(leaf)} placeholders />
      {description && <div style={{ lineHeight: 1.45 }}>{description}</div>}
      {leaf.example && (
        <>
          <div style={{ fontWeight: 600 }}>{t('exprEditor.example')}</div>
          <Code text={leaf.example} placeholders={false} />
        </>
      )}
    </div>
  );
}

/**
 * Вузька панель: згорнуто — лише опис того, що робить функція/оператор (до 2 рядків),
 * і явне посилання «Синтаксис і приклад ▸», щоб було видно, що є детальніша довідка;
 * розгорнуто — повна довідка (синтаксис, опис, приклад). Стан пам'ятається, доки
 * відкрита модалка.
 */
function FunctionDocStrip({ leaf, open, onToggle }: { leaf: FunctionLeaf | undefined; open: boolean; onToggle: () => void }): React.ReactElement {
  const description = leaf ? functionDescription(leaf) : undefined;
  return (
    <div style={{ flexShrink: 0, borderTop: '1px solid var(--qc-border)', display: 'flex', flexDirection: 'column', minHeight: 0, maxHeight: open ? '55%' : undefined }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '6px 10px', fontSize: 12 }}>
        {leaf ? (
          open ? (
            <span style={{ fontWeight: 600, flex: 1, minWidth: 0 }}>{leaf.label}</span>
          ) : (
            <span
              data-testid="expr-function-doc-strip"
              title={description}
              style={{
                flex: 1, minWidth: 0, lineHeight: 1.4, overflow: 'hidden',
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              }}
            >
              <b>{leaf.label}</b>{description ? ` — ${description}` : ''}
            </span>
          )
        ) : (
          <span style={{ flex: 1, color: 'var(--vscode-descriptionForeground, #888)' }}>{t('exprEditor.selectFunction')}</span>
        )}
        {leaf && (
          <button
            type="button"
            data-testid="expr-doc-toggle"
            aria-expanded={open}
            onClick={onToggle}
            style={{
              flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, padding: 0,
              background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap',
              color: 'var(--vscode-textLink-foreground, #3794ff)',
            }}
          >
            {open ? t('exprEditor.hideHelp') : t('exprEditor.showHelp')}
            <span className={`codicon codicon-chevron-${open ? 'up' : 'right'}`} style={{ fontSize: 12 }} />
          </button>
        )}
      </div>
      {open && leaf && (
        <div style={{ padding: '0 10px 8px', overflow: 'auto', minHeight: 0 }}>
          <FunctionDoc leaf={leaf} hideTitle />
        </div>
      )}
    </div>
  );
}

/**
 * Панель «Функції та оператори»: категорії поверх єдиного `FUNCTION_CATALOG`
 * (`buildFunctionCategories`) + довідка вибраного листа (синтаксис, опис, приклад) у
 * тій самій області — окремої постійної панелі документації немає. Enter / подвійний
 * клік вставляє шаблон сніпетом.
 */
export function FunctionsPanel({ onInsertTemplate, searchRef }: Props): React.ReactElement {
  const categories = React.useMemo(() => buildFunctionCategories(), []);
  const [query, setQuery] = React.useState('');
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set(['c:conditional']));
  const [activeKey, setActiveKey] = React.useState<string | null>('c:conditional/ВЫБОР');
  const treeRef = React.useRef<HTMLDivElement>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);
  // Розкладка довідки — за шириною САМОЇ панелі, а не всієї модалки: панель може
  // бути вузькою і в широкій модалці (розділювач «Поля» зсунуто праворуч).
  const [side, setSide] = React.useState(true);
  const [stripOpen, setStripOpen] = React.useState(false);
  React.useLayoutEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const apply = () => setSide(node.clientWidth >= SIDE_DOC_MIN_WIDTH);
    apply();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(apply);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);
  const tokens = React.useMemo(() => tokenizeSearch(query), [query]);
  const searching = tokens.length > 0;

  const { rows, leaves } = React.useMemo(() => {
    const rows: TreeRow[] = [];
    const leaves = new Map<string, FunctionLeaf>();
    const matches = (leaf: FunctionLeaf) => {
      const hay = `${leaf.label} ${functionDescription(leaf) ?? ''}`.toLowerCase();
      return tokens.every(tok => hay.includes(tok));
    };
    for (const cat of categories) {
      if (searching && cat.id === 'frequent') continue;
      const visible = searching ? cat.leaves.filter(matches) : cat.leaves;
      if (searching && visible.length === 0) continue;
      const key = `c:${cat.id}`;
      const isOpen = searching || expanded.has(key);
      rows.push({
        key, depth: 0, expandable: true, expanded: isOpen, group: true,
        icon: CATEGORY_ICON[cat.id],
        iconColor: cat.id === 'frequent' ? 'var(--vscode-charts-yellow, #cca700)' : 'var(--vscode-icon-foreground, #c5c5c5)',
        label: t(cat.labelKey),
        detail: cat.id === 'frequent' ? undefined : String(visible.length),
      });
      if (!isOpen) continue;
      for (const leaf of visible) {
        const leafKey = `${key}/${leaf.label}`;
        rows.push({
          key: leafKey, depth: 1, expandable: false,
          icon: leaf.template.includes('(') || leaf.template.includes('<') ? 'symbol-method' : 'symbol-operator',
          iconColor: 'var(--vscode-symbolIcon-methodForeground, #b180d7)',
          label: searching ? highlightMatches(leaf.label, tokens, HIGHLIGHT_BG) : leaf.label,
          title: functionSignature(leaf),
          dragText: leaf.template,
        });
        leaves.set(leafKey, leaf);
      }
    }
    return { rows, leaves };
  }, [categories, expanded, tokens, searching]);

  function toggle(key: string) {
    if (searching) return;
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function activate(key: string) {
    const leaf = leaves.get(key);
    if (leaf) onInsertTemplate(leaf.template);
    else toggle(key);
  }

  const activeLeaf = activeKey ? leaves.get(activeKey) : undefined;

  return (
    <div ref={rootRef} data-doc-placement={side ? 'side' : 'strip'} data-testid="expr-functions-panel" style={{ display: 'flex', flexDirection: side ? 'row' : 'column', flex: 1, minHeight: 0, minWidth: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column', flex: side ? '1 1 50%' : '1 1 auto', minWidth: 0, minHeight: 0 }}>
        <PaneSearch
          inputRef={searchRef}
          value={query}
          placeholder={t('exprEditor.searchFunctions')}
          testId="expr-functions-search"
          onChange={setQuery}
          onEnterTree={() => treeRef.current?.focus()}
        />
        <TreeList
          ref={treeRef}
          rows={rows}
          activeKey={activeKey}
          onActiveChange={setActiveKey}
          onToggle={toggle}
          onActivate={activate}
          emptyText={t('exprEditor.noMatches')}
          ariaLabel={t('exprEditor.functions')}
          testId="expr-functions-tree"
        />
      </div>
      {side ? (
        <div style={{ flex: '1 1 50%', minWidth: 0, borderLeft: '1px solid var(--qc-border)', padding: '2px 12px 8px', overflow: 'auto' }}>
          <FunctionDoc leaf={activeLeaf} />
        </div>
      ) : (
        <FunctionDocStrip leaf={activeLeaf} open={stripOpen} onToggle={() => setStripOpen(v => !v)} />
      )}
    </div>
  );
}
