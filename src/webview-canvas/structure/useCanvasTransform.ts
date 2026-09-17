import * as React from 'react';
import { clampZoom, fitTransform, zoomAtCursor, type Point, type Rect, type Transform } from './geometry';

const FIT_PADDING = 48;
const ZOOM_STEP = 1.2;

/**
 * Локальний UI-стан pan/zoom канви Structure. Ніколи не потрапляє в
 * QueryState — чисто presentation (design §3 "Manual positions storage" —
 * той самий принцип поширюється й на трансформацію перегляду).
 */
export function useCanvasTransform(): {
  transform: Transform;
  zoomAt: (cursor: Point, factor: number) => void;
  zoomButton: (dir: 1 | -1) => void;
  panBy: (dx: number, dy: number) => void;
  resetZoom: () => void;
  fitTo: (content: Rect, viewport: { width: number; height: number }) => void;
  centerOn: (worldPoint: Point, viewport: { width: number; height: number }) => void;
} {
  const [transform, setTransform] = React.useState<Transform>({ zoom: 1, pan: { x: 0, y: 0 } });
  const viewportCenterRef = React.useRef<Point>({ x: 0, y: 0 });

  const zoomAt = React.useCallback((cursor: Point, factor: number) => {
    viewportCenterRef.current = cursor;
    setTransform(t => zoomAtCursor(t, cursor, t.zoom * factor));
  }, []);

  // Кнопки тулбару зумять навколо ОСТАННЬОЇ відомої точки курсора над канвою
  // (або центру, якщо миша ще не заходила) — той самий zoomAtCursor, що й wheel.
  const zoomButton = React.useCallback((dir: 1 | -1) => {
    setTransform(t => zoomAtCursor(t, viewportCenterRef.current, t.zoom * (dir > 0 ? ZOOM_STEP : 1 / ZOOM_STEP)));
  }, []);

  const panBy = React.useCallback((dx: number, dy: number) => {
    setTransform(t => ({ ...t, pan: { x: t.pan.x + dx, y: t.pan.y + dy } }));
  }, []);

  const resetZoom = React.useCallback(() => {
    setTransform(t => {
      // 100% навколо поточного видимого центру, а не (0,0) — щоб скидання
      // масштабу не "стрибало" в довільний куток canvas.
      const cursor = viewportCenterRef.current;
      return zoomAtCursor(t, cursor, 1);
    });
  }, []);

  const fitTo = React.useCallback((content: Rect, viewport: { width: number; height: number }) => {
    setTransform(fitTransform(content, viewport, FIT_PADDING));
  }, []);

  /** Minimap click/drag → зробити world-точку центром видимого viewport (zoom не змінюється). */
  const centerOn = React.useCallback((worldPoint: Point, viewport: { width: number; height: number }) => {
    setTransform(t => ({
      zoom: t.zoom,
      pan: { x: viewport.width / 2 - worldPoint.x * t.zoom, y: viewport.height / 2 - worldPoint.y * t.zoom },
    }));
  }, []);

  const setCursorHint = React.useCallback((p: Point) => {
    viewportCenterRef.current = p;
  }, []);

  return {
    transform: { ...transform, zoom: clampZoom(transform.zoom) },
    zoomAt: (cursor, factor) => {
      setCursorHint(cursor);
      zoomAt(cursor, factor);
    },
    zoomButton,
    panBy,
    resetZoom,
    fitTo,
    centerOn,
  };
}
