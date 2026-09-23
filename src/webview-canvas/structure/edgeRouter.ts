import type { Point, Rect } from './geometry';

export interface RoutingNode {
  id: string;
  rect: Rect;
}

export interface RoutingEdge {
  id: string | number;
  sourceId: string;
  targetId: string;
}

export interface RoutedEdge {
  id: string | number;
  points: Point[];
  d: string;
  start: Point;
  end: Point;
  label: Point;
}

type Side = 'left' | 'right' | 'top' | 'bottom';
type Direction = 0 | 1 | 2; // none, horizontal, vertical

interface Endpoint {
  edgeIndex: number;
  role: 'source' | 'target';
  node: RoutingNode;
  remote: RoutingNode;
  side: Side;
  port?: Point;
}

interface Segment {
  a: Point;
  b: Point;
}

interface HeapItem {
  cost: number;
  state: number;
}

const CLEARANCE = 18;
const PORT_CORNER_MARGIN = 28;
const BEND_PENALTY = 32;
const CROSSING_PENALTY = 120;
const LABEL_WIDTH = 72;
const LABEL_HEIGHT = 24;
const EPSILON = 0.0001;

function center(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

function endpointSides(source: Rect, target: Rect): { source: Side; target: Side } {
  const a = center(source);
  const b = center(target);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? { source: 'right', target: 'left' } : { source: 'left', target: 'right' };
  }
  return dy >= 0 ? { source: 'bottom', target: 'top' } : { source: 'top', target: 'bottom' };
}

function portPoint(rect: Rect, side: Side, index: number, count: number): Point {
  const horizontalSide = side === 'top' || side === 'bottom';
  const span = horizontalSide ? rect.width : rect.height;
  const margin = Math.min(PORT_CORNER_MARGIN, span / 4);
  const offset = margin + ((span - margin * 2) * (index + 1)) / (count + 1);
  switch (side) {
    case 'left': return { x: rect.x, y: rect.y + offset };
    case 'right': return { x: rect.x + rect.width, y: rect.y + offset };
    case 'top': return { x: rect.x + offset, y: rect.y };
    case 'bottom': return { x: rect.x + offset, y: rect.y + rect.height };
  }
}

function exitPoint(port: Point, side: Side): Point {
  switch (side) {
    case 'left': return { x: port.x - CLEARANCE, y: port.y };
    case 'right': return { x: port.x + CLEARANCE, y: port.y };
    case 'top': return { x: port.x, y: port.y - CLEARANCE };
    case 'bottom': return { x: port.x, y: port.y + CLEARANCE };
  }
}

function inflate(rect: Rect, amount: number): Rect {
  return {
    x: rect.x - amount,
    y: rect.y - amount,
    width: rect.width + amount * 2,
    height: rect.height + amount * 2,
  };
}

function pointInsideRect(point: Point, rect: Rect): boolean {
  return point.x > rect.x + EPSILON
    && point.x < rect.x + rect.width - EPSILON
    && point.y > rect.y + EPSILON
    && point.y < rect.y + rect.height - EPSILON;
}

function segmentCrossesRectInterior(a: Point, b: Point, rect: Rect): boolean {
  if (Math.abs(a.x - b.x) < EPSILON) {
    if (a.x <= rect.x + EPSILON || a.x >= rect.x + rect.width - EPSILON) return false;
    const lo = Math.min(a.y, b.y);
    const hi = Math.max(a.y, b.y);
    return Math.max(lo, rect.y) < Math.min(hi, rect.y + rect.height) - EPSILON;
  }
  if (Math.abs(a.y - b.y) < EPSILON) {
    if (a.y <= rect.y + EPSILON || a.y >= rect.y + rect.height - EPSILON) return false;
    const lo = Math.min(a.x, b.x);
    const hi = Math.max(a.x, b.x);
    return Math.max(lo, rect.x) < Math.min(hi, rect.x + rect.width) - EPSILON;
  }
  return true;
}

function segmentIsClear(a: Point, b: Point, obstacles: readonly Rect[]): boolean {
  return obstacles.every(rect => !segmentCrossesRectInterior(a, b, rect));
}

function segmentLength(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function direction(a: Point, b: Point): Direction {
  return Math.abs(a.y - b.y) < EPSILON ? 1 : 2;
}

function overlapLength(a: Segment, b: Segment): number {
  const aHorizontal = Math.abs(a.a.y - a.b.y) < EPSILON;
  const bHorizontal = Math.abs(b.a.y - b.b.y) < EPSILON;
  if (aHorizontal !== bHorizontal) return 0;
  if (aHorizontal) {
    if (Math.abs(a.a.y - b.a.y) >= EPSILON) return 0;
    return Math.max(0, Math.min(Math.max(a.a.x, a.b.x), Math.max(b.a.x, b.b.x))
      - Math.max(Math.min(a.a.x, a.b.x), Math.min(b.a.x, b.b.x)));
  }
  if (Math.abs(a.a.x - b.a.x) >= EPSILON) return 0;
  return Math.max(0, Math.min(Math.max(a.a.y, a.b.y), Math.max(b.a.y, b.b.y))
    - Math.max(Math.min(a.a.y, a.b.y), Math.min(b.a.y, b.b.y)));
}

function crossesExisting(a: Segment, b: Segment): boolean {
  const aHorizontal = Math.abs(a.a.y - a.b.y) < EPSILON;
  const bHorizontal = Math.abs(b.a.y - b.b.y) < EPSILON;
  if (aHorizontal === bHorizontal) return false;
  const h = aHorizontal ? a : b;
  const v = aHorizontal ? b : a;
  const x = v.a.x;
  const y = h.a.y;
  return x > Math.min(h.a.x, h.b.x) + EPSILON
    && x < Math.max(h.a.x, h.b.x) - EPSILON
    && y > Math.min(v.a.y, v.b.y) + EPSILON
    && y < Math.max(v.a.y, v.b.y) - EPSILON;
}

function congestionPenalty(segment: Segment, used: readonly Segment[]): number {
  let penalty = 0;
  for (const other of used) {
    const overlap = overlapLength(segment, other);
    if (overlap > EPSILON) penalty += CROSSING_PENALTY + overlap * 2;
    else if (crossesExisting(segment, other)) penalty += CROSSING_PENALTY;
  }
  return penalty;
}

class MinHeap {
  private readonly items: HeapItem[] = [];

  push(item: HeapItem): void {
    this.items.push(item);
    let index = this.items.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.items[parent].cost <= item.cost) break;
      this.items[index] = this.items[parent];
      index = parent;
    }
    this.items[index] = item;
  }

  pop(): HeapItem | undefined {
    if (this.items.length === 0) return undefined;
    const root = this.items[0];
    const tail = this.items.pop()!;
    if (this.items.length === 0) return root;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      if (left >= this.items.length) break;
      const child = right < this.items.length && this.items[right].cost < this.items[left].cost ? right : left;
      if (this.items[child].cost >= tail.cost) break;
      this.items[index] = this.items[child];
      index = child;
    }
    this.items[index] = tail;
    return root;
  }
}

function uniqueSorted(values: number[]): number[] {
  return Array.from(new Set(values)).sort((a, b) => a - b);
}

function pointKey(point: Point): string {
  return `${point.x}|${point.y}`;
}

function findOrthogonalPath(start: Point, end: Point, obstacles: readonly Rect[], used: readonly Segment[]): Point[] | null {
  const xs = uniqueSorted([start.x, end.x, ...obstacles.flatMap(rect => [rect.x, rect.x + rect.width])]);
  const ys = uniqueSorted([start.y, end.y, ...obstacles.flatMap(rect => [rect.y, rect.y + rect.height])]);
  const points: Point[] = [];
  const indexByKey = new Map<string, number>();

  for (const y of ys) {
    for (const x of xs) {
      const point = { x, y };
      if (obstacles.some(rect => pointInsideRect(point, rect))) continue;
      indexByKey.set(pointKey(point), points.length);
      points.push(point);
    }
  }

  const startIndex = indexByKey.get(pointKey(start));
  const endIndex = indexByKey.get(pointKey(end));
  if (startIndex === undefined || endIndex === undefined) return null;

  const adjacency: Array<Array<{ to: number; length: number }>> = points.map(() => []);
  const connectLine = (indices: number[]): void => {
    for (let i = 1; i < indices.length; i++) {
      const from = indices[i - 1];
      const to = indices[i];
      if (!segmentIsClear(points[from], points[to], obstacles)) continue;
      const length = segmentLength(points[from], points[to]);
      adjacency[from].push({ to, length });
      adjacency[to].push({ to: from, length });
    }
  };

  for (const y of ys) {
    connectLine(points.map((point, index) => ({ point, index }))
      .filter(entry => Math.abs(entry.point.y - y) < EPSILON)
      .sort((a, b) => a.point.x - b.point.x)
      .map(entry => entry.index));
  }
  for (const x of xs) {
    connectLine(points.map((point, index) => ({ point, index }))
      .filter(entry => Math.abs(entry.point.x - x) < EPSILON)
      .sort((a, b) => a.point.y - b.point.y)
      .map(entry => entry.index));
  }

  const stateCount = points.length * 3;
  const distance = Array<number>(stateCount).fill(Infinity);
  const previous = Array<number>(stateCount).fill(-1);
  const startState = startIndex * 3;
  distance[startState] = 0;
  const heap = new MinHeap();
  heap.push({ cost: 0, state: startState });
  let finalState = -1;

  while (true) {
    const current = heap.pop();
    if (!current) break;
    if (current.cost !== distance[current.state]) continue;
    const nodeIndex = Math.floor(current.state / 3);
    const previousDirection = (current.state % 3) as Direction;
    if (nodeIndex === endIndex) {
      finalState = current.state;
      break;
    }
    for (const next of adjacency[nodeIndex]) {
      const nextDirection = direction(points[nodeIndex], points[next.to]);
      const turn = previousDirection !== 0 && previousDirection !== nextDirection ? BEND_PENALTY : 0;
      const segment = { a: points[nodeIndex], b: points[next.to] };
      const nextCost = current.cost + next.length + turn + congestionPenalty(segment, used);
      const nextState = next.to * 3 + nextDirection;
      if (nextCost >= distance[nextState]) continue;
      distance[nextState] = nextCost;
      previous[nextState] = current.state;
      heap.push({ cost: nextCost, state: nextState });
    }
  }

  if (finalState < 0) return null;
  const reversed: Point[] = [];
  for (let state = finalState; state >= 0; state = previous[state]) {
    reversed.push(points[Math.floor(state / 3)]);
    if (state === startState) break;
  }
  return reversed.reverse();
}

function simplify(points: readonly Point[]): Point[] {
  const result: Point[] = [];
  for (const point of points) {
    const last = result[result.length - 1];
    if (last && Math.abs(last.x - point.x) < EPSILON && Math.abs(last.y - point.y) < EPSILON) continue;
    const previous = result[result.length - 2];
    if (previous && last) {
      const sameX = Math.abs(previous.x - last.x) < EPSILON && Math.abs(last.x - point.x) < EPSILON;
      const sameY = Math.abs(previous.y - last.y) < EPSILON && Math.abs(last.y - point.y) < EPSILON;
      if (sameX || sameY) {
        result[result.length - 1] = point;
        continue;
      }
    }
    result.push(point);
  }
  return result;
}

function format(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

export function orthogonalPath(points: readonly Point[], cornerRadius = 8): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${format(points[0].x)} ${format(points[0].y)}`;
  let d = `M ${format(points[0].x)} ${format(points[0].y)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const previous = points[i - 1];
    const current = points[i];
    const next = points[i + 1];
    const radius = Math.min(cornerRadius, segmentLength(previous, current) / 2, segmentLength(current, next) / 2);
    const before = {
      x: current.x + Math.sign(previous.x - current.x) * radius,
      y: current.y + Math.sign(previous.y - current.y) * radius,
    };
    const after = {
      x: current.x + Math.sign(next.x - current.x) * radius,
      y: current.y + Math.sign(next.y - current.y) * radius,
    };
    d += ` L ${format(before.x)} ${format(before.y)} Q ${format(current.x)} ${format(current.y)} ${format(after.x)} ${format(after.y)}`;
  }
  const last = points[points.length - 1];
  return `${d} L ${format(last.x)} ${format(last.y)}`;
}

function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function labelRect(point: Point): Rect {
  return { x: point.x - LABEL_WIDTH / 2, y: point.y - LABEL_HEIGHT / 2, width: LABEL_WIDTH, height: LABEL_HEIGHT };
}

function chooseLabel(points: readonly Point[], nodeRects: readonly Rect[], occupied: readonly Rect[]): Point {
  const candidates: Array<{ point: Point; score: number }> = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const length = segmentLength(a, b);
    if (length < 1) continue;
    for (const fraction of [0.5, 1 / 3, 2 / 3]) {
      candidates.push({
        point: { x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction },
        score: length + (Math.abs(a.y - b.y) < EPSILON ? 20 : 0) - Math.abs(fraction - 0.5),
      });
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.point.x - b.point.x || a.point.y - b.point.y);
  for (const candidate of candidates) {
    const rect = labelRect(candidate.point);
    if (nodeRects.some(nodeRect => rectsIntersect(rect, nodeRect))) continue;
    if (occupied.some(other => rectsIntersect(rect, other))) continue;
    return candidate.point;
  }
  return candidates[0]?.point ?? points[0] ?? { x: 0, y: 0 };
}

function fallbackPath(start: Point, end: Point, obstacles: readonly Rect[]): Point[] {
  const horizontalFirst = [start, { x: end.x, y: start.y }, end];
  if (segmentIsClear(horizontalFirst[0], horizontalFirst[1], obstacles)
    && segmentIsClear(horizontalFirst[1], horizontalFirst[2], obstacles)) return simplify(horizontalFirst);
  return simplify([start, { x: start.x, y: end.y }, end]);
}

/**
 * Routes all edges as one deterministic batch. Routing as a batch matters:
 * endpoint ports are allocated together and already-routed segments are used
 * as a congestion penalty for subsequent edges.
 */
export function routeEdges(nodes: readonly RoutingNode[], edges: readonly RoutingEdge[]): Array<RoutedEdge | null> {
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const endpoints: Endpoint[] = [];

  edges.forEach((edge, edgeIndex) => {
    const source = nodeById.get(edge.sourceId);
    const target = nodeById.get(edge.targetId);
    if (!source || !target) return;
    const sides = endpointSides(source.rect, target.rect);
    endpoints.push({ edgeIndex, role: 'source', node: source, remote: target, side: sides.source });
    endpoints.push({ edgeIndex, role: 'target', node: target, remote: source, side: sides.target });
  });

  const groups = new Map<string, Endpoint[]>();
  for (const endpoint of endpoints) {
    const key = `${endpoint.node.id}:${endpoint.side}`;
    const group = groups.get(key) ?? [];
    group.push(endpoint);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    const side = group[0].side;
    group.sort((a, b) => {
      const ac = center(a.remote.rect);
      const bc = center(b.remote.rect);
      const primary = side === 'left' || side === 'right' ? ac.y - bc.y : ac.x - bc.x;
      return primary || a.edgeIndex - b.edgeIndex || a.role.localeCompare(b.role);
    });
    group.forEach((endpoint, index) => {
      endpoint.port = portPoint(endpoint.node.rect, endpoint.side, index, group.length);
    });
  }

  const endpointByEdge = new Map<number, { source?: Endpoint; target?: Endpoint }>();
  for (const endpoint of endpoints) {
    const pair = endpointByEdge.get(endpoint.edgeIndex) ?? {};
    pair[endpoint.role] = endpoint;
    endpointByEdge.set(endpoint.edgeIndex, pair);
  }

  const inflatedObstacles = nodes.map(node => inflate(node.rect, CLEARANCE));
  const usedSegments: Segment[] = [];
  const occupiedLabels: Rect[] = [];
  return edges.map((edge, edgeIndex) => {
    const pair = endpointByEdge.get(edgeIndex);
    if (!pair?.source?.port || !pair.target?.port) return null;
    const sourceExit = exitPoint(pair.source.port, pair.source.side);
    const targetExit = exitPoint(pair.target.port, pair.target.side);
    const core = findOrthogonalPath(sourceExit, targetExit, inflatedObstacles, usedSegments)
      ?? fallbackPath(sourceExit, targetExit, inflatedObstacles);
    const points = simplify([pair.source.port, ...core, pair.target.port]);
    const label = chooseLabel(points, nodes.map(node => node.rect), occupiedLabels);
    occupiedLabels.push(labelRect(label));
    for (let i = 1; i < points.length; i++) usedSegments.push({ a: points[i - 1], b: points[i] });
    return {
      id: edge.id,
      points,
      d: orthogonalPath(points),
      start: pair.source.port,
      end: pair.target.port,
      label,
    };
  });
}
