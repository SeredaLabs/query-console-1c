import * as React from 'react';
import { defaultTableAlias, type FieldRef } from '../../core/query/queryModel';
import type { SupportedLocale } from '../../shared/locale';
import { allTables, type QueryAction, type QueryState } from '../../webview/state/queryStore';
import { t } from '../i18n';
import { CARD, SECTION_LABEL, TOKENS } from '../theme';

/**
 * Phase 9 — Grouping Workspace. Той самий грід-патерн, що й Fields/
 * Conditions, але навмисно МІНІМАЛЬНИЙ: лише список `grouping.groupFields`
 * (ADD_GROUP_FIELD/REMOVE_GROUP_FIELD) — без properties-панелі чи
 * expression-бару, бо `FieldRef` тут не має нічого іншого редагованого
 * (design review 2026-09-19, явний вибір користувача — v1 scope).
 *
 * Свідомо НЕ включено (задокументовано, не забуто):
 * - `grouping.aggregates` (окремий legacy/Classic-механізм призначення
 *   агрегатних функцій, паралельний `SelectedField.func`, що вже керується
 *   Fields tab'ом) — дублювання тут створило б два місця для одного й того
 *   ж поняття й ризик розсинхрону. Агрегати лишаються ЛИШЕ у Fields tab.
 * - "Групуючі набори" (`grouping.multiple`/`groupSets`, Classic
 *   GroupingTab.tsx) — рідкісна/просунута можливість, окремий scope пізніше.
 * - HAVING (`model.having`) — генератор його рендерить (`renderHaving`), але
 *   РЕДЮСЕР не має жодного ADD_HAVING/SET_HAVING_* action; додавання такого
 *   UI вимагало б нових reducer actions (нова domain capability), що
 *   виходить за межі "переюзати наявне" — свідомо поза цим проходом.
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

const PANEL_INPUT: React.CSSProperties = {
  fontSize: 12,
  padding: '4px 7px',
  border: `1px solid ${TOKENS.border}`,
  borderRadius: 4,
  background: 'transparent',
  color: TOKENS.text,
  width: '100%',
};

function refLabel(ref: FieldRef, tableLabelOf: (tableId: string) => string): string {
  if (ref.expression !== undefined) return ref.expression;
  return `${tableLabelOf(ref.tableId)}.${ref.path}`;
}

function refMatchesQuery(ref: FieldRef, tableLabelOf: (tableId: string) => string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return refLabel(ref, tableLabelOf).toLowerCase().includes(q);
}

export function GroupingWorkspace({
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
  const [addOpen, setAddOpen] = React.useState(false);
  const [addQuery, setAddQuery] = React.useState('');

  const tableLabelOf = React.useCallback(
    (tableId: string) => {
      const tb = state.selectedTables.find(t2 => t2.id === tableId);
      return tb ? defaultTableAlias(tb) : tableId;
    },
    [state.selectedTables]
  );

  const groupFields = state.grouping.groupFields;
  const isSearching = query.trim().length > 0;
  const visible = groupFields
    .map((ref, idx) => ({ ref, idx }))
    .filter(({ ref }) => refMatchesQuery(ref, tableLabelOf, query));

  // "+ Групування": прості поля доданих джерел, яких ще нема в groupFields —
  // той самий ADD_GROUP_FIELD, що й auto-population з Fields tab. Довільні
  // вирази тут НЕ пропонуються — немає reducer action, що створював би
  // expression-based FieldRef напряму (лише SET_FIELD_FUNC це робить, як
  // побічний ефект призначення агрегату на Fields tab).
  const addableFields = React.useMemo(() => {
    const out: { tableId: string; path: string; label: string }[] = [];
    for (const tb of state.selectedTables) {
      const meta = allTables(state).find(m => m.fullName === tb.fullName);
      if (!meta) continue;
      const alias = defaultTableAlias(tb);
      for (const f of meta.fields) {
        const already = groupFields.some(g => g.tableId === tb.id && g.path === f.name);
        if (!already) out.push({ tableId: tb.id, path: f.name, label: `${alias}.${f.name}` });
      }
    }
    const q = addQuery.trim().toLowerCase();
    return q ? out.filter(f => f.label.toLowerCase().includes(q)) : out;
  }, [state, groupFields, addQuery]);

  function toggleChecked(idx: number): void {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  // REMOVE_GROUP_FIELD адресує елемент за (tableId,path) — для
  // expression-based записів (tableId==='', path==='') це видалило б УСІ
  // такі записи одночасно (реальне обмеження reducer'а, не баг тут), тому
  // remove доступний лише для простих (не-expression) рядків.
  function handleRemoveChecked(): void {
    const targets = checked.size > 0 ? [...checked] : [];
    for (const idx of targets) {
      const ref = groupFields[idx];
      if (!ref || ref.expression !== undefined) continue;
      dispatch({ type: 'REMOVE_GROUP_FIELD', tableId: ref.tableId, path: ref.path });
    }
    setChecked(new Set());
  }

  const removableChecked = [...checked].some(idx => groupFields[idx] && groupFields[idx].expression === undefined);

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
            {t(locale, 'groupingWorkspaceAddField')}
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
                    placeholder={t(locale, 'groupingWorkspaceSearchPlaceholder')}
                    style={PANEL_INPUT}
                  />
                </div>
                {addableFields.length === 0 ? (
                  <div style={{ padding: '8px 10px', fontSize: 12, color: TOKENS.textMuted }}>
                    {t(locale, 'groupingWorkspaceAddFieldEmpty')}
                  </div>
                ) : (
                  addableFields.map(f => (
                    <div
                      key={`${f.tableId}.${f.path}`}
                      onClick={() => {
                        dispatch({ type: 'ADD_GROUP_FIELD', tableId: f.tableId, path: f.path });
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

        <button
          type="button"
          onClick={handleRemoveChecked}
          disabled={!removableChecked}
          title={checked.size > 0 && !removableChecked ? t(locale, 'groupingWorkspaceExpressionNotRemovable') : undefined}
          style={{ ...BTN, flexShrink: 0, ...(!removableChecked ? BTN_DISABLED : {}) }}
        >
          <span className="codicon codicon-trash" style={{ fontSize: 14 }} />
          {t(locale, 'groupingWorkspaceRemove')}
        </button>

        <span style={{ flex: '1 0 8px' }} />
        {groupFields.length > 0 && (
          <div style={SEARCH_BOX}>
            <span className="codicon codicon-search" style={{ fontSize: 12, opacity: 0.6, flexShrink: 0 }} />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={t(locale, 'groupingWorkspaceSearchPlaceholder')}
              style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: 'var(--vscode-input-foreground)', fontSize: 12 }}
            />
          </div>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', padding: 10 }}>
        <div style={{ ...CARD, flex: '1 1 auto', minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '10px 10px 6px', flexShrink: 0 }}>
            <span style={SECTION_LABEL}>
              {t(locale, 'groupingWorkspaceTitle')}
              {groupFields.length > 0 && <span style={{ color: TOKENS.textMuted, fontWeight: 400 }}> · {groupFields.length}</span>}
            </span>
          </div>
          <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'auto', padding: '0 10px 10px' }}>
            {groupFields.length === 0 ? (
              <div style={{ textAlign: 'center', maxWidth: 320, margin: '24px auto 0' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: TOKENS.textSecondary, marginBottom: 4 }}>
                  {t(locale, 'groupingWorkspaceEmptyTitle')}
                </div>
                <div style={{ fontSize: 12, color: TOKENS.textMuted, marginBottom: 12 }}>{t(locale, 'groupingWorkspaceEmptySubtitle')}</div>
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
              <div style={{ padding: '20px 8px', textAlign: 'center', color: TOKENS.textMuted, fontSize: 12 }}>{t(locale, 'groupingWorkspaceSearchNoResults')}</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: 24 }} />
                  <col style={{ width: 24 }} />
                  <col />
                  <col style={{ width: 90 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th style={TH} />
                    <th style={{ ...TH, textAlign: 'right' }}>#</th>
                    <th style={TH}>{t(locale, 'groupingWorkspaceColField')}</th>
                    <th style={TH} />
                  </tr>
                </thead>
                <tbody>
                  {visible.map(({ ref, idx }) => {
                    const isExpr = ref.expression !== undefined;
                    const label = refLabel(ref, tableLabelOf);
                    return (
                      <tr key={idx}>
                        <td style={TD}>
                          <input
                            type="checkbox"
                            checked={checked.has(idx)}
                            disabled={isExpr}
                            title={isExpr ? t(locale, 'groupingWorkspaceExpressionNotRemovable') : undefined}
                            onChange={() => toggleChecked(idx)}
                          />
                        </td>
                        <td style={{ ...TD, textAlign: 'right', color: TOKENS.textSecondary, fontVariantNumeric: 'tabular-nums' }}>{idx + 1}</td>
                        <td style={TD}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                            {isExpr ? (
                              <span className="codicon codicon-symbol-misc" style={{ fontSize: 13, flexShrink: 0, color: TOKENS.chartOrange }} title={t(locale, 'groupingWorkspaceExpressionBadge')} />
                            ) : (
                              <span className="codicon codicon-symbol-field" style={{ fontSize: 13, flexShrink: 0, color: TOKENS.textSecondary }} />
                            )}
                            <span
                              title={label}
                              style={{
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                fontFamily: isExpr ? 'var(--vscode-editor-font-family, monospace)' : undefined,
                              }}
                            >
                              {label}
                            </span>
                          </div>
                        </td>
                        <td style={TD}>
                          {!isExpr && (
                            <button
                              type="button"
                              title={t(locale, 'groupingWorkspaceRemove')}
                              onClick={() => dispatch({ type: 'REMOVE_GROUP_FIELD', tableId: ref.tableId, path: ref.path })}
                              style={{ border: 'none', background: 'transparent', color: TOKENS.textMuted, cursor: 'pointer', fontSize: 13, padding: '2px 4px' }}
                            >
                              <span className="codicon codicon-close" />
                            </button>
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
                {visible.length} / {groupFields.length}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
