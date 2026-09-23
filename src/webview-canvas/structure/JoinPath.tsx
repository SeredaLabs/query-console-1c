import * as React from 'react';
import { TOKENS } from '../theme';
import { joinKindVisual, type JoinKindLabel } from './joinKind';

/**
 * SVG-частина одного JOIN (design §5/§7): видима лінія (2px / 3px selected)
 * + окремий прозорий hit-path (8-10px, `pointer-events:stroke`) — та сама
 * стандартна SVG-техніка, без бібліотеки. Рендериться У СПІЛЬНОМУ <svg>-шарі
 * ПІД картками (design §1) — картки, намальовані пізніше в DOM, візуально
 * перекривають кінці лінії там, де вона проходить під ними.
 *
 * Gap analysis: лінія раніше завжди була одного кольору (border/accent) —
 * "не ідентифікує зв'язок". Тепер колір лінії = kind identity
 * (`joinKindVisual`, той самий, що вже в панелі налаштування) — тип видно
 * одразу, без наведення/вибору. Accent залишається за selection/hover, але
 * як підсилення (товщина + вищий opacity), не заміна кольору.
 *
 * `React.memo` + `index`-параметр у колбеках (Phase 3C performance pass) —
 * той самий підхід, що й TableCard: батько передає стабільний `useCallback`.
 */
export const JoinPath = React.memo(function JoinPath({
  index,
  d,
  kind,
  selected,
  hovered,
  dimmed,
  onClick,
  onHoverChange,
}: {
  index: number;
  /** Уже прокладений obstacle-aware SVG path; один і той самий route використовують line, hit-area і minimap. */
  d: string;
  kind: JoinKindLabel;
  selected: boolean;
  hovered: boolean;
  /** Phase 5 focus/dimming — знижує opacity ЛИШЕ видимого stroke; hit-path лишається клікабельним. */
  dimmed: boolean;
  onClick: (index: number) => void;
  onHoverChange: (index: number, hovered: boolean) => void;
}): React.ReactElement {
  const color = joinKindVisual(kind, TOKENS).color;
  const active = selected || hovered;
  const strokeWidth = selected ? 3 : 2;

  return (
    <>
      {selected && (
        // Selection halo — окремий ширший accent-stroke ПІД kind-кольоровою
        // лінією: розрізняє "яка це connection is selected" від "який тип
        // з'єднання", не змішуючи selection-семантику (accent) з kind-color.
        <path d={d} stroke={TOKENS.accent} strokeWidth={7} fill="none" pointerEvents="none" opacity={0.25} />
      )}
      <path
        d={d}
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
        pointerEvents="none"
        opacity={dimmed ? 0.35 : active ? 1 : 0.75}
      />
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
