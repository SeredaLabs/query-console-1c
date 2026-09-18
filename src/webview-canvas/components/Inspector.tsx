import * as React from 'react';
import type { MetaField, MetaTable } from '../../core/metadata/types';
import { fieldsTypeCompatible } from '../../core/query/fieldTypeCompat';
import { defaultTableAlias, type ConditionOperator, type Join, type SelectedTable } from '../../core/query/queryModel';
import type { SupportedLocale } from '../../shared/locale';
import type { QueryAction, QueryState } from '../../webview/state/queryStore';
import { allTables } from '../../webview/state/queryStore';
import { MetaKindIcon } from '../../webview/components/MetaKindIcon';
import { ConditionModeToggle } from '../structure/Toolbar';
import { JoinKindPicker } from '../structure/JoinKindPicker';
import { joinKindLabel } from '../structure/joinKind';
import type { StructureSelection } from '../structure/StructureWorkspace';
import { groupLabel, t } from '../i18n';
import { DIMENSIONS, SECTION_LABEL, TOKENS } from '../theme';
import { ResizeHandle } from './ResizeHandle';

const CONTAINER_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  overflow: 'hidden',
  borderLeft: `1px solid ${TOKENS.border}`,
  background: TOKENS.surface1,
};

const HEADER_STYLE: React.CSSProperties = {
  height: DIMENSIONS.workspaceNav,
  minHeight: DIMENSIONS.workspaceNav,
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  padding: '0 12px',
  borderBottom: `1px solid ${TOKENS.border}`,
};

const BODY_STYLE: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  padding: 12,
};

const SECTION_GAP: React.CSSProperties = { marginBottom: 16 };

const FIELD_ROW: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  marginBottom: 8,
};

const FIELD_LABEL: React.CSSProperties = {
  fontSize: 11,
  color: TOKENS.textMuted,
};

const FIELD_VALUE: React.CSSProperties = {
  fontSize: 13,
  color: TOKENS.text,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const BADGE: React.CSSProperties = {
  display: 'inline-block',
  fontSize: 11,
  color: TOKENS.textSecondary,
  border: `1px solid ${TOKENS.border}`,
  borderRadius: 3,
  padding: '1px 6px',
  marginTop: 4,
  marginRight: 4,
};

const REMOVE_BTN: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  fontSize: 12,
  border: `1px solid ${TOKENS.border}`,
  borderRadius: 4,
  background: 'transparent',
  color: TOKENS.danger,
  cursor: 'pointer',
  textAlign: 'left',
};

function Field({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div style={FIELD_ROW}>
      <span style={FIELD_LABEL}>{label}</span>
      <span style={FIELD_VALUE}>{children}</span>
    </div>
  );
}

function tableLabel(tableId: string, selectedTables: SelectedTable[]): string {
  const table = selectedTables.find(tb => tb.id === tableId);
  return table ? defaultTableAlias(table) : tableId;
}

function SourceInspector({
  locale,
  table,
  state,
  dispatch,
  onRemoved,
}: {
  locale: SupportedLocale;
  table: SelectedTable;
  state: QueryState;
  dispatch: React.Dispatch<QueryAction>;
  onRemoved: () => void;
}): React.ReactElement {
  const meta = React.useMemo(() => allTables(state).find(m => m.fullName === table.fullName), [state, table.fullName]);
  return (
    <div>
      <div style={SECTION_GAP}>
        <div style={{ ...SECTION_LABEL, marginBottom: 8 }}>{t(locale, 'inspectorSourceSection')}</div>
        <Field label={t(locale, 'inspectorSourceSection')}>{table.fullName}</Field>
        <Field label={t(locale, 'inspectorAliasLabel')}>{defaultTableAlias(table)}</Field>
        {meta && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <MetaKindIcon kind={meta.kind} size={14} />
            <span style={{ fontSize: 12, color: TOKENS.textSecondary }}>{groupLabel(locale, meta.kind)}</span>
          </div>
        )}
        <div>
          {table.virtual && <span style={BADGE}>{t(locale, 'structureVirtualTable')}</span>}
          {table.subquery && <span style={BADGE}>{t(locale, 'inspectorSubqueryBadge')}</span>}
          {table.tempTable && <span style={BADGE}>{t(locale, 'packageIdentityTempTable')}</span>}
        </div>
      </div>
      <div>
        <div style={{ ...SECTION_LABEL, marginBottom: 8 }}>{t(locale, 'inspectorActionsSection')}</div>
        <button
          type="button"
          style={REMOVE_BTN}
          onClick={() => {
            dispatch({ type: 'REMOVE_TABLE', tableId: table.id });
            onRemoved();
          }}
        >
          ✕ {t(locale, 'structureRemoveSource')}
        </button>
      </div>
    </div>
  );
}

const SELECT_STYLE: React.CSSProperties = {
  display: 'block',
  width: '100%',
  marginTop: 2,
  fontSize: 12,
  padding: '3px 4px',
};

/** Той самий перелік, що й Classic ConnectionsTab (`OPERATORS`) — раніше в New Builder
 * Inspector умова поле=поле мала лише неявний `=`, хоча домен/reducer (`SET_JOIN_OPERATOR`)
 * і Classic вже підтримують довільний оператор. */
const OPERATORS: ConditionOperator[] = ['=', '<>', '>', '>=', '<', '<=', 'В', 'МЕЖДУ', 'ПОДОБНО'];

function fieldsOf(tableId: string, selectedTables: SelectedTable[], tablesMeta: MetaTable[]): MetaField[] {
  const table = selectedTables.find(tb => tb.id === tableId);
  if (!table) return [];
  const meta = tablesMeta.find(m => m.fullName === table.fullName);
  return meta ? meta.fields : [];
}

function JoinInspector({
  locale,
  join,
  joinIndex,
  selectedTables,
  state,
  dispatch,
  onRemoved,
}: {
  locale: SupportedLocale;
  join: Join;
  joinIndex: number;
  selectedTables: SelectedTable[];
  state: QueryState;
  dispatch: React.Dispatch<QueryAction>;
  onRemoved: () => void;
}): React.ReactElement {
  const leftLabel = tableLabel(join.leftTableId, selectedTables);
  const rightLabel = tableLabel(join.rightTableId, selectedTables);
  const conditions = join.conditions ?? [
    { custom: join.custom, leftPath: join.leftPath, operator: join.operator, rightPath: join.rightPath, expression: join.expression },
  ];
  const tablesMeta = React.useMemo(() => allTables(state), [state]);
  const leftFields = React.useMemo(
    () => fieldsOf(join.leftTableId, selectedTables, tablesMeta),
    [join.leftTableId, selectedTables, tablesMeta]
  );
  const rightFields = React.useMemo(
    () => fieldsOf(join.rightTableId, selectedTables, tablesMeta),
    [join.rightTableId, selectedTables, tablesMeta]
  );
  const kind = joinKindLabel(join.leftAll, join.rightAll);

  return (
    <div>
      <div style={SECTION_GAP}>
        <div style={{ ...SECTION_LABEL, marginBottom: 8 }}>{t(locale, 'structureJoinSectionSources')}</div>
        <Field label={t(locale, 'inspectorJoinSourceA')}>{leftLabel}</Field>
        <Field label={t(locale, 'inspectorJoinSourceB')}>{rightLabel}</Field>
      </div>
      <div style={SECTION_GAP}>
        <div style={{ ...SECTION_LABEL, marginBottom: 8 }}>{t(locale, 'structureJoinKind')}</div>
        <JoinKindPicker
          value={kind}
          onChange={next => {
            dispatch({ type: 'SET_JOIN_ALL', index: joinIndex, side: 'left', value: next !== 'INNER' });
            dispatch({ type: 'SET_JOIN_ALL', index: joinIndex, side: 'right', value: next === 'FULL' });
          }}
        />
      </div>
      <div style={SECTION_GAP}>
        <div style={{ ...SECTION_LABEL, marginBottom: 8 }}>{t(locale, 'structureJoinSectionCondition')}</div>
        {/*
          Кожен конюнкт (AND-умова) редагується незалежно — той самий
          `ConditionModeToggle`, що й для creation popover, тільки з
          `condIndex`. Reducer це вже підтримує (`ADD_JOIN_CONDITION`/
          `REMOVE_JOIN_CONDITION`/`SET_JOIN_FIELD`/`SET_JOIN_EXPRESSION`/
          `SET_JOIN_CUSTOM` з опційним condIndex) — раніше просто не було
          UI для >1 умови (fallback на read-only). Жодних нових domain
          capabilities: multi-conjunct AND — вже існуюча модель `Join.
          conditions[]`.
        */}
        {conditions.map((c, i) => (
          <div key={i}>
            {i > 0 && (
              <div style={{ fontSize: 10, fontWeight: 600, color: TOKENS.textMuted, margin: '8px 0 4px' }}>
                {t(locale, 'structureJoinAnd')}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <ConditionModeToggle
                  locale={locale}
                  mode={c.custom ? 'custom' : 'field'}
                  onChange={mode => dispatch({ type: 'SET_JOIN_CUSTOM', index: joinIndex, custom: mode === 'custom', condIndex: i })}
                />
                <div style={{ height: 6 }} />
                {c.custom ? (
                  <input
                    type="text"
                    value={c.expression ?? ''}
                    onChange={e => dispatch({ type: 'SET_JOIN_EXPRESSION', index: joinIndex, expression: e.target.value, condIndex: i })}
                    placeholder={t(locale, 'structureJoinExpressionPlaceholder')}
                    style={{ ...SELECT_STYLE, fontFamily: 'var(--vscode-editor-font-family, monospace)' }}
                  />
                ) : (
                  (() => {
                    const selectedLeft = leftFields.find(f => f.name === c.leftPath);
                    return (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <label style={{ ...FIELD_ROW, flex: 1 }}>
                          <span style={FIELD_LABEL}>{t(locale, 'structureJoinFieldSource')}</span>
                          <select
                            value={c.leftPath ?? ''}
                            onChange={e => dispatch({ type: 'SET_JOIN_FIELD', index: joinIndex, side: 'left', path: e.target.value, condIndex: i })}
                            style={SELECT_STYLE}
                          >
                            <option value="">—</option>
                            {leftFields.map(f => (
                              <option key={f.name} value={f.name}>
                                {f.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label style={{ ...FIELD_ROW, flexShrink: 0, width: 54 }}>
                          <span style={FIELD_LABEL}>&nbsp;</span>
                          <select
                            value={c.operator ?? '='}
                            onChange={e => dispatch({ type: 'SET_JOIN_OPERATOR', index: joinIndex, operator: e.target.value as ConditionOperator, condIndex: i })}
                            style={SELECT_STYLE}
                          >
                            {OPERATORS.map(op => (
                              <option key={op} value={op}>
                                {op}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label style={{ ...FIELD_ROW, flex: 1 }}>
                          <span style={FIELD_LABEL}>{t(locale, 'structureJoinFieldTarget')}</span>
                          <select
                            value={c.rightPath ?? ''}
                            onChange={e => dispatch({ type: 'SET_JOIN_FIELD', index: joinIndex, side: 'right', path: e.target.value, condIndex: i })}
                            style={SELECT_STYLE}
                            title={selectedLeft ? t(locale, 'structureJoinFieldTypeMismatchHint') : undefined}
                          >
                            <option value="">—</option>
                            {rightFields.map(f => (
                              <option key={f.name} value={f.name} disabled={!!selectedLeft && !fieldsTypeCompatible(selectedLeft, f)}>
                                {f.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    );
                  })()
                )}
              </div>
              {conditions.length > 1 && (
                <button
                  type="button"
                  title={t(locale, 'structureJoinRemoveCondition')}
                  onClick={() => dispatch({ type: 'REMOVE_JOIN_CONDITION', index: joinIndex, condIndex: i })}
                  style={{
                    flexShrink: 0,
                    marginTop: 2,
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
              )}
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => dispatch({ type: 'ADD_JOIN_CONDITION', index: joinIndex })}
          style={{
            marginTop: 8,
            width: '100%',
            padding: '5px 8px',
            fontSize: 12,
            border: `1px solid ${TOKENS.border}`,
            borderRadius: 4,
            background: 'transparent',
            color: TOKENS.textSecondary,
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          + {t(locale, 'structureJoinAddCondition')}
        </button>
      </div>
      <div>
        <div style={{ ...SECTION_LABEL, marginBottom: 8 }}>{t(locale, 'inspectorActionsSection')}</div>
        <button
          type="button"
          style={REMOVE_BTN}
          onClick={() => {
            dispatch({ type: 'REMOVE_JOIN', index: joinIndex });
            onRemoved();
          }}
        >
          ✕ {t(locale, 'structureRemoveJoin')}
        </button>
      </div>
    </div>
  );
}

/**
 * Phase 4 — Contextual Inspector: рендериться App.tsx ЛИШЕ коли є selection
 * (нічого не selected → компонент взагалі не монтується, canvas займає всю
 * ширину). Показує тільки реально існуючі властивості моделі (read-only) +
 * remove-дію через вже існуючі REMOVE_TABLE/REMOVE_JOIN — жодних нових
 * reducer actions.
 */
export function Inspector({
  locale,
  width,
  onResize,
  state,
  dispatch,
  selection,
  onClearSelection,
}: {
  locale: SupportedLocale;
  width: number;
  onResize: (delta: number) => void;
  state: QueryState;
  dispatch: React.Dispatch<QueryAction>;
  selection: StructureSelection;
  onClearSelection: () => void;
}): React.ReactElement {
  const selectedTable =
    selection?.kind === 'table' ? state.selectedTables.find(tb => tb.id === selection.tableId) ?? null : null;
  const selectedJoin = selection?.kind === 'join' ? state.joins[selection.joinIndex] ?? null : null;

  return (
    <>
      <ResizeHandle axis="x" onResize={onResize} />
      <div style={{ ...CONTAINER_STYLE, width, flexShrink: 0 }}>
        <div style={HEADER_STYLE}>
          <span style={SECTION_LABEL}>{t(locale, 'inspectorTitle')}</span>
        </div>
        <div style={BODY_STYLE}>
          {selectedTable && (
            <SourceInspector locale={locale} table={selectedTable} state={state} dispatch={dispatch} onRemoved={onClearSelection} />
          )}
          {selectedJoin && selection?.kind === 'join' && (
            <JoinInspector
              locale={locale}
              join={selectedJoin}
              joinIndex={selection.joinIndex}
              selectedTables={state.selectedTables}
              state={state}
              dispatch={dispatch}
              onRemoved={onClearSelection}
            />
          )}
          {!selectedTable && !selectedJoin && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <span style={{ color: TOKENS.textMuted, fontSize: 12 }}>{t(locale, 'inspectorEmpty')}</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
