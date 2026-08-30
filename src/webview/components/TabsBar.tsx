import * as React from 'react';

export const TABS = ['Таблицы и поля', 'Группировка', 'Условия', 'Дополнительно', 'Индексы', 'Объединения/Псевдонимы', 'Порядок', 'Итоги', 'Построитель', 'Пакет запросов'];

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
      style={{
        display: 'flex',
        borderBottom: '1px solid var(--qc-border)',
        background: 'var(--vscode-editorGroupHeader-tabsBackground, #252526)',
        overflowX: 'auto',
        overflowY: 'hidden',
      }}
    >
      <style>{`
        .qc-tab { background: var(--vscode-tab-inactiveBackground, #2d2d2d); }
        .qc-tab:hover { background: var(--vscode-tab-hoverBackground, rgba(255,255,255,0.06)); }
      `}</style>
      {tabs.map(tab => {
        const isActive = tab === active;
        return (
          <div
            key={tab}
            data-tab={tab}
            className={`qc-tab${isActive ? ' qc-tab--active' : ''}`}
            onClick={() => onSelect(tab)}
            style={{
              padding: '6px 16px',
              cursor: 'pointer',
              fontSize: 13,
              userSelect: 'none',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              transition: 'background-color 0.1s',
              // Каждая вкладка — отдельный «бокс»: правый разделитель + рамка сверху.
              borderRight: '1px solid var(--qc-border)',
              borderTop: isActive
                ? '3px solid var(--vscode-focusBorder, #007fd4)'
                : '3px solid transparent',
              // Активная вкладка — приподнятый, подсвеченный фон; неактивные — утопленные/темнее
              // (фон неактивной задаёт CSS-класс выше, чтобы hover мог его перебить).
              background: isActive ? 'var(--vscode-tab-activeBackground, #1e1e1e)' : undefined,
              color: isActive
                ? 'var(--vscode-tab-activeForeground, #fff)'
                : 'var(--vscode-tab-inactiveForeground, #999)',
              fontWeight: isActive ? 600 : 400,
              // Активная вкладка визуально сливается с панелью контента снизу,
              // неактивные сохраняют нижний разделитель.
              borderBottom: isActive
                ? '1px solid var(--vscode-tab-activeBackground, #1e1e1e)'
                : '1px solid var(--qc-border)',
              marginBottom: -1,
            }}
          >
            {tab}
          </div>
        );
      })}
    </div>
  );
}
