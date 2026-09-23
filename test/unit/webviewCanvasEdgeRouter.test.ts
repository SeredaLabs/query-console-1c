import { describe, expect, it } from 'vitest';
import {
  routeEdges,
  type RoutedEdge,
  type RoutingEdge,
  type RoutingNode,
} from '../../src/webview-canvas/structure/edgeRouter';
import type { Point, Rect } from '../../src/webview-canvas/structure/geometry';

const CARD = { width: 240, height: 232 };

function node(id: string, x: number, y: number): RoutingNode {
  return { id, rect: { x, y, ...CARD } };
}

function edge(id: string, sourceId: string, targetId: string): RoutingEdge {
  return { id, sourceId, targetId };
}

function segments(points: readonly Point[]): Array<readonly [Point, Point]> {
  return points.slice(1).map((point, index) => [points[index], point] as const);
}

function segmentCrossesRectInterior(a: Point, b: Point, rect: Rect): boolean {
  if (a.x === b.x) {
    return a.x > rect.x && a.x < rect.x + rect.width
      && Math.max(Math.min(a.y, b.y), rect.y) < Math.min(Math.max(a.y, b.y), rect.y + rect.height);
  }
  if (a.y === b.y) {
    return a.y > rect.y && a.y < rect.y + rect.height
      && Math.max(Math.min(a.x, b.x), rect.x) < Math.min(Math.max(a.x, b.x), rect.x + rect.width);
  }
  return true;
}

function segmentOverlap(a1: Point, a2: Point, b1: Point, b2: Point): number {
  const aHorizontal = a1.y === a2.y;
  const bHorizontal = b1.y === b2.y;
  if (aHorizontal !== bHorizontal) return 0;
  if (aHorizontal) {
    if (a1.y !== b1.y) return 0;
    return Math.max(0, Math.min(Math.max(a1.x, a2.x), Math.max(b1.x, b2.x))
      - Math.max(Math.min(a1.x, a2.x), Math.min(b1.x, b2.x)));
  }
  if (a1.x !== b1.x) return 0;
  return Math.max(0, Math.min(Math.max(a1.y, a2.y), Math.max(b1.y, b2.y))
    - Math.max(Math.min(a1.y, a2.y), Math.min(b1.y, b2.y)));
}

function requireRoute(route: RoutedEdge | null): RoutedEdge {
  expect(route).not.toBeNull();
  return route!;
}

describe('webview-canvas structure/edgeRouter', () => {
  it('routes around a foreign table instead of crossing its rectangle', () => {
    const middle = node('middle', 340, 0);
    const [route] = routeEdges(
      [node('left', 0, 0), middle, node('right', 680, 0)],
      [edge('join', 'left', 'right')]
    );

    const routed = requireRoute(route);
    expect(segments(routed.points).every(([a, b]) => !segmentCrossesRectInterior(a, b, middle.rect))).toBe(true);
    expect(routed.points.length).toBeGreaterThan(2);
  });

  it('assigns distinct ports to several joins on the same side of a hub', () => {
    const nodes = [
      node('hub', 0, 300),
      node('a', 680, 0),
      node('b', 680, 150),
      node('c', 680, 300),
      node('d', 680, 450),
      node('e', 680, 600),
    ];
    const routes = routeEdges(nodes, ['a', 'b', 'c', 'd', 'e'].map(id => edge(id, 'hub', id)));
    const starts = routes.map(route => requireRoute(route).start);

    expect(new Set(starts.map(point => `${point.x},${point.y}`)).size).toBe(starts.length);
  });

  it('separates parallel joins between the same pair of tables', () => {
    const routes = routeEdges(
      [node('left', 0, 0), node('right', 680, 0)],
      [edge('first', 'left', 'right'), edge('second', 'left', 'right')]
    ).map(requireRoute);

    expect(routes[0].d).not.toBe(routes[1].d);
    expect(routes[0].start).not.toEqual(routes[1].start);
    expect(routes[0].end).not.toEqual(routes[1].end);
  });

  it('is deterministic for the same node and edge order', () => {
    const nodes = [node('a', 0, 0), node('blocker', 340, 0), node('b', 680, 0)];
    const edges = [edge('one', 'a', 'b'), edge('two', 'a', 'b')];

    expect(routeEdges(nodes, edges)).toEqual(routeEdges(nodes, edges));
  });

  it('uses congestion costs to avoid shared segments in the controlled diagonal case', () => {
    const routes = routeEdges(
      [node('a', 0, 0), node('b', 0, 500), node('c', 680, 0), node('d', 680, 500)],
      [edge('a-d', 'a', 'd'), edge('b-c', 'b', 'c')]
    ).map(requireRoute);

    const first = segments(routes[0].points);
    const second = segments(routes[1].points);
    expect(first.some(([a1, a2]) => second.some(([b1, b2]) => segmentOverlap(a1, a2, b1, b2) > 0))).toBe(false);
  });

  it('places the label outside every table rectangle', () => {
    const nodes = [node('a', 0, 0), node('blocker', 340, 0), node('b', 680, 0)];
    const routed = requireRoute(routeEdges(nodes, [edge('join', 'a', 'b')])[0]);
    const badge = { x: routed.label.x - 36, y: routed.label.y - 12, width: 72, height: 24 };

    for (const { rect } of nodes) {
      const overlaps = badge.x < rect.x + rect.width
        && badge.x + badge.width > rect.x
        && badge.y < rect.y + rect.height
        && badge.y + badge.height > rect.y;
      expect(overlaps).toBe(false);
    }
  });

  it('returns null for an edge whose endpoint node is missing', () => {
    expect(routeEdges([node('a', 0, 0)], [edge('join', 'a', 'missing')])).toEqual([null]);
  });
});
