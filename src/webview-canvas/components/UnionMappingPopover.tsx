import * as React from 'react';
import { createPortal } from 'react-dom';
import { assembleMembers } from '../../webview/state/queryStore/snapshots';
import { deriveUnionColumns } from '../../core/query/unionModel';
import type { QueryAction, QueryState } from '../../webview/state/queryStore';
import type { SupportedLocale } from '../../shared/locale';
import { t } from '../i18n';
import { TOKENS } from '../theme';

const ALIAS_RE = /^[A-Za-zА-Яа-яЁё_][A-Za-zА-Яа-яЁё0-9_]*$/;

const TH: React.CSSProperties = {
  textAlign: 'left',
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: 0.3,
  color: TOKENS.textMuted,
  padding: '4px 8px',
  borderBottom: `1px solid ${TOKENS.border}`,
  whiteSpace: 'nowrap',
};

const TD: React.CSSProperties = {
  fontSize: 12,
  padding: '3px 8px',
  borderBottom: `1px solid ${TOKENS.borderSubtle}`,
  whiteSpace: 'nowrap',
};

const ALIAS_INPUT: React.CSSProperties = {
  fontSize: 12,
  padding: '2px 5px',
  border: `1px solid ${TOKENS.border}`,
  borderRadius: 3,
  background: 'var(--vscode-input-background)',
  color: 'var(--vscode-input-foreground)',
  width: '100%',
  boxSizing: 'border-box',
};

const MOVE_BTN: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  color: TOKENS.textSecondary,
  fontSize: 12,
  padding: '1px 3px',
};

/**
 * Portовано з Classic `UnionsTab.tsx` (таблична частина "Список полів") —
 * та сама модель (`assembleMembers`/`deriveUnionColumns` з
 * `core/query/unionModel.ts`), ті самі actions (`SET_COLUMN_ALIAS`/
 * `MOVE_UNION_COLUMN`), жодної нової domain-семантики. Позиційне
 * зіставлення (`UnionColumn.cells[i]` по індексу члена) — це те, що вже
 * рахує генератор; тут лише візуалізація, без explicit-mapping-об'єкта
 * (роадмап explicitно забороняє його вигадувати понад те, що є в домені).
 *
 * На відміну від Classic (окрема вкладка "Об'єднання/Псевдоніми" з обома
 * панелями — списком запитів І списком полів), тут лише права половина
 * (поля/псевдоніми/порядок) — керування самими SELECT-учасниками вже є
 * в компактній UnionStrip над цим popover'ом, дублювати його тут не треба.
 *
 * `PackageNav`'s BAR_STYLE has `overflow: hidden` (responsive fix — clips
 * long content instead of causing a horizontal scrollbar), which would also
 * clip an `absolute`-positioned dropdown anchored inside it. Rendered via
 * `createPortal` into `document.body` with `position: fixed` at the
 * trigger's own bounding rect instead, so it escapes that clip.
 */
export function UnionMappingPopover({
  locale,
  state,
  dispatch,
  anchor,
  onClose,
}: {
  locale: SupportedLocale;
  state: QueryState;
  dispatch: React.Dispatch<QueryAction>;
  anchor: { top: number; left: number };
  onClose: () => void;
}): React.ReactElement {
  const members = React.useMemo(() => assembleMembers(state), [state]);
  const columns = React.useMemo(() => deriveUnionColumns(members), [members]);
  const [aliasDrafts, setAliasDrafts] = React.useState<Record<number, string>>({});
  const [aliasError, setAliasError] = React.useState<string | null>(null);

  function commitAlias(colIdx: number, alias: string, draft: string) {
    const next = draft.trim();
    setAliasDrafts(d => {
      const { [colIdx]: _omit, ...rest } = d;
      return rest;
    });
    if (next === alias) return;
    if (!ALIAS_RE.test(next)) {
      setAliasError(t(locale, 'unionMappingAliasError'));
      return;
    }
    dispatch({ type: 'SET_COLUMN_ALIAS', alias, newAlias: next });
  }

  return createPortal(
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 1000 }} onClick={onClose} />
      <div
        style={{
          position: 'fixed',
          top: anchor.top,
          left: anchor.left,
          zIndex: 1001,
          width: 420,
          maxHeight: 320,
          borderRadius: 6,
          border: `1px solid ${TOKENS.border}`,
          background: TOKENS.surface1,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div
          style={{
            fontSize: 11,
            color: TOKENS.textMuted,
            padding: '6px 8px',
            borderBottom: `1px solid ${TOKENS.border}`,
            flexShrink: 0,
          }}
        >
          {t(locale, 'unionMappingHint')}
        </div>
        <div style={{ overflow: 'auto', flex: 1 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={{ ...TH, width: 24 }} />
                <th style={TH}>{t(locale, 'unionMappingFieldColumn')}</th>
                {members.map((m, i) => (
                  <th key={i} style={TH}>{m.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {columns.length === 0 ? (
                <tr>
                  <td style={TD} colSpan={2 + members.length}>
                    {t(locale, 'unionMappingEmpty')}
                  </td>
                </tr>
              ) : (
                columns.map((col, colIdx) => {
                  const draft = aliasDrafts[colIdx];
                  const value = draft !== undefined ? draft : col.alias;
                  return (
                    <tr key={col.alias}>
                      <td style={{ ...TD, padding: '2px 2px' }}>
                        <span style={{ display: 'flex', gap: 1 }}>
                          <button
                            type="button"
                            title={t(locale, 'unionMappingMoveUp')}
                            disabled={colIdx === 0}
                            onClick={() => dispatch({ type: 'MOVE_UNION_COLUMN', index: colIdx, dir: 'up' })}
                            style={{ ...MOVE_BTN, opacity: colIdx === 0 ? 0.3 : 1 }}
                          >
                            ‹
                          </button>
                          <button
                            type="button"
                            title={t(locale, 'unionMappingMoveDown')}
                            disabled={colIdx === columns.length - 1}
                            onClick={() => dispatch({ type: 'MOVE_UNION_COLUMN', index: colIdx, dir: 'down' })}
                            style={{ ...MOVE_BTN, opacity: colIdx === columns.length - 1 ? 0.3 : 1 }}
                          >
                            ›
                          </button>
                        </span>
                      </td>
                      <td style={TD}>
                        <input
                          style={ALIAS_INPUT}
                          value={value}
                          onChange={e => setAliasDrafts(d => ({ ...d, [colIdx]: e.target.value }))}
                          onBlur={() => commitAlias(colIdx, col.alias, value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                            else if (e.key === 'Escape') setAliasDrafts(d => { const { [colIdx]: _omit, ...rest } = d; return rest; });
                          }}
                        />
                      </td>
                      {col.cells.map((cell, i) => (
                        <td
                          key={i}
                          style={{
                            ...TD,
                            color: cell === null ? TOKENS.textMuted : TOKENS.text,
                            fontStyle: cell === null ? 'italic' : 'normal',
                          }}
                        >
                          {cell === null ? t(locale, 'unionMappingMissing') : cell}
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      {aliasError !== null && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1002 }}
          onClick={() => setAliasError(null)}
        >
          <div
            style={{
              background: TOKENS.surface1,
              border: `1px solid ${TOKENS.border}`,
              borderRadius: 4,
              padding: 16,
              minWidth: 320,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
            onClick={e => e.stopPropagation()}
          >
            <span style={{ fontSize: 13 }}>{aliasError}</span>
            <button
              type="button"
              className="qcc-btn"
              onClick={() => setAliasError(null)}
              style={{ alignSelf: 'center', padding: '5px 20px', border: `1px solid ${TOKENS.border}`, borderRadius: 4, background: 'transparent', color: TOKENS.text, cursor: 'pointer' }}
            >
              {t(locale, 'unionMappingAliasErrorOk')}
            </button>
          </div>
        </div>
      )}
    </>,
    document.body
  );
}
