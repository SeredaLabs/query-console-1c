import * as React from 'react';
import { createPortal } from 'react-dom';
import type { QueryDocument } from '../../core/query/unionModel';
import { buildResolverFromTables } from '../../core/metadata/buildModelResolver';
import type { SupportedLocale } from '../../shared/locale';
import { localizeDiagnostic } from '../../webview/i18n';
import { computeBatchTextSafe } from '../../webview/computeBatchText';
import { findStaticApplyBlocker } from '../../webview/applyGate';
import { finishSourceQueryDraft, sourceQueryDraft } from '../../webview/sourceQueryDraft';
import { metadataCatalogRef, reducer } from '../../webview/state/queryStore';
import type { StructureSelection } from '../structure/StructureWorkspace';
import { DIMENSIONS, TOKENS } from '../theme';
import { t } from '../i18n';
import { Workspace } from './Workspace';
import type { WorkspaceTab } from './WorkspaceNav';
import { PackageNav } from './PackageNav';

export function SourceQueryEditor({ locale, initialDoc, label, onBack, onCancel }: {
  locale: SupportedLocale;
  initialDoc?: QueryDocument;
  label: string;
  onBack: (doc: QueryDocument) => string | void;
  onCancel: () => void;
}): React.ReactElement {
  const [state, dispatch] = React.useReducer(reducer, initialDoc, sourceQueryDraft);
  const [active, setActive] = React.useState<WorkspaceTab>('structure');
  const [selection, setSelection] = React.useState<StructureSelection>(null);
  const [width, setWidth] = React.useState<number>(DIMENSIONS.inspector.default);
  const [error, setError] = React.useState<string>();
  const dialog = React.useRef<HTMLDivElement>(null);
  const generated = React.useMemo(() => computeBatchTextSafe(state, true), [state]);
  const blocker = React.useMemo(() => findStaticApplyBlocker(state), [state]);
  React.useEffect(() => { setError(undefined); }, [generated.text]);
  React.useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const backgrounds = Array.from(document.querySelectorAll<HTMLElement>('[data-canvas-editor-surface]'))
      .filter(el => el !== dialog.current);
    const previous = backgrounds.map(el => ({ el, inert: el.inert, hidden: el.getAttribute('aria-hidden') }));
    for (const { el } of previous) { el.inert = true; el.setAttribute('aria-hidden', 'true'); }
    dialog.current?.focus();
    return () => {
      for (const { el, inert, hidden } of previous) {
        el.inert = inert;
        if (hidden === null) el.removeAttribute('aria-hidden'); else el.setAttribute('aria-hidden', hidden);
      }
      previousFocus?.focus();
    };
  }, []);
  React.useEffect(() => {
    if (selection?.kind === 'table' && !state.selectedTables.some(t => t.id === selection.tableId)) setSelection(null);
    else if (selection?.kind === 'join' && selection.joinIndex >= state.joins.length) setSelection(null);
  }, [state.selectedTables, state.joins, selection]);

  function back() {
    const tables = metadataCatalogRef.current;
    const result = finishSourceQueryDraft(state, tables.length ? buildResolverFromTables(tables) : undefined);
    if (result.ok) setError(onBack(result.doc) || undefined);
    else setError(result.error ? localizeDiagnostic(result.error) : t(locale, 'saveBlockedMalformed'));
  }

  return createPortal(
    <div data-canvas-editor-surface role="dialog" aria-modal="true" aria-label={label} data-testid="canvas-source-query-editor"
      ref={dialog} tabIndex={-1}
      style={{ position: 'fixed', inset: 0, zIndex: 100, background: TOKENS.background, display: 'flex', flexDirection: 'column' }}
      onKeyDown={e => {
        if (e.key === 'Escape' && !e.defaultPrevented) { e.stopPropagation(); onCancel(); }
        if (e.key === 'Tab') {
          const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') ?? [])
            .filter(el => el.getClientRects().length > 0);
          const first = controls[0], last = controls[controls.length - 1];
          if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { e.preventDefault(); last?.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
        }
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, borderBottom: `1px solid ${TOKENS.border}` }}>
        <button type="button" className="qcc-btn" data-testid="canvas-source-back"
          disabled={!!generated.error || !generated.text.trim() || blocker !== null} onClick={back}>← {t(locale, 'sourceBack')}</button>
        <span style={{ flex: 1 }}>{t(locale, 'workspaceStructure')} / {label}</span>
        <button type="button" className="qcc-btn" onClick={onCancel}>{t(locale, 'cancel')}</button>
      </div>
      {(error || generated.error || blocker) && <div role="alert" style={{ color: TOKENS.danger, padding: 8 }}>
        {error ?? generated.error ?? t(locale, blocker?.kind === 'unsafeVirtualTable' ? 'saveBlockedUnsafeVirtual' : 'saveBlockedMalformed')}
      </div>}
      <PackageNav locale={locale} state={state} dispatch={dispatch} nested onOpenAdditional={() => setActive('additional')} />
      <Workspace locale={locale} state={state} dispatch={dispatch} active={active} onChange={setActive}
        nested metadataLoaded selection={selection} onSelectionChange={setSelection}
        inspectorWidth={width} onInspectorResize={delta => setWidth(w => Math.min(DIMENSIONS.inspector.max, Math.max(DIMENSIONS.inspector.min, w - delta)))} />
    </div>, document.body
  );
}
