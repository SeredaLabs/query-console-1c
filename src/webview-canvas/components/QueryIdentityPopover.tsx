import * as React from 'react';
import { createPortal } from 'react-dom';
import type { SupportedLocale } from '../../shared/locale';
import {
  availableTempTablesWithOrigin,
  compoundQueryType,
  compoundTempTableName,
  type QueryAction,
  type QueryState,
} from '../../webview/state/queryStore';
import { QUERY_TYPES, VERSION_BADGE } from '../additional/AdditionalWorkspace';
import { t } from '../i18n';
import { SECTION_LABEL, TOKENS } from '../theme';

export interface QueryIdentityAnchor {
  top: number;
  left: number;
}

const RADIO_ROW: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 12,
  color: TOKENS.textSecondary,
  cursor: 'pointer',
};

const PICKER_ROW: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  fontSize: 11.5,
  color: TOKENS.textSecondary,
  cursor: 'pointer',
  padding: '3px 0',
};

const PANEL_INPUT: React.CSSProperties = {
  fontSize: 12,
  padding: '4px 7px',
  border: `1px solid ${TOKENS.border}`,
  borderRadius: 4,
  background: 'transparent',
  color: TOKENS.text,
  width: '100%',
  boxSizing: 'border-box',
};

/**
 * PackageNav Quick Actions (2026-09-20): невеликий anchored popover під
 * clickable current-query identity ("Запит 2 ▾") — той самий домен, що вже
 * керує вкладкою "Додатково" (`compoundQueryType`/`compoundTempTableName`,
 * `SET_QUERY_TYPE`/`SET_TEMP_TABLE_NAME`, `QUERY_TYPES` reused з
 * `AdditionalWorkspace.tsx`), жодних нових reducer actions. Ціль — швидкий
 * шлях зробити активний package-член producer/consumer ВТ БЕЗ переходу на
 * вкладку "Додатково"; "Додатково" лишається canonical editor для всього
 * іншого (ПЕРВЫЕ N/РАЗЛИЧНЫЕ/блокування) — цей popover навмисно НЕ дублює ті
 * секції, лише "Тип запиту" + посилання "Додаткові…" (`onOpenAdditional`,
 * перемикає `WorkspaceTab` в `App.tsx`).
 *
 * append/drop picker — це вже НЕ вигадана логіка: `availableTempTablesWithOrigin`
 * (нова тонка обгортка над вже існуючим lifecycle-aware `availableTempTables`,
 * `snapshots.ts`) повертає ЛИШЕ реально відкриті на поточній позиції ВТ, тому
 * тут неможливо вибрати ВТ, якої на цій позиції немає/ще не існує/вже
 * задропана — коректність success guaranteed самим Phase 12 lifecycle-шаром,
 * а не додатковою валідацією тут.
 */
export function QueryIdentityPopover({
  locale,
  state,
  dispatch,
  anchor,
  onClose,
  onOpenAdditional,
}: {
  locale: SupportedLocale;
  state: QueryState;
  dispatch: React.Dispatch<QueryAction>;
  anchor: QueryIdentityAnchor;
  onClose: () => void;
  onOpenAdditional: () => void;
}): React.ReactElement {
  const queryType = compoundQueryType(state);
  const tempTableName = compoundTempTableName(state);
  const unionActive = state.queryList.length > 1;
  const availableTemps = React.useMemo(() => availableTempTablesWithOrigin(state), [state]);

  return createPortal(
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 1000 }} onClick={onClose} />
      <div
        style={{
          position: 'fixed',
          top: anchor.top,
          left: Math.min(anchor.left, Math.max(8, window.innerWidth - 300)),
          zIndex: 1001,
          width: 280,
          maxHeight: '70vh',
          overflow: 'auto',
          borderRadius: 6,
          border: `1px solid ${TOKENS.border}`,
          background: TOKENS.surface1,
          boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
        onClick={e => e.stopPropagation()}
      >
        <span style={SECTION_LABEL}>{t(locale, 'additionalWorkspaceQueryTypeTitle')}</span>

        {QUERY_TYPES.map(qt => {
          const disabled = qt.value === 'dropTemp' && unionActive;
          const active = queryType === qt.value;
          return (
            <div key={qt.value} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ ...RADIO_ROW, opacity: disabled ? 0.5 : 1 }} title={disabled ? t(locale, 'additionalWorkspaceDropTempDisabledHint') : undefined}>
                <input
                  type="radio"
                  name="qcc-query-identity-type"
                  checked={active}
                  disabled={disabled}
                  onChange={() => dispatch({ type: 'SET_QUERY_TYPE', queryType: qt.value })}
                />
                {t(locale, qt.label)}
                {qt.value === 'appendTemp' && (
                  <span style={VERSION_BADGE} title={t(locale, 'additionalWorkspaceAppendTempVersionTooltip')}>
                    {t(locale, 'additionalWorkspaceAppendTempVersionBadge')}
                  </span>
                )}
              </label>

              {active && qt.value === 'createTemp' && (
                <input
                  type="text"
                  autoFocus
                  placeholder={t(locale, 'additionalWorkspaceTempNameLabel')}
                  value={tempTableName}
                  onChange={e => dispatch({ type: 'SET_TEMP_TABLE_NAME', name: e.target.value })}
                  style={{ ...PANEL_INPUT, marginLeft: 22, width: 'calc(100% - 22px)' }}
                />
              )}

              {active && (qt.value === 'appendTemp' || qt.value === 'dropTemp') && (
                <div style={{ marginLeft: 22, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {availableTemps.length === 0 ? (
                    <span style={{ fontSize: 11, color: TOKENS.textMuted, fontStyle: 'italic' }}>{t(locale, 'queryIdentityNoTempTables')}</span>
                  ) : (
                    availableTemps.map(({ table, createdAt }) => (
                      <label key={table.fullName} style={PICKER_ROW}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <input
                            type="radio"
                            name="qcc-query-identity-temp-name"
                            checked={tempTableName.toUpperCase() === table.fullName.toUpperCase()}
                            onChange={() => dispatch({ type: 'SET_TEMP_TABLE_NAME', name: table.fullName })}
                          />
                          <span style={{ color: TOKENS.text }}>{table.fullName}</span>
                        </span>
                        <span style={{ marginLeft: 18, color: TOKENS.textMuted }}>
                          {t(locale, 'queryIdentityCreatedInPrefix')} {t(locale, 'packageTempTableQueryLabel')} {createdAt + 1}
                        </span>
                      </label>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}

        <div style={{ borderTop: `1px solid ${TOKENS.borderSubtle}`, marginTop: 2, paddingTop: 8 }}>
          <button
            type="button"
            className="qcc-btn"
            onClick={() => {
              onOpenAdditional();
              onClose();
            }}
            style={{ border: 'none', background: 'transparent', color: TOKENS.textSecondary, cursor: 'pointer', fontSize: 12, padding: 0 }}
          >
            {t(locale, 'queryIdentityAdditionalLink')}
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}
