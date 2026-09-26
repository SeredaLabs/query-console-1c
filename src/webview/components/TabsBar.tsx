import * as React from 'react';
import { t, type MessageKey } from '../i18n';

export const TABS = ['Таблицы и поля', 'Группировка', 'Условия', 'Дополнительно', 'Индексы', 'Объединения/Псевдонимы', 'Порядок', 'Итоги', 'Построитель', 'Пакет запросов'];

const TAB_LABELS: Record<string, MessageKey> = {
  'Таблицы и поля': 'tabs.tablesAndFields',
  'Связи': 'tabs.connections',
  'Группировка': 'tabs.grouping',
  'Условия': 'tabs.conditions',
  'Дополнительно': 'tabs.additional',
  'Индексы': 'tabs.indexes',
  'Объединения/Псевдонимы': 'tabs.unionsAliases',
  'Порядок': 'tabs.order',
  'Итоги': 'tabs.totals',
  'Построитель': 'tabs.builder',
  'Пакет запросов': 'tabs.batch',
};

interface Props {
  /** Видимые вкладки (вычисляются в App в зависимости от состояния). */
  tabs: string[];
  active: string;
  onSelect: (tab: string) => void;
}

export function TabsBar({ tabs, active, onSelect }: Props): React.ReactElement {
  return (
    <div
      data-testid="tabsbar"
      role="tablist"
      style={{
        display: 'flex',
        flexShrink: 0,
        borderBottom: '1px solid var(--qc-border)',
        background: 'var(--vscode-editorGroupHeader-tabsBackground, #252526)',
        overflowX: 'auto',
        overflowY: 'hidden',
        scrollbarWidth: 'thin',
      }}
    >
      {/* Вкладки — как вкладки панелей VS Code (Problems/Output/Terminal): без
          отдельного «бокса» на каждую, активная — цвет текста + акцентная черта
          снизу. Вес шрифта не меняется, чтобы активная вкладка не «прыгала» по
          ширине. Цвета — через CSS-классы, чтобы hover мог их перебить. */}
      <style>{`
        .qc-tab { color: var(--vscode-tab-inactiveForeground, #969696); }
        .qc-tab:hover { color: var(--vscode-tab-activeForeground, #fff); background: var(--vscode-tab-hoverBackground, transparent); }
        .qc-tab.qc-tab--active {
          color: var(--vscode-tab-activeForeground, #fff);
          outline: 1px dashed var(--vscode-contrastActiveBorder, transparent);
          outline-offset: -3px;
        }
        .qc-tab:focus-visible, .qc-tab.qc-tab--active:focus-visible {
          outline: 1px solid var(--vscode-focusBorder, #007fd4);
          outline-offset: -1px;
        }
      `}</style>
      {tabs.map(tab => {
        const isActive = tab === active;
        return (
          <div
            key={tab}
            data-tab={tab}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            className={`qc-tab${isActive ? ' qc-tab--active' : ''}`}
            onClick={() => onSelect(tab)}
            onKeyDown={e => {
              // Клавиатура: ←/→/Home/End — между вкладками (roving tabindex, как
              // tablist в VS Code), Enter/Space — выбрать сфокусированную.
              const idx = tabs.indexOf(tab);
              let next = -1;
              if (e.key === 'ArrowRight') next = (idx + 1) % tabs.length;
              else if (e.key === 'ArrowLeft') next = (idx - 1 + tabs.length) % tabs.length;
              else if (e.key === 'Home') next = 0;
              else if (e.key === 'End') next = tabs.length - 1;
              else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(tab); return; }
              if (next < 0) return;
              e.preventDefault();
              onSelect(tabs[next]);
              const bar = e.currentTarget.parentElement;
              requestAnimationFrame(() => bar?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus());
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              height: 32,
              boxSizing: 'border-box',
              padding: '0 12px',
              cursor: 'pointer',
              fontSize: 13,
              userSelect: 'none',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              borderBottom: isActive
                ? '2px solid var(--vscode-panelTitle-activeBorder, var(--vscode-focusBorder, #007fd4))'
                : '2px solid transparent',
              borderTop: '2px solid transparent',
            }}
          >
            {t(TAB_LABELS[tab])}
          </div>
        );
      })}
    </div>
  );
}
