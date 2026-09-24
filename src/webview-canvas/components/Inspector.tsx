import * as React from 'react';
import type { MetaField, MetaTable } from '../../core/metadata/types';
import { fieldsTypeCompatible } from '../../core/query/fieldTypeCompat';
import { defaultTableAlias, type ConditionOperator, type Join, type SelectedTable } from '../../core/query/queryModel';
import type { SupportedLocale } from '../../shared/locale';
import type { QueryAction, QueryState } from '../../webview/state/queryStore';
import { allTables } from '../../webview/state/queryStore';
import { MetaKindIcon } from '../../webview/components/MetaKindIcon';
import { JoinKindPicker } from '../structure/JoinKindPicker';
import { joinKindLabel } from '../structure/joinKind';
import type { StructureSelection } from '../structure/StructureWorkspace';
import { t } from '../i18n';
import { groupLabel } from '../../webview/metadataTreeModel';
import { CARD, DIMENSIONS, SECTION_LABEL, TOKENS } from '../theme';
import { ResizeHandle } from '../../webview/components/ResizeHandle';
import { CONDITION_OPERATORS } from '../../webview/conditionOperators';

const CONTAINER_STYLE: React.CSSProperties = {
  ...CARD,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  margin: '10px 10px 10px 0',
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

/** Dark-themed `<select>` — рідний браузерний білий select дуже сильно
 * вибивався з VS Code UI (design review). Тільки токени, як і решта Builder. */
const DARK_SELECT: React.CSSProperties = {
  display: 'block',
  width: '100%',
  fontSize: 12,
  padding: '4px 6px',
  borderRadius: 4,
  border: `1px solid var(--vscode-dropdown-border, ${TOKENS.border})`,
  background: 'var(--vscode-dropdown-background)',
  color: 'var(--vscode-dropdown-foreground)',
};

const IDENT_NAME: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: TOKENS.text,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const IDENT_KIND: React.CSSProperties = {
  fontSize: 11,
  color: TOKENS.textMuted,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const AND_PILL: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 0.4,
  color: TOKENS.textMuted,
  textAlign: 'center',
  margin: '4px 0',
};

const KEBAB_BTN: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: TOKENS.textMuted,
  cursor: 'pointer',
  padding: '2px 4px',
  borderRadius: 3,
  flexShrink: 0,
};

const MENU_ITEM: React.CSSProperties = {
  padding: '6px 10px',
  fontSize: 12,
  color: TOKENS.textSecondary,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const DESTRUCTIVE_LINK: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: TOKENS.danger,
  cursor: 'pointer',
  fontSize: 12,
  padding: '4px 2px',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  opacity: 0.85,
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
            <span style={{ fontSize: 12, color: TOKENS.textSecondary }}>{groupLabel(meta.kind)}</span>
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


function fieldsOf(tableId: string, selectedTables: SelectedTable[], tablesMeta: MetaTable[]): MetaField[] {
  const table = selectedTables.find(tb => tb.id === tableId);
  if (!table) return [];
  const meta = tablesMeta.find(m => m.fullName === table.fullName);
  return meta ? meta.fields : [];
}

function metaOf(tableId: string, selectedTables: SelectedTable[], state: QueryState): MetaTable | undefined {
  const table = selectedTables.find(tb => tb.id === tableId);
  if (!table) return undefined;
  return allTables(state).find(m => m.fullName === table.fullName);
}

/** Легкий overflow-меню — той самий backdrop+absolute патерн, що вже є в
 * FieldsWorkspace ("+ Поле" popover), не нова взаємодія для кодбази. */
function KebabMenu({ items, onClose }: { items: { label: string; onClick: () => void; danger?: boolean }[]; onClose: () => void }): React.ReactElement {
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 10 }} onClick={onClose} />
      <div
        style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          marginTop: 4,
          zIndex: 11,
          minWidth: 160,
          borderRadius: 6,
          border: `1px solid ${TOKENS.border}`,
          background: TOKENS.surface1,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {items.map((item, i) => (
          <div
            key={i}
            onClick={() => {
              item.onClick();
              onClose();
            }}
            style={{ ...MENU_ITEM, color: item.danger ? TOKENS.danger : TOKENS.textSecondary }}
            onMouseEnter={e => (e.currentTarget.style.background = TOKENS.surfaceHover)}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            {item.label}
          </div>
        ))}
      </div>
    </>
  );
}

function JoinInspector({
  locale,
  join,
  joinIndex,
  selectedTables,
  state,
  dispatch,
  onRemoved,
  width,
}: {
  locale: SupportedLocale;
  join: Join;
  joinIndex: number;
  selectedTables: SelectedTable[];
  state: QueryState;
  dispatch: React.Dispatch<QueryAction>;
  onRemoved: () => void;
  width: number;
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
  const leftMeta = metaOf(join.leftTableId, selectedTables, state);
  const rightMeta = metaOf(join.rightTableId, selectedTables, state);
  const kind = joinKindLabel(join.leftAll, join.rightAll);
  const [openMenu, setOpenMenu] = React.useState<number | null>(null);
  // Design review (2026-09-19): field/operator/field розкладка в один рядок
  // ламається на вузькій панелі (3 select стиснуті нема куди) — той самий
  // "adaptive" принцип, що й Fields tab, лише виміряний з уже готового
  // `width` prop (Inspector сам ресайзиться, а не canvas-container), тому
  // без окремого ResizeObserver.
  const stacked = width < 400;

  return (
    <div>
      {/* Ідентифікація зв'язку — інформаційна, не input-подібна (design
          review: "виглядають так, ніби їх можна редагувати"). Тип
          з'єднання більше НЕ дублюється тут текстом — джерело правди
          лише сегментований picker нижче. */}
      <div style={{ ...SECTION_GAP, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={IDENT_NAME} title={leftLabel}>
            {leftLabel}
          </div>
          <div style={IDENT_KIND}>{leftMeta ? groupLabel(leftMeta.kind) : '—'}</div>
        </div>
        <span className="codicon codicon-arrow-right" style={{ fontSize: 14, color: TOKENS.textMuted, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0, textAlign: 'right' }}>
          <div style={IDENT_NAME} title={rightLabel}>
            {rightLabel}
          </div>
          <div style={IDENT_KIND}>{rightMeta ? groupLabel(rightMeta.kind) : '—'}</div>
        </div>
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={SECTION_LABEL}>{t(locale, 'structureJoinSectionCondition')}</span>
          {conditions.length > 1 && <span style={{ ...SECTION_LABEL, color: TOKENS.textMuted }}>{conditions.length}</span>}
        </div>
        {/*
          Кожен конюнкт (AND-умова) редагується незалежно — reducer вже
          підтримує це (`ADD_JOIN_CONDITION`/`REMOVE_JOIN_CONDITION`/
          `SET_JOIN_FIELD`/`SET_JOIN_EXPRESSION`/`SET_JOIN_CUSTOM` з
          опційним condIndex). Design review: `ConditionModeToggle` як
          завжди видимий segmented control прибрано — перемикання
          поле/вираз тепер лише в "⋮"-меню кожної умови (властивість
          КОНКРЕТНОЇ умови, не всього JOIN), а AND-роздільник між умовами
          читається як логічний вираз "A = B AND C = D", а не список
          dropdown'ів.
        */}
        {conditions.map((c, i) => {
          const selectedLeft = leftFields.find(f => f.name === c.leftPath);
          return (
            <React.Fragment key={i}>
              {i > 0 && <div style={AND_PILL}>{t(locale, 'structureJoinAnd')}</div>}
              <div style={{ position: 'relative', border: `1px solid ${TOKENS.border}`, borderRadius: 6, padding: 8, background: TOKENS.surface2 }}>
                <div style={{ position: 'absolute', top: 4, right: 4 }}>
                  <button type="button" title={t(locale, 'inspectorActionsSection')} onClick={() => setOpenMenu(i)} style={KEBAB_BTN}>
                    <span className="codicon codicon-kebab-vertical" style={{ fontSize: 14 }} />
                  </button>
                  {openMenu === i && (
                    <KebabMenu
                      onClose={() => setOpenMenu(null)}
                      items={[
                        c.custom
                          ? { label: t(locale, 'structureJoinModeField'), onClick: () => dispatch({ type: 'SET_JOIN_CUSTOM', index: joinIndex, custom: false, condIndex: i }) }
                          : { label: t(locale, 'structureJoinModeCustom'), onClick: () => dispatch({ type: 'SET_JOIN_CUSTOM', index: joinIndex, custom: true, condIndex: i }) },
                        ...(conditions.length > 1
                          ? [{ label: t(locale, 'structureJoinRemoveCondition'), danger: true, onClick: () => dispatch({ type: 'REMOVE_JOIN_CONDITION', index: joinIndex, condIndex: i }) }]
                          : []),
                      ]}
                    />
                  )}
                </div>
                {c.custom ? (
                  <input
                    type="text"
                    value={c.expression ?? ''}
                    onChange={e => dispatch({ type: 'SET_JOIN_EXPRESSION', index: joinIndex, expression: e.target.value, condIndex: i })}
                    placeholder={t(locale, 'structureJoinExpressionPlaceholder')}
                    style={{ ...DARK_SELECT, paddingRight: 24, fontFamily: 'var(--vscode-editor-font-family, monospace)' }}
                  />
                ) : stacked ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingRight: 20 }}>
                    <select
                      value={c.leftPath ?? ''}
                      onChange={e => dispatch({ type: 'SET_JOIN_FIELD', index: joinIndex, side: 'left', path: e.target.value, condIndex: i })}
                      style={DARK_SELECT}
                      title={t(locale, 'structureJoinFieldSource')}
                    >
                      <option value="">—</option>
                      {leftFields.map(f => (
                        <option key={f.name} value={f.name}>
                          {leftLabel}.{f.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={c.operator ?? '='}
                      onChange={e => dispatch({ type: 'SET_JOIN_OPERATOR', index: joinIndex, operator: e.target.value as ConditionOperator, condIndex: i })}
                      style={{ ...DARK_SELECT, textAlign: 'center' }}
                    >
                      {CONDITION_OPERATORS.map(op => (
                        <option key={op} value={op}>
                          {op}
                        </option>
                      ))}
                    </select>
                    <select
                      value={c.rightPath ?? ''}
                      onChange={e => dispatch({ type: 'SET_JOIN_FIELD', index: joinIndex, side: 'right', path: e.target.value, condIndex: i })}
                      style={DARK_SELECT}
                      title={selectedLeft ? t(locale, 'structureJoinFieldTypeMismatchHint') : t(locale, 'structureJoinFieldTarget')}
                    >
                      <option value="">—</option>
                      {rightFields.map(f => (
                        <option key={f.name} value={f.name} disabled={!!selectedLeft && !fieldsTypeCompatible(selectedLeft, f)}>
                          {rightLabel}.{f.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 6, paddingRight: 20 }}>
                    <select
                      value={c.leftPath ?? ''}
                      onChange={e => dispatch({ type: 'SET_JOIN_FIELD', index: joinIndex, side: 'left', path: e.target.value, condIndex: i })}
                      style={{ ...DARK_SELECT, flex: 1, minWidth: 0 }}
                      title={t(locale, 'structureJoinFieldSource')}
                    >
                      <option value="">—</option>
                      {leftFields.map(f => (
                        <option key={f.name} value={f.name}>
                          {leftLabel}.{f.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={c.operator ?? '='}
                      onChange={e => dispatch({ type: 'SET_JOIN_OPERATOR', index: joinIndex, operator: e.target.value as ConditionOperator, condIndex: i })}
                      style={{ ...DARK_SELECT, flexShrink: 0, width: 52, textAlign: 'center' }}
                    >
                      {CONDITION_OPERATORS.map(op => (
                        <option key={op} value={op}>
                          {op}
                        </option>
                      ))}
                    </select>
                    <select
                      value={c.rightPath ?? ''}
                      onChange={e => dispatch({ type: 'SET_JOIN_FIELD', index: joinIndex, side: 'right', path: e.target.value, condIndex: i })}
                      style={{ ...DARK_SELECT, flex: 1, minWidth: 0 }}
                      title={selectedLeft ? t(locale, 'structureJoinFieldTypeMismatchHint') : t(locale, 'structureJoinFieldTarget')}
                    >
                      <option value="">—</option>
                      {rightFields.map(f => (
                        <option key={f.name} value={f.name} disabled={!!selectedLeft && !fieldsTypeCompatible(selectedLeft, f)}>
                          {rightLabel}.{f.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </React.Fragment>
          );
        })}
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

      <div style={{ marginTop: 4, paddingTop: 10, borderTop: `1px solid ${TOKENS.borderSubtle}` }}>
        <button
          type="button"
          style={DESTRUCTIVE_LINK}
          onClick={() => {
            dispatch({ type: 'REMOVE_JOIN', index: joinIndex });
            onRemoved();
          }}
        >
          <span className="codicon codicon-trash" style={{ fontSize: 13 }} />
          {t(locale, 'structureRemoveJoin')}
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
              width={width}
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
