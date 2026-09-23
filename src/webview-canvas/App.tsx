import * as React from 'react';
import { findStaticApplyBlocker, decideApply } from '../webview/applyGate';
import { localizeDiagnostic, setLocale as setClassicLocale, t as classicT } from '../webview/i18n';
import type { SupportedLocale } from '../shared/locale';
import { computeBatchTextSafe } from '../webview/computeBatchText';
import { initialState, reducer } from '../webview/state/queryStore';
import { postToHost } from '../webview/bridge';
import { useDesignerSession } from '../webview/hooks/useDesignerSession';
import { DocumentBar } from './components/DocumentBar';
import { PackageNav } from './components/PackageNav';
import { SdblDock } from './components/SdblDock';
import { Workspace } from './components/Workspace';
import type { WorkspaceTab } from './components/WorkspaceNav';
import { HoverStyles } from './hoverStyles';
import { t } from './i18n';
import type { StructureSelection } from './structure/StructureWorkspace';
import { DIMENSIONS, ROOT_STYLE, TOKENS } from './theme';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Phase 3E — Workspace Shell Simplification: persistent Sidebar (Метадані/
 * Пакет) прибрано. Metadata browsing переїхало у floating
 * `SourceBrowserPopover` (StructureWorkspace, тригериться з Toolbar "+
 * Джерело" — MetadataTree.tsx сам без змін, лишається reusable content
 * component). Package navigation переїхало у глобальний `PackageNav`
 * (той самий QueryState.batchSaved/activeBatch, ті самі actions).
 *
 * Phase 4 — Contextual Inspector: `selection` піднято сюди (раніше було
 * local state у StructureWorkspace) — Inspector рендериться як sibling
 * Workspace ЛИШЕ коли є selection; canvas отримує решту ширини завжди,
 * коли Inspector не змонтований.
 */
export function App(): React.ReactElement {
  const [locale, setLocale] = React.useState<SupportedLocale>('en');
  const [state, dispatch] = React.useReducer(reducer, undefined, initialState);

  const [sdblCollapsed, setSdblCollapsed] = React.useState(true);
  const [sdblHeight, setSdblHeight] = React.useState<number>(DIMENSIONS.sdbl.default);
  // Той самий client-side шлях, що й Classic (computeBatchText.ts) — жодного
  // host round-trip: assembleBatch(state) + generateBatch(...), обгорнуто в
  // try/catch (контрольована помилка замість краху всього webview).
  const batchText = React.useMemo(() => computeBatchTextSafe(state, true), [state]);

  const [workspaceTab, setWorkspaceTab] = React.useState<WorkspaceTab>('structure');

  const [selection, setSelection] = React.useState<StructureSelection>(null);
  const [inspectorWidth, setInspectorWidth] = React.useState<number>(DIMENSIONS.inspector.default);
  // Result of the click-time check (`decideApply` 'invalid'), already localized;
  // cleared as soon as the generated text changes.
  const [saveError, setSaveError] = React.useState<string | null>(null);

  // Package/query switch, REMOVE_TABLE чи REMOVE_JOIN, чия ціль зараз обрана
  // — selection не повинна пережити зникнення своєї цілі (design §9/§10,
  // перенесено з колишнього local-state ефекту в StructureWorkspace).
  React.useEffect(() => {
    if (selection?.kind === 'table' && !state.selectedTables.some(t => t.id === selection.tableId)) {
      setSelection(null);
    } else if (selection?.kind === 'join' && selection.joinIndex >= state.joins.length) {
      setSelection(null);
    }
  }, [state.selectedTables, state.joins, selection]);

  // Сесія з хостом — СПІЛЬНА з Classic (`webview/hooks/useDesignerSession.ts`):
  // ready → metadataTree → loadModel тим самим `tryOpenBatch` → `LOAD_BATCH`,
  // стан завантаження (Canvas не показує порожнє редаговане полотно, яке потім
  // перезапише LOAD_BATCH) і `loadError` (блокуючий overlay нижче, лише Close —
  // жодного `insertText` поверх оригінального тексту, який Canvas не відкрив).
  // Тут лише Canvas-специфічне: локаль.
  const { loading, metadataLoaded, loadError, buildResolver } = useDesignerSession(dispatch, msg => {
    if (msg.type === 'init' && msg.locale) {
      setLocale(msg.locale);
      // Texts Canvas reuses from Classic instead of duplicating (core diagnostics
      // via `localizeDiagnostic`, metadata group labels, loading/open-failed
      // messages) read Classic's own module-level locale.
      setClassicLocale(msg.locale);
    }
  });

  /**
   * Apply gate — ТОЙ САМИЙ, що й Classic «ОК» (`webview/applyGate.ts`, спільний
   * модуль, жодної Canvas-копії перевірок): небезпечна віртуальна таблиця чи
   * пошкоджений custom-вираз блокують кнопку постійно, а при натисканні
   * `decideApply` ще раз перевіряє згенерований текст тим самим критерієм, що й
   * відкриття з тексту (`validateBatchText`: поля, таблиці, дублікати псевдонімів,
   * кількість колонок ОБЪЕДИНЕНИЯ).
   */
  const applyBlocker = React.useMemo(() => findStaticApplyBlocker(state), [state]);
  const saveBlocked = applyBlocker !== null;
  React.useEffect(() => { setSaveError(null); }, [batchText.text]);

  /**
   * Save support (2026-09-21): "Зберегти" тепер реально функціональна --- той
   * самий `WebviewMsg.insertText`, що й Classic (`webview/App.tsx`'s
   * `handleInsert`), з уже готовим client-side `batchText` (Canvas і так
   * рахує його для SdblDock через `computeBatchTextSafe`, жодного нового
   * обчислення). Хост (`canvasPanel.ts`) записує його в СПРАВЖНІЙ `insertResult()`
   * з тими самими stale-document/`documentVersion` guard'ами, що й Classic.
   */
  const handleSave = React.useCallback(() => {
    const decision = decideApply(batchText.text, batchText.error, applyBlocker, buildResolver());
    if (!decision.ok) {
      if (decision.kind === 'invalid') setSaveError(localizeDiagnostic(decision.error));
      return;
    }
    setSaveError(null);
    postToHost({ type: 'insertText', text: batchText.text });
  }, [batchText, applyBlocker, buildResolver]);

  /** Load-failure fix (2026-09-22): closes the panel WITHOUT ever sending
   * `insertText` --- `canvasPanel.ts` disposes on `cancel`, same as Classic's
   * `handleCancel`. The only way out of the loadError overlay. */
  const handleClose = React.useCallback(() => {
    postToHost({ type: 'cancel' });
  }, []);

  const resizeSdbl = React.useCallback((delta: number) => {
    // SDBL dock над нижнім краєм: тягнення вгору (delta<0) має ЗБІЛЬШУВАТИ висоту.
    setSdblHeight(h => clamp(h - delta, DIMENSIONS.sdbl.min, DIMENSIONS.sdbl.max));
  }, []);

  const resizeInspector = React.useCallback((delta: number) => {
    // Inspector — правий край: тягнення вправо (delta>0) має ЗВУЖУВАТИ панель.
    setInspectorWidth(w => clamp(w - delta, DIMENSIONS.inspector.min, DIMENSIONS.inspector.max));
  }, []);

  return (
    <>
    <div style={ROOT_STYLE}>
      <HoverStyles />
      <DocumentBar
        locale={locale}
        onSave={handleSave}
        saveDisabled={!!batchText.error || !batchText.text.trim() || saveBlocked}
        saveDisabledReason={
          applyBlocker?.kind === 'unsafeVirtualTable'
            ? t(locale, 'saveBlockedUnsafeVirtual')
            : applyBlocker?.kind === 'malformedCustom'
            ? t(locale, 'saveBlockedMalformed')
            : undefined
        }
        saveError={saveError ?? undefined}
      />
      <PackageNav locale={locale} state={state} dispatch={dispatch} onOpenAdditional={() => setWorkspaceTab('additional')} />
      <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
        <Workspace
          locale={locale}
          active={workspaceTab}
          onChange={setWorkspaceTab}
          state={state}
          dispatch={dispatch}
          metadataLoaded={metadataLoaded}
          selection={selection}
          onSelectionChange={setSelection}
          inspectorWidth={inspectorWidth}
          onInspectorResize={resizeInspector}
        />
      </div>
      <SdblDock
        locale={locale}
        collapsed={sdblCollapsed}
        height={sdblHeight}
        text={batchText.text}
        error={batchText.error}
        onToggleCollapsed={() => setSdblCollapsed(v => !v)}
        onResize={resizeSdbl}
      />
    </div>

    {/* Load-failure fix (2026-09-22, audit P1 #2): blocking overlay, same intent
        as Classic's `loadError` banner --- covers the whole panel so the user
        cannot reach an empty, editable canvas (and Save) behind it; Close is the
        only escape and never sends `insertText`. */}
    {loadError != null && (
      <div
        data-testid="canvas-load-error"
        style={{
          position: 'fixed', inset: 0,
          background: TOKENS.background,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 12, padding: 24, textAlign: 'center', zIndex: 400,
        }}
      >
        <div style={{ color: TOKENS.danger, fontSize: 14, fontWeight: 600 }}>
          {classicT('constructor.openFailed')}
        </div>
        <div style={{ color: TOKENS.danger, fontSize: 13, whiteSpace: 'pre-wrap', maxWidth: 640 }}>
          {localizeDiagnostic(loadError)}
        </div>
        <button type="button" className="qcc-btn" onClick={handleClose}>
          {classicT('actions.close')}
        </button>
      </div>
    )}

    {/* 7.8.2 (shared with Classic via useDesignerSession): covers the canvas until
        metadata and the initial query, if any, have arrived. */}
    {loading && loadError == null && (
      <div
        data-testid="canvas-loading-overlay"
        style={{
          position: 'fixed', inset: 0,
          background: TOKENS.background,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 300, color: TOKENS.textSecondary, fontSize: 14,
        }}
      >
        {classicT('constructor.loading')}
      </div>
    )}
    </>
  );
}
