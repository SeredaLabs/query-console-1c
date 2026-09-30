import * as React from 'react';
import type { DesignerMode } from '../../shared/messages';
import { t } from '../i18n';

/**
 * Compact Classic/Canvas segmented toggle, shared by both designer UIs. The
 * active segment is the current UI; activating the other one asks the host to
 * reload the same panel with that UI (`switchDesigner`).
 */
const CSS = `
.qc-mode-toggle { display: inline-flex; flex-shrink: 0; border: 1px solid var(--vscode-button-border, var(--vscode-contrastBorder, var(--vscode-widget-border, #3c3c3c))); border-radius: 4px; overflow: hidden; }
.qc-mode-toggle button { display: flex; align-items: center; justify-content: center; width: 30px; height: 22px; padding: 0; border: none; cursor: pointer; background: transparent; color: var(--vscode-foreground, #ccc); }
.qc-mode-toggle button + button { border-left: 1px solid var(--vscode-button-border, var(--vscode-widget-border, #3c3c3c)); }
.qc-mode-toggle button:not([aria-pressed="true"]):not(:disabled):hover { background: var(--vscode-toolbar-hoverBackground, rgba(90, 93, 94, 0.31)); }
.qc-mode-toggle button[aria-pressed="true"] { background: var(--vscode-button-background, #0e639c); color: var(--vscode-button-foreground, #fff); cursor: default; }
.qc-mode-toggle button:disabled:not([aria-pressed="true"]) { opacity: 0.5; cursor: not-allowed; }
.qc-mode-toggle button:focus-visible { outline: 1px solid var(--vscode-focusBorder, #007fd4); outline-offset: -1px; }
`;

function ClassicIcon(): React.ReactElement {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <circle cx="2.5" cy="4" r="1" /><circle cx="2.5" cy="8" r="1" /><circle cx="2.5" cy="12" r="1" />
      <rect x="5" y="3.4" width="9" height="1.2" rx="0.6" /><rect x="5" y="7.4" width="9" height="1.2" rx="0.6" />
      <rect x="5" y="11.4" width="9" height="1.2" rx="0.6" />
    </svg>
  );
}

function CanvasIcon(): React.ReactElement {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round">
      <path d="M8 2.2 13.8 8 8 13.8 2.2 8Z" />
    </svg>
  );
}

export function DesignerModeToggle({ active, onSwitch, disabled }: {
  active: DesignerMode;
  onSwitch: (target: DesignerMode) => void;
  /** Blocks switching while the current UI must not be left (e.g. a pending confirmation). */
  disabled?: boolean;
}): React.ReactElement {
  const segment = (mode: DesignerMode, label: string, icon: React.ReactElement) => (
    <button
      type="button"
      data-testid={`designer-mode-${mode}`}
      aria-pressed={active === mode}
      aria-label={label}
      title={label}
      disabled={disabled && active !== mode}
      onClick={() => { if (active !== mode) onSwitch(mode); }}
    >
      {icon}
    </button>
  );
  return (
    <div className="qc-mode-toggle" role="group" aria-label={t('designer.mode.label')}>
      <style>{CSS}</style>
      {segment('classic', t('designer.mode.classic'), <ClassicIcon />)}
      {segment('canvas', t('designer.mode.canvas'), <CanvasIcon />)}
    </div>
  );
}
