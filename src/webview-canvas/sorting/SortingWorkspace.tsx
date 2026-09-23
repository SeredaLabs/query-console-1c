import * as React from 'react';
import { defaultTableAlias, type SortDirection } from '../../core/query/queryModel';
import type { SupportedLocale } from '../../shared/locale';
import type { QueryAction, QueryState } from '../../webview/state/queryStore';
import { t } from '../i18n';
import { CARD, SECTION_LABEL, TOKENS } from '../theme';
import { distinctFieldRefs } from '../../webview/fieldSource';

/**
 * Phase 10 — Sorting Workspace. Той самий мінімальний грід-патерн, що й
 * Grouping (Phase 9): список `state.order.fields` (ADD_ORDER_FIELD/
 * REMOVE_ORDER_FIELD/SET_ORDER_DIRECTION) + "Автоупорядочивание"
 * (SET_ORDER_AUTO) — жодних нових reducer actions.
 *
 * Кандидати для "+ Сортування" — ЛИШЕ прості (не-expression) поля з уже
 * вибраного SELECT-списку (`state.selectedFields`), той самий обсяг, що й
 * Classic OrderTab.tsx (`distinctFieldRefs(selectedFields)`), а НЕ всі поля
 * джерел (як у Grouping/Conditions) — `OrderField` адресує лише
 * (tableId,path)/selectAlias/літеральний `&Параметр`, без довільних
 * виразів, тож сортування за полем, якого немає в SELECT, взагалі
 * непредставиме без alias. Це та сама причина, чому Fields tab свідомо не
 * додав "Сортування"-колонку (задокументовано в FieldsWorkspace.tsx).
 *
 * Свідомо НЕ включено: reorder/пріоритет сортування — `MOVE_ORDER_FIELD`
 * НЕ існує в reducer'і (на відміну від Fields' MOVE_FIELD), і Classic
 * OrderTab.tsx теж не має reorder UI (пріоритет — порядок додавання) —
 * це не regression, а збіг з уже наявною поведінкою.
 */

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

export function SortingWorkspace({
  locale,
  state,
  dispatch,
  onGoToFields,
}: {
  locale: SupportedLocale;
  state: QueryState;
  dispatch: React.Dispatch<QueryAction>;
  onGoToFields?: () => void;
}): React.ReactElement {
  const [query, setQuery] = React.useState('');
  const [addOpen, setAddOpen] = React.useState(false);
  const [addQuery, setAddQuery] = React.useState('');

  const tableLabelOf = React.useCallback(
    (tableId: string) => {
      const tb = state.selectedTables.find(t2 => t2.id === tableId);
      return tb ? defaultTableAlias(tb) : tableId;
    },
    [state.selectedTables]
  );

  const orderFields = state.order.fields;
  const isSearching = query.trim().length > 0;
  const visible = orderFields
    .map((f, idx) => ({ f, idx }))
    .filter(({ f }) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return `${tableLabelOf(f.tableId)}.${f.path}`.toLowerCase().includes(q);
    });

  // "+ Сортування": лише прості (не-expression) поля, що ВЖЕ у SELECT —
  // той самий обсяг і та сама функція, що Classic OrderTab.tsx (distinctFieldRefs), бо
  // OrderField не вміє адресувати довільний вираз/поле поза SELECT.
  const addableFields = React.useMemo(() => {
    const out: { tableId: string; path: string; label: string }[] = [];
    for (const sf of distinctFieldRefs(state.selectedFields)) {
      const already = orderFields.some(o => o.tableId === sf.tableId && o.path === sf.path);
      if (already) continue;
      out.push({ tableId: sf.tableId, path: sf.path, label: `${tableLabelOf(sf.tableId)}.${sf.path}` });
    }
    const q = addQuery.trim().toLowerCase();
    return q ? out.filter(f => f.label.toLowerCase().includes(q)) : out;
  }, [state.selectedFields, orderFields, tableLabelOf, addQuery]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0, minHeight: 0 }}>
      <div style={BAR_STYLE}>
        <span style={{ position: 'relative', flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setAddOpen(v => !v)}
            disabled={addableFields.length === 0 && !addOpen}
            style={{ ...BTN, flexShrink: 0, ...(addableFields.length === 0 && !addOpen ? BTN_DISABLED : {}) }}
          >
            <span className="codicon codicon-add" style={{ fontSize: 14 }} />
            {t(locale, 'sortingWorkspaceAddField')}
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
                    placeholder={t(locale, 'sortingWorkspaceSearchPlaceholder')}
                    style={PANEL_INPUT}
                  />
                </div>
                {addableFields.length === 0 ? (
                  <div style={{ padding: '8px 10px', fontSize: 12, color: TOKENS.textMuted }}>
                    {t(locale, 'sortingWorkspaceAddFieldEmpty')}
                  </div>
                ) : (
                  addableFields.map(f => (
                    <div
                      key={`${f.tableId}.${f.path}`}
                      onClick={() => {
                        dispatch({ type: 'ADD_ORDER_FIELD', tableId: f.tableId, path: f.path });
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

        <span style={{ width: 1, height: 18, background: TOKENS.border, margin: '0 2px', flexShrink: 0 }} />

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: TOKENS.textSecondary, cursor: 'pointer', flexShrink: 0 }}>
          <input type="checkbox" checked={state.order.auto} onChange={e => dispatch({ type: 'SET_ORDER_AUTO', auto: e.target.checked })} />
          {t(locale, 'sortingWorkspaceAutoOrder')}
        </label>

        <span style={{ flex: '1 0 8px' }} />
        {orderFields.length > 0 && (
          <div style={SEARCH_BOX}>
            <span className="codicon codicon-search" style={{ fontSize: 12, opacity: 0.6, flexShrink: 0 }} />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={t(locale, 'sortingWorkspaceSearchPlaceholder')}
              style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: 'var(--vscode-input-foreground)', fontSize: 12 }}
            />
          </div>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', padding: 10 }}>
        <div style={{ ...CARD, flex: '1 1 auto', minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '10px 10px 6px', flexShrink: 0 }}>
            <span style={SECTION_LABEL}>
              {t(locale, 'sortingWorkspaceTitle')}
              {orderFields.length > 0 && <span style={{ color: TOKENS.textMuted, fontWeight: 400 }}> · {orderFields.length}</span>}
            </span>
          </div>
          <div
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: 0,
              overflow: 'auto',
              padding: '0 10px 10px',
              ...(orderFields.length === 0 ? { display: 'flex', alignItems: 'center', justifyContent: 'center' } : null),
            }}
          >
            {orderFields.length === 0 ? (
              <div style={{ textAlign: 'center', maxWidth: 320 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: TOKENS.textSecondary, marginBottom: 4 }}>
                  {t(locale, 'sortingWorkspaceEmptyTitle')}
                </div>
                <div style={{ fontSize: 12, color: TOKENS.textMuted, marginBottom: 12 }}>{t(locale, 'sortingWorkspaceEmptySubtitle')}</div>
                {onGoToFields && state.selectedFields.length === 0 && (
                  <button
                    type="button"
                    onClick={onGoToFields}
                    style={{ padding: '5px 12px', fontSize: 12, border: `1px solid ${TOKENS.border}`, borderRadius: 4, background: 'transparent', color: TOKENS.text, cursor: 'pointer' }}
                  >
                    {t(locale, 'sortingWorkspaceEmptyButton')}
                  </button>
                )}
              </div>
            ) : visible.length === 0 ? (
              <div style={{ padding: '20px 8px', textAlign: 'center', color: TOKENS.textMuted, fontSize: 12 }}>{t(locale, 'sortingWorkspaceSearchNoResults')}</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: 24 }} />
                  <col />
                  <col style={{ width: 110 }} />
                  <col style={{ width: 32 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th style={{ ...TH, textAlign: 'right' }}>#</th>
                    <th style={TH}>{t(locale, 'sortingWorkspaceColField')}</th>
                    <th style={TH}>{t(locale, 'sortingWorkspaceColDirection')}</th>
                    <th style={TH} />
                  </tr>
                </thead>
                <tbody>
                  {visible.map(({ f, idx }) => (
                    <tr key={idx}>
                      <td style={{ ...TD, textAlign: 'right', color: TOKENS.textSecondary, fontVariantNumeric: 'tabular-nums' }}>{idx + 1}</td>
                      <td style={TD}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                          <span className="codicon codicon-symbol-field" style={{ fontSize: 13, flexShrink: 0, color: TOKENS.textSecondary }} />
                          <span title={`${tableLabelOf(f.tableId)}.${f.path}`} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {tableLabelOf(f.tableId)}.{f.path}
                          </span>
                        </div>
                      </td>
                      <td style={TD}>
                        <select
                          value={f.direction}
                          onChange={e => dispatch({ type: 'SET_ORDER_DIRECTION', tableId: f.tableId, path: f.path, direction: e.target.value as SortDirection })}
                          style={CELL_INPUT}
                        >
                          <option value="asc">{t(locale, 'sortingWorkspaceDirectionAsc')}</option>
                          <option value="desc">{t(locale, 'sortingWorkspaceDirectionDesc')}</option>
                        </select>
                      </td>
                      <td style={TD}>
                        <button
                          type="button"
                          title={t(locale, 'sortingWorkspaceRemove')}
                          onClick={() => dispatch({ type: 'REMOVE_ORDER_FIELD', tableId: f.tableId, path: f.path })}
                          style={{ border: 'none', background: 'transparent', color: TOKENS.textMuted, cursor: 'pointer', fontSize: 13, padding: '2px 4px' }}
                        >
                          <span className="codicon codicon-close" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {isSearching && visible.length > 0 && (
              <div style={{ padding: '6px 2px', fontSize: 11, color: TOKENS.textMuted, textAlign: 'center' }}>
                {visible.length} / {orderFields.length}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
