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
  padding: '0 16px',
  background: TOKENS.surface2,
  borderBottom: `1px solid ${TOKENS.border}`,
  gap: 12,
};

/**
 * Header redesign (2026-09-21): ліва зона тепер ОДНА product-identity
 * group --- icon + title + CANVAS badge, вертикально centered, gap ~8px
 * між елементами (explicit spec §6). Раніше тут ще був `queryName`
 * ("Без назви") --- прибраний повністю: New Builder не має жодної реальної
 * document-name сутності (жодного query filename/title у `QueryState`),
 * тож цей текст був вигаданим placeholder'ом, а не відображенням
 * справжнього стану --- explicit "НЕ створюй document-name state, НЕ
 * вигадуй назву документа".
 */
const IDENTITY_GROUP: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  minWidth: 0,
};

const TITLE_STYLE: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  color: TOKENS.text,
};

/**
 * "CANVAS" --- informational tag (§3), НЕ кнопка/перемикач: лише показує,
 * що зараз відкритий New Builder UI, а не Classic. Той самий "тихий accent"
 * принцип, що вже є в `queryIdentityTempBadge`-style badges у PackageNav
 * (subtle tinted background через `color-mix`, а не суцільна заливка) ---
 * НАВМИСНО тихіший за `Зберегти` (primary action), щоб не конкурувати
 * увагою (explicit: "CANVAS badge не повинен бути яскравішим за Save").
 */
const CANVAS_BADGE: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: 0.4,
  lineHeight: '18px',
  height: 18,
  padding: '0 5px',
  borderRadius: 3,
  border: `1px solid color-mix(in srgb, ${TOKENS.accent} 40%, transparent)`,
  background: `color-mix(in srgb, ${TOKENS.accent} 12%, transparent)`,
  color: TOKENS.accent,
  flexShrink: 0,
  whiteSpace: 'nowrap',
};

const ACTIONS_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexShrink: 0,
};

/**
 * Save support (2026-09-21): "Зберегти" тепер РЕАЛЬНА primary дія (§ save
 * task) --- `insertText`/`insertResult()`, той самий шлях, що й Classic.
 * Disabled-стан тепер функціональний (немає що зберігати / помилка
 * генерації --- `batchText.error`/пустий текст), а НЕ permanent "not yet
 * available" заглушка.
 */
const BTN_PRIMARY: React.CSSProperties = {
  padding: '4px 12px',
  fontSize: 12,
  borderRadius: 4,
  border: 'none',
  cursor: 'pointer',
  background: 'var(--vscode-button-background)',
  color: 'var(--vscode-button-foreground)',
};

const BTN_PRIMARY_DISABLED: React.CSSProperties = {
  ...BTN_PRIMARY,
  cursor: 'not-allowed',
  opacity: 0.6,
};

export function DocumentBar({
  locale,
  onSave,
  saveDisabled,
}: {
  locale: SupportedLocale;
  onSave: () => void;
  saveDisabled: boolean;
}): React.ReactElement {
  return (
    <div style={BAR_STYLE}>
      <div style={IDENTITY_GROUP}>
        <span style={TITLE_STYLE}>{t(locale, 'title')}</span>
        <span style={CANVAS_BADGE}>CANVAS</span>
      </div>
      <div style={ACTIONS_STYLE}>
        <button
          type="button"
          className="qcc-btn"
          style={saveDisabled ? BTN_PRIMARY_DISABLED : BTN_PRIMARY}
          disabled={saveDisabled}
          onClick={onSave}
        >
          {t(locale, 'save')}
        </button>
      </div>
    </div>
  );
}
