import * as React from 'react';
import { TOKENS } from '../theme';
import type { Point } from './geometry';

/**
 * SVG-частина одного JOIN (design §5/§7): видима лінія (2px / 3px selected)
 * + окремий прозорий hit-path (8-10px, `pointer-events:stroke`) — та сама
 * стандартна SVG-техніка, без бібліотеки. Рендериться У СПІЛЬНОМУ <svg>-шарі
 * ПІД картками (design §1) — картки, намальовані пізніше в DOM, візуально
 * перекривають кінці лінії там, де вона проходить під ними.
 *
 * `React.memo` + `index`-параметр у колбеках (Phase 3C performance pass) —
 * той самий підхід, що й TableCard: батько передає стабільний `useCallback`.
 */
export const JoinPath = React.memo(function JoinPath({
  index,
  a,
  b,
  selected,
  hovered,
  dimmed,
  onClick,
  onHoverChange,
}: {
  index: number;
  a: Point;
  b: Point;
  selected: boolean;
  hovered: boolean;
  /** Phase 5 focus/dimming — знижує opacity ЛИШЕ видимого stroke; hit-path лишається клікабельним. */
  dimmed: boolean;
  onClick: (index: number) => void;
  onHoverChange: (index: number, hovered: boolean) => void;
}): React.ReactElement {
  const d = `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
  const color = selected || hovered ? TOKENS.accent : TOKENS.border;
  const strokeWidth = selected ? 3 : 2;

  return (
    <>
      <path d={d} stroke={color} strokeWidth={strokeWidth} fill="none" pointerEvents="none" opacity={dimmed ? 0.45 : 1} />
      <path
        d={d}
        stroke="transparent"
        strokeWidth={9}
        fill="none"
        style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
        onPointerDown={e => e.stopPropagation()}
        onClick={e => {
          e.stopPropagation();
          onClick(index);
        }}
        onMouseEnter={() => onHoverChange(index, true)}
        onMouseLeave={() => onHoverChange(index, false)}
      />
    </>
  );
});
