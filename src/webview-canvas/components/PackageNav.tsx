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
  overflow: 'hidden',
};

const GROUP_LABEL: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  color: TOKENS.textSecondary,
  whiteSpace: 'nowrap',
  flexShrink: 0,
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

const UNION_KEYWORD_BTN: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: 0.3,
  padding: '2px 3px',
  // Design review (2026-09-19): раніше chartOrange — "кричало" на
  // користувача, ніби ОБ'ЄДНАТИ ВСЕ це команда, а не режим композиції.
  // Нейтральний textSecondary + окремий muted label ("⑂ Об'єднання:")
  // пояснює контекст, не привертаючи зайвої уваги; єдиний акцентний
  // колір у стрічці — активний SELECT-чип (TOKENS.accent).
  color: TOKENS.textSecondary,
  whiteSpace: 'nowrap',
};

const UNION_LABEL: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  color: TOKENS.textMuted,
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

const UNION_REMOVE_BTN: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  fontSize: 10,
  padding: '0 2px',
  color: TOKENS.textMuted,
  lineHeight: 1,
};

/**
 * Design review (2026-09-19, polish pass): члени UNION навмисно виглядають
 * НЕ так, як пакетні `[n]` (bracket-text) — округлий chip з м'яким фоном на
 * активному стані відрізняє "SELECT у межах поточного запиту" від "запит
 * пакета", щоб користувач не плутав два різних виміри навігації.
 */
const UNION_CHIP_ACTIVE: React.CSSProperties = {
  border: 'none',
  cursor: 'default',
  fontSize: 11,
  fontWeight: 600,
  padding: '1px 6px',
  borderRadius: 3,
  background: TOKENS.surfaceSelected,
  color: TOKENS.accent,
};

const UNION_CHIP_INACTIVE: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  fontSize: 11,
  fontWeight: 400,
  padding: '1px 6px',
  borderRadius: 3,
  color: TOKENS.textSecondary,
};

/** Кількість SELECT-чипів, показаних повністю inline, перш ніж стиснути в
 * компактний "SELECT n/total ‹ ›" режим (design review 2026-09-19). */
const UNION_INLINE_LIMIT = 4;

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

  // Design review (2026-09-19): одноразова контекстна підказка — з'являється
  // ЛИШЕ в момент створення першого union-члена (не при кожному відкритті),
  // ховається по dismiss або якщо union знову звели до 1 SELECT.
  const [showUnionHint, setShowUnionHint] = React.useState(false);
  React.useEffect(() => {
    if (state.queryList.length <= 1) setShowUnionHint(false);
  }, [state.queryList.length]);

  return (
    <div>
      <div style={BAR_STYLE}>
        <span style={GROUP_LABEL} title={t(locale, 'packageConceptTooltip')}>
          <span className="codicon codicon-package" style={{ fontSize: 12 }} />
          {t(locale, 'sidebarPackage')}:
        </span>
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
        <span style={{ width: 1, height: 14, background: TOKENS.border, margin: '0 2px', flexShrink: 0 }} />
        <span
          style={{
            flex: '0 1 auto',
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: TOKENS.text,
          }}
        >
          {activeName}
          {isTempTable && <span style={{ color: TOKENS.textMuted }}> · {t(locale, 'packageIdentityTempTable')}</span>}
        </span>
        <UnionStrip locale={locale} state={state} dispatch={dispatch} onFirstUnionCreated={() => setShowUnionHint(true)} />
      </div>
      {showUnionHint && (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 6,
            padding: '5px 12px',
            fontSize: 11,
            color: TOKENS.textMuted,
            background: TOKENS.surface1,
            borderBottom: `1px solid ${TOKENS.border}`,
          }}
        >
          <span className="codicon codicon-info" style={{ fontSize: 12, flexShrink: 0, marginTop: 1 }} />
          <span style={{ flex: 1, minWidth: 0 }}>{t(locale, 'packageUnionHint')}</span>
          <button
            type="button"
            className="qcc-btn"
            title={t(locale, 'packageUnionHintDismiss')}
            onClick={() => setShowUnionHint(false)}
            style={{ border: 'none', background: 'transparent', color: TOKENS.textMuted, cursor: 'pointer', fontSize: 12, padding: '0 2px', flexShrink: 0 }}
          >
            <span className="codicon codicon-close" />
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Design review (2026-09-19): УНІВЕРСАЛЬНИЙ інструмент "об'єднання
 * запитів" (ОБЪЕДИНИТЬ/ОБЪЕДИНИТЬ ВСЕ, `QueryState.queryList`/
 * `activeQuery` — той самий домен, що вже давно працює в Classic
 * `UnionsTab.tsx`/`ADD_QUERY`/`REMOVE_QUERY`/`SET_ACTIVE_QUERY`/
 * `SET_QUERY_DISTINCT`, жодних нових reducer actions) навмисно НЕ отримав
 * окремої вкладки чи persistent-стрічки — за прямим запитом користувача
 * вбудований у ЦЕЙ САМИЙ рядок PackageNav, щоб не додавати висоти.
 * `queryList`/`activeQuery` — per-active-batch-member state (входить у
 * snapshot `batchSaved`, як і `selectedFields`/`conditions`/...), тому
 * коректно перемикається разом із пакетом.
 *
 * Коли union ще немає (queryList.length<=1) — лише тиха "+ Об'єднання"
 * текстова кнопка, без жодного додаткового шуму для звичайного запиту.
 * Коли є 2-4 SELECT — показані повністю inline: `[1] — UNION — [2] +`.
 * Понад {@link UNION_INLINE_LIMIT} — стиснуто в `SELECT n/total ‹ ›`.
 *
 * Ключове слово між чипами i-1 та i визначається `queryList[i].distinct`
 * (те саме, що генератор читає в `generateDocument`: true → ОБЪЕДИНИТЬ,
 * false → ОБЪЕДИНИТЬ ВСЕ) — клік по слову перемикає САМЕ ЦЕ значення.
 */
function UnionStrip({
  locale,
  state,
  dispatch,
  onFirstUnionCreated,
}: {
  locale: SupportedLocale;
  state: QueryState;
  dispatch: React.Dispatch<QueryAction>;
  onFirstUnionCreated: () => void;
}): React.ReactElement {
  const queryList = state.queryList;

  if (queryList.length <= 1) {
    return (
      <button
        type="button"
        className="qcc-btn"
        title={t(locale, 'packageUnionAdd')}
        onClick={() => {
          dispatch({ type: 'ADD_QUERY' });
          onFirstUnionCreated();
        }}
        style={{ ...NUMBER_BTN, flexShrink: 0, color: TOKENS.textMuted }}
      >
        {t(locale, 'packageAddUnion')}
      </button>
    );
  }

  const unionLabel = (
    <span style={UNION_LABEL} title={t(locale, 'packageUnionLabelTooltip')}>
      <span className="codicon codicon-git-merge" style={{ fontSize: 12 }} />
      {t(locale, 'packageUnionLabel')}
    </span>
  );

  if (queryList.length > UNION_INLINE_LIMIT) {
    const active = state.activeQuery;
    const keywordLabel = active > 0 ? (queryList[active].distinct ? t(locale, 'packageUnionKeywordDistinct') : t(locale, 'packageUnionKeywordAll')) : null;
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        {unionLabel}
        <button
          type="button"
          className="qcc-btn"
          title={t(locale, 'packageUnionPrev')}
          disabled={active === 0}
          onClick={() => dispatch({ type: 'SET_ACTIVE_QUERY', index: active - 1 })}
          style={{ ...NUMBER_BTN, opacity: active === 0 ? 0.4 : 1 }}
        >
          ‹
        </button>
        <span style={{ color: TOKENS.textSecondary, whiteSpace: 'nowrap' }}>
          {t(locale, 'packageUnionSelectLabel')} {active + 1}/{queryList.length}
        </span>
        <button
          type="button"
          className="qcc-btn"
          title={t(locale, 'packageUnionNext')}
          disabled={active === queryList.length - 1}
          onClick={() => dispatch({ type: 'SET_ACTIVE_QUERY', index: active + 1 })}
          style={{ ...NUMBER_BTN, opacity: active === queryList.length - 1 ? 0.4 : 1 }}
        >
          ›
        </button>
        {keywordLabel && (
          <button
            type="button"
            className="qcc-btn"
            title={queryList[active].distinct ? t(locale, 'packageUnionKeywordDistinctTooltip') : t(locale, 'packageUnionKeywordAllTooltip')}
            onClick={() => dispatch({ type: 'SET_QUERY_DISTINCT', index: active, distinct: !queryList[active].distinct })}
            style={UNION_KEYWORD_BTN}
          >
            {keywordLabel} ▾
          </button>
        )}
        <button
          type="button"
          className="qcc-btn"
          title={t(locale, 'packageUnionAdd')}
          onClick={() => dispatch({ type: 'ADD_QUERY' })}
          style={{ ...NUMBER_BTN, fontWeight: 600 }}
        >
          +
        </button>
      </span>
    );
  }

  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
      {unionLabel}
      {queryList.map((q, i) => {
        const active = i === state.activeQuery;
        return (
          <React.Fragment key={i}>
            {i > 0 && (
              <button
                type="button"
                className="qcc-btn"
                title={q.distinct ? t(locale, 'packageUnionKeywordDistinctTooltip') : t(locale, 'packageUnionKeywordAllTooltip')}
                onClick={() => dispatch({ type: 'SET_QUERY_DISTINCT', index: i, distinct: !q.distinct })}
                style={UNION_KEYWORD_BTN}
              >
                {q.distinct ? t(locale, 'packageUnionKeywordDistinct') : t(locale, 'packageUnionKeywordAll')} ▾
              </button>
            )}
            <span className="qcc-union-chip" style={{ display: 'flex', alignItems: 'center' }}>
              <button
                type="button"
                title={active ? q.name : `${t(locale, 'packageUnionGoToPrefix')} ${i + 1}`}
                onClick={() => {
                  if (!active) dispatch({ type: 'SET_ACTIVE_QUERY', index: i });
                }}
                style={active ? UNION_CHIP_ACTIVE : UNION_CHIP_INACTIVE}
              >
                {i + 1}
              </button>
              <button
                type="button"
                className="qcc-union-remove"
                title={t(locale, 'packageUnionRemove')}
                onClick={() => dispatch({ type: 'REMOVE_QUERY', index: i })}
                style={UNION_REMOVE_BTN}
              >
                <span className="codicon codicon-trash" />
              </button>
            </span>
          </React.Fragment>
        );
      })}
      <button
        type="button"
        className="qcc-btn"
        title={t(locale, 'packageUnionAdd')}
        onClick={() => dispatch({ type: 'ADD_QUERY' })}
        style={{ ...NUMBER_BTN, fontWeight: 600 }}
      >
        +
      </button>
    </span>
  );
}
