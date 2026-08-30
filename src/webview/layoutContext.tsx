import * as React from 'react';
import type { Layout } from '../shared/messages';

interface LayoutContextValue {
  layout: Layout;
  setLayoutValue: (key: string, value: number) => void;
}

const LayoutContext = React.createContext<LayoutContextValue>({
  layout: {},
  setLayoutValue: () => {},
});

export const LayoutProvider = LayoutContext.Provider;

/**
 * 8.3.8: замена React.useState(default) для ширин/высот панелей-разделителей —
 * тот же тип возврата (значение + сеттер, включая функциональную форму
 * setValue(prev => …), как у ResizeHandle), но значение читается/пишется в
 * общий Layout (см. layoutContext), сохраняемый между открытиями конструктора.
 * `key` должен быть уникален в пределах всего приложения (не только вкладки).
 */
export function useLayoutValue(key: string, defaultValue: number): [number, React.Dispatch<React.SetStateAction<number>>] {
  const { layout, setLayoutValue } = React.useContext(LayoutContext);
  const current = layout[key] ?? defaultValue;
  const setValue = React.useCallback(
    (action: React.SetStateAction<number>) => {
      const next = typeof action === 'function' ? (action as (prev: number) => number)(current) : action;
      setLayoutValue(key, next);
    },
    [key, current, setLayoutValue]
  );
  return [current, setValue];
}
