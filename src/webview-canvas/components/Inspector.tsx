import * as React from 'react';
import { defaultTableAlias, type Join, type SelectedTable } from '../../core/query/queryModel';
import type { SupportedLocale } from '../../shared/locale';
import type { QueryAction, QueryState } from '../../webview/state/queryStore';
import { allTables } from '../../webview/state/queryStore';
import { MetaKindIcon } from '../../webview/components/MetaKindIcon';
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

/** Один конюнкт JOIN у людському вигляді — читання вже існуючих полів моделі, без нової семантики. */
function describeJoinCondition(
  cond: { custom?: boolean; leftPath?: string; operator?: string; rightPath?: string; expression?: string },
  leftLabel: string,
  rightLabel: string
): string {
  if (cond.custom && cond.expression) return cond.expression;
  if (cond.leftPath && cond.rightPath) return `${leftLabel}.${cond.leftPath} ${cond.operator ?? '='} ${rightLabel}.${cond.rightPath}`;
  return '—';
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

function JoinInspector({
  locale,
  join,
  joinIndex,
  selectedTables,
  dispatch,
  onRemoved,
}: {
  locale: SupportedLocale;
  join: Join;
  joinIndex: number;
  selectedTables: SelectedTable[];
  dispatch: React.Dispatch<QueryAction>;
  onRemoved: () => void;
}): React.ReactElement {
  const leftLabel = tableLabel(join.leftTableId, selectedTables);
  const rightLabel = tableLabel(join.rightTableId, selectedTables);
  const conditions = join.conditions ?? [
    { custom: join.custom, leftPath: join.leftPath, operator: join.operator, rightPath: join.rightPath, expression: join.expression },
  ];
  return (
    <div>
      <div style={SECTION_GAP}>
        <div style={{ ...SECTION_LABEL, marginBottom: 8 }}>{t(locale, 'inspectorJoinSection')}</div>
        <Field label={t(locale, 'inspectorJoinSection')}>{joinKindLabel(join.leftAll, join.rightAll)}</Field>
        <Field label={t(locale, 'inspectorJoinSourceA')}>{leftLabel}</Field>
        <Field label={t(locale, 'inspectorJoinSourceB')}>{rightLabel}</Field>
        <div style={FIELD_ROW}>
          <span style={FIELD_LABEL}>{t(locale, 'inspectorConditionsLabel')}</span>
          {conditions.map((c, i) => (
            <span key={i} style={{ ...FIELD_VALUE, whiteSpace: 'normal' }}>
              {describeJoinCondition(c, leftLabel, rightLabel)}
            </span>
          ))}
        </div>
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
