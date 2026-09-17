import { describe, expect, it } from 'vitest';
import { anchorPoints, type Rect } from '../../src/webview-canvas/structure/geometry';
import { joinKindLabel } from '../../src/webview-canvas/structure/joinKind';

function rect(x: number, y: number, width = 240, height = 90): Rect {
  return { x, y, width, height };
}

describe('webview-canvas structure/geometry: anchorPoints', () => {
  it('abs(dx) > abs(dy) і B праворуч від A → right/left (горизонтальна пара)', () => {
    const a = rect(0, 0);
    const b = rect(500, 20); // dx=500-... великий, dy малий
    const { a: pa, b: pb } = anchorPoints(a, b);
    expect(pa.x).toBe(a.x + a.width); // правий бік A
    expect(pb.x).toBe(b.x); // лівий бік B
    expect(pa.y).toBe(a.y + a.height / 2);
    expect(pb.y).toBe(b.y + b.height / 2);
  });

  it('абс(dx) > abs(dy) і B ліворуч від A → left/right', () => {
    const a = rect(500, 0);
    const b = rect(0, 10);
    const { a: pa, b: pb } = anchorPoints(a, b);
    expect(pa.x).toBe(a.x); // лівий бік A
    expect(pb.x).toBe(b.x + b.width); // правий бік B
  });

  it('abs(dy) >= abs(dx) і B нижче A → bottom/top (вертикальна пара)', () => {
    const a = rect(0, 0);
    const b = rect(10, 400);
    const { a: pa, b: pb } = anchorPoints(a, b);
    expect(pa.y).toBe(a.y + a.height); // низ A
    expect(pb.y).toBe(b.y); // верх B
    expect(pa.x).toBe(a.x + a.width / 2);
    expect(pb.x).toBe(b.x + b.width / 2);
  });

  it('abs(dy) > abs(dx) і B вище A → top/bottom', () => {
    const a = rect(0, 400);
    const b = rect(10, 0);
    const { a: pa, b: pb } = anchorPoints(a, b);
    expect(pa.y).toBe(a.y); // верх A
    expect(pb.y).toBe(b.y + b.height); // низ B
  });
});

describe('webview-canvas structure/joinKind: joinKindLabel', () => {
  it('leftAll=false, rightAll=false → INNER (дефолт ADD_JOIN)', () => {
    expect(joinKindLabel(false, false)).toBe('INNER');
  });
  it('leftAll=true, rightAll=false → LEFT', () => {
    expect(joinKindLabel(true, false)).toBe('LEFT');
  });
  it('leftAll=true, rightAll=true → FULL', () => {
    expect(joinKindLabel(true, true)).toBe('FULL');
  });
});
