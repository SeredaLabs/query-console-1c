import type { Join, SelectedTable } from '../../core/query/queryModel';

export interface Size {
  width: number;
  height: number;
}

export interface Pos {
  x: number;
  y: number;
}

// Phase 5: стандартизована geometry (усі картки — 240×232, фіксовано; див.
// usePositions.ts STANDARD_CARD_SIZE). Використовується лише як fallback,
// якщо `cardSize` accessor не передано (реальний виклик з StructureWorkspace
// завжди передає getCardSize).
const DEFAULT_CARD_SIZE: Size = { width: 240, height: 232 };
const HORIZONTAL_GAP = 100; // 80-120px за visual spec §33
const VERTICAL_GAP = 52; // 40-64px за visual spec §33
const SINGLETON_COLUMNS = 4; // скільки карток без зв'язків в одному ряду, щоб не витягувати canvas в одну довгу лінію

/**
 * Layered/BFS auto-layout (.claude/new_builder_phase3_design.md §layout).
 * Рахує позиції ЛИШЕ для tableId, яких ще немає в `existingPositions` —
 *既 розташовані/перетягнуті картки не чіпає (auto-layout vs manual drag,
 * design §4). У Phase 3A `joins` реалістично завжди порожній (JOIN — Phase
 * 3B), тому основний шлях, який реально виконується зараз, — це "singleton"
 * гілка нижче; BFS-гілка для з'єднаних компонент готова наперед для 3B.
 */
export function computeAutoLayout(
  tables: SelectedTable[],
  joins: Join[],
  existingPositions: Record<string, Pos>,
  cardSize: (id: string) => Size = () => DEFAULT_CARD_SIZE
): Record<string, Pos> {
  const newIds = tables.map(t => t.id).filter(id => !(id in existingPositions));
  if (newIds.length === 0) return {};

  const idSet = new Set(newIds);
  const adjacency = new Map<string, Set<string>>();
  for (const id of newIds) adjacency.set(id, new Set());
  for (const j of joins) {
    if (idSet.has(j.leftTableId) && idSet.has(j.rightTableId)) {
      adjacency.get(j.leftTableId)!.add(j.rightTableId);
      adjacency.get(j.rightTableId)!.add(j.leftTableId);
    }
  }

  // Компоненти зв'язності серед НОВИХ таблиць (порядок — як у selectedTables).
  const visited = new Set<string>();
  const components: string[][] = [];
  for (const id of newIds) {
    if (visited.has(id)) continue;
    const queue = [id];
    visited.add(id);
    const component: string[] = [];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      component.push(cur);
      for (const next of adjacency.get(cur) ?? []) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
    components.push(component);
  }

  // Позиції вже зайнятих карток — щоб нові компоненти не накладались на існуючі.
  const occupiedRects = Object.entries(existingPositions).map(([id, pos]) => {
    const size = cardSize(id);
    return { x1: pos.x, y1: pos.y, x2: pos.x + size.width, y2: pos.y + size.height };
  });
  let cursorX = occupiedRects.length > 0 ? Math.max(...occupiedRects.map(r => r.x2)) + HORIZONTAL_GAP : 0;
  const baseY = occupiedRects.length > 0 ? Math.min(...occupiedRects.map(r => r.y1)) : 0;

  const result: Record<string, Pos> = {};
  const singleton: string[] = [];

  for (const component of components) {
    if (component.length === 1 && adjacency.get(component[0])!.size === 0) {
      singleton.push(component[0]);
      continue;
    }
    // BFS-шари всередині зв'язної компоненти (готово для Phase 3B, коли
    // з'являться реальні joins): root = перший елемент компоненти.
    const layers: string[][] = [];
    const layerOf = new Map<string, number>();
    const bfsQueue = [component[0]];
    layerOf.set(component[0], 0);
    while (bfsQueue.length > 0) {
      const cur = bfsQueue.shift()!;
      const layer = layerOf.get(cur)!;
      layers[layer] = layers[layer] ?? [];
      layers[layer].push(cur);
      for (const next of adjacency.get(cur) ?? []) {
        if (!layerOf.has(next)) {
          layerOf.set(next, layer + 1);
          bfsQueue.push(next);
        }
      }
    }
    let maxWidth = 0;
    layers.forEach((layer, layerIdx) => {
      layer.forEach((id, colIdx) => {
        const size = cardSize(id);
        result[id] = {
          x: cursorX + colIdx * (size.width + HORIZONTAL_GAP),
          y: baseY + layerIdx * (size.height + VERTICAL_GAP),
        };
        maxWidth = Math.max(maxWidth, colIdx * (size.width + HORIZONTAL_GAP) + size.width);
      });
    });
    cursorX += maxWidth + HORIZONTAL_GAP;
  }

  // Картки без жодного зв'язку — компактна сітка, щоб не витягувати canvas в один рядок.
  singleton.forEach((id, i) => {
    const size = cardSize(id);
    const row = Math.floor(i / SINGLETON_COLUMNS);
    const col = i % SINGLETON_COLUMNS;
    result[id] = {
      x: cursorX + col * (size.width + HORIZONTAL_GAP),
      y: baseY + row * (size.height + VERTICAL_GAP),
    };
  });

  return result;
}
