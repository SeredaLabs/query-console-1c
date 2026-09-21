import * as React from 'react';
import type { SupportedLocale } from '../shared/locale';
import { computeBatchTextSafe } from '../webview/computeBatchText';
import { initialState, reducer } from '../webview/state/queryStore';
import { onHostMessage, postToHost } from './bridge';
import { DocumentBar } from './components/DocumentBar';
import { PackageNav } from './components/PackageNav';
import { SdblDock } from './components/SdblDock';
import { Workspace } from './components/Workspace';
import type { WorkspaceTab } from './components/WorkspaceNav';
import { HoverStyles } from './hoverStyles';
import type { StructureSelection } from './structure/StructureWorkspace';
import { DIMENSIONS, ROOT_STYLE } from './theme';

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
      }
    });
    postToHost({ type: 'ready' });
    return off;
  }, []);

  const handleCancel = React.useCallback(() => {
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
    <div style={ROOT_STYLE}>
      <HoverStyles />
      <DocumentBar locale={locale} queryName="" onCancel={handleCancel} />
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
  );
}
