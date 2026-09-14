import * as React from 'react';
import type { SupportedLocale } from '../../shared/locale';
import { t, type MessageKey } from '../i18n';
import { DIMENSIONS, TOKENS } from '../theme';

export type WorkspaceTab = 'structure' | 'fields' | 'conditions' | 'grouping' | 'sorting' | 'additional';

const TAB_LABEL_KEY: Record<WorkspaceTab, MessageKey> = {
  structure: 'workspaceStructure',
  fields: 'workspaceFields',
  conditions: 'workspaceConditions',
  grouping: 'workspaceGrouping',
  sorting: 'workspaceSorting',
  additional: 'workspaceAdditional',
};

const TABS: WorkspaceTab[] = ['structure', 'fields', 'conditions', 'grouping', 'sorting', 'additional'];

/** Semantic codicon на кожну вкладку — чиста scanning-допомога (як і в
 * TableCard/Source Browser), жодної нової інформації понад те, що вже дає
 * текстовий label. */
const TAB_ICON: Record<WorkspaceTab, string> = {
  structure: 'list-tree',
  fields: 'symbol-field',
  conditions: 'filter',
  grouping: 'group-by-ref-type',
  sorting: 'sort-precedence',
  additional: 'settings-gear',
};

const NAV_STYLE: React.CSSProperties = {
  height: DIMENSIONS.workspaceNav,
  minHeight: DIMENSIONS.workspaceNav,
  flexShrink: 0,
  display: 'flex',
  alignItems: 'stretch',
  gap: 4,
  padding: '0 12px',
  borderBottom: `1px solid ${TOKENS.border}`,
  // Phase 3D: surface2 (не background) — відділяє смугу навігації від canvas,
  // яка теж використовує background; без цього обидві зливались в один фон.
  background: TOKENS.surface2,
};

function tabStyle(active: boolean): React.CSSProperties {
  return {
    border: 'none',
    background: 'transparent',
    color: active ? TOKENS.text : TOKENS.textSecondary,
    fontWeight: active ? 600 : 400,
    fontSize: 13,
    padding: '0 6px',
    cursor: 'pointer',
    borderBottom: active ? `2px solid ${TOKENS.accent}` : '2px solid transparent',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  };
}

/** Workspace navigation (§9 visual spec) — таб-стрип; активна вкладка — local
 * UI state, без жодного зв'язку з doменом (Phase 1). */
export function WorkspaceNav({
  locale,
  active,
  onChange,
}: {
  locale: SupportedLocale;
  active: WorkspaceTab;
  onChange: (tab: WorkspaceTab) => void;
}): React.ReactElement {
  return (
    <div style={NAV_STYLE}>
      {TABS.map(tab => {
        const isActive = tab === active;
        return (
          <button key={tab} type="button" style={tabStyle(isActive)} onClick={() => onChange(tab)}>
            <span
              className={`codicon codicon-${TAB_ICON[tab]}`}
              style={{ fontSize: 14, opacity: isActive ? 1 : 0.75 }}
            />
            {t(locale, TAB_LABEL_KEY[tab])}
          </button>
        );
      })}
    </div>
  );
}
