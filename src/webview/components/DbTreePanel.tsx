import * as React from 'react';
import type { MetaTable, MetaField, TableKind } from '../../core/metadata/types';
import type { RefId } from '../../shared/messages';
import { Chevron } from './Chevron';
import { MetaKindIcon } from './MetaKindIcon';
import { SECTION_HEADER } from '../sharedStyles';

interface Props {
  tables: MetaTable[];
  expandedRefs: Map<string, MetaField[]>;
  focusedTableFullName: string | null;
  focusedFieldPath: string | null;
  onFocusTable: (fullName: string) => void;
  onFocusField: (tableFullName: string, fieldPath: string) => void;
  onExpandRef: (ref: RefId) => void;
  onAddTable: (table: MetaTable) => void;
  onAddField: (tableFullName: string, fieldPath: string) => void;
  /** 7.8.17: временные таблицы, доступные активному запросу пакета (отдельная группа). */
  tempTables?: MetaTable[];
}

const GROUP_KINDS: TableKind[] = [
  'Справочник', 'Документ',
  'ПланОбмена', 'ПланВидовХарактеристик', 'ПланСчетов', 'ПланВидовРасчета',
  'БизнесПроцесс', 'Задача',
  'РегистрСведений', 'РегистрНакопления', 'РегистрБухгалтерии', 'РегистрРасчета',
  'Последовательность', 'ЖурналДокументов', 'КритерийОтбора',
  'Константа', 'Перечисление',
];
const GROUP_LABELS: Record<string, string> = {
  'Справочник': 'Справочники',
  'Документ': 'Документы',
  'ПланОбмена': 'Планы обмена',
  'ПланВидовХарактеристик': 'Планы видов характеристик',
  'ПланСчетов': 'Планы счетов',
  'ПланВидовРасчета': 'Планы видов расчета',
  'БизнесПроцесс': 'Бизнес-процессы',
  'Задача': 'Задачи',
  'РегистрСведений': 'Регистры сведений',
  'РегистрНакопления': 'Регистры накопления',
  'РегистрБухгалтерии': 'Регистры бухгалтерии',
  'РегистрРасчета': 'Регистры расчета',
  'Последовательность': 'Последовательности',
  'ЖурналДокументов': 'Журналы документов',
  'КритерийОтбора': 'Критерии отбора',
  'Константа': 'Константы',
  'Перечисление': 'Перечисления',
};

function norm(s: string): string {
  return s.toLowerCase();
}

function fieldMatches(field: MetaField, q: string): boolean {
  return norm(field.name).includes(q);
}

/** ВНИМАНИЕ: ищет только среди уже загруженных полей (собственные поля таблицы
 * и её табличных частей) — вложенные поля справочных полей подгружаются лениво
 * по клику (onExpandRef), поэтому в поиск не попадают. */
function tsMatchesQuery(ts: MetaTable, q: string): boolean {
  return norm(ts.name).includes(q) || ts.fields.some(f => fieldMatches(f, q));
}

function tableMatchesQuery(table: MetaTable, q: string): boolean {
  return norm(table.name).includes(q)
    || table.fields.some(f => fieldMatches(f, q))
    || (table.tabularSections ?? []).some(ts => tsMatchesQuery(ts, q));
}

function highlightText(text: string, q: string): React.ReactNode {
  if (!q) return text;
  const idx = norm(text).indexOf(q);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: 'var(--vscode-editor-findMatchHighlightBackground, rgba(234,92,0,0.33))', color: 'inherit', borderRadius: 2 }}>
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}

function FieldNode({ tableFullName, fieldPath, field, expandedRefs, collapsedRefs, onToggleCollapse, focusedTableFullName, focusedFieldPath, onFocusField, onExpandRef, onAddField, depth, query }: {
  tableFullName: string;
  fieldPath: string;
  field: MetaField;
  expandedRefs: Map<string, MetaField[]>;
  collapsedRefs: Set<string>;
  onToggleCollapse: (key: string) => void;
  focusedTableFullName: string | null;
  focusedFieldPath: string | null;
  onFocusField: (t: string, p: string) => void;
  onExpandRef: (ref: RefId) => void;
  onAddField: (tableFullName: string, fieldPath: string) => void;
  depth: number;
  query: string;
}): React.ReactElement {
  const ref = field.types.find(t => t.ref)?.ref ?? null;
  const refKey = ref ? `${ref.kind}.${ref.name}` : null;
  const fetched = refKey ? expandedRefs.has(refKey) : false;
  const expanded = fetched && refKey ? !collapsedRefs.has(refKey) : false;
  const isFocused = focusedTableFullName === tableFullName && focusedFieldPath === fieldPath;

  function handleExpandToggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (!ref || !refKey) return;
    if (!fetched) {
      onExpandRef(ref);
    } else {
      onToggleCollapse(refKey);
    }
  }

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.setData('text/plain', JSON.stringify({ kind: 'field', tableFullName, fieldPath }));
    e.dataTransfer.effectAllowed = 'copy';
  }

  return (
    <>
      <div
        data-field-path={fieldPath}
        draggable
        className="qc-row"
        onDragStart={handleDragStart}
        onClick={() => onFocusField(tableFullName, fieldPath)}
        style={{
          paddingLeft: 8 + depth * 16,
          paddingTop: 2,
          paddingBottom: 2,
          cursor: 'default',
          background: isFocused ? 'var(--vscode-list-activeSelectionBackground, #094771)' : undefined,
          color: isFocused ? 'var(--vscode-list-activeSelectionForeground, #fff)' : 'inherit',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          userSelect: 'none',
        }}
      >
        {ref ? <Chevron expanded={expanded} onClick={handleExpandToggle} /> : <span style={{ width: 14, flexShrink: 0 }} />}
        <span className={`codicon codicon-${ref ? 'references' : 'symbol-field'}`} style={{ fontSize: 13, opacity: 0.75, flexShrink: 0 }} />
        <span>{highlightText(field.name, query)}</span>
      </div>
      {expanded && refKey && expandedRefs.get(refKey)?.map(subField => (
        <FieldNode
          key={`${fieldPath}.${subField.name}`}
          tableFullName={tableFullName}
          fieldPath={`${fieldPath}.${subField.name}`}
          field={subField}
          expandedRefs={expandedRefs}
          collapsedRefs={collapsedRefs}
          onToggleCollapse={onToggleCollapse}
          focusedTableFullName={focusedTableFullName}
          focusedFieldPath={focusedFieldPath}
          onFocusField={onFocusField}
          onExpandRef={onExpandRef}
          onAddField={onAddField}
          depth={depth + 1}
          query={query}
        />
      ))}
    </>
  );
}

function TabularSectionNode({ ts, expandedRefs, collapsedRefs, onToggleCollapse, focusedTableFullName, focusedFieldPath, onFocusField, onExpandRef, onAddField, depth, query, parentMatched }: {
  ts: MetaTable;
  expandedRefs: Map<string, MetaField[]>;
  collapsedRefs: Set<string>;
  onToggleCollapse: (key: string) => void;
  focusedTableFullName: string | null;
  focusedFieldPath: string | null;
  onFocusField: (t: string, p: string) => void;
  onExpandRef: (ref: RefId) => void;
  onAddField: (tableFullName: string, fieldPath: string) => void;
  depth: number;
  query: string;
  parentMatched: boolean;
}): React.ReactElement {
  const [manualExpanded, setManualExpanded] = React.useState(false);
  const isSearching = query.length > 0;
  const expanded = isSearching || manualExpanded;
  const tsNameMatches = isSearching && norm(ts.name).includes(query);
  const showAllFields = parentMatched || tsNameMatches;
  const fieldsToRender = isSearching ? ts.fields.filter(f => showAllFields || fieldMatches(f, query)) : ts.fields;

  function handleDragStart(e: React.DragEvent) {
    const parentFullName = ts.fullName.split('.').slice(0, 2).join('.');
    e.dataTransfer.setData('text/plain', JSON.stringify({
      kind: 'tabularsection',
      parentTableFullName: parentFullName,
      tsName: ts.name,
      tsFullName: ts.fullName,
      tsFields: ts.fields.map(f => f.name),
    }));
    e.dataTransfer.effectAllowed = 'copy';
  }

  return (
    <>
      <div
        draggable
        className="qc-row"
        title="Табличная часть"
        onDragStart={handleDragStart}
        onClick={() => setManualExpanded(prev => !prev)}
        style={{
          paddingLeft: 8 + depth * 16,
          paddingTop: 2,
          paddingBottom: 2,
          cursor: 'default',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          userSelect: 'none',
          color: 'var(--vscode-descriptionForeground, #aaa)',
        }}
      >
        <Chevron expanded={expanded} />
        <MetaKindIcon kind="ТабличнаяЧасть" />
        <span>{highlightText(ts.name, query)}</span>
      </div>
      {expanded && fieldsToRender.map(field => (
        <FieldNode
          key={`${ts.fullName}:${field.name}`}
          tableFullName={ts.fullName}
          fieldPath={field.name}
          field={field}
          expandedRefs={expandedRefs}
          collapsedRefs={collapsedRefs}
          onToggleCollapse={onToggleCollapse}
          focusedTableFullName={focusedTableFullName}
          focusedFieldPath={focusedFieldPath}
          onFocusField={onFocusField}
          onExpandRef={onExpandRef}
          onAddField={onAddField}
          depth={depth + 1}
          query={query}
        />
      ))}
    </>
  );
}

export function DbTreePanel({ tables, expandedRefs, focusedTableFullName, focusedFieldPath, onFocusTable, onFocusField, onExpandRef, onAddTable, onAddField, tempTables = [] }: Props): React.ReactElement {
  const [expandedGroups, setExpandedGroups] = React.useState<Set<TableKind>>(new Set());
  const [expandedTables, setExpandedTables] = React.useState<Set<string>>(new Set());
  const [collapsedRefs, setCollapsedRefs] = React.useState<Set<string>>(new Set());
  const [query, setQuery] = React.useState('');

  const normalizedQuery = query.trim().toLowerCase();
  const isSearching = normalizedQuery.length > 0;

  function toggleGroup(kind: TableKind) {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      next.has(kind) ? next.delete(kind) : next.add(kind);
      return next;
    });
  }

  function toggleTable(fullName: string) {
    setExpandedTables(prev => {
      const next = new Set(prev);
      next.has(fullName) ? next.delete(fullName) : next.add(fullName);
      return next;
    });
  }

  function toggleCollapsedRef(key: string) {
    setCollapsedRefs(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  React.useEffect(() => {
    setCollapsedRefs(prev => {
      let changed = false;
      const next = new Set(prev);
      for (const key of Array.from(prev)) {
        if (!expandedRefs.has(key)) {
          next.delete(key);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [expandedRefs]);

  // Only top-level object kinds are shown as groups
  const topLevelTables = tables.filter(t => GROUP_KINDS.includes(t.kind as typeof GROUP_KINDS[number]));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={SECTION_HEADER}>База данных</div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          margin: '4px 6px',
          padding: '3px 6px',
          background: 'var(--vscode-input-background, #3c3c3c)',
          border: '1px solid var(--qc-border)',
          borderRadius: 3,
        }}
      >
        <span className="codicon codicon-search" style={{ fontSize: 13, opacity: 0.6, flexShrink: 0 }} />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Поиск таблицы или поля..."
          style={{
            flex: 1,
            minWidth: 0,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--vscode-input-foreground, #ccc)',
            fontSize: 12,
          }}
        />
        {query && (
          <span
            className="codicon codicon-close"
            onClick={() => setQuery('')}
            title="Очистить"
            style={{ fontSize: 12, opacity: 0.6, cursor: 'pointer', flexShrink: 0 }}
          />
        )}
      </div>
      <div style={{ overflowY: 'auto', flex: 1, minHeight: 0, fontSize: 13 }}>
      {GROUP_KINDS.map(kind => {
        const groupAll = topLevelTables.filter(t => t.kind === kind);
        const group = isSearching ? groupAll.filter(t => tableMatchesQuery(t, normalizedQuery)) : groupAll;
        if (isSearching && group.length === 0) return null;
        const isExpanded = isSearching ? true : expandedGroups.has(kind);
        return (
          <div key={kind}>
            <div
              className="qc-row"
              onClick={() => toggleGroup(kind)}
              style={{ padding: '3px 8px', fontWeight: 600, cursor: 'default', display: 'flex', alignItems: 'center', gap: 4, userSelect: 'none' }}
            >
              <Chevron expanded={isExpanded} />
              <MetaKindIcon kind={kind} />
              <span>{GROUP_LABELS[kind]}</span>
            </div>
            {isExpanded && group.map(table => {
              const isTableExpanded = isSearching ? true : expandedTables.has(table.fullName);
              const isFocused = focusedTableFullName === table.fullName && !focusedFieldPath;
              const tableNameMatches = isSearching && norm(table.name).includes(normalizedQuery);
              const fieldsToRender = isSearching
                ? table.fields.filter(f => tableNameMatches || fieldMatches(f, normalizedQuery))
                : table.fields;
              const tsToRender = isSearching
                ? (table.tabularSections ?? []).filter(ts => tableNameMatches || tsMatchesQuery(ts, normalizedQuery))
                : (table.tabularSections ?? []);

              function handleTableDragStart(e: React.DragEvent) {
                e.dataTransfer.setData('text/plain', JSON.stringify({ kind: 'table', tableFullName: table.fullName }));
                e.dataTransfer.effectAllowed = 'copy';
              }

              return (
                <div key={table.fullName}>
                  <div
                    data-table-fullname={table.fullName}
                    draggable
                    className="qc-row"
                    onDragStart={handleTableDragStart}
                    onClick={() => { toggleTable(table.fullName); onFocusTable(table.fullName); }}
                    style={{
                      paddingLeft: 24,
                      paddingTop: 2,
                      paddingBottom: 2,
                      cursor: 'default',
                      background: isFocused ? 'var(--vscode-list-activeSelectionBackground, #094771)' : undefined,
                      color: isFocused ? 'var(--vscode-list-activeSelectionForeground, #fff)' : 'inherit',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      userSelect: 'none',
                    }}
                  >
                    <Chevron expanded={isTableExpanded} />
                    <MetaKindIcon kind={table.kind} />
                    <span>{highlightText(table.name, normalizedQuery)}</span>
                  </div>
                  {isTableExpanded && fieldsToRender.map(field => (
                    <FieldNode
                      key={`${table.fullName}:${field.name}`}
                      tableFullName={table.fullName}
                      fieldPath={field.name}
                      field={field}
                      expandedRefs={expandedRefs}
                      collapsedRefs={collapsedRefs}
                      onToggleCollapse={toggleCollapsedRef}
                      focusedTableFullName={focusedTableFullName}
                      focusedFieldPath={focusedFieldPath}
                      onFocusField={onFocusField}
                      onExpandRef={onExpandRef}
                      onAddField={onAddField}
                      depth={2}
                      query={normalizedQuery}
                    />
                  ))}
                  {isTableExpanded && tsToRender.map(ts => (
                    <TabularSectionNode
                      key={ts.fullName}
                      ts={ts}
                      expandedRefs={expandedRefs}
                      collapsedRefs={collapsedRefs}
                      onToggleCollapse={toggleCollapsedRef}
                      focusedTableFullName={focusedTableFullName}
                      focusedFieldPath={focusedFieldPath}
                      onFocusField={onFocusField}
                      onExpandRef={onExpandRef}
                      onAddField={onAddField}
                      depth={2}
                      query={normalizedQuery}
                      parentMatched={tableNameMatches}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        );
      })}

      {/* 7.8.17: группа «Временные таблицы» — ВТ, созданные в предыдущих запросах пакета.
          Перетаскивание строки добавляет источник-ВТ (`врем КАК врем`) через ADD_TEMP_TABLE.
          Поиск на эту группу не распространяется — список ВТ пакета всегда короткий. */}
      {tempTables.length > 0 && (() => {
        const isExpanded = expandedGroups.has('ВременнаяТаблица');
        return (
          <div>
            <div
              data-testid="temp-tables-group"
              className="qc-row"
              onClick={() => toggleGroup('ВременнаяТаблица')}
              style={{ padding: '3px 8px', fontWeight: 600, cursor: 'default', display: 'flex', alignItems: 'center', gap: 4, userSelect: 'none' }}
            >
              <Chevron expanded={isExpanded} />
              <span className={`codicon codicon-folder${isExpanded ? '-opened' : ''}`} style={{ fontSize: 13, opacity: 0.75, flexShrink: 0 }} />
              <span>Временные таблицы</span>
            </div>
            {isExpanded && tempTables.map(table => {
              const isTableExpanded = expandedTables.has(table.fullName);
              return (
                <div key={table.fullName}>
                  <div
                    data-temp-table={table.name}
                    draggable
                    onDragStart={e => {
                      e.dataTransfer.setData('text/plain', JSON.stringify({
                        kind: 'temptable',
                        name: table.name,
                        fields: table.fields.map(f => f.name),
                      }));
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    onClick={() => toggleTable(table.fullName)}
                    style={{ paddingLeft: 24, paddingTop: 2, paddingBottom: 2, cursor: 'default', display: 'flex', alignItems: 'center', gap: 4, userSelect: 'none' }}
                  >
                    <Chevron expanded={isTableExpanded} />
                    <MetaKindIcon kind={table.kind} />
                    <span>{table.name}</span>
                  </div>
                  {isTableExpanded && table.fields.map(field => (
                    <div key={field.name} className="qc-row" style={{ paddingLeft: 48, paddingTop: 2, paddingBottom: 2, userSelect: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span className="codicon codicon-symbol-field" style={{ fontSize: 13, opacity: 0.75, flexShrink: 0 }} />
                      {field.name}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        );
      })()}
      </div>
    </div>
  );
}
