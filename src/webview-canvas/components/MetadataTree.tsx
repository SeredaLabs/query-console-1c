import * as React from 'react';
import type { MetaField, MetaTable, TableKind } from '../../core/metadata/types';
import type { SelectedTable } from '../../core/query/queryModel';
import { Chevron } from '../../webview/components/Chevron';
import { MetaKindIcon } from '../../webview/components/MetaKindIcon';
import type { SupportedLocale } from '../../shared/locale';
import { groupLabel, t } from '../i18n';
import { TOKENS } from '../theme';

/**
 * Phase 3D-Tree: той самий перелік верхньорівневих видів метаданих, що й
 * Classic DbTreePanel.tsx (GROUP_KINDS) — реальна таксономія 1С, а не
 * довільний вибір UI.
 */
const GROUP_KINDS: TableKind[] = [
  'Справочник', 'Документ',
  'ПланОбмена', 'ПланВидовХарактеристик', 'ПланСчетов', 'ПланВидовРасчета',
  'БизнесПроцесс', 'Задача',
  'РегистрСведений', 'РегистрНакопления', 'РегистрБухгалтерии', 'РегистрРасчета',
  'Последовательность', 'ЖурналДокументов', 'КритерийОтбора',
  'Константа', 'Перечисление',
];

function isReferenceField(field: MetaField): boolean {
  return field.types.some(ty => ty.ref);
}

function tokenize(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

function textMatchesToken(text: string, token: string): boolean {
  return text.toLowerCase().includes(token);
}

function textMatchesAllTokens(text: string, tokens: string[]): boolean {
  const lower = text.toLowerCase();
  return tokens.every(tok => lower.includes(tok));
}

/**
 * Search corpus — та сама ідея, що й Classic `tableCorpus()`
 * (DbTreePanel.tsx): назва таблиці + власні поля + табличні частини + їхні
 * поля. Кешовано по посиланню на об'єкт (метадані не змінюються, поки не
 * перезавантажаться цілком).
 */
const tableCorpusCache = new WeakMap<MetaTable, string>();
function tableCorpus(table: MetaTable): string {
  const cached = tableCorpusCache.get(table);
  if (cached !== undefined) return cached;
  const parts = [table.name, ...table.fields.map(f => f.name)];
  for (const ts of table.tabularSections ?? []) {
    parts.push(ts.name, ...ts.fields.map(f => f.name));
  }
  const corpus = parts.join(' ').toLowerCase();
  tableCorpusCache.set(table, corpus);
  return corpus;
}

function tableMatchesQuery(table: MetaTable, tokens: string[]): boolean {
  const corpus = tableCorpus(table);
  return tokens.every(tok => corpus.includes(tok));
}

function highlight(name: string, tokens: string[]): React.ReactNode {
  if (tokens.length === 0) return name;
  const lower = name.toLowerCase();
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
  if (ranges.length === 0) return name;
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
    if (start > pos) parts.push(name.slice(pos, start));
    parts.push(
      <mark key={i} style={{ background: 'var(--vscode-editor-findMatchHighlightBackground)', color: 'inherit', borderRadius: 2 }}>
        {name.slice(start, end)}
      </mark>
    );
    pos = end;
  });
  if (pos < name.length) parts.push(name.slice(pos));
  return <>{parts}</>;
}

/** Одне вже відфільтроване (при активному пошуку) поле, готове до рендеру. */
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
 * Єдина модель фільтрації дерева під пошук — той самий паттерн, що й
 * Classic `buildRenderModel` (DbTreePanel.tsx), без ref-drill-down (не в
 * scope Phase 3D-Tree).
 */
function buildRenderModel(topLevelTables: MetaTable[], tokens: string[], isSearching: boolean): RenderGroup[] {
  return GROUP_KINDS.map(kind => {
    const groupAll = topLevelTables.filter(tb => tb.kind === kind);
    const groupTables = isSearching ? groupAll.filter(tb => tableMatchesQuery(tb, tokens)) : groupAll;
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

// Phase 3E.1: стабільні колонки [chevron-slot][icon][label][trailing] —
// chevron-slot має ФІКСОВАНУ ширину завжди (навіть для non-expandable
// рядків — поле отримує порожній spacer тієї ж ширини замість Chevron), щоб
// icon+label завжди лежали на тій самій вертикальній лінії незалежно від
// того, чи є в рядка toggle. Indentation — суто множник INDENT_UNIT*depth,
// один-в-один для будь-якого типу рядка на тій самій глибині.
const CHEVRON_SLOT = 14;
const INDENT_UNIT = 14;
const ROW_BASE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  paddingRight: 8,
  paddingTop: 2,
  paddingBottom: 2,
  // 22px density: 2+2 padding + 18px line-height.
  lineHeight: '18px',
  userSelect: 'none',
};

function indentStyle(depth: number, interactive: boolean): React.CSSProperties {
  return {
    ...ROW_BASE,
    paddingLeft: 8 + depth * INDENT_UNIT,
    cursor: interactive ? 'pointer' : 'default',
  };
}

const GROUP_HEADER_STYLE: React.CSSProperties = {
  ...indentStyle(0, true),
  fontWeight: 500,
  fontSize: 13,
};

const TABLE_ROW_STYLE: React.CSSProperties = {
  ...indentStyle(1, true),
  fontSize: 13,
};

const FIELD_ROW_STYLE: React.CSSProperties = {
  ...indentStyle(2, false),
  fontSize: 12,
};

const TS_FIELD_ROW_STYLE: React.CSSProperties = {
  ...indentStyle(3, false),
  fontSize: 12,
};

const TS_ROW_STYLE: React.CSSProperties = {
  ...indentStyle(2, true),
  fontSize: 13,
  color: TOKENS.textSecondary,
};

/** Порожній spacer тієї ж ширини, що й Chevron-слот — для non-expandable рядків. */
const CHEVRON_SPACER: React.CSSProperties = { width: CHEVRON_SLOT, flexShrink: 0 };

function FieldRow({ field, tabular, tokens }: { field: MetaField; tabular?: boolean; tokens: string[] }): React.ReactElement {
  const ref = isReferenceField(field);
  return (
    <div className="qcc-meta-row" style={tabular ? TS_FIELD_ROW_STYLE : FIELD_ROW_STYLE}>
      <span style={CHEVRON_SPACER} />
      {/* Phase 3E.1: 0.75→0.9 — symbol-field (маленьке коло) на 0.75 губився
          поруч з border/hover кольорами; reference-поле лишається помітно
          відмінним (стрілка), а не тільки формою glyph'а. */}
      <span className={`codicon codicon-${ref ? 'references' : 'symbol-field'}`} style={{ fontSize: 14, opacity: 0.9, flexShrink: 0, color: ref ? TOKENS.accent : TOKENS.textSecondary }} />
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {highlight(field.name, tokens)}
      </span>
    </div>
  );
}

/**
 * Trailing add-control — спільний для TableRow і TabularSectionRow: табличну
 * частину домен вже моделює як звичайну `MetaTable` (kind:'ТабличнаяЧасть',
 * власний fullName у tables[]), тож вона додається тим самим ADD_TABLE, тільки
 * UI досі не давав до цього доступу з TS-рядка.
 *
 * Interaction pattern (зафіксовано як свідоме UX-рішення New Builder, не
 * тимчасовий компроміс): single click по рядку → expand/collapse; double
 * click по рядку → додати джерело (швидкий шлях для досвідченого
 * користувача); цей trailing `+`/`✓` — паралельний, явний
 * discoverability-affordance для нового користувача (однаковий ADD_TABLE
 * під обома шляхами). Double-click по вже доданому — no-op (не дублює);
 * навмисний повторний add (self-join сценарій, `✓×N`) лишається можливим
 * ТІЛЬКИ через явний клік по `+`.
 */
function AddControl({
  locale,
  addedCount,
  onAdd,
}: {
  locale: SupportedLocale;
  addedCount: number;
  onAdd: () => void;
}): React.ReactElement {
  const added = addedCount > 0;
  return (
    <span
      className={added ? undefined : 'qcc-meta-add'}
      onClick={e => { e.stopPropagation(); onAdd(); }}
      title={added ? t(locale, 'metadataAddedTitle') : t(locale, 'metadataAddTitle')}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        flexShrink: 0,
        minWidth: 16,
        justifyContent: 'flex-end',
        cursor: 'pointer',
        ...(added ? { opacity: 1 } : {}),
      }}
    >
      {/* Phase 3E.1-fix: codicon замість жирного текстового "+"/"✓" — той
          самий "план" (тонкий іконочний гліф), що й Chevron, а не окремий
          важчий текстовий стиль. */}
      <span
        className={`codicon codicon-${added ? 'check' : 'add'}`}
        style={{ fontSize: 10, color: added ? TOKENS.success : TOKENS.textSecondary }}
      />
      {added && addedCount > 1 && (
        <span style={{ fontSize: 11, color: TOKENS.success }}>×{addedCount}</span>
      )}
    </span>
  );
}

function TabularSectionRow({
  locale,
  rts,
  expanded,
  onToggle,
  addedCount,
  onAdd,
  tokens,
}: {
  locale: SupportedLocale;
  rts: RenderTs;
  expanded: boolean;
  onToggle: () => void;
  addedCount: number;
  onAdd: () => void;
  tokens: string[];
}): React.ReactElement {
  return (
    <>
      <div
        className="qcc-meta-row"
        style={TS_ROW_STYLE}
        onClick={onToggle}
        onDoubleClick={e => { e.stopPropagation(); if (addedCount === 0) onAdd(); }}
        title={t(locale, 'metadataTabularSection')}
      >
        <Chevron expanded={expanded} />
        <MetaKindIcon kind="ТабличнаяЧасть" size={14} />
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {highlight(rts.ts.name, tokens)}
        </span>
        <AddControl locale={locale} addedCount={addedCount} onAdd={onAdd} />
      </div>
      {expanded && rts.fields.map(rf => (
        <FieldRow key={rf.key} field={rf.field} tabular tokens={tokens} />
      ))}
    </>
  );
}

function TableRow({
  locale,
  rt,
  expanded,
  onToggle,
  addedCount,
  onAdd,
  tsExpanded,
  onToggleTs,
  tsAddedCount,
  onAddTs,
  tokens,
}: {
  locale: SupportedLocale;
  rt: RenderTable;
  expanded: boolean;
  onToggle: () => void;
  addedCount: number;
  onAdd: () => void;
  tsExpanded: (key: string) => boolean;
  onToggleTs: (key: string) => void;
  tsAddedCount: (fullName: string) => number;
  onAddTs: (table: MetaTable) => void;
  tokens: string[];
}): React.ReactElement {
  return (
    <>
      <div
        className="qcc-meta-row"
        style={TABLE_ROW_STYLE}
        onClick={onToggle}
        onDoubleClick={e => { e.stopPropagation(); if (addedCount === 0) onAdd(); }}
      >
        <Chevron expanded={expanded} />
        <MetaKindIcon kind={rt.table.kind} size={14} />
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {highlight(rt.table.name, tokens)}
        </span>
        <AddControl locale={locale} addedCount={addedCount} onAdd={onAdd} />
      </div>
      {expanded && rt.fields.map(rf => <FieldRow key={rf.key} field={rf.field} tokens={tokens} />)}
      {expanded && rt.tabularSections.map(rts => (
        <TabularSectionRow
          key={rts.key}
          locale={locale}
          rts={rts}
          expanded={tsExpanded(rts.key)}
          onToggle={() => onToggleTs(rts.key)}
          addedCount={tsAddedCount(rts.ts.fullName)}
          onAdd={() => onAddTs(rts.ts)}
          tokens={tokens}
        />
      ))}
    </>
  );
}

export function MetadataTree({
  locale,
  tables,
  loaded,
  selectedTables,
  onAddTable,
}: {
  locale: SupportedLocale;
  tables: MetaTable[];
  loaded: boolean;
  selectedTables: SelectedTable[];
  onAddTable: (table: MetaTable) => void;
}): React.ReactElement {
  const [query, setQuery] = React.useState('');
  const [debouncedQuery, setDebouncedQuery] = React.useState('');
  // "Manual" — стан, який контролює користувач вручну (persist між пошуками).
  // Під час активного пошуку відповідні гілки примусово показуються розгорнутими
  // (обчислюється, а не мутує ці сети) — після очищення пошуку дерево одразу
  // повертається до manual-стану без жодного окремого "revert".
  const [expandedGroups, setExpandedGroups] = React.useState<Set<TableKind>>(new Set());
  const [expandedTables, setExpandedTables] = React.useState<Set<string>>(new Set());
  const [expandedTsSections, setExpandedTsSections] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 150);
    return () => clearTimeout(timer);
  }, [query]);

  const tokens = React.useMemo(() => tokenize(debouncedQuery), [debouncedQuery]);
  const isSearching = tokens.length > 0;

  const topLevel = React.useMemo(() => tables.filter(tb => GROUP_KINDS.includes(tb.kind)), [tables]);
  const renderModel = React.useMemo(() => buildRenderModel(topLevel, tokens, isSearching), [topLevel, tokens, isSearching]);
  const totalMatches = renderModel.reduce((n, g) => n + g.tables.length, 0);

  function toggleGroup(kind: TableKind): void {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      next.has(kind) ? next.delete(kind) : next.add(kind);
      return next;
    });
  }
  function toggleTable(fullName: string): void {
    setExpandedTables(prev => {
      const next = new Set(prev);
      next.has(fullName) ? next.delete(fullName) : next.add(fullName);
      return next;
    });
  }
  function toggleTsSection(key: string): void {
    setExpandedTsSections(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  const addedCounts = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const st of selectedTables) counts.set(st.fullName, (counts.get(st.fullName) ?? 0) + 1);
    return counts;
  }, [selectedTables]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ padding: 8, flexShrink: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            height: 30,
            padding: '0 8px',
            background: 'var(--vscode-input-background)',
            border: `1px solid ${TOKENS.border}`,
            borderRadius: 4,
          }}
        >
          <span className="codicon codicon-search" style={{ fontSize: 13, opacity: 0.6, flexShrink: 0 }} />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t(locale, 'metadataSearchPlaceholder')}
            style={{
              flex: 1,
              minWidth: 0,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--vscode-input-foreground)',
              fontSize: 13,
            }}
          />
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {!loaded && (
          <div style={{ padding: '12px 8px', color: TOKENS.textMuted, fontSize: 12 }}>{t(locale, 'metadataLoading')}</div>
        )}
        {loaded && tables.length === 0 && (
          <div style={{ padding: '12px 8px', color: TOKENS.textMuted, fontSize: 12 }}>{t(locale, 'metadataEmpty')}</div>
        )}
        {loaded && tables.length > 0 && isSearching && totalMatches === 0 && (
          <div style={{ padding: '12px 8px', color: TOKENS.textMuted, fontSize: 12 }}>{t(locale, 'metadataNoResults')}</div>
        )}
        {loaded &&
          renderModel.map(group => {
            if (isSearching && group.tables.length === 0) return null;
            const isGroupExpanded = isSearching || expandedGroups.has(group.kind);
            return (
              <div key={group.kind}>
                <div className="qcc-meta-row" style={GROUP_HEADER_STYLE} onClick={() => toggleGroup(group.kind)}>
                  <Chevron expanded={isGroupExpanded} />
                  <MetaKindIcon kind={group.kind} size={14} />
                  <span>{groupLabel(locale, group.kind)}</span>
                </div>
                {isGroupExpanded && group.tables.map(rt => (
                  <TableRow
                    key={rt.key}
                    locale={locale}
                    rt={rt}
                    expanded={isSearching || expandedTables.has(rt.table.fullName)}
                    onToggle={() => toggleTable(rt.table.fullName)}
                    addedCount={addedCounts.get(rt.table.fullName) ?? 0}
                    onAdd={() => onAddTable(rt.table)}
                    tsExpanded={key => isSearching || expandedTsSections.has(key)}
                    onToggleTs={toggleTsSection}
                    tsAddedCount={fullName => addedCounts.get(fullName) ?? 0}
                    onAddTs={onAddTable}
                    tokens={tokens}
                  />
                ))}
              </div>
            );
          })}
      </div>
      {loaded && tables.length > 0 && (
        <div
          style={{
            flexShrink: 0,
            padding: '4px 8px',
            fontSize: 11,
            color: TOKENS.textMuted,
            textAlign: 'center',
            borderTop: `1px solid ${TOKENS.border}`,
          }}
        >
          {t(locale, 'metadataDoubleClickHint')}
        </div>
      )}
    </div>
  );
}
