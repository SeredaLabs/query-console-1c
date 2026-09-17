import * as React from 'react';
import type { Join, SelectedTable } from '../../core/query/queryModel';
import { computeAutoLayout, type Pos, type Size } from './layout';

/**
 * Phase 5: стандартизована geometry — усі source-картки мають ОДНАКОВИЙ
 * фіксований розмір (240×232 — 40px header + 192px fields viewport,
 * internal scroll усередині). Content адаптується під geometry картки, а
 * не навпаки, тож `cardSize()` більше не потребує runtime-вимірювання —
 * ResizeObserver/onMeasured/setCardSize (Phase 3C) прибрано як мертвий код.
 */
const STANDARD_CARD_SIZE: Size = { width: 240, height: 232 };

/**
 * Позиції карток (design §3/§4): Canvas-local, НІКОЛИ не в QueryState.
 * Auto-layout рахується ЛИШЕ для tableId без запису в positions (нова
 * таблиця / вперше видимий package-крок) — перетягнуті картки
 * (`manuallyPositioned`) auto-layout більше не чіпає, окрім явного
 * "Auto Layout" (resetLayout).
 */
export function usePositions(
  tables: SelectedTable[],
  joins: Join[]
): {
  positions: Record<string, Pos>;
  cardSize: (id: string) => Size;
  updatePosition: (id: string, pos: Pos) => void;
  isManual: (id: string) => boolean;
  resetLayout: () => void;
} {
  const [positions, setPositions] = React.useState<Record<string, Pos>>({});
  const [manuallyPositioned, setManuallyPositioned] = React.useState<Set<string>>(new Set());
  const positionsRef = React.useRef(positions);
  positionsRef.current = positions;

  const getCardSize = React.useCallback((_id: string): Size => STANDARD_CARD_SIZE, []);

  // Прибрати позиції/manual-мітки таблиць, яких більше немає у видимому
  // наборі (REMOVE_TABLE або перемикання package/query — design §9/§10),
  // і докласти auto-layout для щойно з'явлених tableId.
  React.useEffect(() => {
    const currentIds = new Set(tables.map(t => t.id));

    setManuallyPositioned(prev => {
      let changed = false;
      const next = new Set(prev);
      for (const id of Array.from(next)) {
        if (!currentIds.has(id)) { next.delete(id); changed = true; }
      }
      return changed ? next : prev;
    });

    const patch = computeAutoLayout(tables, joins, positionsRef.current, getCardSize);
    const hasRemoved = Object.keys(positionsRef.current).some(id => !currentIds.has(id));

    if (Object.keys(patch).length === 0 && !hasRemoved) return;
    setPositions(prev => {
      const next: Record<string, Pos> = {};
      for (const [id, pos] of Object.entries(prev)) if (currentIds.has(id)) next[id] = pos;
      return { ...next, ...patch };
    });
    // tables/joins — референс-стабільні лише як значення reducer-стейту;
    // навмисно не додаємо positions/manuallyPositioned у залежності (інакше
    // ефект зациклився б сам на собі) — актуальний стан читаємо через ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables, joins, getCardSize]);

  const updatePosition = React.useCallback((id: string, pos: Pos) => {
    setPositions(prev => ({ ...prev, [id]: pos }));
    setManuallyPositioned(prev => (prev.has(id) ? prev : new Set(prev).add(id)));
  }, []);

  const isManual = React.useCallback((id: string) => manuallyPositioned.has(id), [manuallyPositioned]);

  const resetLayout = React.useCallback(() => {
    setManuallyPositioned(new Set());
    setPositions(() => computeAutoLayout(tables, joins, {}, getCardSize));
  }, [tables, joins, getCardSize]);

  return { positions, cardSize: getCardSize, updatePosition, isManual, resetLayout };
}
