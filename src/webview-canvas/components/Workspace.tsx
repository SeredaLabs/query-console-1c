import * as React from 'react';
import type { SupportedLocale } from '../../shared/locale';
import type { QueryAction, QueryState } from '../../webview/state/queryStore';
import { AdditionalWorkspace } from '../additional/AdditionalWorkspace';
import { ConditionsWorkspace } from '../conditions/ConditionsWorkspace';
import { FieldsWorkspace } from '../fields/FieldsWorkspace';
import { GroupingWorkspace } from '../grouping/GroupingWorkspace';
import { SortingWorkspace } from '../sorting/SortingWorkspace';
import { StructureWorkspace, type StructureSelection } from '../structure/StructureWorkspace';
import { WorkspaceNav, type WorkspaceTab } from './WorkspaceNav';

const CONTAINER_STYLE: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

/**
 * Workspace: nav + вміст активної вкладки. Усі 6 вкладок тепер мають
 * реальний вміст (Structure Phase 3A, Fields Phase 7, Conditions Phase 8,
 * Grouping Phase 9, Sorting Phase 10, Additional Phase 11) — generic
 * "буде реалізовано в наступній фазі" placeholder (`workspacePlaceholder`)
 * більше нікуди не рендериться, лишений в i18n на випадок майбутньої
 * вкладки, не видалений звідти навмисно.
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
  inspectorWidth,
  onInspectorResize,
}: {
  locale: SupportedLocale;
  active: WorkspaceTab;
  onChange: (tab: WorkspaceTab) => void;
  state: QueryState;
  dispatch: React.Dispatch<QueryAction>;
  metadataLoaded: boolean;
  selection: StructureSelection;
  onSelectionChange: (selection: StructureSelection) => void;
  inspectorWidth: number;
  onInspectorResize: (delta: number) => void;
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
      <div style={{ display: active === 'structure' ? 'flex' : 'none', flex: 1, minWidth: 0, minHeight: 0 }}>
        <StructureWorkspace
          locale={locale}
          state={state}
          dispatch={dispatch}
          metadataLoaded={metadataLoaded}
          selection={selection}
          onSelectionChange={onSelectionChange}
          inspectorWidth={inspectorWidth}
          onInspectorResize={onInspectorResize}
        />
      </div>
      <div style={{ display: active === 'fields' ? 'flex' : 'none', flex: 1, minWidth: 0, minHeight: 0 }}>
        <FieldsWorkspace locale={locale} state={state} dispatch={dispatch} onGoToStructure={() => onChange('structure')} />
      </div>
      <div style={{ display: active === 'conditions' ? 'flex' : 'none', flex: 1, minWidth: 0, minHeight: 0 }}>
        <ConditionsWorkspace locale={locale} state={state} dispatch={dispatch} onGoToStructure={() => onChange('structure')} />
      </div>
      <div style={{ display: active === 'grouping' ? 'flex' : 'none', flex: 1, minWidth: 0, minHeight: 0 }}>
        <GroupingWorkspace locale={locale} state={state} dispatch={dispatch} onGoToStructure={() => onChange('structure')} />
      </div>
      <div style={{ display: active === 'sorting' ? 'flex' : 'none', flex: 1, minWidth: 0, minHeight: 0 }}>
        <SortingWorkspace locale={locale} state={state} dispatch={dispatch} onGoToFields={() => onChange('fields')} />
      </div>
      <div style={{ display: active === 'additional' ? 'flex' : 'none', flex: 1, minWidth: 0, minHeight: 0 }}>
        <AdditionalWorkspace locale={locale} state={state} dispatch={dispatch} />
      </div>
    </div>
  );
}
