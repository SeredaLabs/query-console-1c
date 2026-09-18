import * as React from 'react';
import { TOKENS } from '../theme';
import type { Point } from './geometry';
import { joinKindVisual, type JoinKindLabel } from './joinKind';

const MARKER_SIZE = 5; // Phase 3D: 6→5, трохи менш домінантний normal-стан (§7 gap analysis)

function Marker({ point, color, opacity }: { point: Point; color: string; opacity: number }): React.ReactElement {
  return (
    <div
      style={{
        position: 'absolute',
        left: point.x - MARKER_SIZE / 2,
        top: point.y - MARKER_SIZE / 2,
        width: MARKER_SIZE,
        height: MARKER_SIZE,
        borderRadius: '50%',
        background: color,
        opacity,
        pointerEvents: 'none',
      }}
    />
  );
}

/**
 * HTML-частина одного JOIN (design §6/badge): endpoint markers + текстовий
 * pill LEFT/INNER/FULL (§13 spec) — рендериться НАД картками (design §5),
 * щоб підпис ніколи не ховався під сусідньою карткою. Сам не кликабельний
 * (`pointerEvents:none` на контейнері) — клік/hover обробляє JoinPath.
 */
export const JoinOverlay = React.memo(function JoinOverlay({
  index,
  a,
  b,
  mid,
  kind,
  selected,
  hovered,
  dimmed,
  removeTitle,
  onRemove,
}: {
  index: number;
  a: Point;
  b: Point;
  mid: Point;
  kind: JoinKindLabel;
  selected: boolean;
  hovered: boolean;
  /** Phase 5 focus/dimming. */
  dimmed: boolean;
  removeTitle: string;
  onRemove: (index: number) => void;
}): React.ReactElement {
  const active = selected || hovered;
  const visual = joinKindVisual(kind, TOKENS);
  // Phase 3D: normal-стан endpoint markers — subtle (§7); full at selected/hovered.
  const markerOpacity = active ? 1 : 0.7;
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', opacity: dimmed ? 0.45 : 1 }}>
      <Marker point={a} color={visual.color} opacity={markerOpacity} />
      <Marker point={b} color={visual.color} opacity={markerOpacity} />
      <div
        className="qcc-join-badge"
        style={{
          position: 'absolute',
          left: mid.x,
          top: mid.y,
          transform: 'translate(-50%, -50%)',
          display: 'flex',
          alignItems: 'center',
          gap: 2,
        }}
      >
        <div
          style={{
            height: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '0 6px',
            fontSize: 11,
            fontWeight: 600,
            borderRadius: 4,
            background: TOKENS.surface1,
            // Selected — accent ring (той самий принцип, що й на лінії: kind-колір лишається, selection — окремий cue).
            border: `1px solid ${visual.color}`,
            boxShadow: selected ? `0 0 0 1px ${TOKENS.accent}` : 'none',
            color: visual.color,
            whiteSpace: 'nowrap',
          }}
        >
          <span className={`codicon codicon-${visual.icon}`} style={{ fontSize: 11, flexShrink: 0 }} />
          <span>{kind}</span>
        </div>
        {selected && (
          <button
            type="button"
            className="qcc-join-remove"
            title={removeTitle}
            onClick={() => onRemove(index)}
            style={{
              pointerEvents: 'auto',
              height: 20,
              width: 18,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              borderRadius: 4,
              border: `1px solid ${TOKENS.accent}`,
              background: TOKENS.surface1,
              color: TOKENS.accent,
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
});
