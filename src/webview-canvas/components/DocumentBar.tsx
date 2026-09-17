import * as React from 'react';
import type { SupportedLocale } from '../../shared/locale';
import { t } from '../i18n';
import { DIMENSIONS, TOKENS } from '../theme';

const BAR_STYLE: React.CSSProperties = {
  height: DIMENSIONS.documentBar,
  minHeight: DIMENSIONS.documentBar,
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0 12px',
  background: TOKENS.surface2,
  borderBottom: `1px solid ${TOKENS.border}`,
  gap: 12,
};

const TITLE_STYLE: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const QUERY_NAME_STYLE: React.CSSProperties = {
  // Phase 3D: 13→12px — трохи менший за title (product identity лишається
  // primary), щоб контекст (ім'я запиту) читався як secondary, а не
  // конкурував за увагу з product-назвою.
  fontSize: 12,
  color: TOKENS.textSecondary,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  minWidth: 0,
};

const ACTIONS_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexShrink: 0,
};

const BTN_BASE: React.CSSProperties = {
  padding: '4px 12px',
  fontSize: 12,
  borderRadius: 4,
  border: `1px solid ${TOKENS.border}`,
  cursor: 'pointer',
  background: 'transparent',
  color: TOKENS.text,
};

const BTN_PRIMARY: React.CSSProperties = {
  ...BTN_BASE,
  border: 'none',
  background: 'var(--vscode-button-background)',
  color: 'var(--vscode-button-foreground)',
};

const BTN_DISABLED: React.CSSProperties = {
  opacity: 0.5,
  cursor: 'not-allowed',
};

/** Phase 3D: Cancel — найлегша дія в барі, без border (plain text), щоб не
 * конкурувати вагою з Classic (secondary bordered) чи Save (primary). */
const BTN_LIGHT: React.CSSProperties = {
  padding: '4px 12px',
  fontSize: 12,
  border: 'none',
  cursor: 'pointer',
  background: 'transparent',
  color: TOKENS.textSecondary,
};

export function DocumentBar({
  locale,
  queryName,
  onCancel,
}: {
  locale: SupportedLocale;
  queryName: string;
  onCancel: () => void;
}): React.ReactElement {
  const notYetTitle = t(locale, 'notYetAvailable');
  return (
    <div style={BAR_STYLE}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <span style={TITLE_STYLE}>{t(locale, 'title')}</span>
        <span style={QUERY_NAME_STYLE}>{queryName || t(locale, 'untitledQuery')}</span>
      </div>
      <div style={ACTIONS_STYLE}>
        <button
          type="button"
          style={{ ...BTN_BASE, ...BTN_DISABLED }}
          disabled
          title={notYetTitle}
        >
          {t(locale, 'switchToClassic')}
        </button>
        <button type="button" className="qcc-btn" style={BTN_LIGHT} onClick={onCancel}>
          {t(locale, 'cancel')}
        </button>
        <button
          type="button"
          style={{ ...BTN_PRIMARY, ...BTN_DISABLED }}
          disabled
          title={notYetTitle}
        >
          {t(locale, 'save')}
        </button>
      </div>
    </div>
  );
}
