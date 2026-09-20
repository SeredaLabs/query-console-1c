import * as React from 'react';
import type { QueryType } from '../../core/query/queryModel';
import type { SupportedLocale } from '../../shared/locale';
import type { QueryAction, QueryState } from '../../webview/state/queryStore';
import { compoundQueryType, compoundTempTableName } from '../../webview/state/queryStore';
import { t, type MessageKey } from '../i18n';
import { CARD, SECTION_LABEL, TOKENS } from '../theme';

/**
 * Phase 11 — Additional Workspace, остання вкладка з New Builder roadmap.
 * Порт трьох із чотирьох секцій Classic `AdditionalTab.tsx`:
 * - "Вибірка записів" — ПЕРВЫЕ N/РАЗЛИЧНЫЕ/РАЗРЕШЕННЫЕ
 *   (SET_SELECTION_TOP/SET_SELECTION_DISTINCT/SET_SELECTION_ALLOWED);
 * - "Блокування" — ДЛЯ ИЗМЕНЕНИЯ (SET_LOCK_ENABLED/ADD_LOCK_TABLE/
 *   REMOVE_LOCK_TABLE, `state.lockForUpdate: string[]` адресує таблиці за
 *   `fullName`, НЕ за `id`).
 * - "Тип запиту" (Phase 13 мінімальний зріз, 2026-09-20) — `QueryType`
 *   (select/createTemp/appendTemp/dropTemp) + `tempTableName`, ті самі
 *   `SET_QUERY_TYPE`/`SET_TEMP_TABLE_NAME` actions, що й Classic
 *   `AdditionalTab.tsx`. Це ЛИШЕ здатність позначити активний
 *   package/union-член як creator/consumer/dropper тимчасової таблиці —
 *   subquery-as-source (важча половина Phase 13, з окремими gaps по
 *   condition-subquery/EXISTS) свідомо НЕ входить у цей зріз.
 *   `queryType`/`tempTableName` вже коректно зберігаються/відновлюються
 *   в snapshot-логіці (`snapshots.ts`) і вже читаються `PackageNav`'s
 *   `isTempTable` badge — ця секція просто дає користувачу спосіб їх
 *   встановити, жодних нових reducer actions.
 *
 * UNION + temp-table semantic audit (2026-09-20): `ПОМЕСТИТЬ`/`ДОБАВИТЬ` має
 * рівно один граматичний слот у 1С SDBL (одразу після списку полів ПЕРШОГО
 * учасника; `ОБЪЕДИНИТЬ` — пізніша секція ТОГО САМОГО оператора) — тому
 * queryType/tempTableName належать COMPOUND-запиту в цілому, а не тому
 * union-учаснику, який зараз активний. Значення тут читаються через
 * `compoundQueryType`/`compoundTempTableName` (завжди коректні незалежно
 * від активного учасника); reducer сам маршрутизує запис у member 0.
 * `dropTemp` вимкнено, поки існує об'єднання (`queryList.length > 1`) —
 * УНИЧТОЖИТЬ самостійний оператор, несумісний із SELECT-arm.
 *
 * Свідомо НЕ включено:
 * - "Кеш метаданих" (refresh-button + preserveComments) — Classic-
 *   специфічний host-round-trip механізм (`postToHost` cache-invalidation),
 *   без явного архітектурного еквівалента в New Builder, що вже
 *   генерує SDBL повністю client-side (`computeBatchTextSafe`).
 *
 * Немає грід-патерну (на відміну від Fields/Conditions/Grouping/Sorting) —
 * це форма налаштувань, не список record'ів.
 */

const QUERY_TYPES: { value: QueryType; label: MessageKey }[] = [
  { value: 'select', label: 'additionalWorkspaceQueryTypeSelect' },
  { value: 'createTemp', label: 'additionalWorkspaceQueryTypeCreateTemp' },
  { value: 'appendTemp', label: 'additionalWorkspaceQueryTypeAppendTemp' },
  { value: 'dropTemp', label: 'additionalWorkspaceQueryTypeDropTemp' },
];

const RADIO_ROW: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 12,
  color: TOKENS.textSecondary,
  cursor: 'pointer',
};

/**
 * Design polish (2026-09-20): невеликий muted badge для позначення
 * платформо-версійної вимоги (`ДОБАВИТЬ` valid лише з 1С:Підприємство
 * 8.3.25+) — суто інформаційний, не блокує/не ховає опцію на старіших
 * версіях (платформу цього середовища ми не знаємо і не перевіряємо).
 * Neutral/muted (НЕ warning-жовтий), без "NEW" — другорядний елемент,
 * що не конкурує з текстом radio-label.
 */
const VERSION_BADGE: React.CSSProperties = {
  fontSize: 10,
  lineHeight: '14px',
  padding: '0 4px',
  borderRadius: 3,
  border: `1px solid ${TOKENS.border}`,
  color: TOKENS.textMuted,
  whiteSpace: 'nowrap',
  flexShrink: 0,
  cursor: 'default',
};

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
  const queryType = compoundQueryType(state);
  const tempTableName = compoundTempTableName(state);
  const unionActive = state.queryList.length > 1;

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
        <span style={SECTION_LABEL}>{t(locale, 'additionalWorkspaceQueryTypeTitle')}</span>

        {QUERY_TYPES.map(qt => {
          const disabled = qt.value === 'dropTemp' && unionActive;
          return (
            <label key={qt.value} style={{ ...RADIO_ROW, opacity: disabled ? 0.5 : 1 }} title={disabled ? t(locale, 'additionalWorkspaceDropTempDisabledHint') : undefined}>
              <input
                type="radio"
                name="qcc-query-type"
                checked={queryType === qt.value}
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
          );
        })}

        <label style={{ ...RADIO_ROW, cursor: 'default' }}>
          <span style={{ opacity: queryType === 'select' ? 0.5 : 1 }}>{t(locale, 'additionalWorkspaceTempNameLabel')}:</span>
          <input
            type="text"
            disabled={queryType === 'select'}
            value={tempTableName}
            onChange={e => dispatch({ type: 'SET_TEMP_TABLE_NAME', name: e.target.value })}
            style={{ ...PANEL_INPUT, flex: 1, minWidth: 0, width: 'auto', opacity: queryType === 'select' ? 0.5 : 1 }}
          />
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
