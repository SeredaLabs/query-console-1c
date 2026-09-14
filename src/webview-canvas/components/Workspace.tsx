import * as React from 'react';
import type { SupportedLocale } from '../../shared/locale';
import type { QueryAction, QueryState } from '../../webview/state/queryStore';
import { t, type MessageKey } from '../i18n';
import { StructureWorkspace, type StructureSelection } from '../structure/StructureWorkspace';
import { TOKENS } from '../theme';
import { WorkspaceNav, type WorkspaceTab } from './WorkspaceNav';

const TAB_TITLE_KEY: Record<WorkspaceTab, MessageKey> = {
  structure: 'workspaceStructure',
  fields: 'workspaceFields',
  conditions: 'workspaceConditions',
  grouping: 'workspaceGrouping',
  sorting: 'workspaceSorting',
  additional: 'workspaceAdditional',
};

const CONTAINER_STYLE: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const BODY_STYLE: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

/**
 * Workspace: nav + вміст активної вкладки. Structure (Phase 3A) — єдина
 * вкладка з реальним вмістом; решта лишаються Phase 1 заглушкою (Fields/
 * Conditions/Grouping/Sorting/Additional — Phase 7-11).
 */
export function Workspace({
  locale,
  active,
  onChange,
  state,
  dispatch,
  metadataLoaded,
  selection,
  onSelectionChange,
}: {
  locale: SupportedLocale;
  active: WorkspaceTab;
  onChange: (tab: WorkspaceTab) => void;
  state: QueryState;
  dispatch: React.Dispatch<QueryAction>;
  metadataLoaded: boolean;
  selection: StructureSelection;
  onSelectionChange: (selection: StructureSelection) => void;
}): React.ReactElement {
  // Bug fix: StructureWorkspace раніше рендерився лише при active==='structure'
  // (умовний unmount/remount) — перемикання на будь-яку іншу вкладку й назад
  // знищувало ВСІ локальні canvas-стани (pan/zoom з useCanvasTransform,
  // ручні позиції карток з usePositions, hoveredJoin, containerSize) і
  // користувач бачив скинуте розташування. StructureWorkspace тепер
  // ЗАВЖДИ змонтований — лише приховується через `display:none`, коли
  // активна інша вкладка, так само як CSS ховає плейсхолдер, коли активна
  // 'structure'. Жодних змін у самому StructureWorkspace/usePositions —
  // тільки в тому, ЯК Workspace його монтує.
  return (
    <div style={CONTAINER_STYLE}>
      <WorkspaceNav locale={locale} active={active} onChange={onChange} />
      <div style={{ display: active === 'structure' ? 'flex' : 'none', flex: 1, minHeight: 0 }}>
        <StructureWorkspace
          locale={locale}
          state={state}
          dispatch={dispatch}
          metadataLoaded={metadataLoaded}
          selection={selection}
          onSelectionChange={onSelectionChange}
        />
      </div>
      {active !== 'structure' && (
        <div style={BODY_STYLE}>
          <div style={{ textAlign: 'center', color: TOKENS.textMuted, fontSize: 13, maxWidth: 320 }}>
            <div style={{ fontWeight: 600, marginBottom: 4, color: TOKENS.textSecondary }}>
              {t(locale, TAB_TITLE_KEY[active])}
            </div>
            <div>{t(locale, 'workspacePlaceholder')}</div>
          </div>
        </div>
      )}
    </div>
  );
}
