import * as React from 'react';
import type { Join, SelectedTable } from '../../core/query/queryModel';
import { TOKENS } from '../theme';
import { identityColor } from './colors';
import { minimapToWorld, worldToMinimap, type Point, type Rect } from './geometry';
import type { Pos, Size } from './layout';

const MAP_WIDTH = 160;
const MAP_HEIGHT = 100;
const PADDING = 6;

/**
 * Навігаційний minimap (Phase 3C) — НЕ domain representation, читає ті самі
 * джерела, що вже рендерить Structure (positions/state.selectedTables/
 * state.joins), нічого не кешує й не дублює. Прямокутники карток —
 * identity-колір як маленький accent (border), нейтральна заливка. Лінії —
 * нейтральні, тонкі. Click/drag → `onPanTo(worldPoint)`.
 */
export function Minimap({
  tables,
  joins,
  positions,
  cardSize,
  content,
  viewportWorld,
  scaleTransform,
  onPanTo,
}: {
  tables: SelectedTable[];
  joins: Join[];
  positions: Record<string, Pos>;
  cardSize: (id: string) => Size;
  content: Rect;
  viewportWorld: Rect;
  scaleTransform: { scale: number; offsetX: number; offsetY: number };
  onPanTo: (worldPoint: Point) => void;
}): React.ReactElement {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const draggingRef = React.useRef(false);

  const panFromLocalPoint = (clientX: number, clientY: number): void => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    const local = { x: clientX - rect.left, y: clientY - rect.top };
    onPanTo(minimapToWorld(local, scaleTransform));
  };

  const onPointerDown = (e: React.PointerEvent): void => {
    e.stopPropagation();
    draggingRef.current = true;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* no-op — див. коментар у CanvasSurface.onPointerDown */
    }
    panFromLocalPoint(e.clientX, e.clientY);
  };
  const onPointerMove = (e: React.PointerEvent): void => {
    if (!draggingRef.current) return;
    e.stopPropagation();
    panFromLocalPoint(e.clientX, e.clientY);
  };
  const onPointerUp = (e: React.PointerEvent): void => {
    e.stopPropagation();
    draggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* no-op */
    }
  };

  const viewportMin = worldToMinimap({ x: viewportWorld.x, y: viewportWorld.y }, scaleTransform);
  const viewportMax = worldToMinimap(
    { x: viewportWorld.x + viewportWorld.width, y: viewportWorld.y + viewportWorld.height },
    scaleTransform
  );

  return (
    <div
      ref={rootRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{
        position: 'absolute',
        right: 12,
        bottom: 12,
        width: MAP_WIDTH,
        height: MAP_HEIGHT,
        borderRadius: 4,
        border: `1px solid ${TOKENS.border}`,
        background: TOKENS.surface1,
        overflow: 'hidden',
        cursor: 'pointer',
      }}
    >
      {tables.map((table, i) => {
        const pos = positions[table.id];
        if (!pos) return null;
        const size = cardSize(table.id);
        const topLeft = worldToMinimap(pos, scaleTransform);
        const bottomRight = worldToMinimap({ x: pos.x + size.width, y: pos.y + size.height }, scaleTransform);
        return (
          <div
            key={table.id}
            style={{
              position: 'absolute',
              left: topLeft.x,
              top: topLeft.y,
              width: Math.max(2, bottomRight.x - topLeft.x),
              height: Math.max(2, bottomRight.y - topLeft.y),
              borderRadius: 1,
              border: `1px solid ${identityColor(i)}`,
              background: TOKENS.surface2,
            }}
          />
        );
      })}
      <svg width={MAP_WIDTH} height={MAP_HEIGHT} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}>
        {joins.map((join, i) => {
          const posA = positions[join.leftTableId];
          const posB = positions[join.rightTableId];
          if (!posA || !posB) return null;
          const sizeA = cardSize(join.leftTableId);
          const sizeB = cardSize(join.rightTableId);
          const centerA = worldToMinimap({ x: posA.x + sizeA.width / 2, y: posA.y + sizeA.height / 2 }, scaleTransform);
          const centerB = worldToMinimap({ x: posB.x + sizeB.width / 2, y: posB.y + sizeB.height / 2 }, scaleTransform);
          return (
            <line
              key={i}
              x1={centerA.x}
              y1={centerA.y}
              x2={centerB.x}
              y2={centerB.y}
              stroke={TOKENS.border}
              strokeWidth={1}
            />
          );
        })}
      </svg>
      {/* Viewport rectangle — добре видимий у light/dark через accent-колір рамки + напівпрозору заливку. */}
      <div
        style={{
          position: 'absolute',
          left: Math.max(0, viewportMin.x),
          top: Math.max(0, viewportMin.y),
          width: Math.min(MAP_WIDTH, viewportMax.x) - Math.max(0, viewportMin.x),
          height: Math.min(MAP_HEIGHT, viewportMax.y) - Math.max(0, viewportMin.y),
          border: `1.5px solid ${TOKENS.accent}`,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
