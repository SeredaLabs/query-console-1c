import * as React from 'react';
import type { MetaTable } from '../../core/metadata/types';
import { type ConditionOperator, type Join, type SelectedTable } from '../../core/query/queryModel';
import type { SupportedLocale } from '../../shared/locale';
import { t } from '../i18n';
import { TOKENS } from '../theme';
import { JoinManagerPopover } from './JoinManagerPopover';
import type { JoinKindLabel } from './joinKind';

export type ConditionMode = 'field' | 'custom';

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

/** Semantic codicon перед лейблом дії — та сама scanning-допомога, що вже в
 * TableCard/WorkspaceNav/Inspector, тільки для toolbar-кнопок. */
function BtnIcon({ name, muted = true }: { name: string; muted?: boolean }): React.ReactElement {
  return <span className={`codicon codicon-${name}`} style={{ fontSize: 14, opacity: muted ? 0.85 : 1, flexShrink: 0 }} />;
}

const BTN_DISABLED: React.CSSProperties = { opacity: 0.4, cursor: 'not-allowed' };

/**
 * "Просте поле" / "Довільний вираз" — спільний перемикач режиму умови,
 * використовується і в creation popover, і в Inspector (JoinInspector).
 */
export function ConditionModeToggle({
  locale,
  mode,
  onChange,
}: {
  locale: SupportedLocale;
  mode: ConditionMode;
  onChange: (mode: ConditionMode) => void;
}): React.ReactElement {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {(['field', 'custom'] as ConditionMode[]).map(m => {
        const active = m === mode;
        return (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            style={{
              flex: 1,
              fontSize: 11,
              fontWeight: active ? 600 : 400,
              padding: '4px 6px',
              borderRadius: 4,
              cursor: 'pointer',
              border: `1px solid ${active ? TOKENS.accent : TOKENS.border}`,
              background: active ? `color-mix(in srgb, ${TOKENS.accent} 12%, transparent)` : 'transparent',
              color: active ? TOKENS.accent : TOKENS.textSecondary,
            }}
          >
            {t(locale, m === 'field' ? 'structureJoinModeField' : 'structureJoinModeCustom')}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Structure toolbar: zoom + Fit + Auto Layout + "+ Джерело" (Phase 3A) +
 * "Зв'язки" (Phase 3B + Phase 6, об'єднано — gap analysis: "Додати зв'язок"
 * і "Зв'язки (N)" були двома окремими кнопками з дублюючою логікою, хоча
 * концептуально одна дія "керування зв'язками" — тепер один вхід,
 * `JoinManagerPopover` сам перемикає список/форму створення всередині).
 */
export function Toolbar({
  locale,
  zoomPercent,
  tables,
  tablesMeta,
  joins,
  selectedJoinIndex,
  onZoomOut,
  onZoomIn,
  onZoomReset,
  onFit,
  onAutoLayout,
  onAddSource,
  onCreateJoin,
  onSelectJoin,
  onRemoveJoin,
  sourceButtonRef,
}: {
  locale: SupportedLocale;
  zoomPercent: number;
  tables: SelectedTable[];
  /** Для field-select'ів у Join popover (тип/поля з'єднання одразу при створенні). */
  tablesMeta: MetaTable[];
  joins: Join[];
  selectedJoinIndex: number | null;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onZoomReset: () => void;
  onFit: () => void;
  onAutoLayout: () => void;
  onAddSource: () => void;
  onCreateJoin: (
    sourceId: string,
    targetId: string,
    kind: JoinKindLabel,
    leftField: string,
    rightField: string,
    expression: string,
    operator: ConditionOperator
  ) => void;
  onSelectJoin: (index: number) => void;
  onRemoveJoin: (index: number) => void;
  /** Phase 3E: якір для floating Source Browser (StructureWorkspace вимірює позицію кнопки). */
  sourceButtonRef?: React.Ref<HTMLButtonElement>;
}): React.ReactElement {
  const [joinManagerOpen, setJoinManagerOpen] = React.useState(false);
  const canJoin = tables.length >= 2;
  const hasAnyJoin = joins.length > 0;

  return (
    <div style={BAR_STYLE}>
      {/* Graph actions (створення) — тепер ЛІВОРУЧ, першими: це primary
          actions при побудові запиту, а zoom/layout — view-controls, які
          природньо йдуть праворуч (той самий порядок, що в більшості
          editor-подібних тулбарів — VS Code, Figma). */}
      <button
        type="button"
        ref={sourceButtonRef}
        className="qcc-btn"
        style={{ ...BTN, color: TOKENS.textSecondary }}
        onClick={onAddSource}
      >
        <BtnIcon name="add" />
        {t(locale, 'structureAddSource')}
      </button>
      <span style={{ position: 'relative' }}>
        <button
          type="button"
          className="qcc-btn"
          style={{ ...BTN, color: TOKENS.textSecondary, ...(canJoin || hasAnyJoin ? {} : BTN_DISABLED) }}
          disabled={!canJoin && !hasAnyJoin}
          title={canJoin || hasAnyJoin ? undefined : t(locale, 'structureJoinNeedsTwoSources')}
          onClick={() => setJoinManagerOpen(v => !v)}
        >
          <BtnIcon name="link" />
          {t(locale, 'structureJoinsOverview')}
          {hasAnyJoin && ` (${joins.length})`}
        </button>
        {joinManagerOpen && (canJoin || hasAnyJoin) && (
          <JoinManagerPopover
            locale={locale}
            tables={tables}
            tablesMeta={tablesMeta}
            joins={joins}
            selectedJoinIndex={selectedJoinIndex}
            onSelectJoin={onSelectJoin}
            onRemoveJoin={onRemoveJoin}
            onCreate={onCreateJoin}
            onClose={() => setJoinManagerOpen(false)}
          />
        )}
      </span>
      <span style={{ width: 1, height: 18, background: TOKENS.border, margin: '0 4px' }} />
      <span style={{ flex: 1 }} />
      {/* View-controls (zoom/Fit/Авто-компоновка) — праворуч. */}
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
        <BtnIcon name="screen-full" />
        {t(locale, 'structureFit')}
      </button>
      <button type="button" className="qcc-btn" style={BTN} onClick={onAutoLayout}>
        <BtnIcon name="layout" />
        {t(locale, 'structureAutoLayout')}
      </button>
    </div>
  );
}
