import * as React from 'react';
import type { SupportedLocale } from '../../shared/locale';
import { assembleBatch, batchMemberName, type QueryAction, type QueryState } from '../../webview/state/queryStore';
import { t } from '../i18n';
import { DIMENSIONS, TOKENS } from '../theme';

const BAR_STYLE: React.CSSProperties = {
  height: DIMENSIONS.packageNav,
  minHeight: DIMENSIONS.packageNav,
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '0 12px',
  borderBottom: `1px solid ${TOKENS.border}`,
  background: TOKENS.surface2,
  fontSize: 12,
};

const NUMBER_BTN: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  fontSize: 12,
  padding: '2px 4px',
  borderRadius: 3,
  color: TOKENS.textSecondary,
};

/**
 * Phase 3E: package navigation переїхала з Sidebar → Пакет (PackagePanel,
 * видалено) у компактну глобальну стрічку над WorkspaceNav — той самий
 * `QueryState.batchSaved`/`activeBatch` і ті самі `SET_ACTIVE_BATCH`/
 * `ADD_BATCH_QUERY` actions, жодної нової domain-семантики. Move/remove
 * (раніше в PackagePanel) свідомо не перенесені сюди — окреме майбутнє
 * рішення, не Phase 3E scope.
 */
export function PackageNav({
  locale,
  state,
  dispatch,
}: {
  locale: SupportedLocale;
  state: QueryState;
  dispatch: React.Dispatch<QueryAction>;
}): React.ReactElement {
  const batch = React.useMemo(() => assembleBatch(state), [state]);
  const activeModel = batch.members[state.activeBatch]?.members[0]?.model;
  const activeName = batchMemberName(state, state.activeBatch);
  const isTempTable = activeModel?.queryType === 'createTemp' || activeModel?.queryType === 'appendTemp';

  return (
    <div style={BAR_STYLE}>
      <span style={{ color: TOKENS.textSecondary }}>{t(locale, 'sidebarPackage')}:</span>
      {batch.members.map((_, i) => {
        const active = i === state.activeBatch;
        return (
          <button
            key={i}
            type="button"
            className="qcc-btn"
            title={batchMemberName(state, i)}
            onClick={() => {
              if (!active) dispatch({ type: 'SET_ACTIVE_BATCH', index: i });
            }}
            style={{
              ...NUMBER_BTN,
              color: active ? TOKENS.accent : TOKENS.textSecondary,
              fontWeight: active ? 700 : 400,
            }}
          >
            {active ? `[${i + 1}]` : `${i + 1}`}
          </button>
        );
      })}
      <button
        type="button"
        className="qcc-btn"
        title={t(locale, 'packageAddQuery')}
        onClick={() => dispatch({ type: 'ADD_BATCH_QUERY' })}
        style={{ ...NUMBER_BTN, fontWeight: 600 }}
      >
        +
      </button>
      <span style={{ width: 1, height: 14, background: TOKENS.border, margin: '0 2px' }} />
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: TOKENS.text }}>
        {activeName}
        {isTempTable && <span style={{ color: TOKENS.textMuted }}> · {t(locale, 'packageIdentityTempTable')}</span>}
      </span>
    </div>
  );
}
