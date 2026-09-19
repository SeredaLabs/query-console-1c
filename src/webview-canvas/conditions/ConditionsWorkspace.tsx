import * as React from 'react';
import type { MetaField, MetaTable } from '../../core/metadata/types';
import { describeFieldTypes } from '../../core/metadata/describeType';
import { isStructurallyValidExpression } from '../../core/query/expressionSyntaxCheck';
import type { Condition, ConditionOperator } from '../../core/query/queryModel';
import { defaultTableAlias } from '../../core/query/queryModel';
import type { SupportedLocale } from '../../shared/locale';
import { allTables, type QueryAction, type QueryState } from '../../webview/state/queryStore';
import { t } from '../i18n';
import { CARD, SECTION_LABEL, TOKENS } from '../theme';

/**
 * Phase 8 — Conditions Workspace. Той самий грід-патерн, що й Fields
 * (Phase 7): таблиця ВЖЕ доданих WHERE-умов (`state.conditions`), клік по
 * рядку → "Властивості умови" праворуч + "Вираз умови" знизу (editable
 * лише коли custom). Жодних нових reducer actions — лише ADD_CONDITION/
 * REMOVE_CONDITION/SET_CONDITION_CUSTOM/SET_CONDITION_OPERATOR/
 * SET_CONDITION_PARAM/SET_CONDITION_EXPRESSION, що вже підтримувались
 * (Classic ConditionsTab.tsx use той самий набір).
 *
 * Модель — ПЛОСКИЙ список (`Condition[]`), а не дерево AND/OR/NOT: генератор
 * (`buildConditionStrings`/`renderConditions`) з'єднує елементи неявним "І"
 * (AND). Немає reducer action для створення `subquery`/`hierarchy`/`negated`
 * умов — ці поля заповнюються лише парсингом існуючого SDBL, тому UI їх не
 * створює (лише показує/редагує, якщо вони вже є в моделі — тут не
 * зустрічаються, бо New Builder не підтягує існуючий запит, див. STOP-нотатку
 * в new_builder_current_state.md).
 */

const OPERATORS: ConditionOperator[] = ['=', '<>', '>', '>=', '<', '<=', 'В', 'МЕЖДУ', 'ПОДОБНО'];

const BAR_STYLE: React.CSSProperties = {
  height: 36,
  minHeight: 36,
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '0 8px',
  borderBottom: `1px solid ${TOKENS.border}`,
  position: 'relative',
};

const BTN: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: TOKENS.text,
  cursor: 'pointer',
  fontSize: 12,
  padding: '4px 8px',
  borderRadius: 4,
  display: 'flex',
  alignItems: 'center',
  gap: 5,
};

const BTN_DISABLED: React.CSSProperties = { opacity: 0.4, cursor: 'not-allowed' };

const SEARCH_BOX: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  height: 26,
  padding: '0 8px',
  background: 'var(--vscode-input-background)',
  border: `1px solid ${TOKENS.border}`,
  borderRadius: 4,
  flex: '0 1 180px',
  minWidth: 80,
};

const TH: React.CSSProperties = {
  textAlign: 'left',
  fontSize: 10.5,
  fontWeight: 700,
  color: TOKENS.textSecondary,
  textTransform: 'uppercase',
  letterSpacing: 0.3,
  padding: '7px 8px',
  background: TOKENS.surface2,
  borderBottom: `1px solid ${TOKENS.border}`,
  whiteSpace: 'nowrap',
};

const TD: React.CSSProperties = {
  padding: '6px 8px',
  fontSize: 12,
  color: TOKENS.text,
  borderBottom: `1px solid ${TOKENS.border}`,
  verticalAlign: 'middle',
};

const CELL_INPUT: React.CSSProperties = {
  fontSize: 12,
  padding: '2px 5px',
  border: `1px solid transparent`,
  borderRadius: 3,
  background: 'transparent',
  color: TOKENS.text,
  width: '100%',
};

const PANEL_INPUT: React.CSSProperties = {
  fontSize: 12,
  padding: '4px 7px',
  border: `1px solid ${TOKENS.border}`,
  borderRadius: 4,
  background: 'transparent',
  color: TOKENS.text,
  width: '100%',
};

function conditionMatchesQuery(cond: Condition, tableLabel: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = `${tableLabel} ${cond.path ?? ''} ${cond.expression ?? ''} ${cond.param ?? ''}`.toLowerCase();
  return haystack.includes(q);
}

export function ConditionsWorkspace({
  locale,
  state,
  dispatch,
  onGoToStructure,
}: {
  locale: SupportedLocale;
  state: QueryState;
  dispatch: React.Dispatch<QueryAction>;
  onGoToStructure?: () => void;
}): React.ReactElement {
  const [query, setQuery] = React.useState('');
  const [checked, setChecked] = React.useState<Set<number>>(new Set());
  const [activeIdx, setActiveIdx] = React.useState<number | null>(null);
  const [addOpen, setAddOpen] = React.useState(false);
  const [addQuery, setAddQuery] = React.useState('');

  const tableLabelOf = React.useCallback(
    (tableId: string | undefined) => {
      const tb = state.selectedTables.find(t2 => t2.id === tableId);
      return tb ? defaultTableAlias(tb) : (tableId ?? '');
    },
    [state.selectedTables]
  );

  const metaFieldOf = React.useCallback(
    (tableId: string | undefined, path: string | undefined): MetaField | undefined => {
      if (!tableId || !path) return undefined;
      const tb = state.selectedTables.find(t2 => t2.id === tableId);
      if (!tb) return undefined;
      const meta = allTables(state).find(m => m.fullName === tb.fullName);
      return meta?.fields.find(f => f.name === path);
    },
    [state]
  );

  const conditions = state.conditions;
  const isSearching = query.trim().length > 0;
  const visible = conditions
    .map((cond, idx) => ({ cond, idx }))
    .filter(({ cond }) => conditionMatchesQuery(cond, tableLabelOf(cond.tableId), query));

  React.useEffect(() => {
    if (conditions.length === 0) {
      if (activeIdx !== null) setActiveIdx(null);
      return;
    }
    if (activeIdx === null || activeIdx >= conditions.length) {
      setActiveIdx(Math.min(activeIdx ?? 0, conditions.length - 1));
    }
  }, [conditions.length, activeIdx]);

  const active = activeIdx !== null ? conditions[activeIdx] : undefined;

  // "+ Умова": усі поля доданих джерел — на відміну від Fields, дублі
  // дозволені (одне й те саме поле може мати кілька умов, напр. МЕЖДУ
  // двома окремими рядками), тому без exclude-фільтра.
  const addableFields = React.useMemo(() => {
    const out: { tableId: string; path: string; label: string }[] = [];
    for (const tb of state.selectedTables) {
      const meta = allTables(state).find((m: MetaTable) => m.fullName === tb.fullName);
      if (!meta) continue;
      const alias = defaultTableAlias(tb);
      for (const f of meta.fields) out.push({ tableId: tb.id, path: f.name, label: `${alias}.${f.name}` });
    }
    const q = addQuery.trim().toLowerCase();
    return q ? out.filter(f => f.label.toLowerCase().includes(q)) : out;
  }, [state, addQuery]);

  function toggleChecked(idx: number): void {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function handleRemoveChecked(): void {
    const targets = (checked.size > 0 ? [...checked] : activeIdx !== null ? [activeIdx] : []).sort((a, b) => b - a);
    for (const idx of targets) dispatch({ type: 'REMOVE_CONDITION', index: idx });
    setChecked(new Set());
    setActiveIdx(null);
  }

  const hasBulkTarget = checked.size > 0 || activeIdx !== null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0, minHeight: 0 }}>
      <div style={BAR_STYLE}>
        <span style={{ position: 'relative', flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setAddOpen(v => !v)}
            disabled={state.selectedTables.length === 0}
            style={{ ...BTN, flexShrink: 0, ...(state.selectedTables.length === 0 ? BTN_DISABLED : {}) }}
          >
            <span className="codicon codicon-add" style={{ fontSize: 14 }} />
            {t(locale, 'conditionsWorkspaceAddCondition')}
          </button>
          {addOpen && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 10 }} onClick={() => setAddOpen(false)} />
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: 4,
                  zIndex: 11,
                  width: 260,
                  maxHeight: 320,
                  overflowY: 'auto',
                  borderRadius: 6,
                  border: `1px solid ${TOKENS.border}`,
                  background: TOKENS.surface1,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                }}
                onClick={e => e.stopPropagation()}
              >
                <div style={{ padding: 8 }}>
                  <input
                    autoFocus
                    type="text"
                    value={addQuery}
                    onChange={e => setAddQuery(e.target.value)}
                    placeholder={t(locale, 'conditionsWorkspaceSearchPlaceholder')}
                    style={PANEL_INPUT}
                  />
                </div>
                {addableFields.length === 0 ? (
                  <div style={{ padding: '8px 10px', fontSize: 12, color: TOKENS.textMuted }}>
                    {t(locale, 'conditionsWorkspaceAddConditionEmpty')}
                  </div>
                ) : (
                  addableFields.map((f, i) => (
                    <div
                      key={`${f.tableId}.${f.path}.${i}`}
                      onClick={() => {
                        dispatch({ type: 'ADD_CONDITION', tableId: f.tableId, path: f.path });
                        setActiveIdx(conditions.length);
                        setAddOpen(false);
                      }}
                      style={{ padding: '5px 10px', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: TOKENS.textSecondary }}
                      onMouseEnter={e => (e.currentTarget.style.background = TOKENS.surfaceHover)}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <span className="codicon codicon-symbol-field" style={{ fontSize: 12, opacity: 0.75, flexShrink: 0 }} />
                      {f.label}
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </span>

        <button type="button" onClick={handleRemoveChecked} disabled={!hasBulkTarget} style={{ ...BTN, flexShrink: 0, ...(!hasBulkTarget ? BTN_DISABLED : {}) }}>
          <span className="codicon codicon-trash" style={{ fontSize: 14 }} />
          {t(locale, 'conditionsWorkspaceRemove')}
        </button>

        <span style={{ flex: '1 0 8px' }} />
        {conditions.length > 0 && (
          <div style={SEARCH_BOX}>
            <span className="codicon codicon-search" style={{ fontSize: 12, opacity: 0.6, flexShrink: 0 }} />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={t(locale, 'conditionsWorkspaceSearchPlaceholder')}
              style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: 'var(--vscode-input-foreground)', fontSize: 12 }}
            />
          </div>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', gap: 4, padding: 10 }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
          <div style={{ ...CARD, flex: '1 1 auto', minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '10px 10px 6px', flexShrink: 0 }}>
              <span style={SECTION_LABEL}>
                {t(locale, 'conditionsWorkspaceTitle')}
                {conditions.length > 0 && <span style={{ color: TOKENS.textMuted, fontWeight: 400 }}> · {conditions.length}</span>}
              </span>
            </div>
            <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'auto', padding: '0 10px 10px' }}>
              {conditions.length === 0 ? (
                <div style={{ textAlign: 'center', maxWidth: 280, margin: '24px auto 0' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: TOKENS.textSecondary, marginBottom: 4 }}>
                    {t(locale, 'conditionsWorkspaceEmptyTitle')}
                  </div>
                  <div style={{ fontSize: 12, color: TOKENS.textMuted, marginBottom: 12 }}>{t(locale, 'conditionsWorkspaceEmptySubtitle')}</div>
                  {onGoToStructure && state.selectedTables.length === 0 && (
                    <button
                      type="button"
                      onClick={onGoToStructure}
                      style={{ padding: '5px 12px', fontSize: 12, border: `1px solid ${TOKENS.border}`, borderRadius: 4, background: 'transparent', color: TOKENS.text, cursor: 'pointer' }}
                    >
                      {t(locale, 'fieldsWorkspaceEmptyButton')}
                    </button>
                  )}
                </div>
              ) : visible.length === 0 ? (
                <div style={{ padding: '20px 8px', textAlign: 'center', color: TOKENS.textMuted, fontSize: 12 }}>{t(locale, 'conditionsWorkspaceSearchNoResults')}</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: 24 }} />
                    <col style={{ width: 24 }} />
                    <col />
                    <col style={{ width: 90 }} />
                    <col style={{ width: 130 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th style={TH} />
                      <th style={{ ...TH, textAlign: 'right' }}>#</th>
                      <th style={TH}>{t(locale, 'conditionsWorkspaceColExpression')}</th>
                      <th style={TH}>{t(locale, 'conditionsWorkspaceColOperator')}</th>
                      <th style={TH}>{t(locale, 'conditionsWorkspaceColValue')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map(({ cond, idx }) => {
                      const isActive = activeIdx === idx;
                      const display = cond.custom ? cond.expression || '' : `${tableLabelOf(cond.tableId)}.${cond.path ?? ''}`;
                      return (
                        <tr
                          key={idx}
                          onClick={() => setActiveIdx(idx)}
                          style={{
                            cursor: 'pointer',
                            background: isActive ? `color-mix(in srgb, ${TOKENS.accent} 16%, transparent)` : 'transparent',
                            boxShadow: isActive ? `inset 3px 0 0 ${TOKENS.accent}` : undefined,
                          }}
                          onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = TOKENS.surfaceHover; }}
                          onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                        >
                          <td style={TD}>
                            <input type="checkbox" checked={checked.has(idx)} onClick={e => e.stopPropagation()} onChange={() => toggleChecked(idx)} />
                          </td>
                          <td style={{ ...TD, textAlign: 'right', color: TOKENS.textSecondary, fontVariantNumeric: 'tabular-nums' }}>{idx + 1}</td>
                          <td style={TD}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                              {cond.custom ? (
                                <span className="codicon codicon-symbol-misc" style={{ fontSize: 13, flexShrink: 0, color: TOKENS.chartOrange }} title={t(locale, 'conditionsWorkspaceExpressionBadge')} />
                              ) : (
                                <span className="codicon codicon-symbol-field" style={{ fontSize: 13, flexShrink: 0, color: TOKENS.textSecondary }} />
                              )}
                              <span
                                title={display || undefined}
                                style={{
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  fontFamily: cond.custom ? 'var(--vscode-editor-font-family, monospace)' : undefined,
                                  color: cond.custom && !cond.expression ? TOKENS.textMuted : TOKENS.text,
                                }}
                              >
                                {display || t(locale, 'conditionsWorkspaceExpressionPlaceholder')}
                              </span>
                            </div>
                          </td>
                          <td style={TD}>
                            {cond.custom ? (
                              <span style={{ color: TOKENS.textMuted }}>—</span>
                            ) : (
                              <select
                                value={cond.operator ?? '='}
                                onClick={e => e.stopPropagation()}
                                onChange={e => dispatch({ type: 'SET_CONDITION_OPERATOR', index: idx, operator: e.target.value as ConditionOperator })}
                                style={CELL_INPUT}
                              >
                                {OPERATORS.map(op => (
                                  <option key={op} value={op}>
                                    {op}
                                  </option>
                                ))}
                              </select>
                            )}
                          </td>
                          <td style={TD}>
                            {cond.custom ? (
                              <span style={{ color: TOKENS.textMuted }}>—</span>
                            ) : (
                              <input
                                type="text"
                                value={cond.param ?? ''}
                                onClick={e => e.stopPropagation()}
                                onChange={e => dispatch({ type: 'SET_CONDITION_PARAM', index: idx, param: e.target.value })}
                                placeholder={t(locale, 'conditionsWorkspaceParamPlaceholder')}
                                style={CELL_INPUT}
                              />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              {isSearching && visible.length > 0 && (
                <div style={{ padding: '6px 2px', fontSize: 11, color: TOKENS.textMuted, textAlign: 'center' }}>
                  {visible.length} / {conditions.length}
                </div>
              )}
            </div>
          </div>

          {active && (
            <ConditionExpressionBar
              locale={locale}
              dispatch={dispatch}
              condition={active}
              conditionIdx={activeIdx as number}
              tableLabel={tableLabelOf(active.tableId)}
            />
          )}
        </div>

        {active && (
          <ConditionPropertiesPanel
            locale={locale}
            dispatch={dispatch}
            condition={active}
            conditionIdx={activeIdx as number}
            tableLabel={tableLabelOf(active.tableId)}
            typeLabel={(() => {
              const meta = metaFieldOf(active.tableId, active.path);
              return meta ? describeFieldTypes(meta) : '';
            })()}
          />
        )}
      </div>
    </div>
  );
}

/** Нижня панель "Вираз умови" — editable ЛИШЕ для custom-умов (custom===true);
 * для простої умови показує read-only preview "Таблиця.Поле Оператор
 * &Параметр" (той самий "показати, як воно збереться" патерн, що й Fields
 * FieldExpressionBar для plain-полів). */
function ConditionExpressionBar({
  locale,
  dispatch,
  condition,
  conditionIdx,
  tableLabel,
}: {
  locale: SupportedLocale;
  dispatch: React.Dispatch<QueryAction>;
  condition: Condition;
  conditionIdx: number;
  tableLabel: string;
}): React.ReactElement {
  const [checkResult, setCheckResult] = React.useState<boolean | null>(null);
  const value = condition.custom
    ? condition.expression ?? ''
    : `${tableLabel}.${condition.path ?? ''} ${condition.operator ?? '='} ${condition.param ?? ''}`;

  return (
    <div style={{ ...CARD, flexShrink: 0, padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={SECTION_LABEL}>{t(locale, 'conditionsWorkspaceExpressionSectionTitle')}</span>
        {condition.custom && (
          <button
            type="button"
            onClick={() => setCheckResult(isStructurallyValidExpression(value))}
            style={{ border: `1px solid ${TOKENS.border}`, background: 'transparent', color: TOKENS.textSecondary, cursor: 'pointer', fontSize: 11, padding: '3px 8px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <span className="codicon codicon-check" style={{ fontSize: 12 }} />
            {t(locale, 'conditionsWorkspaceValidate')}
          </button>
        )}
      </div>
      <textarea
        value={value}
        disabled={!condition.custom}
        onChange={e => dispatch({ type: 'SET_CONDITION_EXPRESSION', index: conditionIdx, expression: e.target.value })}
        rows={2}
        style={{
          width: '100%',
          resize: 'vertical',
          fontFamily: 'var(--vscode-editor-font-family, monospace)',
          fontSize: 12.5,
          padding: 8,
          border: `1px solid ${TOKENS.border}`,
          borderRadius: 4,
          background: condition.custom ? TOKENS.surface2 : 'transparent',
          color: condition.custom ? TOKENS.text : TOKENS.textMuted,
        }}
      />
      {checkResult !== null && (
        <div style={{ marginTop: 4, fontSize: 11, color: checkResult ? TOKENS.success : TOKENS.danger }}>
          {checkResult ? t(locale, 'conditionsWorkspaceValidationOk') : t(locale, 'conditionsWorkspaceValidationFail')}
        </div>
      )}
    </div>
  );
}

/** Права панель "Властивості умови" — Оператор/Параметр (лише для простої
 * умови) і "Використовувати як довільний вираз" — checkbox-перемикач через
 * ІСНУЮЧИЙ SET_CONDITION_CUSTOM (той самий шлях, що чекбокс "К." у Classic
 * ConditionsTab), без нової domain capability. */
function ConditionPropertiesPanel({
  locale,
  dispatch,
  condition,
  conditionIdx,
  tableLabel,
  typeLabel,
}: {
  locale: SupportedLocale;
  dispatch: React.Dispatch<QueryAction>;
  condition: Condition;
  conditionIdx: number;
  tableLabel: string;
  typeLabel: string;
}): React.ReactElement {
  const isCustom = condition.custom;
  return (
    <div style={{ ...CARD, width: 280, flexShrink: 0, minWidth: 0, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
      <span style={SECTION_LABEL}>{t(locale, 'conditionsWorkspacePropertiesTitle')}</span>

      {!isCustom && (
        <>
          <label style={{ fontSize: 11, color: TOKENS.textMuted, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {tableLabel}.{condition.path ?? ''}
            {typeLabel && <span style={{ ...PANEL_INPUT, color: TOKENS.textMuted, background: TOKENS.surface2 }}>{typeLabel}</span>}
          </label>

          <label style={{ fontSize: 11, color: TOKENS.textMuted, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {t(locale, 'conditionsWorkspaceOperatorLabel')}
            <select
              value={condition.operator ?? '='}
              onChange={e => dispatch({ type: 'SET_CONDITION_OPERATOR', index: conditionIdx, operator: e.target.value as ConditionOperator })}
              style={PANEL_INPUT}
            >
              {OPERATORS.map(op => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
          </label>

          <label style={{ fontSize: 11, color: TOKENS.textMuted, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {t(locale, 'conditionsWorkspaceParamLabel')}
            <input
              type="text"
              value={condition.param ?? ''}
              onChange={e => dispatch({ type: 'SET_CONDITION_PARAM', index: conditionIdx, param: e.target.value })}
              placeholder={t(locale, 'conditionsWorkspaceParamPlaceholder')}
              style={PANEL_INPUT}
            />
          </label>
        </>
      )}

      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: TOKENS.textSecondary, cursor: isCustom ? 'default' : 'pointer' }}>
        <input
          type="checkbox"
          checked={isCustom}
          disabled={isCustom}
          title={isCustom ? t(locale, 'conditionsWorkspaceAlreadyExpression') : undefined}
          onChange={() => {
            if (isCustom) return;
            const expr = `${tableLabel}.${condition.path ?? ''} ${condition.operator ?? '='} ${condition.param ?? ''}`;
            dispatch({ type: 'SET_CONDITION_CUSTOM', index: conditionIdx, custom: true });
            dispatch({ type: 'SET_CONDITION_EXPRESSION', index: conditionIdx, expression: expr });
          }}
        />
        {t(locale, 'conditionsWorkspaceUseAsExpression')}
      </label>

      <div style={{ fontSize: 11, color: TOKENS.textMuted, lineHeight: 1.5, borderTop: `1px solid ${TOKENS.borderSubtle}`, paddingTop: 8 }}>
        {t(locale, 'conditionsWorkspacePropertiesHint')}
      </div>
    </div>
  );
}
