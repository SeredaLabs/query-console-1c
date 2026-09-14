import * as React from 'react';
import type { SupportedLocale } from '../../shared/locale';
import { t } from '../i18n';
import { DIMENSIONS, TOKENS } from '../theme';
import { ResizeHandle } from './ResizeHandle';

const HEADER_STYLE: React.CSSProperties = {
  height: DIMENSIONS.sdbl.collapsed,
  minHeight: DIMENSIONS.sdbl.collapsed,
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '0 14px',
  cursor: 'pointer',
  userSelect: 'none',
  borderTop: `1px solid ${TOKENS.border}`,
  background: TOKENS.surface2,
};

const BODY_STYLE: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: 'auto',
  padding: '8px 12px',
  fontFamily: 'var(--vscode-editor-font-family, monospace)',
  fontSize: 12.5,
  color: TOKENS.textMuted,
  whiteSpace: 'pre',
};

/**
 * SDBL dock shell (Phase 1): статична заглушка замість реального generate()
 * — той з'явиться лише разом зі Structure/Fields (Phase 3/7). "Copy" не
 * підключений (немає чого копіювати), тому неактивний з поясненням.
 */
export function SdblDock({
  locale,
  collapsed,
  height,
  onToggleCollapsed,
  onResize,
}: {
  locale: SupportedLocale;
  collapsed: boolean;
  height: number;
  onToggleCollapsed: () => void;
  onResize: (delta: number) => void;
}): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      {!collapsed && <ResizeHandle axis="y" onResize={onResize} />}
      <div style={HEADER_STYLE} onClick={onToggleCollapsed}>
        <span style={{ fontWeight: 600, fontSize: 12 }}>{t(locale, 'sdblTitle')}</span>
        <span style={{ width: 1, height: 12, background: TOKENS.border }} />
        <span style={{ fontSize: 11, color: TOKENS.textSecondary }}>{t(locale, 'sdblGenerated')}</span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          disabled
          title={t(locale, 'notYetAvailable')}
          style={{
            border: 'none',
            background: 'transparent',
            color: TOKENS.textMuted,
            cursor: 'not-allowed',
            fontSize: 12,
          }}
          onClick={e => e.stopPropagation()}
        >
          {t(locale, 'sdblCopy')}
        </button>
        <span style={{ fontSize: 11, color: TOKENS.textSecondary }}>{collapsed ? '▾' : '▴'}</span>
      </div>
      {!collapsed && (
        <div style={{ ...BODY_STYLE, height: height - DIMENSIONS.sdbl.collapsed }}>
          {t(locale, 'sdblPlaceholder')}
        </div>
      )}
    </div>
  );
}
