import * as React from 'react';
import type { SupportedLocale } from '../../shared/locale';
import { CodeEditor } from '../../webview/components/CodeEditor';
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

/**
 * SDBL dock (Phase 7): реальний `generate()`, той самий client-side шлях, що
 * й Classic (`computeBatchTextSafe` — `assembleBatch` + `generateBatch`, без
 * жодного host round-trip; `type: 'generate'`/`'generatedText'` у
 * messages.ts/panel.ts — мертвий шлях, Classic ним теж не користується,
 * генерація завжди локальна в webview). Раніше тут була статична Phase-1
 * заглушка — тепер `text`/`error` приходять з `computeBatchTextSafe(state)`
 * в App.tsx.
 *
 * Рендер тексту — той самий `CodeEditor` (CodeMirror 6 + SDBL-підсвітка), що
 * й Classic-модалка "Текст запроса" (ConstructorView.tsx), а не голий
 * `<div>` з plain text — читома скарга користувача (2026-09-18): "текст
 * запросу жодним чином не форматований, так у Classic". `readOnly` (новий
 * опційний prop CodeEditor, не зачіпає інші місця використання) — підсвітка/
 * курсор/копіювання лишаються, редагування нема (New Builder ще не вміє
 * SDBL→QueryState назад).
 */
export function SdblDock({
  locale,
  collapsed,
  height,
  text,
  error,
  onToggleCollapsed,
  onResize,
}: {
  locale: SupportedLocale;
  collapsed: boolean;
  height: number;
  text: string;
  error: string | null;
  onToggleCollapsed: () => void;
  onResize: (delta: number) => void;
}): React.ReactElement {
  const [copied, setCopied] = React.useState(false);
  const canCopy = !error && text.length > 0;

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard API недоступний (рідкісний webview-контекст) — тихо ігноруємо, кнопка лишається клікабельною для повторної спроби.
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      {!collapsed && <ResizeHandle axis="y" onResize={onResize} />}
      <div style={HEADER_STYLE} onClick={onToggleCollapsed}>
        <span style={{ fontWeight: 600, fontSize: 12 }}>{t(locale, 'sdblTitle')}</span>
        <span style={{ width: 1, height: 12, background: TOKENS.border }} />
        <span style={{ fontSize: 11, color: error ? TOKENS.danger : TOKENS.textSecondary }}>
          {error ? t(locale, 'sdblError') : t(locale, 'sdblGenerated')}
        </span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          disabled={!canCopy}
          title={canCopy ? t(locale, 'sdblCopy') : t(locale, 'notYetAvailable')}
          style={{
            border: 'none',
            background: 'transparent',
            color: canCopy ? TOKENS.textSecondary : TOKENS.textMuted,
            cursor: canCopy ? 'pointer' : 'not-allowed',
            fontSize: 12,
          }}
          onClick={e => {
            e.stopPropagation();
            if (canCopy) void handleCopy();
          }}
        >
          {copied ? t(locale, 'sdblCopied') : t(locale, 'sdblCopy')}
        </button>
        <span style={{ fontSize: 11, color: TOKENS.textSecondary }}>{collapsed ? '▾' : '▴'}</span>
      </div>
      {!collapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', height: height - DIMENSIONS.sdbl.collapsed, minHeight: 0 }}>
          {error ? (
            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflow: 'auto',
                padding: '8px 12px',
                fontFamily: 'var(--vscode-editor-font-family, monospace)',
                fontSize: 12.5,
                color: TOKENS.danger,
                whiteSpace: 'pre-wrap',
              }}
            >
              {error}
            </div>
          ) : (
            <CodeEditor
              readOnly
              value={text || t(locale, 'sdblPlaceholder')}
              onChange={() => {}}
              spellCheck={false}
              wrapperStyle={{ flex: 1, minHeight: 0, background: 'transparent' }}
              textStyle={{
                fontFamily: 'var(--vscode-editor-font-family, monospace)',
                fontSize: 12.5,
                lineHeight: 1.5,
                whiteSpace: 'pre',
                color: text ? TOKENS.text : TOKENS.textMuted,
                padding: 8,
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
