import { describe, expect, it } from 'vitest';
import {
  boundingBox,
  clampZoom,
  fitTransform,
  screenToWorld,
  worldToScreen,
  zoomAtCursor,
  ZOOM_MAX,
  ZOOM_MIN,
} from '../../src/webview-canvas/structure/geometry';

describe('webview-canvas structure/geometry', () => {
  it('worldToScreen/screenToWorld — взаємно обернені за будь-якої трансформації', () => {
    const t = { zoom: 1.5, pan: { x: 40, y: -20 } };
    const world = { x: 123, y: 45 };
    expect(screenToWorld(worldToScreen(world, t), t)).toEqual(world);
  });

  it('clampZoom — обмежує в межах [ZOOM_MIN, ZOOM_MAX]', () => {
    expect(clampZoom(0.01)).toBe(ZOOM_MIN);
    expect(clampZoom(100)).toBe(ZOOM_MAX);
    expect(clampZoom(1)).toBe(1);
  });

  it('zoomAtCursor — world-точка під курсором лишається під курсором після зміни zoom', () => {
    const t = { zoom: 1, pan: { x: 0, y: 0 } };
    const cursor = { x: 300, y: 200 };
    const worldBefore = screenToWorld(cursor, t);
    const next = zoomAtCursor(t, cursor, 2);
    const worldAfter = screenToWorld(cursor, next);
    expect(worldAfter.x).toBeCloseTo(worldBefore.x, 6);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y, 6);
    expect(next.zoom).toBe(2);
  });

  it('boundingBox — null для порожнього списку, об\'єднує прямокутники інакше', () => {
    expect(boundingBox([])).toBeNull();
    const box = boundingBox([
      { x: 0, y: 0, width: 100, height: 50 },
      { x: 200, y: 100, width: 40, height: 40 },
    ]);
    expect(box).toEqual({ x: 0, y: 0, width: 240, height: 140 });
  });

  it('fitTransform — центрує content у viewport з відступом', () => {
    const content = { x: 0, y: 0, width: 200, height: 100 };
    const viewport = { width: 800, height: 600 };
    const t = fitTransform(content, viewport, 0);
    // content-центр (100,50) під трансформацією має потрапити у viewport-центр (400,300).
    const screenCenter = worldToScreen({ x: 100, y: 50 }, t);
    expect(screenCenter.x).toBeCloseTo(400, 6);
    expect(screenCenter.y).toBeCloseTo(300, 6);
  });
});
