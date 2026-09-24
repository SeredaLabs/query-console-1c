/**
 * Чисті (без React) геометричні хелпери канви: world↔screen трансформація,
 * zoom-to-cursor, bounding box для Fit. Unit-тестуються ізольовано, так само
 * як core/query — жодного DOM/React тут.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Transform {
  zoom: number;
  pan: Point;
}

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 2;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampZoom(zoom: number): number {
  return clamp(zoom, ZOOM_MIN, ZOOM_MAX);
}

/** World-точка → screen-точка під поточною трансформацією. */
export function worldToScreen(world: Point, t: Transform): Point {
  return { x: world.x * t.zoom + t.pan.x, y: world.y * t.zoom + t.pan.y };
}

/** Screen-точка → world-точка (інверсія worldToScreen). */
export function screenToWorld(screen: Point, t: Transform): Point {
  return { x: (screen.x - t.pan.x) / t.zoom, y: (screen.y - t.pan.y) / t.zoom };
}

/**
 * Нова трансформація після зміни zoom так, щоб world-точка ПІД курсором
 * (у screen-координатах `cursor`) лишилась під курсором після зміни.
 */
export function zoomAtCursor(t: Transform, cursor: Point, nextZoom: number): Transform {
  const clamped = clampZoom(nextZoom);
  const worldUnderCursor = screenToWorld(cursor, t);
  return {
    zoom: clamped,
    pan: {
      x: cursor.x - worldUnderCursor.x * clamped,
      y: cursor.y - worldUnderCursor.y * clamped,
    },
  };
}

/** Габарити прямокутника картки за позицією (top-left) і розміром. */
export function cardRect(pos: Point, size: { width: number; height: number }): Rect {
  return { x: pos.x, y: pos.y, width: size.width, height: size.height };
}

function rectCenter(r: Rect): Point {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

/**
 * Anchor-точки JOIN-лінії між двома картками (Phase 3B правило, задане
 * прямо): порівнюємо ЦЕНТРИ карток. `abs(dx) > abs(dy)` → з'єднуємо
 * лівий/правий боки (горизонтально домінує); інакше — верх/низ.
 */
export function anchorPoints(a: Rect, b: Rect): { a: Point; b: Point } {
  const ca = rectCenter(a);
  const cb = rectCenter(b);
  const dx = cb.x - ca.x;
  const dy = cb.y - ca.y;
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0
      ? { a: { x: a.x + a.width, y: ca.y }, b: { x: b.x, y: cb.y } } // a праворуч → a.right, b.left
      : { a: { x: a.x, y: ca.y }, b: { x: b.x + b.width, y: cb.y } }; // a ліворуч → a.left, b.right
  }
  return dy > 0
    ? { a: { x: ca.x, y: a.y + a.height }, b: { x: cb.x, y: b.y } } // a вище → a.bottom, b.top
    : { a: { x: ca.x, y: a.y }, b: { x: cb.x, y: b.y + b.height } }; // a нижче → a.top, b.bottom
}

/** Об'єднана bounding box набору прямокутників; null якщо порожньо. */
export function boundingBox(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Трансформація, що вписує `content` у `viewport` з відступом `padding` з
 * усіх боків, по центру. Використовується кнопкою Fit.
 */
export function fitTransform(content: Rect, viewport: { width: number; height: number }, padding: number): Transform {
  const availW = Math.max(1, viewport.width - padding * 2);
  const availH = Math.max(1, viewport.height - padding * 2);
  const zoom = clampZoom(Math.min(availW / Math.max(1, content.width), availH / Math.max(1, content.height)));
  const contentCenterX = content.x + content.width / 2;
  const contentCenterY = content.y + content.height / 2;
  return {
    zoom,
    pan: {
      x: viewport.width / 2 - contentCenterX * zoom,
      y: viewport.height / 2 - contentCenterY * zoom,
    },
  };
}

const MINIMAP_MAX_SCALE = 3;

/**
 * Лінійна world→minimap-piксель трансформація (top-left origin, БЕЗ
 * центрування — на відміну від fitTransform, тут просто {scale,offset}, бо
 * малюємо прямокутники/лінії напряму в локальних пікселях мінімапи).
 * `scale` обмежено зверху (§ MINIMAP_MAX_SCALE), щоб дуже маленький content
 * (1-2 картки поруч) не розтягувався до абсурду всередині 160×100 рамки.
 */
export function minimapTransform(
  content: Rect,
  mapSize: { width: number; height: number },
  padding: number
): { scale: number; offsetX: number; offsetY: number } {
  const availW = Math.max(1, mapSize.width - padding * 2);
  const availH = Math.max(1, mapSize.height - padding * 2);
  const scale = Math.min(
    MINIMAP_MAX_SCALE,
    Math.min(availW / Math.max(1, content.width), availH / Math.max(1, content.height))
  );
  return {
    scale,
    offsetX: padding - content.x * scale + (availW - content.width * scale) / 2,
    offsetY: padding - content.y * scale + (availH - content.height * scale) / 2,
  };
}

export function worldToMinimap(p: Point, t: { scale: number; offsetX: number; offsetY: number }): Point {
  return { x: p.x * t.scale + t.offsetX, y: p.y * t.scale + t.offsetY };
}

export function minimapToWorld(p: Point, t: { scale: number; offsetX: number; offsetY: number }): Point {
  return { x: (p.x - t.offsetX) / t.scale, y: (p.y - t.offsetY) / t.scale };
}

/**
 * Чи "суттєво перевищує viewport" контент, для показу/приховання minimap
 * (design §8, zoom-aware — не статичний поріг): ховаємо, коли ЦІЛИЙ content
 * уже вміщається в поточний видимий world-rect за розміром.
 */
export function contentExceedsViewport(content: Rect, viewportWorld: Rect): boolean {
  return content.width > viewportWorld.width || content.height > viewportWorld.height;
}
