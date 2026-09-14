import * as React from 'react';
import { TOKENS } from '../theme';
import type { Transform } from './geometry';

const DOT_GRID_SIZE = 18; // 16-20px за visual spec §11

/**
 * Transformed viewport (design §1/§2): один wrapper з `transform: translate()
 * scale()`, у якому й картки (Phase 3A), і join-лінії (Phase 3B) лежатимуть в
 * ОДНІЙ world-системі координат. Фон-drag = pan; фон-клік = очистити
 * selection. Дочірні елементи (картки) самі зупиняють propagation свого
 * власного pointerdown/click, щоб не тригерити pan/deselect.
 */
export function CanvasSurface({
  transform,
  onWheelZoom,
  onPanBy,
  onBackgroundClick,
  containerRef,
  children,
  emptyState,
  fixedOverlay,
}: {
  transform: Transform;
  onWheelZoom: (cursor: { x: number; y: number }, factor: number) => void;
  onPanBy: (dx: number, dy: number) => void;
  onBackgroundClick: () => void;
  containerRef: React.RefObject<HTMLDivElement>;
  children: React.ReactNode;
  /**
   * Empty-state overlay (§26 spec) — центрований, НЕ у world-транформованому
   * шарі (лишається на місці незалежно від pan/zoom). Обгортка сама
   * `pointerEvents:none`, щоб не заважати pan/deselect фону; auto лише на
   * власному контенті (щоб кнопка "+ Додати джерело" лишалась клікабельною).
   */
  emptyState?: React.ReactNode;
  /**
   * Фіксований overlay (Phase 3C — minimap): так само НЕ у world-transform
   * шарі, інакше рухався б/масштабувався разом із канвою замість лишатись
   * прибитим у куті viewport'а.
   */
  fixedOverlay?: React.ReactNode;
}): React.ReactElement {
  const panDragRef = React.useRef<{ x: number; y: number } | null>(null);
  const movedRef = React.useRef(false);

  const onWheel = (e: React.WheelEvent): void => {
    // Bug fix: onWheel висить на кореневому контейнері (bubbling), тому
    // скрол усередині TableCard-івського списку полів (`.qcc-card-fields`,
    // власний internal overflow:auto) теж долітав сюди й перехоплювався як
    // canvas-zoom (preventDefault() убивав нативний scroll картки). Якщо
    // курсор фактично над елементом із власним внутрішнім скролом —
    // пропускаємо canvas zoom і даємо браузеру проскролити його нативно.
    if ((e.target as HTMLElement).closest('.qcc-card-fields')) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const cursor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const factor = Math.exp(-e.deltaY * 0.001);
    onWheelZoom(cursor, factor);
  };

  const onPointerDown = (e: React.PointerEvent): void => {
    if (e.target !== e.currentTarget) return; // клік/drag пішов від картки/JOIN — не панувати
    // setPointerCapture кидає NotFoundError для деяких джерел pointer-подій
    // (підтверджено live QA) — необроблений виняток тут раніше зривав решту
    // обробника й міг лишати panDragRef у неконсистентному стані.
    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {
      /* no-op */
    }
    panDragRef.current = { x: e.clientX, y: e.clientY };
    movedRef.current = false;
  };
  const onPointerMove = (e: React.PointerEvent): void => {
    if (!panDragRef.current) return;
    const dx = e.clientX - panDragRef.current.x;
    const dy = e.clientY - panDragRef.current.y;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) movedRef.current = true;
    panDragRef.current = { x: e.clientX, y: e.clientY };
    onPanBy(dx, dy);
  };
  const onPointerUp = (e: React.PointerEvent): void => {
    // Реагуємо ЛИШЕ якщо саме НАШ onPointerDown ініціював цей цикл
    // (panDragRef.current виставляється тільки там, і тільки для
    // target===currentTarget). Інакше pointerup, що забубнявів від картки/
    // JOIN (дочірній елемент міг не зупинити propagation, чи його власний
    // capture-виклик кинув виняток раніше), помилково очищав би selection
    // одразу після її встановлення — головна причина нестабільного deselect,
    // знайдена live QA Phase 3B.
    if (panDragRef.current === null) return;
    try {
      (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    } catch {
      /* no-op — див. коментар у onPointerDown */
    }
    panDragRef.current = null;
    if (!movedRef.current) onBackgroundClick();
  };

  return (
    <div
      ref={containerRef}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{
        flex: 1,
        minHeight: 0,
        position: 'relative',
        overflow: 'hidden',
        cursor: panDragRef.current ? 'grabbing' : 'grab',
        background: TOKENS.background,
        // Phase 3D: borderSubtle (не border) — менш контрастна крапка,
        // щоб dot-grid не конкурував з картками/JOIN за увагу (§5 gap analysis).
        backgroundImage: `radial-gradient(${TOKENS.borderSubtle} 1px, transparent 1px)`,
        backgroundSize: `${DOT_GRID_SIZE}px ${DOT_GRID_SIZE}px`,
        backgroundPosition: `${transform.pan.x}px ${transform.pan.y}px`,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          transform: `translate(${transform.pan.x}px, ${transform.pan.y}px) scale(${transform.zoom})`,
          transformOrigin: '0 0',
        }}
      >
        {children}
      </div>
      {emptyState && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <div style={{ pointerEvents: 'auto' }}>{emptyState}</div>
        </div>
      )}
      {fixedOverlay}
    </div>
  );
}
