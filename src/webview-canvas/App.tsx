import * as React from 'react';
import { buildResolverFromTables } from '../core/metadata/buildModelResolver';
import { tryOpenBatch } from '../core/query/validateBatch';
import { findUnsafeVirtualTables, findMalformedCustomExpressions } from '../core/query/semanticValidator';
import type { SupportedLocale } from '../shared/locale';
import { computeBatchTextSafe } from '../webview/computeBatchText';
import { assembleBatch, initialState, metadataCatalogRef, reducer } from '../webview/state/queryStore';
import { onHostMessage, postToHost } from './bridge';
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
  // 'metadataTree' ще не прийшов від хоста (loadMetadata асинхронний) — відрізняємо
  // від "прийшов, і таблиць реально 0" (справжній empty state).
  const [metadataLoaded, setMetadataLoaded] = React.useState(false);

  const [sdblCollapsed, setSdblCollapsed] = React.useState(true);
  const [sdblHeight, setSdblHeight] = React.useState<number>(DIMENSIONS.sdbl.default);
  // Той самий client-side шлях, що й Classic (computeBatchText.ts) — жодного
  // host round-trip: assembleBatch(state) + generateBatch(...), обгорнуто в
  // try/catch (контрольована помилка замість краху всього webview).
  const batchText = React.useMemo(() => computeBatchTextSafe(state, true), [state]);

  const [workspaceTab, setWorkspaceTab] = React.useState<WorkspaceTab>('structure');

  const [selection, setSelection] = React.useState<StructureSelection>(null);
  const [inspectorWidth, setInspectorWidth] = React.useState<number>(DIMENSIONS.inspector.default);
  // Load-failure fix (2026-09-22, audit P1 #2): non-null → the query under the
  // cursor failed to parse. Rendered as a blocking overlay (see below), never as
  // a silently empty, editable canvas.
  const [loadError, setLoadError] = React.useState<string | null>(null);

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

  React.useEffect(() => {
    const off = onHostMessage(msg => {
      if (msg.type === 'init' && msg.locale) setLocale(msg.locale);
      else if (msg.type === 'metadataTree') {
        dispatch({ type: 'SET_METADATA', tables: msg.tables });
        setMetadataLoaded(true);
      } else if (msg.type === 'loadModel') {
        // Save support (2026-09-21): ТОЙ САМИЙ критерій, що й Classic
        // (`webview/App.tsx`'s 'loadModel' handler) --- `tryOpenBatch` (спільний
        // `core/query/validateBatch.ts`) розбирає текст запиту, знайденого під
        // курсором при відкритті команди (`extension.ts`), і диспатчить УЖЕ
        // існуючий `LOAD_BATCH` reducer action (`queryStore.ts`) --- жодного
        // нового domain/parser коду, лише підключення вже готового шляху до
        // Canvas. Резолвер --- з `metadataCatalogRef` (той самий module-level
        // ref, синхронно оновлюваний `SET_METADATA`-кейсом reducer'а, яким уже
        // користується `allTables()`), а не окремий Canvas-specific стан.
        //
        // Load-failure fix (2026-09-22, audit P1 #2): раніше провал `tryOpenBatch`
        // просто нічого не диспатчив --- Canvas лишався мовчки порожнім, як при
        // звичайному відкритті без initial query, і НЕ відрізнявся від нього. Хост
        // (`canvasPanel.ts`) при цьому ВЖЕ захопив `savedEditor` (діапазон
        // оригінального тексту в редакторі) при відкритті панелі --- якщо
        // користувач після цього побудує НОВИЙ запит у порожньому Canvas і натисне
        // Save, `insertText` перезапише ОРИГІНАЛЬНИЙ текст під курсором, хоча
        // Canvas його навіть не відкривав. `loadError` рендериться як блокуючий
        // overlay (нижче) --- єдина дія користувача звідти --- Close (`cancel`,
        // `canvasPanel.ts` диспозить панель БЕЗ жодного `insertText`), той самий
        // fail-closed підхід, що й Classic (`webview/App.tsx`'s `loadError`).
        const resolver = metadataCatalogRef.current.length ? buildResolverFromTables(metadataCatalogRef.current) : undefined;
        const r = tryOpenBatch(msg.text, resolver, { preserveComments: true });
        if (r.ok) { dispatch({ type: 'LOAD_BATCH', doc: r.doc }); setLoadError(null); }
        else setLoadError(r.error);
      }
    });
    postToHost({ type: 'ready' });
    return off;
  }, []);

  /**
   * Apply-gate parity fix (2026-09-22, audit P1 #1): Save раніше перевіряв
   * ЛИШЕ `batchText.error`/порожній текст --- на відміну від Classic
   * (`webview/App.tsx`'s `unsafeVtError`/`malformedCustomError`), жодного
   * capability/preservation gate ПЕРЕД записом. Віртуальна таблиця з
   * непокритими позиціями 3+ (`findUnsafeVirtualTables`) чи пошкоджений
   * custom-вираз (`findMalformedCustomExpressions`) мовчки зберігались би з
   * втратою даних (§27/28/54 P0.5 --- той самий gate, що вже захищає Classic).
   * Той самий `assembleBatch(state)`, що Canvas і так рахує кожен рендер для
   * `batchText` --- жодної нової моделі/обчислення, лише підключення вже
   * існуючих у ядрі перевірок.
   */
  const unsafeVtNames = React.useMemo(() => findUnsafeVirtualTables(assembleBatch(state)), [state]);
  const malformedCustomHits = React.useMemo(() => findMalformedCustomExpressions(assembleBatch(state)), [state]);
  const saveBlocked = unsafeVtNames.length > 0 || malformedCustomHits.length > 0;

  /**
   * Save support (2026-09-21): "Зберегти" тепер реально функціональна --- той
   * самий `WebviewMsg.insertText`, що й Classic (`webview/App.tsx`'s
   * `handleInsert`), з уже готовим client-side `batchText` (Canvas і так
   * рахує його для SdblDock через `computeBatchTextSafe`, жодного нового
   * обчислення). Хост (`canvasPanel.ts`) записує його в СПРАВЖНІЙ `insertResult()`
   * з тими самими stale-document/`documentVersion` guard'ами, що й Classic.
   */
  const handleSave = React.useCallback(() => {
    if (batchText.error || !batchText.text.trim() || saveBlocked) return;
    postToHost({ type: 'insertText', text: batchText.text });
  }, [batchText, saveBlocked]);

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
          unsafeVtNames.length > 0
            ? t(locale, 'saveBlockedUnsafeVirtual')
            : malformedCustomHits.length > 0
            ? t(locale, 'saveBlockedMalformed')
            : undefined
        }
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
          {t(locale, 'openFailedTitle')}
        </div>
        <div style={{ color: TOKENS.danger, fontSize: 13, whiteSpace: 'pre-wrap', maxWidth: 640 }}>
          {loadError}
        </div>
        <button type="button" className="qcc-btn" onClick={handleClose}>
          {t(locale, 'openFailedClose')}
        </button>
      </div>
    )}
    </>
  );
}
