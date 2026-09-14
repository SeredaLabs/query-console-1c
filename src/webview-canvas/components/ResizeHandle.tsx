import * as React from 'react';

/**
 * Перетаскиваемый разделитель ширини/висоти сусідньої панелі. Локальна копія
 * того ж патерну, що й src/webview/components/ResizeHandle.tsx (Classic) —
 * НЕ імпортується звідти свідомо: New Builder — окремий бандл
 * (src/webview-canvas/**), і Phase 1 не повинен створювати cross-bundle
 * залежність заради 50 рядків generic-утиліти.
 */
export function ResizeHandle({
  onResize,
  axis = 'x',
}: {
  onResize: (delta: number) => void;
  axis?: 'x' | 'y';
}): React.ReactElement {
  const onMouseDown = React.useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      let last = axis === 'x' ? e.clientX : e.clientY;
      const move = (ev: MouseEvent): void => {
        const cur = axis === 'x' ? ev.clientX : ev.clientY;
        if (cur !== last) {
          onResize(cur - last);
          last = cur;
        }
      };
      const up = (): void => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
      document.body.style.cursor = axis === 'x' ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';
    },
    [axis, onResize]
  );

  const base: React.CSSProperties = {
    flexShrink: 0,
    cursor: axis === 'x' ? 'col-resize' : 'row-resize',
    background: 'transparent',
    zIndex: 1,
  };
  const style: React.CSSProperties =
    axis === 'x'
      ? { ...base, width: 6, alignSelf: 'stretch', margin: '0 -3px' }
      : { ...base, height: 6, width: '100%', margin: '-3px 0' };

  return (
    <div
      role="separator"
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      onMouseDown={onMouseDown}
      style={style}
    />
  );
}
