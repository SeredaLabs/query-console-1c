import { describe, expect, it } from 'vitest';
import {
  contentExceedsViewport,
  minimapToWorld,
  minimapTransform,
  worldToMinimap,
  type Rect,
} from '../../src/webview-canvas/structure/geometry';

describe('webview-canvas structure/geometry: minimapTransform / world<->minimap', () => {
  it('worldToMinimap/minimapToWorld — взаємно обернені', () => {
    const content: Rect = { x: 0, y: 0, width: 1000, height: 400 };
    const t = minimapTransform(content, { width: 160, height: 100 }, 6);
    const world = { x: 342, y: 88 };
    const back = minimapToWorld(worldToMinimap(world, t), t);
    expect(back.x).toBeCloseTo(world.x, 6);
    expect(back.y).toBeCloseTo(world.y, 6);
  });

  it('великий content вписується в 160×100 з відступом (не виходить за межі)', () => {
    const content: Rect = { x: 0, y: 0, width: 2000, height: 1500 };
    const t = minimapTransform(content, { width: 160, height: 100 }, 6);
    const topLeft = worldToMinimap({ x: content.x, y: content.y }, t);
    const bottomRight = worldToMinimap({ x: content.x + content.width, y: content.y + content.height }, t);
    expect(topLeft.x).toBeGreaterThanOrEqual(0);
    expect(topLeft.y).toBeGreaterThanOrEqual(0);
    expect(bottomRight.x).toBeLessThanOrEqual(160.001);
    expect(bottomRight.y).toBeLessThanOrEqual(100.001);
  });

  it('дуже маленький content не розтягується абсурдно (scale обмежено)', () => {
    const content: Rect = { x: 0, y: 0, width: 10, height: 10 };
    const t = minimapTransform(content, { width: 160, height: 100 }, 6);
    expect(t.scale).toBeLessThanOrEqual(3);
  });

  it('offset коректно центрує вузький/високий content без "розповзання" по довшій осі', () => {
    // Вузька колонка карток (width << height) — типовий кейс layered layout.
    const content: Rect = { x: 0, y: 0, width: 240, height: 2000 };
    const t = minimapTransform(content, { width: 160, height: 100 }, 6);
    const topLeft = worldToMinimap({ x: 0, y: 0 }, t);
    const bottomRight = worldToMinimap({ x: 240, y: 2000 }, t);
    expect(bottomRight.y - topLeft.y).toBeLessThanOrEqual(100 - 6 * 2 + 0.001);
  });
});

describe('webview-canvas structure/geometry: contentExceedsViewport', () => {
  it('content менший за viewport → false (minimap ховається)', () => {
    const content: Rect = { x: 0, y: 0, width: 300, height: 200 };
    const viewport: Rect = { x: -50, y: -50, width: 800, height: 600 };
    expect(contentExceedsViewport(content, viewport)).toBe(false);
  });

  it('content ширший за viewport → true (minimap показується)', () => {
    const content: Rect = { x: 0, y: 0, width: 3000, height: 200 };
    const viewport: Rect = { x: 0, y: 0, width: 800, height: 600 };
    expect(contentExceedsViewport(content, viewport)).toBe(true);
  });

  it('content вищий за viewport → true', () => {
    const content: Rect = { x: 0, y: 0, width: 300, height: 3000 };
    const viewport: Rect = { x: 0, y: 0, width: 800, height: 600 };
    expect(contentExceedsViewport(content, viewport)).toBe(true);
  });
});
