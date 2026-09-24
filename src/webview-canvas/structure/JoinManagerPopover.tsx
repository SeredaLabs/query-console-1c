import * as React from 'react';
import type { MetaField, MetaTable } from '../../core/metadata/types';
import { fieldsTypeCompatible } from '../../core/query/fieldTypeCompat';
import { defaultTableAlias, type ConditionOperator, type Join, type SelectedTable } from '../../core/query/queryModel';
import type { SupportedLocale } from '../../shared/locale';
import { t } from '../i18n';
import { SECTION_LABEL, TOKENS } from '../theme';
import { ConditionModeToggle, type ConditionMode } from './ConditionModeToggle';
import { JoinKindPicker } from './JoinKindPicker';
import { joinKindLabel, type JoinKindLabel } from './joinKind';
import { CONDITION_OPERATORS } from '../../webview/conditionOperators';

const BTN: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: TOKENS.text,
  cursor: 'pointer',
  fontSize: 12,
  padding: '4px 8px',
  borderRadius: 4,
};

const SELECT_STYLE: React.CSSProperties = {
  display: 'block',
  width: '100%',
  marginTop: 2,
  fontSize: 12,
  padding: '3px 4px',
};

function tableSelectLabel(table: SelectedTable): string {
  return `${defaultTableAlias(table)} (${table.fullName})`;
}

function tableLabel(tableId: string, tables: SelectedTable[]): string {
  const tb = tables.find(tb2 => tb2.id === tableId);
  return tb ? defaultTableAlias(tb) : tableId;
}


/** Поля обраної таблиці (top-level, без tabular sections — той самий обсяг, що TableCard показує для source). */
function fieldsOf(tableId: string, tables: SelectedTable[], tablesMeta: MetaTable[]): MetaField[] {
  const table = tables.find(tb => tb.id === tableId);
  if (!table) return [];
  const meta = tablesMeta.find(m => m.fullName === table.fullName);
  return meta ? meta.fields : [];
}

/**
 * Gap analysis: "Додати зв'язок" (створення) і "Зв'язки (N)" (перегляд
 * існуючих) були двома окремими кнопками/попапами з дублюючою логікою —
 * хоча концептуально це одна дія "керування зв'язками". Об'єднано в один
 * popover з двома внутрішніми режимами: `list` (за замовчуванням, коли є
 * хоч один join) — рядки існуючих зв'язків + "+ Додати зв'язок" знизу;
 * `create` — та сама форма (Джерела/Тип/Умова), що була в колишньому
 * `JoinPopover`. Один вхід у тулбарі замість двох, той самий набір уже
 * існуючих reducer actions.
 */
export function JoinManagerPopover({
  locale,
  tables,
  tablesMeta,
  joins,
  selectedJoinIndex,
  onSelectJoin,
  onRemoveJoin,
  onCreate,
  onClose,
}: {
  locale: SupportedLocale;
  tables: SelectedTable[];
  tablesMeta: MetaTable[];
  joins: Join[];
  selectedJoinIndex: number | null;
  onSelectJoin: (index: number) => void;
  onRemoveJoin: (index: number) => void;
  onCreate: (
    sourceId: string,
    targetId: string,
    kind: JoinKindLabel,
    leftField: string,
    rightField: string,
    expression: string,
    operator: ConditionOperator
  ) => void;
  onClose: () => void;
}): React.ReactElement {
  const [mode, setMode] = React.useState<'list' | 'create'>(joins.length > 0 ? 'list' : 'create');
  const [query, setQuery] = React.useState('');

  const [source, setSource] = React.useState(tables[0]?.id ?? '');
  const [target, setTarget] = React.useState(tables[1]?.id ?? '');
  const [kind, setKind] = React.useState<JoinKindLabel>('INNER');
  const [condMode, setCondMode] = React.useState<ConditionMode>('field');
  const [leftField, setLeftField] = React.useState('');
  const [rightField, setRightField] = React.useState('');
  const [operator, setOperator] = React.useState<ConditionOperator>('=');
  const [expression, setExpression] = React.useState('');

  const sourceFields = React.useMemo(() => fieldsOf(source, tables, tablesMeta), [source, tables, tablesMeta]);
  const targetFields = React.useMemo(() => fieldsOf(target, tables, tablesMeta), [target, tables, tablesMeta]);
  const selectedLeftField = sourceFields.find(f => f.name === leftField);
  /** Жорстке блокування (не просто попередження): поле цілі, тип якого не перетинається
   * з уже обраним полем джерела (Строка ↔ ДокументСсылка тощо), лишається в списку — щоб
   * було видно, чому саме воно недоступне — але вибрати його неможливо (`disabled`). */
  const isTargetFieldCompatible = React.useCallback(
    (f: MetaField) => !selectedLeftField || fieldsTypeCompatible(selectedLeftField, f),
    [selectedLeftField]
  );

  React.useEffect(() => {
    if (!sourceFields.some(f => f.name === leftField)) setLeftField('');
  }, [sourceFields]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    if (!targetFields.some(f => f.name === rightField && isTargetFieldCompatible(f))) setRightField('');
  }, [targetFields, isTargetFieldCompatible]); // eslint-disable-line react-hooks/exhaustive-deps

  const isSearching = query.trim().length > 0;
  const filteredJoins = React.useMemo(() => {
    const entries = joins.map((join, index) => ({ join, index }));
    if (!isSearching) return entries;
    const q = query.trim().toLowerCase();
    return entries.filter(({ join }) => {
      const kindLabel = joinKindLabel(join.leftAll, join.rightAll);
      const corpus = `${kindLabel} ${tableLabel(join.leftTableId, tables)} ${tableLabel(join.rightTableId, tables)}`.toLowerCase();
      return corpus.includes(q);
    });
  }, [joins, isSearching, query, tables]);

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 10 }} onClick={onClose} />
      <div
        style={{
          position: 'absolute',
          top: '100%',
          marginTop: 4,
          left: 0,
          zIndex: 11,
          width: mode === 'create' ? 300 : 260,
          maxHeight: mode === 'list' ? 360 : undefined,
          padding: mode === 'create' ? 12 : 0,
          borderRadius: 6,
          border: `1px solid ${TOKENS.border}`,
          background: TOKENS.surface1,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          display: 'flex',
          flexDirection: 'column',
          gap: mode === 'create' ? 12 : 0,
        }}
        onClick={e => e.stopPropagation()}
      >
        {mode === 'list' ? (
          <>
            {joins.length > 0 && (
              <div style={{ padding: 8, flexShrink: 0 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    height: 28,
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
                    placeholder={t(locale, 'structureJoinSearchPlaceholder')}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      color: 'var(--vscode-input-foreground)',
                      fontSize: 12,
                    }}
                  />
                </div>
              </div>
            )}
            <div style={{ overflowY: 'auto', flex: joins.length > 0 ? '0 1 auto' : undefined }}>
              {joins.length === 0 ? (
                <div style={{ padding: 12, fontSize: 12, color: TOKENS.textMuted }}>
                  {t(locale, 'structureJoinsOverviewEmpty')}
                </div>
              ) : filteredJoins.length === 0 ? (
                <div style={{ padding: 12, fontSize: 12, color: TOKENS.textMuted }}>
                  {t(locale, 'structureJoinSearchNoResults')}
                </div>
              ) : (
              filteredJoins.map(({ join, index }) => {
                const selected = index === selectedJoinIndex;
                return (
                  <div
                    key={index}
                    onClick={() => {
                      onSelectJoin(index);
                      onClose();
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 10px',
                      cursor: 'pointer',
                      borderBottom: `1px solid ${TOKENS.borderSubtle}`,
                      background: selected ? `color-mix(in srgb, ${TOKENS.accent} 12%, transparent)` : 'transparent',
                    }}
                  >
                    <span
                      style={{
                        flexShrink: 0,
                        fontSize: 10,
                        fontWeight: 600,
                        padding: '1px 5px',
                        borderRadius: 3,
                        border: `1px solid ${selected ? TOKENS.accent : TOKENS.border}`,
                        color: selected ? TOKENS.accent : TOKENS.textSecondary,
                      }}
                    >
                      {joinKindLabel(join.leftAll, join.rightAll)}
                    </span>
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: 12,
                        color: TOKENS.text,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={`${tableLabel(join.leftTableId, tables)} ↔ ${tableLabel(join.rightTableId, tables)}`}
                    >
                      {tableLabel(join.leftTableId, tables)} ↔ {tableLabel(join.rightTableId, tables)}
                    </span>
                    <button
                      type="button"
                      title={t(locale, 'structureRemoveJoin')}
                      onClick={e => {
                        e.stopPropagation();
                        onRemoveJoin(index);
                      }}
                      style={{
                        flexShrink: 0,
                        border: 'none',
                        background: 'transparent',
                        color: TOKENS.textMuted,
                        cursor: 'pointer',
                        fontSize: 12,
                        padding: '2px 4px',
                      }}
                    >
                      ✕
                    </button>
                  </div>
                );
              })
              )}
            </div>
            <button
              type="button"
              disabled={tables.length < 2}
              title={tables.length < 2 ? t(locale, 'structureJoinNeedsTwoSources') : undefined}
              onClick={() => setMode('create')}
              style={{
                flexShrink: 0,
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 10px',
                fontSize: 12,
                border: 'none',
                borderTop: joins.length > 0 ? `1px solid ${TOKENS.borderSubtle}` : 'none',
                background: 'transparent',
                color: tables.length < 2 ? TOKENS.textMuted : TOKENS.textSecondary,
                cursor: tables.length < 2 ? 'not-allowed' : 'pointer',
                opacity: tables.length < 2 ? 0.6 : 1,
              }}
            >
              <span className="codicon codicon-add" style={{ fontSize: 13 }} />
              {t(locale, 'structureAddJoin')}
            </button>
            {joins.length > 0 && (
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
                {t(locale, 'structureJoinClickHint')}
              </div>
            )}
          </>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={SECTION_LABEL}>{t(locale, 'structureJoinSectionSources')}</span>
              <label style={{ fontSize: 11, color: TOKENS.textSecondary }}>
                {t(locale, 'structureJoinSource')}
                <select value={source} onChange={e => setSource(e.target.value)} style={SELECT_STYLE}>
                  {tables.map(tb => (
                    <option key={tb.id} value={tb.id}>
                      {tableSelectLabel(tb)}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ fontSize: 11, color: TOKENS.textSecondary }}>
                {t(locale, 'structureJoinTarget')}
                <select value={target} onChange={e => setTarget(e.target.value)} style={SELECT_STYLE}>
                  {tables.map(tb => (
                    <option key={tb.id} value={tb.id}>
                      {tableSelectLabel(tb)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={SECTION_LABEL}>{t(locale, 'structureJoinKind')}</span>
              <JoinKindPicker value={kind} onChange={setKind} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={SECTION_LABEL}>{t(locale, 'structureJoinSectionCondition')}</span>
              <ConditionModeToggle locale={locale} mode={condMode} onChange={setCondMode} />
              {condMode === 'field' ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <label style={{ fontSize: 11, color: TOKENS.textSecondary, flex: 1 }}>
                    {t(locale, 'structureJoinFieldSource')}
                    <select value={leftField} onChange={e => setLeftField(e.target.value)} style={SELECT_STYLE}>
                      <option value="">—</option>
                      {sourceFields.map(f => (
                        <option key={f.name} value={f.name}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={{ fontSize: 11, color: TOKENS.textSecondary, flexShrink: 0, width: 54 }}>
                    &nbsp;
                    <select value={operator} onChange={e => setOperator(e.target.value as ConditionOperator)} style={SELECT_STYLE}>
                      {CONDITION_OPERATORS.map(op => (
                        <option key={op} value={op}>
                          {op}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={{ fontSize: 11, color: TOKENS.textSecondary, flex: 1 }}>
                    {t(locale, 'structureJoinFieldTarget')}
                    <select
                      value={rightField}
                      onChange={e => setRightField(e.target.value)}
                      style={SELECT_STYLE}
                      title={selectedLeftField ? t(locale, 'structureJoinFieldTypeMismatchHint') : undefined}
                    >
                      <option value="">—</option>
                      {targetFields.map(f => (
                        <option key={f.name} value={f.name} disabled={!isTargetFieldCompatible(f)}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : (
                <input
                  type="text"
                  value={expression}
                  onChange={e => setExpression(e.target.value)}
                  placeholder={t(locale, 'structureJoinExpressionPlaceholder')}
                  style={{ ...SELECT_STYLE, fontFamily: 'var(--vscode-editor-font-family, monospace)' }}
                />
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                style={BTN}
                onClick={() => (joins.length > 0 ? setMode('list') : onClose())}
              >
                {t(locale, 'cancel')}
              </button>
              <button
                type="button"
                style={{ ...BTN, border: `1px solid ${TOKENS.accent}`, color: TOKENS.accent }}
                onClick={() => {
                  onCreate(source, target, kind, leftField, rightField, condMode === 'custom' ? expression : '', operator);
                  onClose();
                }}
              >
                {t(locale, 'structureJoinCreate')}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
