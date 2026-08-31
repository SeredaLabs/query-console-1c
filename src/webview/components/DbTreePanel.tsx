import * as React from 'react';
import type { MetaTable, MetaField, TableKind } from '../../core/metadata/types';
import type { RefId } from '../../shared/messages';
import { Chevron } from './Chevron';
import { MetaKindIcon } from './MetaKindIcon';
import { IconButton } from './IconButton';
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

const ACTIVE_MATCH_BG = 'var(--vscode-editor-findMatchBackground, rgba(234,92,0,0.5))';

function norm(s: string): string {
  return s.toLowerCase();
}

/** Разбивает строку поиска на отдельные ключевые слова («расчет эффектив» → ['расчет','эффектив']) —
 * каждое слово должно найтись где-то в таблице (в её названии или названиях полей), но не обязательно
 * рядом друг с другом и не обязательно в одном и том же слове/поле. */
function tokenize(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

function textMatchesToken(text: string, token: string): boolean {
  return norm(text).includes(token);
}

function textMatchesAllTokens(text: string, tokens: string[]): boolean {
  const t = norm(text);
  return tokens.every(tok => t.includes(tok));
}

/** ВНИМАНИЕ: ищет только среди уже загруженных полей (собственные поля таблицы
 * и её табличных частей) — вложенные поля справочных полей подгружаются лениво
 * по клику (onExpandRef), поэтому в поиск не попадают.
 *
 * Кэшируется по ссылке на таблицу — на реальных конфигурациях (сотни таблиц,
 * тысячи полей) пересборка этой строки на каждое нажатие клавиши заметно
 * тормозила ввод; объект метаданных таблицы не меняется, пока не перезагрузят
 * метаданные целиком, поэтому WeakMap безопасен. */
const tableCorpusCache = new WeakMap<MetaTable, string>();
function tableCorpus(table: MetaTable): string {
  const cached = tableCorpusCache.get(table);
  if (cached !== undefined) return cached;
  const parts = [table.name, ...table.fields.map(f => f.name)];
  for (const ts of table.tabularSections ?? []) {
    parts.push(ts.name, ...ts.fields.map(f => f.name));
  }
  const corpus = norm(parts.join(' '));
  tableCorpusCache.set(table, corpus);
  return corpus;
}

function tableMatchesQuery(table: MetaTable, tokens: string[]): boolean {
  const corpus = tableCorpus(table);
  return tokens.every(tok => corpus.includes(tok));
}

function highlightText(text: string, tokens: string[]): React.ReactNode {
  if (tokens.length === 0) return text;
  const lower = text.toLowerCase();
  const ranges: Array<[number, number]> = [];
  for (const tok of tokens) {
    let from = 0;
    while (true) {
      const idx = lower.indexOf(tok, from);
      if (idx === -1) break;
      ranges.push([idx, idx + tok.length]);
      from = idx + tok.length;
    }
  }
  if (ranges.length === 0) return text;
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push(r);
  }
  const parts: React.ReactNode[] = [];
  let pos = 0;
  merged.forEach(([start, end], i) => {
    if (start > pos) parts.push(text.slice(pos, start));
    parts.push(
      <mark key={i} style={{ background: 'var(--vscode-editor-findMatchHighlightBackground, rgba(234,92,0,0.33))', color: 'inherit', borderRadius: 2 }}>
        {text.slice(start, end)}
      </mark>
    );
    pos = end;
  });
  if (pos < text.length) parts.push(text.slice(pos));
  return <>{parts}</>;
}

/** Одно уже отфильтрованное (при активном поиске) поле, готовое к отрисовке. */
interface RenderField {
  field: MetaField;
  key: string;
}
interface RenderTs {
  ts: MetaTable;
  key: string;
  fields: RenderField[];
}
interface RenderTable {
  table: MetaTable;
  key: string;
  fields: RenderField[];
  tabularSections: RenderTs[];
}
interface RenderGroup {
  kind: TableKind;
  tables: RenderTable[];
}

/**
 * Единая модель фильтрации дерева под поиск — считается один раз за рендер и
 * используется и для отрисовки, и для сбора списка результатов (навигация
 * вперёд/назад), чтобы обе части не могли разойтись между собой.
 */
function buildRenderModel(topLevelTables: MetaTable[], tokens: string[], isSearching: boolean): RenderGroup[] {
  return GROUP_KINDS.map(kind => {
    const groupAll = topLevelTables.filter(t => t.kind === kind);
    const groupTables = isSearching ? groupAll.filter(t => tableMatchesQuery(t, tokens)) : groupAll;
    const tables: RenderTable[] = groupTables.map(table => {
      const nameMatches = isSearching && textMatchesAllTokens(table.name, tokens);
      const fields: RenderField[] = (isSearching
        ? table.fields.filter(f => nameMatches || tokens.some(tok => textMatchesToken(f.name, tok)))
        : table.fields
      ).map(field => ({ field, key: `${table.fullName}#${field.name}` }));
      const tabularSections: RenderTs[] = (table.tabularSections ?? [])
        .filter(ts => !isSearching || nameMatches || textMatchesAllTokens(ts.name, tokens) || ts.fields.some(f => tokens.some(tok => textMatchesToken(f.name, tok))))
        .map(ts => {
          const tsNameMatches = isSearching && textMatchesAllTokens(ts.name, tokens);
          const showAll = nameMatches || tsNameMatches;
          const tsFields: RenderField[] = (isSearching
            ? ts.fields.filter(f => showAll || tokens.some(tok => textMatchesToken(f.name, tok)))
            : ts.fields
          ).map(field => ({ field, key: `${ts.fullName}#${field.name}` }));
          return { ts, key: ts.fullName, fields: tsFields };
        });
      return { table, key: table.fullName, fields, tabularSections };
    });
    return { kind, tables };
  });
}

/** Плоский упорядоченный список ключей результатов (в том же порядке, в каком они отрисованы) —
 * по нему работают кнопки «следующий/предыдущий результат» и счётчик. Гранулярность — таблица/
 * документ целиком (а не каждое совпавшее поле внутри неё по отдельности): если хоть что-то в
 * таблице совпало (имя или любое из её полей), в списке результатов она одна. */
function collectMatchKeys(groups: RenderGroup[]): string[] {
  const keys: string[] = [];
  for (const g of groups) {
    for (const t of g.tables) keys.push(t.key);
  }
  return keys;
}

function FieldNode({ tableFullName, fieldPath, field, expandedRefs, collapsedRefs, onToggleCollapse, focusedTableFullName, focusedFieldPath, onFocusField, onExpandRef, onAddField, depth, tokens }: {
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
  tokens: string[];
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
        <span>{highlightText(field.name, tokens)}</span>
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
          tokens={tokens}
        />
      ))}
    </>
  );
}

function TabularSectionNode({ ts, fields, expandedRefs, collapsedRefs, onToggleCollapse, focusedTableFullName, focusedFieldPath, onFocusField, onExpandRef, onAddField, depth, tokens, expanded, onToggle }: {
  ts: MetaTable;
  fields: RenderField[];
  expandedRefs: Map<string, MetaField[]>;
  collapsedRefs: Set<string>;
  onToggleCollapse: (key: string) => void;
  focusedTableFullName: string | null;
  focusedFieldPath: string | null;
  onFocusField: (t: string, p: string) => void;
  onExpandRef: (ref: RefId) => void;
  onAddField: (tableFullName: string, fieldPath: string) => void;
  depth: number;
  tokens: string[];
  expanded: boolean;
  onToggle: () => void;
}): React.ReactElement {
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
        onClick={onToggle}
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
        <span>{highlightText(ts.name, tokens)}</span>
      </div>
      {expanded && fields.map(rf => (
        <FieldNode
          key={`${ts.fullName}:${rf.field.name}`}
          tableFullName={ts.fullName}
          fieldPath={rf.field.name}
          field={rf.field}
          expandedRefs={expandedRefs}
          collapsedRefs={collapsedRefs}
          onToggleCollapse={onToggleCollapse}
          focusedTableFullName={focusedTableFullName}
          focusedFieldPath={focusedFieldPath}
          onFocusField={onFocusField}
          onExpandRef={onExpandRef}
          onAddField={onAddField}
          depth={depth + 1}
          tokens={tokens}
        />
      ))}
    </>
  );
}

export function DbTreePanel({ tables, expandedRefs, focusedTableFullName, focusedFieldPath, onFocusTable, onFocusField, onExpandRef, onAddTable, onAddField, tempTables = [] }: Props): React.ReactElement {
  const [expandedGroups, setExpandedGroups] = React.useState<Set<TableKind>>(new Set());
  const [expandedTables, setExpandedTables] = React.useState<Set<string>>(new Set());
  const [expandedTsSections, setExpandedTsSections] = React.useState<Set<string>>(new Set());
  const [collapsedRefs, setCollapsedRefs] = React.useState<Set<string>>(new Set());
  const [query, setQuery] = React.useState('');
  const [debouncedQuery, setDebouncedQuery] = React.useState('');
  const [activeMatchIdx, setActiveMatchIdx] = React.useState(0);
  const treeRef = React.useRef<HTMLDivElement>(null);

  // Поле ввода реагирует мгновенно, а фильтрация дерева — с небольшой задержкой:
  // на реальных конфигурациях (сотни таблиц) пересчёт на каждое нажатие клавиши
  // ощутимо тормозил набор текста.
  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 150);
    return () => clearTimeout(timer);
  }, [query]);

  const tokens = React.useMemo(() => tokenize(debouncedQuery), [debouncedQuery]);
  const isSearching = tokens.length > 0;

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

  function toggleTsSection(key: string) {
    setExpandedTsSections(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
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

  React.useEffect(() => {
    setActiveMatchIdx(0);
  }, [debouncedQuery]);

  // Only top-level object kinds are shown as groups
  const topLevelTables = React.useMemo(
    () => tables.filter(t => GROUP_KINDS.includes(t.kind as typeof GROUP_KINDS[number])),
    [tables]
  );
  const renderModel = React.useMemo(
    () => buildRenderModel(topLevelTables, tokens, isSearching),
    [topLevelTables, tokens, isSearching]
  );
  const matchKeys = React.useMemo(() => collectMatchKeys(renderModel), [renderModel]);
  const totalMatches = matchKeys.length;

  // Совпадения при поиске раскрываются автоматически, но только один раз — в момент,
  // когда объект впервые становится совпадением. Дальше пользователь может свободно
  // свернуть/развернуть его вручную (в т.ч. пока поиск ещё активен), и это уже не
  // перебивается на каждое следующее нажатие клавиши.
  const prevMatchedGroupsRef = React.useRef<Set<TableKind>>(new Set());
  const prevMatchedTablesRef = React.useRef<Set<string>>(new Set());
  const prevMatchedTsRef = React.useRef<Set<string>>(new Set());
  React.useEffect(() => {
    if (!isSearching) {
      prevMatchedGroupsRef.current = new Set();
      prevMatchedTablesRef.current = new Set();
      prevMatchedTsRef.current = new Set();
      return;
    }
    const curGroups = new Set<TableKind>();
    const curTables = new Set<string>();
    const curTs = new Set<string>();
    const newGroups: TableKind[] = [];
    const newTables: string[] = [];
    const newTs: string[] = [];
    for (const g of renderModel) {
      if (g.tables.length === 0) continue;
      curGroups.add(g.kind);
      if (!prevMatchedGroupsRef.current.has(g.kind)) newGroups.push(g.kind);
      for (const t of g.tables) {
        curTables.add(t.key);
        if (!prevMatchedTablesRef.current.has(t.key)) newTables.push(t.key);
        for (const ts of t.tabularSections) {
          curTs.add(ts.key);
          if (!prevMatchedTsRef.current.has(ts.key)) newTs.push(ts.key);
        }
      }
    }
    if (newGroups.length > 0) setExpandedGroups(prev => new Set([...prev, ...newGroups]));
    if (newTables.length > 0) setExpandedTables(prev => new Set([...prev, ...newTables]));
    if (newTs.length > 0) setExpandedTsSections(prev => new Set([...prev, ...newTs]));
    prevMatchedGroupsRef.current = curGroups;
    prevMatchedTablesRef.current = curTables;
    prevMatchedTsRef.current = curTs;
  }, [renderModel, isSearching]);
  const clampedActiveIdx = totalMatches > 0 ? Math.min(activeMatchIdx, totalMatches - 1) : 0;
  const activeMatchKey = totalMatches > 0 ? matchKeys[clampedActiveIdx] : null;

  React.useEffect(() => {
    if (!activeMatchKey || !treeRef.current) return;
    const el = treeRef.current.querySelector(`[data-search-key="${CSS.escape(activeMatchKey)}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeMatchKey]);

  function goToMatch(delta: number) {
    if (totalMatches === 0) return;
    setActiveMatchIdx(i => (i + delta + totalMatches) % totalMatches);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={SECTION_HEADER}>База данных</div>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, padding: 4, gap: 4 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          height: 24,
          boxSizing: 'border-box',
          padding: '0 6px',
          background: 'var(--vscode-input-background, #3c3c3c)',
          border: '1px solid var(--qc-border)',
          borderRadius: 3,
        }}
      >
        <span className="codicon codicon-search" style={{ fontSize: 13, opacity: 0.6, flexShrink: 0, marginRight: 4 }} />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            goToMatch(e.shiftKey ? -1 : 1);
          }}
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
        {isSearching && (
          <span style={{ fontSize: 11, color: 'var(--vscode-descriptionForeground, #888)', flexShrink: 0, whiteSpace: 'nowrap', padding: '0 2px' }}>
            {totalMatches > 0 ? `${clampedActiveIdx + 1} из ${totalMatches}` : 'нет результатов'}
          </span>
        )}
        <IconButton icon="chevron-up" title="Предыдущий результат" disabled={totalMatches === 0} onClick={() => goToMatch(-1)} />
        <IconButton icon="chevron-down" title="Следующий результат" disabled={totalMatches === 0} onClick={() => goToMatch(1)} />
        {query && <IconButton icon="close" title="Очистить" onClick={() => setQuery('')} />}
      </div>
      <div ref={treeRef} style={{ overflowY: 'auto', flex: 1, minHeight: 0, fontSize: 13 }}>
      {renderModel.map(group => {
        if (isSearching && group.tables.length === 0) return null;
        const isExpanded = expandedGroups.has(group.kind);
        return (
          <div key={group.kind}>
            <div
              className="qc-row"
              onClick={() => toggleGroup(group.kind)}
              style={{ padding: '3px 8px', fontWeight: 600, cursor: 'default', display: 'flex', alignItems: 'center', gap: 4, userSelect: 'none' }}
            >
              <Chevron expanded={isExpanded} />
              <MetaKindIcon kind={group.kind} />
              <span>{GROUP_LABELS[group.kind]}</span>
            </div>
            {isExpanded && group.tables.map(rt => {
              const isTableExpanded = expandedTables.has(rt.table.fullName);
              const isFocused = focusedTableFullName === rt.table.fullName && !focusedFieldPath;
              const isTableActiveMatch = rt.key === activeMatchKey;

              function handleTableDragStart(e: React.DragEvent) {
                e.dataTransfer.setData('text/plain', JSON.stringify({ kind: 'table', tableFullName: rt.table.fullName }));
                e.dataTransfer.effectAllowed = 'copy';
              }

              return (
                <div key={rt.table.fullName}>
                  <div
                    data-table-fullname={rt.table.fullName}
                    data-search-key={rt.key}
                    draggable
                    className="qc-row"
                    onDragStart={handleTableDragStart}
                    onClick={() => { toggleTable(rt.table.fullName); onFocusTable(rt.table.fullName); }}
                    style={{
                      paddingLeft: 24,
                      paddingTop: 2,
                      paddingBottom: 2,
                      cursor: 'default',
                      background: isTableActiveMatch ? ACTIVE_MATCH_BG : (isFocused ? 'var(--vscode-list-activeSelectionBackground, #094771)' : undefined),
                      color: isTableActiveMatch ? 'inherit' : (isFocused ? 'var(--vscode-list-activeSelectionForeground, #fff)' : 'inherit'),
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      userSelect: 'none',
                    }}
                  >
                    <Chevron expanded={isTableExpanded} />
                    <MetaKindIcon kind={rt.table.kind} />
                    <span>{highlightText(rt.table.name, tokens)}</span>
                  </div>
                  {isTableExpanded && rt.fields.map(rf => (
                    <FieldNode
                      key={`${rt.table.fullName}:${rf.field.name}`}
                      tableFullName={rt.table.fullName}
                      fieldPath={rf.field.name}
                      field={rf.field}
                      expandedRefs={expandedRefs}
                      collapsedRefs={collapsedRefs}
                      onToggleCollapse={toggleCollapsedRef}
                      focusedTableFullName={focusedTableFullName}
                      focusedFieldPath={focusedFieldPath}
                      onFocusField={onFocusField}
                      onExpandRef={onExpandRef}
                      onAddField={onAddField}
                      depth={2}
                      tokens={tokens}
                    />
                  ))}
                  {isTableExpanded && rt.tabularSections.map(rts => (
                    <TabularSectionNode
                      key={rts.ts.fullName}
                      ts={rts.ts}
                      fields={rts.fields}
                      expandedRefs={expandedRefs}
                      collapsedRefs={collapsedRefs}
                      onToggleCollapse={toggleCollapsedRef}
                      focusedTableFullName={focusedTableFullName}
                      focusedFieldPath={focusedFieldPath}
                      onFocusField={onFocusField}
                      onExpandRef={onExpandRef}
                      onAddField={onAddField}
                      depth={2}
                      tokens={tokens}
                      expanded={expandedTsSections.has(rts.key)}
                      onToggle={() => toggleTsSection(rts.key)}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        );
      })}

      {isSearching && totalMatches === 0 && (
        <div style={{ padding: '12px 8px', color: 'var(--vscode-descriptionForeground, #888)' }}>Совпадений не найдено</div>
      )}

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
    </div>
  );
}
