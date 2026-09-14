import * as React from 'react';
import { defaultTableAlias, type SelectedTable } from '../../core/query/queryModel';
import type { SupportedLocale } from '../../shared/locale';
import { t } from '../i18n';
import { TOKENS } from '../theme';

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
};

const BTN_DISABLED: React.CSSProperties = { opacity: 0.4, cursor: 'not-allowed' };

function tableLabel(table: SelectedTable): string {
  return `${defaultTableAlias(table)} (${table.fullName})`;
}

/**
 * "+ Додати зв'язок" popover — найпростіший UX, який дозволяє ІСНУЮЧИЙ
 * reducer (design gate): два <select> (Джерело/Ціль), попередньо заповнені
 * тими самими двома таблицями, що й ADD_JOIN обрав би за замовчуванням
 * (selectedTables[0]/[1]). "Створити" викликає onCreateJoin(sourceId,
 * targetId) — сам ланцюжок ADD_JOIN→SET_JOIN_TABLE×2 живе у StructureWorkspace.
 */
function JoinPopover({
  locale,
  tables,
  onCreate,
  onClose,
}: {
  locale: SupportedLocale;
  tables: SelectedTable[];
  onCreate: (sourceId: string, targetId: string) => void;
  onClose: () => void;
}): React.ReactElement {
  const [source, setSource] = React.useState(tables[0]?.id ?? '');
  const [target, setTarget] = React.useState(tables[1]?.id ?? '');

  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 10 }}
        onClick={onClose}
      />
      <div
        style={{
          position: 'absolute',
          top: 36,
          right: 8,
          zIndex: 11,
          width: 260,
          padding: 12,
          borderRadius: 6,
          border: `1px solid ${TOKENS.border}`,
          background: TOKENS.surface1,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
        onClick={e => e.stopPropagation()}
      >
        <label style={{ fontSize: 11, color: TOKENS.textSecondary }}>
          {t(locale, 'structureJoinSource')}
          <select
            value={source}
            onChange={e => setSource(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: 2, fontSize: 12, padding: '3px 4px' }}
          >
            {tables.map(tb => (
              <option key={tb.id} value={tb.id}>
                {tableLabel(tb)}
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 11, color: TOKENS.textSecondary }}>
          {t(locale, 'structureJoinTarget')}
          <select
            value={target}
            onChange={e => setTarget(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: 2, fontSize: 12, padding: '3px 4px' }}
          >
            {tables.map(tb => (
              <option key={tb.id} value={tb.id}>
                {tableLabel(tb)}
              </option>
            ))}
          </select>
        </label>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button type="button" style={BTN} onClick={onClose}>
            {t(locale, 'cancel')}
          </button>
          <button
            type="button"
            style={{ ...BTN, border: `1px solid ${TOKENS.accent}`, color: TOKENS.accent }}
            onClick={() => {
              onCreate(source, target);
              onClose();
            }}
          >
            {t(locale, 'structureJoinCreate')}
          </button>
        </div>
      </div>
    </>
  );
}

/**
 * Structure toolbar: zoom + Fit + Auto Layout + "+ Джерело" (Phase 3A) +
 * "+ Додати зв'язок" (Phase 3B, активна лише при ≥2 джерелах).
 */
export function Toolbar({
  locale,
  zoomPercent,
  tables,
  onZoomOut,
  onZoomIn,
  onZoomReset,
  onFit,
  onAutoLayout,
  onAddSource,
  onCreateJoin,
  sourceButtonRef,
}: {
  locale: SupportedLocale;
  zoomPercent: number;
  tables: SelectedTable[];
  onZoomOut: () => void;
  onZoomIn: () => void;
  onZoomReset: () => void;
  onFit: () => void;
  onAutoLayout: () => void;
  onAddSource: () => void;
  onCreateJoin: (sourceId: string, targetId: string) => void;
  /** Phase 3E: якір для floating Source Browser (StructureWorkspace вимірює позицію кнопки). */
  sourceButtonRef?: React.Ref<HTMLButtonElement>;
}): React.ReactElement {
  const [joinPopoverOpen, setJoinPopoverOpen] = React.useState(false);
  const canJoin = tables.length >= 2;

  return (
    <div style={BAR_STYLE}>
      <button type="button" className="qcc-btn" style={BTN} title={t(locale, 'structureZoomOut')} onClick={onZoomOut}>
        −
      </button>
      <button
        type="button"
        className="qcc-btn"
        style={{ ...BTN, minWidth: 44 }}
        title={t(locale, 'structureZoomReset')}
        onClick={onZoomReset}
      >
        {zoomPercent}%
      </button>
      <button type="button" className="qcc-btn" style={BTN} title={t(locale, 'structureZoomIn')} onClick={onZoomIn}>
        +
      </button>
      <span style={{ width: 1, height: 18, background: TOKENS.border, margin: '0 4px' }} />
      <button type="button" className="qcc-btn" style={BTN} onClick={onFit}>
        {t(locale, 'structureFit')}
      </button>
      <button type="button" className="qcc-btn" style={BTN} onClick={onAutoLayout}>
        {t(locale, 'structureAutoLayout')}
      </button>
      {/* Phase 3D: другий subtle divider — відділяє Navigation-групу (zoom/Fit/
          Авто-компоновка) від Graph actions-групи (+Джерело/+Зв'язок), без
          важких group-контейнерів (explicit рішення користувача). */}
      <span style={{ width: 1, height: 18, background: TOKENS.border, margin: '0 4px' }} />
      <span style={{ flex: 1 }} />
      <button
        type="button"
        ref={sourceButtonRef}
        className="qcc-btn"
        style={{ ...BTN, color: TOKENS.textSecondary }}
        onClick={onAddSource}
      >
        {t(locale, 'structureAddSource')}
      </button>
      <button
        type="button"
        className="qcc-btn"
        style={{ ...BTN, color: TOKENS.textSecondary, ...(canJoin ? {} : BTN_DISABLED) }}
        disabled={!canJoin}
        title={canJoin ? undefined : t(locale, 'structureJoinNeedsTwoSources')}
        onClick={() => setJoinPopoverOpen(v => !v)}
      >
        {t(locale, 'structureAddJoin')}
      </button>
      {joinPopoverOpen && canJoin && (
        <JoinPopover
          locale={locale}
          tables={tables}
          onCreate={onCreateJoin}
          onClose={() => setJoinPopoverOpen(false)}
        />
      )}
    </div>
  );
}
