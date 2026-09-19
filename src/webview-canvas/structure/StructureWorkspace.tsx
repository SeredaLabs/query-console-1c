import * as React from 'react';
import type { ConditionOperator } from '../../core/query/queryModel';
import type { SupportedLocale } from '../../shared/locale';
import type { QueryAction, QueryState } from '../../webview/state/queryStore';
import { allTables } from '../../webview/state/queryStore';
import { Inspector } from '../components/Inspector';
import { t } from '../i18n';
import { TOKENS } from '../theme';
import { CanvasSurface } from './CanvasSurface';
import {
  anchorPoints,
  boundingBox,
  cardRect,
  contentExceedsViewport,
  joinCurve,
  minimapTransform,
  screenToWorld,
  type Point,
  type Rect,
} from './geometry';
import { joinKindLabel, type JoinKindLabel } from './joinKind';
import type { Pos } from './layout';
import { Minimap } from './Minimap';
import { JoinOverlay } from './JoinOverlay';
import { JoinPath } from './JoinPath';
import { SourceBrowserPopover, type SourceBrowserAnchor } from './SourceBrowserPopover';
import { TableCard } from './TableCard';
import { Toolbar } from './Toolbar';
import { useCanvasTransform } from './useCanvasTransform';
import { usePositions } from './usePositions';

/**
 * Local selection (design §13 — reusable seam): 'join' variant оголошений
 * ЗАРАЗ (Phase 3A), але жодного значення з kind:'join' у 3A ще не
 * конструюється — Phase 3B додасть лише dispatch-точку, не сам тип.
 */
export type StructureSelection = { kind: 'table'; tableId: string } | { kind: 'join'; joinIndex: number } | null;

export function StructureWorkspace({
  locale,
  state,
  dispatch,
  metadataLoaded,
  selection,
  onSelectionChange,
  inspectorWidth,
  onInspectorResize,
}: {
  locale: SupportedLocale;
  state: QueryState;
  dispatch: React.Dispatch<QueryAction>;
  metadataLoaded: boolean;
  /** Selection лишається піднятим в App.tsx (переживає перемикання вкладок),
   * але сам Inspector рендериться ТУТ — нижче Toolbar/WorkspaceNav, поруч із
   * канвою, а не sibling'ом усього Workspace — щоб картка властивостей не
   * перекривала панель кнопок (+Джерело/Зв'язки) і рядок вкладок розділів,
   * і була на тому ж вертикальному рівні, що й права панель на вкладці Поля. */
  selection: StructureSelection;
  onSelectionChange: (selection: StructureSelection) => void;
  inspectorWidth: number;
  onInspectorResize: (delta: number) => void;
}): React.ReactElement {
  const setSelection = onSelectionChange;
  // Phase 3E: floating Source Browser замінює persistent Sidebar → Метадані.
  // Позиція — виміряна відносно кнопки "+ Джерело" (sourceButtonRef), а не
  // фіксований куток, щоб popover завжди відкривався "з" тригера.
  // Phase 3E.1: anchor тепер несе й width/height — обидва РЕАЛЬНО затиснуті
  // під доступний простір shellRef (workspace), а не фіксовані 340×520.
  const [sourcePopoverOpen, setSourcePopoverOpen] = React.useState(false);
  const [sourceAnchor, setSourceAnchor] = React.useState<SourceBrowserAnchor | null>(null);
  const sourceButtonRef = React.useRef<HTMLButtonElement>(null);
  const shellRef = React.useRef<HTMLDivElement>(null);

  const PREFERRED_WIDTH = 340;
  const PREFERRED_HEIGHT = 480;
  const SAFE_MARGIN = 10;

  /**
   * Phase 3E.1: рахує anchor у КООРДИНАТАХ shellRef (доступний workspace-простір,
   * не весь браузерний viewport — Source Browser не повинен вилазити за межі
   * Structure workspace). Ширина/висота — preferred, але затиснуті під реально
   * доступний простір; якщо знизу від кнопки бракує місця — panel
   * repositioning вгору (flip), а не clip.
   */
  const computeSourceAnchor = React.useCallback((): SourceBrowserAnchor | null => {
    const btn = sourceButtonRef.current;
    const shell = shellRef.current;
    if (!btn || !shell) return null;
    const br = btn.getBoundingClientRect();
    const sr = shell.getBoundingClientRect();

    const availW = Math.max(0, sr.width - SAFE_MARGIN * 2);
    const availH = Math.max(0, sr.height - SAFE_MARGIN * 2);
    const width = Math.min(PREFERRED_WIDTH, availW);
    const height = Math.min(PREFERRED_HEIGHT, availH);

    let left = br.left - sr.left;
    if (left + width > sr.width - SAFE_MARGIN) left = sr.width - SAFE_MARGIN - width;
    if (left < SAFE_MARGIN) left = SAFE_MARGIN;

    const belowTop = br.bottom - sr.top + 4;
    const spaceBelow = sr.height - SAFE_MARGIN - belowTop;
    let top: number;
    if (spaceBelow >= height) {
      top = belowTop;
    } else {
      // Недостатньо місця знизу — спробувати вище кнопки; інакше просто
      // затиснути в межах shell (використати весь доступний вертикальний простір).
      const aboveTop = br.top - sr.top - 4 - height;
      top = aboveTop >= SAFE_MARGIN ? aboveTop : Math.max(SAFE_MARGIN, sr.height - SAFE_MARGIN - height);
    }

    return { top, left, width, height };
  }, []);

  const openSourceBrowser = React.useCallback(() => {
    setSourceAnchor(computeSourceAnchor());
    setSourcePopoverOpen(true);
  }, [computeSourceAnchor]);

  // Реальний available space може змінитись, поки popover відкритий (resize
  // вікна VS Code) — перерахувати anchor, а не лишати застарілу позицію.
  React.useEffect(() => {
    if (!sourcePopoverOpen) return;
    const onResize = (): void => setSourceAnchor(computeSourceAnchor());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [sourcePopoverOpen, computeSourceAnchor]);
  const [hoveredJoin, setHoveredJoin] = React.useState<number | null>(null);
  const [containerSize, setContainerSize] = React.useState<{ width: number; height: number } | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const { transform, zoomAt, zoomButton, panBy, resetZoom, fitTo, centerOn } = useCanvasTransform();
  const { positions, cardSize, updatePosition, resetLayout } = usePositions(state.selectedTables, state.joins);

  // Phase 3C: розмір контейнера потрібен і для minimap (viewport world-rect),
  // не лише для Fit (той читає DOM напряму лише в обробнику кліку).
  React.useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = (): void => setContainerSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Phase 4: selection auto-clear ефект перенесено в App.tsx (там тепер
  // живе сам selection-стан) — тут більше не дублюємо.

  const tablesMeta = React.useMemo(() => allTables(state), [state]);

  const tableRect = React.useCallback(
    (tableId: string): Rect | null => {
      const pos = positions[tableId];
      if (!pos) return null;
      return cardRect(pos, cardSize(tableId));
    },
    [positions, cardSize]
  );

  // Геометрія кожного JOIN — рахується ОДИН раз за рендер, використовується
  // і SVG-шаром (лінії, під картками), і HTML-шаром (markers+badge, над
  // картками), і minimap. Джойн, чия таблиця ще не має позиції (не мало б
  // траплятись — REMOVE_TABLE каскадно чистить пов'язані joins — але
  // захисно), не рендериться.
  const joinGeometry = React.useMemo(() => {
    return state.joins.map((join, index) => {
      const rectA = tableRect(join.leftTableId);
      const rectB = tableRect(join.rightTableId);
      if (!rectA || !rectB) return null;
      const { a, b } = anchorPoints(rectA, rectB);
      // `mid` тепер точка РІВНО на вигнутій лінії (той самий `joinCurve`, що
      // малює саму лінію в JoinPath) — інакше badge/маркери "плавали" б
      // поза кривою для несиметричних з'єднань (gap analysis: плавніша лінія).
      const { mid } = joinCurve(a, b);
      return {
        index,
        a,
        b,
        mid,
        kind: joinKindLabel(join.leftAll, join.rightAll),
      };
    });
  }, [state.joins, tableRect]);

  // ---- Phase 3C performance pass: стабільні callbacks (useCallback), щоб
  // React.memo на TableCard/JoinPath/JoinOverlay реально пропускав рендер
  // під час чистого pan/zoom (transform міняється, конкретна картка/джойн —
  // ні). handleToggleField лишається залежним від selectedFields (потрібен
  // актуальний список для пошуку індексу при знятті чекбоксу) — стабільний
  // лише між релевантними змінами полів, що прийнятно.
  const handleSelectTable = React.useCallback((tableId: string) => setSelection({ kind: 'table', tableId }), []);
  const handleRemoveTable = React.useCallback(
    (tableId: string) => {
      // Phase 5 — deterministic JOIN-selection clear (замість object-reference
      // identity): REMOVE_TABLE каскадно чистить joins у реducer'і, і індекс
      // обраного JOIN може почати вказувати на інший join. Найпростіший
      // deterministic fix — завжди скидати JOIN-selection тут, а не намагатись
      // відстежити, чи саме ЦЕЙ join вижив під тим самим індексом.
      if (selection?.kind === 'join') setSelection(null);
      dispatch({ type: 'REMOVE_TABLE', tableId });
    },
    [dispatch, selection]
  );
  const handleDragTo = React.useCallback((tableId: string, pos: Pos) => updatePosition(tableId, pos), [updatePosition]);
  const handleToggleField = React.useCallback(
    (tableId: string, path: string, checked: boolean) => {
      if (checked) {
        dispatch({ type: 'ADD_FIELD', tableId, fieldPath: path });
      } else {
        const idx = state.selectedFields.findIndex(f => f.tableId === tableId && f.path === path && !f.expression);
        if (idx >= 0) dispatch({ type: 'REMOVE_FIELD', fieldIdx: idx });
      }
    },
    [dispatch, state.selectedFields]
  );
  const handleSelectJoin = React.useCallback((joinIndex: number) => setSelection({ kind: 'join', joinIndex }), []);
  const handleJoinHover = React.useCallback(
    (joinIndex: number, hovered: boolean) => setHoveredJoin(hovered ? joinIndex : null),
    []
  );
  const handleRemoveJoin = React.useCallback(
    (joinIndex: number) => {
      dispatch({ type: 'REMOVE_JOIN', index: joinIndex });
      setSelection(null);
    },
    [dispatch]
  );

  const handleCreateJoin = (
    sourceId: string,
    targetId: string,
    kind: JoinKindLabel,
    leftField: string,
    rightField: string,
    expression: string,
    operator: ConditionOperator
  ): void => {
    // Ланцюжок з ІСНУЮЧИХ дій (design gate): ADD_JOIN завжди з'єднує
    // selectedTables[0]/[1] — одразу коригуємо на реально обрані Джерело/Ціль
    // через SET_JOIN_TABLE (теж вже існуюча дія). Новий join завжди в кінці
    // масиву, тому його індекс відомий ДО диспатчу.
    const newIndex = state.joins.length;
    dispatch({ type: 'ADD_JOIN' });
    dispatch({ type: 'SET_JOIN_TABLE', index: newIndex, side: 'left', tableId: sourceId });
    dispatch({ type: 'SET_JOIN_TABLE', index: newIndex, side: 'right', tableId: targetId });
    // Тип з'єднання — одразу при створенні, не тільки INNER за замовчуванням
    // (gap analysis: "немає можливості зразу тип ліве/внутрішнє"). LEFT/INNER/
    // FULL — саме два booleans leftAll/rightAll, як і рахує joinKindLabel().
    dispatch({ type: 'SET_JOIN_ALL', index: newIndex, side: 'left', value: kind !== 'INNER' });
    dispatch({ type: 'SET_JOIN_ALL', index: newIndex, side: 'right', value: kind === 'FULL' });
    // Умова — довільний вираз (SET_JOIN_CUSTOM+SET_JOIN_EXPRESSION) або просте
    // поле з обох сторін (SET_JOIN_FIELD); інакше лишається порожня умова,
    // донастроювана в Inspector — як і раніше.
    if (expression.trim()) {
      dispatch({ type: 'SET_JOIN_CUSTOM', index: newIndex, custom: true });
      dispatch({ type: 'SET_JOIN_EXPRESSION', index: newIndex, expression });
    } else if (leftField && rightField) {
      dispatch({ type: 'SET_JOIN_FIELD', index: newIndex, side: 'left', path: leftField });
      dispatch({ type: 'SET_JOIN_FIELD', index: newIndex, side: 'right', path: rightField });
      if (operator !== '=') dispatch({ type: 'SET_JOIN_OPERATOR', index: newIndex, operator });
    }
    setSelection({ kind: 'join', joinIndex: newIndex });
  };

  // Phase 5 — focus/dimming (асиметрична семантика за коригуванням, НЕ
  // єдине "selected+сусіди" правило для обох видів selection):
  // - table selected → focus = сама картка + УСІ прямо приєднані JOIN'и +
  //   ENDPOINT-картки цих JOIN'ів (без подальшого транзитивного розширення).
  // - join selected → focus = ЛИШЕ цей JOIN + рівно його ліва/права картка,
  //   без інших JOIN'ів чи сусідів endpoint-таблиць.
  const focus = React.useMemo((): { tables: Set<string> | null; joins: Set<number> | null } => {
    if (!selection) return { tables: null, joins: null };
    if (selection.kind === 'table') {
      const tables = new Set<string>([selection.tableId]);
      const joins = new Set<number>();
      state.joins.forEach((join, index) => {
        if (join.leftTableId === selection.tableId || join.rightTableId === selection.tableId) {
          joins.add(index);
          tables.add(join.leftTableId);
          tables.add(join.rightTableId);
        }
      });
      return { tables, joins };
    }
    const join = state.joins[selection.joinIndex];
    if (!join) return { tables: null, joins: null };
    return {
      tables: new Set([join.leftTableId, join.rightTableId]),
      joins: new Set([selection.joinIndex]),
    };
  }, [selection, state.joins]);

  const isTableDimmed = React.useCallback((tableId: string) => focus.tables !== null && !focus.tables.has(tableId), [focus]);
  const isJoinDimmed = React.useCallback((index: number) => focus.joins !== null && !focus.joins.has(index), [focus]);

  const contentBox = React.useMemo(() => {
    const rects = state.selectedTables.map(tb => cardRect(positions[tb.id] ?? { x: 0, y: 0 }, cardSize(tb.id)));
    return boundingBox(rects);
  }, [state.selectedTables, positions, cardSize]);

  const handleFit = (): void => {
    if (!contentBox || !containerRef.current) return;
    const viewport = containerRef.current.getBoundingClientRect();
    fitTo(contentBox, { width: viewport.width, height: viewport.height });
  };

  // Phase 3C: minimap. Видимий world-rect — інверсія поточної трансформації
  // на розмір контейнера; показуємо minimap лише коли контент (за розміром,
  // zoom-aware) реально перевищує його — design gate.
  const viewportWorld = React.useMemo((): Rect | null => {
    if (!containerSize) return null;
    const topLeft = screenToWorld({ x: 0, y: 0 }, transform);
    const bottomRight = screenToWorld({ x: containerSize.width, y: containerSize.height }, transform);
    return { x: topLeft.x, y: topLeft.y, width: bottomRight.x - topLeft.x, height: bottomRight.y - topLeft.y };
  }, [containerSize, transform]);

  const showMinimap =
    state.selectedTables.length >= 2 &&
    contentBox !== null &&
    viewportWorld !== null &&
    contentExceedsViewport(contentBox, viewportWorld);

  const minimapScaleTransform = React.useMemo(() => {
    if (!contentBox) return null;
    return minimapTransform(contentBox, { width: 160, height: 100 }, 6);
  }, [contentBox]);

  const handlePanTo = React.useCallback(
    (worldPoint: Point) => {
      if (!containerSize) return;
      centerOn(worldPoint, containerSize);
    },
    [centerOn, containerSize]
  );

  return (
    <div
      ref={shellRef}
      style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}
    >
      <Toolbar
        locale={locale}
        zoomPercent={Math.round(transform.zoom * 100)}
        tables={state.selectedTables}
        tablesMeta={tablesMeta}
        joins={state.joins}
        selectedJoinIndex={selection?.kind === 'join' ? selection.joinIndex : null}
        onZoomOut={() => zoomButton(-1)}
        onZoomIn={() => zoomButton(1)}
        onZoomReset={resetZoom}
        onFit={handleFit}
        onAutoLayout={resetLayout}
        onAddSource={openSourceBrowser}
        onCreateJoin={handleCreateJoin}
        onSelectJoin={handleSelectJoin}
        onRemoveJoin={handleRemoveJoin}
        sourceButtonRef={sourceButtonRef}
      />
      {sourcePopoverOpen && (
        <SourceBrowserPopover
          locale={locale}
          tables={tablesMeta}
          loaded={metadataLoaded}
          selectedTables={state.selectedTables}
          onAddTable={table => dispatch({ type: 'ADD_TABLE', table })}
          anchor={sourceAnchor}
          onClose={() => setSourcePopoverOpen(false)}
        />
      )}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex' }}>
      <CanvasSurface
        transform={transform}
        onWheelZoom={zoomAt}
        onPanBy={panBy}
        onBackgroundClick={() => setSelection(null)}
        containerRef={containerRef}
        emptyState={
          state.selectedTables.length === 0 ? (
            <div style={{ textAlign: 'center', maxWidth: 260 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: TOKENS.textSecondary, marginBottom: 4 }}>
                {t(locale, 'structureEmptyTitle')}
              </div>
              <div style={{ fontSize: 12, color: TOKENS.textMuted, marginBottom: 12 }}>
                {t(locale, 'structureEmptySubtitle')}
              </div>
              <button
                type="button"
                onClick={openSourceBrowser}
                style={{
                  padding: '5px 12px',
                  fontSize: 12,
                  border: `1px solid ${TOKENS.border}`,
                  borderRadius: 4,
                  background: 'transparent',
                  color: TOKENS.text,
                  cursor: 'pointer',
                }}
              >
                {t(locale, 'structureEmptyAddButton')}
              </button>
            </div>
          ) : undefined
        }
        fixedOverlay={
          showMinimap && contentBox && viewportWorld && minimapScaleTransform ? (
            <Minimap
              tables={state.selectedTables}
              joins={state.joins}
              positions={positions}
              cardSize={cardSize}
              content={contentBox}
              viewportWorld={viewportWorld}
              scaleTransform={minimapScaleTransform}
              onPanTo={handlePanTo}
            />
          ) : undefined
        }
      >
        {/*
          Шар 1 — SVG JOIN-лінії, ПІД картками (design: "JOIN проходить під
          TableCard"). Bug fix: попередній `width={0} height={0}` +
          `overflow:visible` ("безрозмірний SVG") ламається, коли батьківський
          world-контейнер має CSS `transform` (pan/zoom) — Chromium створює
          для 0×0-елемента власний compositing layer і НЕ малює контент, що
          виходить за межі цього layer'а, хоча pointer-events (клік/hover на
          лінії) продовжують працювати — тому лінія була клікабельна, але
          візуально невидима між маркерами й badge. Фікс — реальний (великий)
          розмір SVG замість 0×0, з тим самим `overflow:visible` як safety net
          для контенту, що все ж вийде за ці межі.
        */}
        <svg width={20000} height={20000} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}>
          {joinGeometry.map(g => {
            if (!g) return null;
            return (
              <JoinPath
                key={g.index}
                index={g.index}
                a={g.a}
                b={g.b}
                kind={g.kind}
                selected={selection?.kind === 'join' && selection.joinIndex === g.index}
                hovered={hoveredJoin === g.index}
                dimmed={isJoinDimmed(g.index)}
                onClick={handleSelectJoin}
                onHoverChange={handleJoinHover}
              />
            );
          })}
        </svg>

        {/* Шар 2 — TableCard. */}
        {state.selectedTables.map(table => {
          const meta = tablesMeta.find(m => m.fullName === table.fullName);
          return (
            <TableCard
              key={table.id}
              locale={locale}
              table={table}
              meta={meta}
              position={positions[table.id] ?? { x: 0, y: 0 }}
              selected={selection?.kind === 'table' && selection.tableId === table.id}
              dimmed={isTableDimmed(table.id)}
              selectedFields={state.selectedFields}
              zoom={transform.zoom}
              onSelect={handleSelectTable}
              onRemove={handleRemoveTable}
              onToggleField={handleToggleField}
              onDragTo={handleDragTo}
            />
          );
        })}

        {/* Шар 3 — endpoint markers + LEFT/INNER/FULL badge, НАД картками (design: підпис ніколи не ховається під сусідньою карткою). */}
        {joinGeometry.map(g => {
          if (!g) return null;
          const isSelected = selection?.kind === 'join' && selection.joinIndex === g.index;
          return (
            <JoinOverlay
              key={g.index}
              index={g.index}
              a={g.a}
              b={g.b}
              mid={g.mid}
              kind={g.kind}
              selected={isSelected}
              hovered={hoveredJoin === g.index}
              dimmed={isJoinDimmed(g.index)}
              removeTitle={t(locale, 'structureRemoveJoin')}
              onRemove={handleRemoveJoin}
            />
          );
        })}
      </CanvasSurface>
      </div>
      {selection !== null && (
        <Inspector
          locale={locale}
          width={inspectorWidth}
          onResize={onInspectorResize}
          state={state}
          dispatch={dispatch}
          selection={selection}
          onClearSelection={() => setSelection(null)}
        />
      )}
      </div>
    </div>
  );
}
