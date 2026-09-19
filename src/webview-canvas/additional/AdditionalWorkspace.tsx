import * as React from 'react';
import type { SupportedLocale } from '../../shared/locale';
import type { QueryAction, QueryState } from '../../webview/state/queryStore';
import { t } from '../i18n';
import { CARD, SECTION_LABEL, TOKENS } from '../theme';

/**
 * Phase 11 — Additional Workspace, остання вкладка з New Builder roadmap.
 * Порт ЛИШЕ двох із чотирьох секцій Classic `AdditionalTab.tsx` (explicit
 * scope decision користувача, 2026-09-19):
 * - "Вибірка записів" — ПЕРВЫЕ N/РАЗЛИЧНЫЕ/РАЗРЕШЕННЫЕ
 *   (SET_SELECTION_TOP/SET_SELECTION_DISTINCT/SET_SELECTION_ALLOWED);
 * - "Блокування" — ДЛЯ ИЗМЕНЕНИЯ (SET_LOCK_ENABLED/ADD_LOCK_TABLE/
 *   REMOVE_LOCK_TABLE, `state.lockForUpdate: string[]` адресує таблиці за
 *   `fullName`, НЕ за `id`).
 *
 * Свідомо НЕ включено:
 * - "Тип запиту" (`QueryType`: createTemp/appendTemp/dropTemp + тимчасова
 *   таблиця) — це ВЖЕ окремо зарезервовано в roadmap як Phase 13
 *   ("manual temp table / subquery-as-source... окремий implementation
 *   gate перед стартом") — реалізація тут обійшла б це рішення;
 * - "Кеш метаданих" (refresh-button + preserveComments) — Classic-
 *   специфічний host-round-trip механізм (`postToHost` cache-invalidation),
 *   без явного архітектурного еквівалента в New Builder, що вже
 *   генерує SDBL повністю client-side (`computeBatchTextSafe`).
 *
 * Немає грід-патерну (на відміну від Fields/Conditions/Grouping/Sorting) —
 * це форма налаштувань, не список record'ів.
 */

const PANEL_INPUT: React.CSSProperties = {
  fontSize: 12,
  padding: '4px 7px',
  border: `1px solid ${TOKENS.border}`,
  borderRadius: 4,
  background: 'transparent',
  color: TOKENS.text,
  width: 80,
};

const CHECK_ROW: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 12,
  color: TOKENS.textSecondary,
  cursor: 'pointer',
};

export function AdditionalWorkspace({
  locale,
  state,
  dispatch,
}: {
  locale: SupportedLocale;
  state: QueryState;
  dispatch: React.Dispatch<QueryAction>;
}): React.ReactElement {
  const hasTop = state.selection.top !== undefined;

  return (
    <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ ...CARD, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
        <span style={SECTION_LABEL}>{t(locale, 'additionalWorkspaceSelectionTitle')}</span>

        <label style={CHECK_ROW}>
          <input
            type="checkbox"
            checked={hasTop}
            onChange={e => dispatch({ type: 'SET_SELECTION_TOP', top: e.target.checked ? 10 : undefined })}
          />
          {t(locale, 'additionalWorkspaceTopLabel')}
          <input
            type="number"
            min={1}
            disabled={!hasTop}
            value={state.selection.top ?? 10}
            onChange={e => {
              const n = parseInt(e.target.value, 10);
              dispatch({ type: 'SET_SELECTION_TOP', top: Number.isFinite(n) && n > 0 ? n : undefined });
            }}
            style={{ ...PANEL_INPUT, opacity: hasTop ? 1 : 0.5 }}
          />
        </label>

        <label style={CHECK_ROW}>
          <input
            type="checkbox"
            checked={state.selection.distinct ?? false}
            onChange={e => dispatch({ type: 'SET_SELECTION_DISTINCT', distinct: e.target.checked })}
          />
          {t(locale, 'additionalWorkspaceDistinctLabel')}
        </label>

        <label style={CHECK_ROW}>
          <input
            type="checkbox"
            checked={state.selection.allowed ?? false}
            onChange={e => dispatch({ type: 'SET_SELECTION_ALLOWED', allowed: e.target.checked })}
          />
          {t(locale, 'additionalWorkspaceAllowedLabel')}
        </label>
      </div>

      <div style={{ ...CARD, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
        <span style={SECTION_LABEL}>{t(locale, 'additionalWorkspaceLockTitle')}</span>

        <label style={CHECK_ROW}>
          <input type="checkbox" checked={state.lockEnabled} onChange={e => dispatch({ type: 'SET_LOCK_ENABLED', enabled: e.target.checked })} />
          {t(locale, 'additionalWorkspaceLockEnabledLabel')}
        </label>

        {state.lockEnabled && (
          state.selectedTables.length === 0 ? (
            <div style={{ fontSize: 12, color: TOKENS.textMuted }}>{t(locale, 'additionalWorkspaceLockNoSources')}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 24 }}>
              {state.selectedTables.map(tb => {
                const checked = state.lockForUpdate.includes(tb.fullName);
                return (
                  <label key={tb.id} style={CHECK_ROW}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={e => {
                        if (e.target.checked) dispatch({ type: 'ADD_LOCK_TABLE', fullName: tb.fullName });
                        else dispatch({ type: 'REMOVE_LOCK_TABLE', fullName: tb.fullName });
                      }}
                    />
                    {tb.fullName}
                  </label>
                );
              })}
            </div>
          )
        )}

        <div style={{ fontSize: 11, color: TOKENS.textMuted, lineHeight: 1.5, borderTop: `1px solid ${TOKENS.borderSubtle}`, paddingTop: 8 }}>
          {t(locale, 'additionalWorkspaceLockHint')}
        </div>
      </div>
    </div>
  );
}
