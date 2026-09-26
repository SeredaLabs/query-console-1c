import * as React from 'react';
import type { MetaField, MetaTable } from '../../core/metadata/types';
import { describeFieldTypes } from '../../core/metadata/describeType';
import { tokenizeSearch } from '../metadataTreeModel';
import { highlightMatches } from '../components/highlightMatches';
import { t } from '../i18n';
import { fieldReference, referenceTarget, type ExpressionContext, type ExpressionSource } from './expressionContext';
import { TreeList, type TreeRow } from './TreeList';
import { PaneSearch } from './PaneSearch';

const HIGHLIGHT_BG = 'var(--vscode-editor-findMatchHighlightBackground, rgba(234,92,0,0.33))';

interface Props {
  ctx: ExpressionContext;
  onInsert: (text: string) => void;
  searchRef: React.RefObject<HTMLInputElement>;
}

interface RowTarget {
  source: ExpressionSource;
  /** Шлях полів від джерела; порожній — рядок самого джерела. */
  path: string[];
}

function fieldIcon(field: MetaField): { icon: string; color: string } {
  return field.types.some(tp => tp.ref)
    ? { icon: 'symbol-class', color: 'var(--vscode-symbolIcon-classForeground, #ee9d28)' }
    : { icon: 'symbol-field', color: 'var(--vscode-symbolIcon-fieldForeground, #75beff)' };
}

/**
 * Панель «Поля»: джерела виразу (вибрані таблиці під своїми псевдонімами) → поля з
 * типом праворуч → поля за посиланням (ліниво, через той самий `MetadataResolver`).
 * Enter / подвійний клік вставляє посилання, сформоване `fieldReference` для поточного
 * режиму адресації; рядок можна перетягнути в редактор.
 */
export function FieldsPanel({ ctx, onInsert, searchRef }: Props): React.ReactElement {
  const [query, setQuery] = React.useState('');
  const [expanded, setExpanded] = React.useState<Set<string>>(
    () => new Set(ctx.sources.slice(0, ctx.sources.length <= 2 ? 2 : 1).map(s => `s:${s.alias}`)),
  );
  const [activeKey, setActiveKey] = React.useState<string | null>(null);
  const treeRef = React.useRef<HTMLDivElement>(null);
  const tokens = React.useMemo(() => tokenizeSearch(query), [query]);
  const searching = tokens.length > 0;

  const { rows, targets } = React.useMemo(() => {
    const rows: TreeRow[] = [];
    const targets = new Map<string, RowTarget>();
    const matches = (name: string) => tokens.every(tok => name.toLowerCase().includes(tok));

    function pushFields(source: ExpressionSource, meta: MetaTable, parentKey: string, path: string[], depth: number) {
      for (const field of meta.fields) {
        if (searching && depth === 1 && !matches(field.name) && !matches(source.alias)) continue;
        const key = `${parentKey}/${field.name}`;
        const fieldPath = [...path, field.name];
        const target = searching ? undefined : referenceTarget(field, ctx.resolver);
        const isOpen = expanded.has(key);
        const { icon, color } = fieldIcon(field);
        rows.push({
          key, depth, expandable: !!target && target.fields.length > 0, expanded: isOpen,
          icon, iconColor: color,
          label: searching ? highlightMatches(field.name, tokens, HIGHLIGHT_BG) : field.name,
          detail: describeFieldTypes(field) || undefined,
          title: [fieldReference(ctx, source, fieldPath), describeFieldTypes(field)].filter(Boolean).join('\n'),
          dragText: fieldReference(ctx, source, fieldPath),
        });
        targets.set(key, { source, path: fieldPath });
        if (target && isOpen) pushFields(source, target, key, fieldPath, depth + 1);
      }
    }

    for (const source of ctx.sources) {
      const key = `s:${source.alias}`;
      if (searching && !matches(source.alias) && !source.meta.fields.some(f => matches(f.name))) continue;
      const isOpen = searching || expanded.has(key);
      rows.push({
        key, depth: 0, expandable: true, expanded: isOpen, group: true,
        icon: 'table', iconColor: 'var(--vscode-symbolIcon-structForeground, var(--vscode-icon-foreground, #c5c5c5))',
        label: searching ? highlightMatches(source.alias, tokens, HIGHLIGHT_BG) : source.alias,
        detail: source.meta.fullName !== source.alias ? source.meta.fullName : undefined,
        title: source.meta.fullName,
      });
      targets.set(key, { source, path: [] });
      if (isOpen) pushFields(source, source.meta, key, [], 1);
    }
    return { rows, targets };
  }, [ctx, expanded, tokens, searching]);

  function toggle(key: string) {
    if (searching && key.startsWith('s:') && !key.includes('/')) return;
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function activate(key: string) {
    const target = targets.get(key);
    if (!target) return;
    if (target.path.length === 0) { toggle(key); return; }
    onInsert(fieldReference(ctx, target.source, target.path));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
      <PaneSearch
        inputRef={searchRef}
        value={query}
        placeholder={t('exprEditor.searchFields')}
        testId="expr-fields-search"
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
        emptyText={ctx.sources.length === 0 ? t('exprEditor.noSources') : t('exprEditor.noMatches')}
        ariaLabel={t('common.fields')}
        testId="expr-fields-tree"
      />
    </div>
  );
}
