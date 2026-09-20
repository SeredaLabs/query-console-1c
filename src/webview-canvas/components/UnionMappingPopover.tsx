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
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: 0.3,
  color: TOKENS.textMuted,
  padding: '6px 10px',
  borderBottom: `1px solid ${TOKENS.border}`,
  whiteSpace: 'nowrap',
};

const TD: React.CSSProperties = {
  fontSize: 13,
  padding: '6px 10px',
  borderBottom: `1px solid ${TOKENS.borderSubtle}`,
  whiteSpace: 'nowrap',
};

const ALIAS_INPUT: React.CSSProperties = {
  fontSize: 13,
  padding: '4px 8px',
  border: `1px solid ${TOKENS.border}`,
  borderRadius: 4,
  background: 'var(--vscode-input-background)',
  color: 'var(--vscode-input-foreground)',
  width: '100%',
  minWidth: 140,
  boxSizing: 'border-box',
};

const MOVE_BTN: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  color: TOKENS.textSecondary,
  fontSize: 14,
  padding: '2px 4px',
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
 * в компактній UnionStrip над цим діалогом, дублювати його тут не треба.
 *
 * Design review (2026-09-20): перша версія була крихітним popover'ом
 * (420×320, anchored під іконкою) — з реальними довгими назвами полів і
 * >1 запитом-учасником стовпці/inputs ставали нечитабельними, з'являвся
 * зайвий горизонтальний скрол. Замінено на центрований модальний діалог
 * (`min(900px, 90vw)`) — той самий контент, просто достатньо місця для
 * таблиці; горизонтальний скрол лишається лише як fallback для 5+ запитів.
 * Рендериться через `createPortal`, бо `PackageNav`'s BAR_STYLE має
 * `overflow: hidden` (responsive fix) — не проблема для fixed-overlay
 * модалки, але важливо не загубити цю причину, якщо колись переносити назад.
 */
export function UnionMappingPopover({
  locale,
  state,
  dispatch,
  onClose,
}: {
  locale: SupportedLocale;
  state: QueryState;
  dispatch: React.Dispatch<QueryAction>;
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
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{
          width: 'min(900px, 90vw)',
          maxHeight: '80vh',
          borderRadius: 8,
          border: `1px solid ${TOKENS.border}`,
          background: TOKENS.surface1,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 14px',
            borderBottom: `1px solid ${TOKENS.border}`,
            flexShrink: 0,
          }}
        >
          <span className="codicon codicon-list-flat" style={{ fontSize: 14, color: TOKENS.textSecondary }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: TOKENS.text, flex: 1 }}>{t(locale, 'packageUnionMappingButton')}</span>
          <button
            type="button"
            className="qcc-btn"
            title={t(locale, 'unionMappingClose')}
            onClick={onClose}
            style={{ border: 'none', background: 'transparent', color: TOKENS.textMuted, cursor: 'pointer', fontSize: 14, padding: '2px 4px' }}
          >
            <span className="codicon codicon-close" />
          </button>
        </div>
        <div
          style={{
            fontSize: 12,
            color: TOKENS.textMuted,
            padding: '8px 14px',
            borderBottom: `1px solid ${TOKENS.border}`,
            flexShrink: 0,
          }}
        >
          {t(locale, 'unionMappingHint')}
        </div>
        <div style={{ overflow: 'auto', flex: 1, padding: '0 4px' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={{ ...TH, width: 40 }} />
                <th style={{ ...TH, minWidth: 160 }}>{t(locale, 'unionMappingFieldColumn')}</th>
                {members.map((m, i) => (
                  <th key={i} style={{ ...TH, minWidth: 160 }}>{m.name}</th>
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
                      <td style={{ ...TD, padding: '4px 4px' }}>
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
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1002 }}
          onClick={e => { e.stopPropagation(); setAliasError(null); }}
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
    </div>,
    document.body
  );
}
