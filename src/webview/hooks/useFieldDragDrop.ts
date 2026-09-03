import * as React from 'react';

/** Полезная нагрузка перетаскивания простого поля выборки (tableId + путь). */
export interface FieldDragPayload {
  tableId: string;
  path: string;
}

interface UseFieldDragDropResult {
  /** onDragStart списка-источника: сериализует {tableId, path} в dataTransfer. */
  dragStart: (e: React.DragEvent, tableId: string, path: string) => void;
  /** Распарсить payload из dataTransfer на onDrop; null — если данные повреждены/чужие. */
  parseDrop: (e: React.DragEvent) => FieldDragPayload | null;
  /** onDragOver целевой зоны: preventDefault + dropEffect='copy'. */
  allowDrop: (e: React.DragEvent) => void;
  /** Общий стиль зоны списка-источника/приёма поля (flex, overflow, minHeight). */
  dropZone: React.CSSProperties;
}

/**
 * Общая механика drag-and-drop простых полей выборки между списком-источником
 * «Поля» и целевой зоной вкладки — раньше OrderTab/GroupingTab/TotalsTab/
 * IndexTab копипастили идентичные dragStart/parseDrop/allowDrop и стиль
 * dropZone (~20 строк на вкладку). Различается только то, что каждая вкладка
 * делает с payload'ом после успешного drop (какое действие диспатчить) —
 * это остаётся на стороне вызывающего кода, в его собственном onDrop.
 *
 *   const { dragStart, parseDrop, allowDrop, dropZone } = useFieldDragDrop();
 *   <div draggable onDragStart={e => dragStart(e, f.tableId, f.path)} />
 *   <div style={dropZone} onDragOver={allowDrop} onDrop={e => {
 *     e.preventDefault();
 *     const d = parseDrop(e);
 *     if (d) onAddOrderField(d.tableId, d.path);
 *   }} />
 *
 * Примечание: у AdditionalTab похожий, но не идентичный механизм — payload
 * там {fullName} (перетаскивается таблица, а не поле), а allowDrop несёт
 * дополнительное условие (`lockEnabled`). Он сознательно не переведён на этот
 * хук: подгонка под общий payload потребовала бы либо runtime-валидатора формы
 * (которым не пользуется ни один из четырёх реальных вызывающих), либо
 * протекающей абстракции ради вкладки, которая перетаскивает другую сущность.
 */
export function useFieldDragDrop(): UseFieldDragDropResult {
  const dragStart = React.useCallback((e: React.DragEvent, tableId: string, path: string) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ tableId, path }));
    e.dataTransfer.effectAllowed = 'copy';
  }, []);

  const parseDrop = React.useCallback((e: React.DragEvent): FieldDragPayload | null => {
    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
      if (data && typeof data.tableId === 'string' && typeof data.path === 'string') {
        return { tableId: data.tableId, path: data.path };
      }
    } catch { /* ignore */ }
    return null;
  }, []);

  const allowDrop = React.useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const dropZone = React.useMemo<React.CSSProperties>(() => ({
    flex: 1,
    overflowY: 'auto',
    fontSize: 13,
    minHeight: 40,
  }), []);

  return { dragStart, parseDrop, allowDrop, dropZone };
}
