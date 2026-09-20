import * as React from 'react';
import type { MetaField } from '../../core/metadata/types';
import { describeFieldTypes } from '../../core/metadata/describeType';
import { isStructurallyValidExpression } from '../../core/query/expressionSyntaxCheck';
import type { AggregateFunction, SelectedField } from '../../core/query/queryModel';
import { defaultTableAlias } from '../../core/query/queryModel';
import type { SupportedLocale } from '../../shared/locale';
import { allTables, type QueryAction, type QueryState } from '../../webview/state/queryStore';
import { ResizeHandle } from '../components/ResizeHandle';
import { t } from '../i18n';
import { CARD, DIMENSIONS, SECTION_LABEL, TOKENS } from '../theme';

function clampPanelWidth(width: number): number {
  return Math.min(DIMENSIONS.fieldsPanel.max, Math.max(DIMENSIONS.fieldsPanel.min, width));
}

/**
 * Responsive breakpoints — виміряні від ВЛАСНОЇ ширини FieldsWorkspace
 * (ResizeObserver, той самий патерн, що й `containerSize` у
 * StructureWorkspace.tsx), а не CSS media queries: усі стилі тут — inline,
 * і Fields tab не ділить ширину з жодною сусідньою панеллю (на відміну від
 * Structure+Inspector), тож container-width === доступна ширина контенту.
 * Пороги — рівно ті, що в задачі: ≥1200 wide, 850–1200 medium, <850 narrow.
 */
type FieldsLayout = 'wide' | 'medium' | 'narrow';

const BREAKPOINT_MEDIUM = 1200;
const BREAKPOINT_NARROW = 850;

function layoutFor(width: number | null): FieldsLayout {
  if (width === null || width >= BREAKPOINT_MEDIUM) return 'wide';
  if (width >= BREAKPOINT_NARROW) return 'medium';
  return 'narrow';
}

function useElementWidth<T extends HTMLElement>(): [React.RefObject<T>, number | null] {
  const ref = React.useRef<T>(null);
  const [width, setWidth] = React.useState<number | null>(null);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = (): void => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/**
 * Phase 7 — Fields Workspace. Grid-редактор ВЖЕ вибраного SELECT-списку
 * (`state.selectedFields`) — не picker для додавання полів, додавання й
 * досі відбувається на канві (чекбокс TableCard) АБО через "+ Поле" тут
 * (той самий ADD_FIELD, просто друга точка входу на ту саму дію).
 *
 * Design pass (2026-09-19, за референсом користувача): таблиця-грід замість
 * карток-рядків (checkbox-виділення для bulk Дублювати/Видалити, # , Вираз,
 * Псевдонім, Тип (read-only, з метаданих), Агрегація), клік по рядку →
 * "Вираз поля" (снизу, editable лише коли "Використовувати як вираз") і
 * "Властивості поля" (праворуч, compact) — той самий SET_FIELD_EXPRESSION/
 * SET_FIELD_ALIAS/SET_FIELD_FUNC/MOVE_FIELD/REMOVE_FIELD/ADD_EXPRESSION_FIELD,
 * що вже були. НЕ додає Сортування-колонку з референсу: ADD_ORDER_FIELD/
 * SET_ORDER_DIRECTION (Order-модель, Phase 10) адресують поле лише по
 * (tableId,path) — для довільних виразів такої адресації немає, а
 * напівпідтримка (тільки для простих полів) на цьому екрані була б
 * незрозумілою; лишаємо Order осторонь до Phase 10.
 *
 * Попередня спроба (split-view з докованим ExpressionBuilder) відкинута
 * користувачем ("шляпа виглядає, забери") — цей дизайн інший: таблиця, не
 * панель дерева функцій.
 */

const ALL_FUNCS: AggregateFunction[] = ['Сумма', 'Количество', 'КоличествоРазличных', 'Максимум', 'Минимум', 'Среднее'];

const COL_MIN_WIDTH = 50;
const COL_MAX_WIDTH = 400;

function clampColWidth(width: number): number {
  return Math.min(COL_MAX_WIDTH, Math.max(COL_MIN_WIDTH, width));
}

/** Драг-хендл на правому краю `<th>` — той самий mousemove/mouseup патерн, що
 * й `ResizeHandle.tsx`, але позиційований `absolute` всередині table-cell
 * (а не flex-item через `alignSelf`, який тут не мав би сенсу). */
function ColResizeHandle({ onResize }: { onResize: (delta: number) => void }): React.ReactElement {
  const onMouseDown = React.useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      let last = e.clientX;
      const move = (ev: MouseEvent): void => {
        const cur = ev.clientX;
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
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [onResize]
  );

  return (
    <span
      role="separator"
      aria-orientation="vertical"
      onMouseDown={onMouseDown}
      onClick={e => e.stopPropagation()}
      style={{ position: 'absolute', top: 0, bottom: 0, right: -4, width: 8, cursor: 'col-resize', zIndex: 2 }}
    />
  );
}

function isReferenceField(field: MetaField): boolean {
  return field.types.some(ty => ty.ref);
}

const BAR_STYLE: React.CSSProperties = {
  height: 36,
  minHeight: 36,
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '0 8px',
  borderBottom: `1px solid ${TOKENS.border}`,
  position: 'relative',
};

const BTN: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: TOKENS.text,
  cursor: 'pointer',
  fontSize: 12,
  padding: '4px 8px',
  borderRadius: 4,
  display: 'flex',
  alignItems: 'center',
  gap: 5,
};

const BTN_DISABLED: React.CSSProperties = { opacity: 0.4, cursor: 'not-allowed' };

const SEARCH_BOX: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  height: 26,
  padding: '0 8px',
  background: 'var(--vscode-input-background)',
  border: `1px solid ${TOKENS.border}`,
  borderRadius: 4,
  flex: '0 1 180px',
  minWidth: 80,
};

const TH: React.CSSProperties = {
  textAlign: 'left',
  fontSize: 10.5,
  fontWeight: 700,
  color: TOKENS.textSecondary,
  textTransform: 'uppercase',
  letterSpacing: 0.3,
  padding: '7px 8px',
  background: TOKENS.surface2,
  borderBottom: `1px solid ${TOKENS.border}`,
  whiteSpace: 'nowrap',
};

const TD: React.CSSProperties = {
  padding: '6px 8px',
  fontSize: 12,
  color: TOKENS.text,
  borderBottom: `1px solid ${TOKENS.border}`,
  verticalAlign: 'middle',
};

const CELL_INPUT: React.CSSProperties = {
  fontSize: 12,
  padding: '2px 5px',
  border: `1px solid transparent`,
  borderRadius: 3,
  background: 'transparent',
  color: TOKENS.text,
  width: '100%',
};

const PANEL_INPUT: React.CSSProperties = {
  fontSize: 12,
  padding: '4px 7px',
  border: `1px solid ${TOKENS.border}`,
  borderRadius: 4,
  background: 'transparent',
  color: TOKENS.text,
  width: '100%',
};

function fieldMatchesQuery(field: SelectedField, tableLabel: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = `${tableLabel} ${field.path} ${field.expression ?? ''} ${field.alias ?? ''} ${field.func ?? ''}`.toLowerCase();
  return haystack.includes(q);
}

export function FieldsWorkspace({
  locale,
  state,
  dispatch,
  onGoToStructure,
}: {
  locale: SupportedLocale;
  state: QueryState;
  dispatch: React.Dispatch<QueryAction>;
  onGoToStructure?: () => void;
}): React.ReactElement {
  const [query, setQuery] = React.useState('');
  const [checked, setChecked] = React.useState<Set<number>>(new Set());
  const [activeIdx, setActiveIdx] = React.useState<number | null>(null);
  const [addFieldOpen, setAddFieldOpen] = React.useState(false);
  const [addFieldQuery, setAddFieldQuery] = React.useState('');
  const [panelWidth, setPanelWidth] = React.useState<number>(DIMENSIONS.fieldsPanel.default);
  const resizePanel = React.useCallback((delta: number) => {
    // Ресайз-хендл — правий край панелі: тягнення вліво (delta<0) має РОЗШИРЮВАТИ.
    setPanelWidth(w => clampPanelWidth(w - delta));
  }, []);
  const [rootRef, containerWidth] = useElementWidth<HTMLDivElement>();
  const layout = layoutFor(containerWidth);
  const isNarrow = layout === 'narrow';
  const isCompact = layout !== 'wide';

  const tableLabelOf = React.useCallback(
    (tableId: string) => {
      const tb = state.selectedTables.find(t2 => t2.id === tableId);
      return tb ? defaultTableAlias(tb) : tableId;
    },
    [state.selectedTables]
  );

  const metaFieldOf = React.useCallback(
    (tableId: string, path: string): MetaField | undefined => {
      const tb = state.selectedTables.find(t2 => t2.id === tableId);
      if (!tb) return undefined;
      const meta = allTables(state).find(m => m.fullName === tb.fullName);
      return meta?.fields.find(f => f.name === path);
    },
    [state]
  );

  const fields = state.selectedFields;
  const isSearching = query.trim().length > 0;
  const visible = fields
    .map((field, idx) => ({ field, idx }))
    .filter(({ field }) => fieldMatchesQuery(field, tableLabelOf(field.tableId), query));

  // Панель властивостей/вираз-бар мають бути видимі завжди, коли є хоч одне
  // поле (як на референсі користувача) — не лише після explicit кліку.
  // Перший рядок обирається автоматично; після видалення/фільтрації індекс
  // підтискається до останнього валідного, а не скидається в null (інакше
  // панелі мовчки зникали б, залишаючи порожній екран).
  React.useEffect(() => {
    if (fields.length === 0) {
      if (activeIdx !== null) setActiveIdx(null);
      return;
    }
    if (activeIdx === null || activeIdx >= fields.length) {
      setActiveIdx(Math.min(activeIdx ?? 0, fields.length - 1));
    }
  }, [fields.length, activeIdx]);

  const active = activeIdx !== null ? fields[activeIdx] : undefined;
  const activeMeta = active && active.path !== '' ? metaFieldOf(active.tableId, active.path) : undefined;

  // "+ Поле": кандидати з уже доданих джерел, яких ще НЕМА в selectedFields —
  // той самий ADD_FIELD, що й чекбокс на TableCard, просто друга точка входу.
  const addableFields = React.useMemo(() => {
    const out: { tableId: string; path: string; label: string }[] = [];
    for (const tb of state.selectedTables) {
      const meta = allTables(state).find(m => m.fullName === tb.fullName);
      if (!meta) continue;
      const alias = defaultTableAlias(tb);
      for (const f of meta.fields) {
        const already = fields.some(sf => sf.tableId === tb.id && sf.path === f.name && !sf.expression);
        if (!already) out.push({ tableId: tb.id, path: f.name, label: `${alias}.${f.name}` });
      }
    }
    const q = addFieldQuery.trim().toLowerCase();
    return q ? out.filter(f => f.label.toLowerCase().includes(q)) : out;
  }, [state, fields, addFieldQuery]);

  function toggleChecked(idx: number): void {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function selectRow(idx: number): void {
    setActiveIdx(idx);
  }

  function handleDuplicate(): void {
    const targets = checked.size > 0 ? [...checked] : activeIdx !== null ? [activeIdx] : [];
    for (const idx of targets) {
      const f = fields[idx];
      if (!f) continue;
      const expr = f.expression ?? `${tableLabelOf(f.tableId)}.${f.path}`;
      dispatch({ type: 'ADD_EXPRESSION_FIELD', tableId: f.tableId, expression: expr, alias: f.alias });
    }
    setChecked(new Set());
  }

  function handleRemoveChecked(): void {
    const targets = (checked.size > 0 ? [...checked] : activeIdx !== null ? [activeIdx] : []).sort((a, b) => b - a);
    for (const idx of targets) dispatch({ type: 'REMOVE_FIELD', fieldIdx: idx });
    setChecked(new Set());
    setActiveIdx(null);
  }

  const canMoveUp = activeIdx !== null && activeIdx > 0;
  const canMoveDown = activeIdx !== null && activeIdx < fields.length - 1;
  const hasBulkTarget = checked.size > 0 || activeIdx !== null;

  // "Вираз" не отримує явної ширини навмисно — table-layout:fixed віддає
  // йому весь залишок (компактні колонки нижче фіксовані, "Вираз" — 1fr).
  const defaultColWidths = isCompact
    ? { alias: 100, type: 68, aggregate: 92 }
    : { alias: 130, type: 90, aggregate: 110 };
  // Ручний resize (drag на правому краю th) перекриває default для тієї
  // колонки, доки макет (isCompact) не зміниться — тоді overrides скидаються,
  // щоб не застрягти з "компактною" шириною на широкому екрані й навпаки.
  const [colOverride, setColOverride] = React.useState<Partial<Record<'alias' | 'type' | 'aggregate', number>>>({});
  React.useEffect(() => setColOverride({}), [isCompact]);
  const colWidths = {
    checkbox: isCompact ? 22 : 26,
    index: isCompact ? 22 : 26,
    alias: colOverride.alias ?? defaultColWidths.alias,
    type: colOverride.type ?? defaultColWidths.type,
    aggregate: colOverride.aggregate ?? defaultColWidths.aggregate,
  };
  const resizeCol = React.useCallback((key: 'alias' | 'type' | 'aggregate', delta: number) => {
    setColOverride(prev => ({
      ...prev,
      [key]: clampColWidth((prev[key] ?? defaultColWidths[key]) + delta),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCompact]);

  return (
    <div ref={rootRef} style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0, minHeight: 0 }}>
      <div style={{ ...BAR_STYLE, overflowX: 'auto', overflowY: 'hidden' }}>
        <span style={{ position: 'relative', flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setAddFieldOpen(v => !v)}
            disabled={addableFields.length === 0 && !addFieldOpen}
            style={{ ...BTN, flexShrink: 0, ...(addableFields.length === 0 && !addFieldOpen ? BTN_DISABLED : {}) }}
          >
            <span className="codicon codicon-add" style={{ fontSize: 14 }} />
            {t(locale, 'fieldsWorkspaceAddField')}
          </button>
          {addFieldOpen && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 10 }} onClick={() => setAddFieldOpen(false)} />
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: 4,
                  zIndex: 11,
                  width: 260,
                  maxHeight: 320,
                  overflowY: 'auto',
                  borderRadius: 6,
                  border: `1px solid ${TOKENS.border}`,
                  background: TOKENS.surface1,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                }}
                onClick={e => e.stopPropagation()}
              >
                <div style={{ padding: 8 }}>
                  <input
                    autoFocus
                    type="text"
                    value={addFieldQuery}
                    onChange={e => setAddFieldQuery(e.target.value)}
                    placeholder={t(locale, 'fieldsWorkspaceSearchPlaceholder')}
                    style={PANEL_INPUT}
                  />
                </div>
                {addableFields.length === 0 ? (
                  <div style={{ padding: '8px 10px', fontSize: 12, color: TOKENS.textMuted }}>{t(locale, 'fieldsWorkspaceAddFieldEmpty')}</div>
                ) : (
                  addableFields.map(f => (
                    <div
                      key={`${f.tableId}.${f.path}`}
                      onClick={() => dispatch({ type: 'ADD_FIELD', tableId: f.tableId, fieldPath: f.path })}
                      style={{ padding: '5px 10px', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: TOKENS.textSecondary }}
                      onMouseEnter={e => (e.currentTarget.style.background = TOKENS.surfaceHover)}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <span className="codicon codicon-symbol-field" style={{ fontSize: 12, opacity: 0.75, flexShrink: 0 }} />
                      {f.label}
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </span>

        <button
          type="button"
          onClick={() => {
            const tableId = state.selectedTables[0]?.id;
            if (!tableId) return;
            const idx = fields.length;
            dispatch({ type: 'ADD_EXPRESSION_FIELD', tableId, expression: '' });
            setActiveIdx(idx);
          }}
          disabled={state.selectedTables.length === 0}
          style={{ ...BTN, flexShrink: 0, ...(state.selectedTables.length === 0 ? BTN_DISABLED : {}) }}
        >
          <span className="codicon codicon-symbol-misc" style={{ fontSize: 14 }} />
          {t(locale, 'fieldsWorkspaceAddExpression')}
        </button>

        <span style={{ width: 1, height: 18, background: TOKENS.border, margin: '0 2px', flexShrink: 0 }} />

        <button
          type="button"
          title={t(locale, 'fieldsWorkspaceDuplicate')}
          onClick={handleDuplicate}
          disabled={!hasBulkTarget}
          style={{ ...BTN, flexShrink: 0, ...(!hasBulkTarget ? BTN_DISABLED : {}) }}
        >
          <span className="codicon codicon-copy" style={{ fontSize: 14 }} />
          {!isCompact && t(locale, 'fieldsWorkspaceDuplicate')}
        </button>
        <button
          type="button"
          title={t(locale, 'fieldsWorkspaceRemove')}
          onClick={handleRemoveChecked}
          disabled={!hasBulkTarget}
          style={{ ...BTN, flexShrink: 0, ...(!hasBulkTarget ? BTN_DISABLED : {}) }}
        >
          <span className="codicon codicon-trash" style={{ fontSize: 14 }} />
          {!isCompact && t(locale, 'fieldsWorkspaceRemove')}
        </button>
        <button
          type="button"
          title={t(locale, 'fieldsWorkspaceMoveUp')}
          onClick={() => activeIdx !== null && dispatch({ type: 'MOVE_FIELD', fieldIdx: activeIdx, direction: 'up' })}
          disabled={!canMoveUp}
          style={{ ...BTN, flexShrink: 0, ...(!canMoveUp ? BTN_DISABLED : {}) }}
        >
          <span className="codicon codicon-arrow-up" style={{ fontSize: 14 }} />
        </button>
        <button
          type="button"
          title={t(locale, 'fieldsWorkspaceMoveDown')}
          onClick={() => activeIdx !== null && dispatch({ type: 'MOVE_FIELD', fieldIdx: activeIdx, direction: 'down' })}
          disabled={!canMoveDown}
          style={{ ...BTN, flexShrink: 0, ...(!canMoveDown ? BTN_DISABLED : {}) }}
        >
          <span className="codicon codicon-arrow-down" style={{ fontSize: 14 }} />
        </button>

        <span style={{ flex: '1 0 8px' }} />
        {fields.length > 0 && (
          <div style={SEARCH_BOX}>
            <span className="codicon codicon-search" style={{ fontSize: 12, opacity: 0.6, flexShrink: 0 }} />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={t(locale, 'fieldsWorkspaceSearchPlaceholder')}
              style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: 'var(--vscode-input-foreground)', fontSize: 12 }}
            />
          </div>
        )}
      </div>

      <div
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          display: 'flex',
          flexDirection: isNarrow ? 'column' : 'row',
          // Design review: 10px gap з КОЖНОГО боку ResizeHandle (сам handle
          // — 6px з -3px margins, тобто по факту 0 власної ширини) робив
          // проміжок між грідом і Properties завеликим (~20px) — саме там,
          // де сидить вертикальний роздільник-хендл. Звужено лише для
          // row-режиму (у narrow-стеку 10px між блоками — норм).
          gap: isNarrow ? 10 : 4,
          padding: 10,
          overflowY: isNarrow ? 'auto' : 'hidden',
        }}
      >
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
      <div style={{ ...CARD, flex: '1 1 auto', minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '10px 10px 6px', flexShrink: 0 }}>
        <span style={SECTION_LABEL}>
          {t(locale, 'fieldsWorkspaceTitle')}
          {fields.length > 0 && <span style={{ color: TOKENS.textMuted, fontWeight: 400 }}> · {fields.length}</span>}
        </span>
      </div>

        <div
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            overflow: 'auto',
            padding: '0 10px 10px',
            ...(fields.length === 0 ? { display: 'flex', alignItems: 'center', justifyContent: 'center' } : null),
          }}
        >
          {fields.length === 0 ? (
            <div style={{ textAlign: 'center', maxWidth: 280 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: TOKENS.textSecondary, marginBottom: 4 }}>{t(locale, 'fieldsWorkspaceEmptyTitle')}</div>
              <div style={{ fontSize: 12, color: TOKENS.textMuted, marginBottom: 12 }}>{t(locale, 'fieldsWorkspaceEmptySubtitle')}</div>
              {onGoToStructure && (
                <button
                  type="button"
                  onClick={onGoToStructure}
                  style={{ padding: '5px 12px', fontSize: 12, border: `1px solid ${TOKENS.border}`, borderRadius: 4, background: 'transparent', color: TOKENS.text, cursor: 'pointer' }}
                >
                  {t(locale, 'fieldsWorkspaceEmptyButton')}
                </button>
              )}
            </div>
          ) : visible.length === 0 ? (
            <div style={{ padding: '20px 8px', textAlign: 'center', color: TOKENS.textMuted, fontSize: 12 }}>{t(locale, 'fieldsWorkspaceSearchNoResults')}</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              {/*
                table-layout:fixed — БЕЗ цього браузер рахує ширину колонок з
                min-content КОЖНОЇ комірки (auto layout), а `white-space:nowrap`
                + `text-overflow:ellipsis` НЕ зменшують цей min-content (ellipsis
                лише ховає текст візуально ПІСЛЯ того, як layout уже вирішив,
                що колонка мусить бути широкою) — тому довгий вираз/псевдонім
                розпирав усю таблицю й був головним джерелом horizontal overflow.
                З fixed-layout колонки БЕЗ ширини в colgroup ділять залишок
                порівну — тут це лише "Вираз", що й потрібно (найбільше місця).
              */}
              <colgroup>
                <col style={{ width: colWidths.checkbox }} />
                <col style={{ width: colWidths.index }} />
                <col />
                <col style={{ width: colWidths.alias }} />
                <col style={{ width: colWidths.type }} />
                <col style={{ width: colWidths.aggregate }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={TH} />
                  <th style={{ ...TH, textAlign: 'right' }}>#</th>
                  <th style={TH}>{t(locale, 'fieldsWorkspaceColExpression')}</th>
                  <th style={{ ...TH, position: 'relative' }}>
                    {t(locale, 'fieldsWorkspaceColAlias')}
                    <ColResizeHandle onResize={delta => resizeCol('alias', delta)} />
                  </th>
                  <th style={{ ...TH, position: 'relative' }}>
                    {t(locale, 'fieldsWorkspaceColType')}
                    <ColResizeHandle onResize={delta => resizeCol('type', delta)} />
                  </th>
                  <th style={{ ...TH, position: 'relative' }}>
                    {t(locale, 'fieldsWorkspaceColAggregate')}
                    <ColResizeHandle onResize={delta => resizeCol('aggregate', delta)} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map(({ field, idx }) => {
                  const meta = field.path !== '' ? metaFieldOf(field.tableId, field.path) : undefined;
                  const ref = meta ? isReferenceField(meta) : false;
                  const typeLabel = meta ? describeFieldTypes(meta) : field.path === '' ? t(locale, 'fieldsWorkspaceTypeUnknown') : '';
                  const isActive = activeIdx === idx;
                  return (
                    <tr
                      key={idx}
                      onClick={() => selectRow(idx)}
                      style={{
                        cursor: 'pointer',
                        background: isActive ? `color-mix(in srgb, ${TOKENS.accent} 16%, transparent)` : 'transparent',
                        boxShadow: isActive ? `inset 3px 0 0 ${TOKENS.accent}` : undefined,
                      }}
                      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = TOKENS.surfaceHover; }}
                      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                    >
                      <td style={TD}>
                        <input type="checkbox" checked={checked.has(idx)} onClick={e => e.stopPropagation()} onChange={() => toggleChecked(idx)} />
                      </td>
                      <td style={{ ...TD, textAlign: 'right', color: TOKENS.textSecondary, fontVariantNumeric: 'tabular-nums' }}>{idx + 1}</td>
                      <td style={TD}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                          {field.path === '' ? (
                            <span className="codicon codicon-symbol-misc" style={{ fontSize: 13, flexShrink: 0, color: TOKENS.chartOrange }} title={t(locale, 'fieldsWorkspaceExpressionBadge')} />
                          ) : (
                            <span className={`codicon codicon-${ref ? 'references' : 'symbol-field'}`} style={{ fontSize: 13, flexShrink: 0, color: ref ? TOKENS.accent : TOKENS.textSecondary }} />
                          )}
                          <span
                            title={field.path === '' ? field.expression || undefined : `${tableLabelOf(field.tableId)}.${field.path}`}
                            style={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              fontFamily: field.path === '' ? 'var(--vscode-editor-font-family, monospace)' : undefined,
                              color: field.path === '' && !field.expression ? TOKENS.textMuted : TOKENS.text,
                            }}
                          >
                            {field.path === ''
                              ? field.expression || t(locale, 'fieldsWorkspaceExpressionPlaceholder')
                              : `${tableLabelOf(field.tableId)}.${field.path}`}
                          </span>
                        </div>
                      </td>
                      <td style={TD}>
                        <input
                          type="text"
                          value={field.alias ?? ''}
                          title={field.alias || undefined}
                          onClick={e => e.stopPropagation()}
                          onChange={e => dispatch({ type: 'SET_FIELD_ALIAS', fieldIdx: idx, alias: e.target.value })}
                          placeholder={t(locale, 'fieldsWorkspaceAliasPlaceholder')}
                          style={CELL_INPUT}
                        />
                      </td>
                      <td
                        title={typeLabel || undefined}
                        style={{ ...TD, color: TOKENS.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      >
                        {typeLabel || '—'}
                      </td>
                      <td style={TD}>
                        <select
                          value={field.func ?? ''}
                          onClick={e => e.stopPropagation()}
                          onChange={e => dispatch({ type: 'SET_FIELD_FUNC', fieldIdx: idx, func: e.target.value ? (e.target.value as AggregateFunction) : undefined })}
                          title={t(locale, 'fieldsWorkspaceAggregateSelectHint')}
                          style={field.func ? { ...CELL_INPUT, color: TOKENS.accent, fontWeight: 600 } : CELL_INPUT}
                        >
                          <option value="">{t(locale, 'fieldsWorkspaceNoAggregate')}</option>
                          {ALL_FUNCS.map(fn => (
                            <option key={fn} value={fn}>
                              {fn}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {isSearching && visible.length > 0 && (
            <div style={{ padding: '6px 2px', fontSize: 11, color: TOKENS.textMuted, textAlign: 'center' }}>
              {visible.length} / {fields.length}
            </div>
          )}
        </div>
      </div>

        {active && (
          <FieldExpressionBar
            locale={locale}
            dispatch={dispatch}
            field={active}
            fieldIdx={activeIdx as number}
            tableLabel={tableLabelOf(active.tableId)}
          />
        )}
      </div>

      {active && (
        <>
          {!isNarrow && <ResizeHandle axis="x" onResize={resizePanel} />}
          <FieldPropertiesPanel
            locale={locale}
            dispatch={dispatch}
            field={active}
            fieldIdx={activeIdx as number}
            tableLabel={tableLabelOf(active.tableId)}
            typeLabel={activeMeta ? describeFieldTypes(activeMeta) : t(locale, 'fieldsWorkspaceTypeUnknown')}
            width={isNarrow ? '100%' : panelWidth}
          />
        </>
      )}
      </div>
    </div>
  );
}

/** Нижня панель "Вираз поля" — editable ЛИШЕ для custom-expression полів
 * (path===''); для простого поля показує його дотовану адресу read-only з
 * підказкою ввімкнути "Використовувати як вираз" у панелі властивостей. */
function FieldExpressionBar({
  locale,
  dispatch,
  field,
  fieldIdx,
  tableLabel,
}: {
  locale: SupportedLocale;
  dispatch: React.Dispatch<QueryAction>;
  field: SelectedField;
  fieldIdx: number;
  tableLabel: string;
}): React.ReactElement {
  const isExpr = field.path === '';
  const [checkResult, setCheckResult] = React.useState<boolean | null>(null);
  const value = isExpr ? field.expression ?? '' : `${tableLabel}.${field.path}`;

  return (
    <div style={{ ...CARD, flexShrink: 0, padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={SECTION_LABEL}>{t(locale, 'fieldsWorkspaceExpressionSectionTitle')}</span>
        {isExpr && (
          <button
            type="button"
            onClick={() => setCheckResult(isStructurallyValidExpression(value))}
            style={{ border: `1px solid ${TOKENS.border}`, background: 'transparent', color: TOKENS.textSecondary, cursor: 'pointer', fontSize: 11, padding: '3px 8px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <span className="codicon codicon-check" style={{ fontSize: 12 }} />
            {t(locale, 'fieldsWorkspaceValidate')}
          </button>
        )}
      </div>
      <textarea
        value={value}
        disabled={!isExpr}
        onChange={e => dispatch({ type: 'SET_FIELD_EXPRESSION', fieldIdx, expression: e.target.value })}
        rows={2}
        style={{
          width: '100%',
          resize: 'vertical',
          fontFamily: 'var(--vscode-editor-font-family, monospace)',
          fontSize: 12.5,
          padding: 8,
          border: `1px solid ${TOKENS.border}`,
          borderRadius: 4,
          background: isExpr ? TOKENS.surface2 : 'transparent',
          color: isExpr ? TOKENS.text : TOKENS.textMuted,
        }}
      />
      {checkResult !== null && (
        <div style={{ marginTop: 4, fontSize: 11, color: checkResult ? TOKENS.success : TOKENS.danger }}>
          {checkResult ? t(locale, 'fieldsWorkspaceValidationOk') : t(locale, 'fieldsWorkspaceValidationFail')}
        </div>
      )}
    </div>
  );
}

/** Права панель "Властивості поля" — Псевдонім/Тип(read-only)/Агрегація, і
 * "Використовувати як вираз" — checkbox-перемикач, що конвертує просте поле
 * в редаговану адресу через ІСНУЮЧИЙ SET_FIELD_EXPRESSION (той самий шлях,
 * що й double-click у Classic FieldsPanel), без нової domain capability. */
function FieldPropertiesPanel({
  locale,
  dispatch,
  field,
  fieldIdx,
  tableLabel,
  typeLabel,
  width,
}: {
  locale: SupportedLocale;
  dispatch: React.Dispatch<QueryAction>;
  field: SelectedField;
  fieldIdx: number;
  tableLabel: string;
  typeLabel: string;
  width: number | string;
}): React.ReactElement {
  const isExpr = field.path === '';
  return (
    <div style={{ ...CARD, width, flexShrink: 0, minWidth: 0, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
      <span style={SECTION_LABEL}>{t(locale, 'fieldsWorkspacePropertiesTitle')}</span>

      <label style={{ fontSize: 11, color: TOKENS.textMuted, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {t(locale, 'fieldsWorkspaceAliasPlaceholder')}
        <input
          type="text"
          value={field.alias ?? ''}
          onChange={e => dispatch({ type: 'SET_FIELD_ALIAS', fieldIdx, alias: e.target.value })}
          style={PANEL_INPUT}
        />
      </label>

      <label style={{ fontSize: 11, color: TOKENS.textMuted, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {t(locale, 'fieldsWorkspaceColType')}
        <span style={{ ...PANEL_INPUT, color: TOKENS.textMuted, background: TOKENS.surface2 }}>{typeLabel}</span>
      </label>

      <label style={{ fontSize: 11, color: TOKENS.textMuted, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {t(locale, 'fieldsWorkspaceColAggregate')}
        <select
          value={field.func ?? ''}
          onChange={e => dispatch({ type: 'SET_FIELD_FUNC', fieldIdx, func: e.target.value ? (e.target.value as AggregateFunction) : undefined })}
          style={PANEL_INPUT}
        >
          <option value="">{t(locale, 'fieldsWorkspaceNoAggregate')}</option>
          {ALL_FUNCS.map(fn => (
            <option key={fn} value={fn}>
              {fn}
            </option>
          ))}
        </select>
      </label>

      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: TOKENS.textSecondary, cursor: isExpr ? 'default' : 'pointer' }}>
        <input
          type="checkbox"
          checked={isExpr}
          disabled={isExpr}
          title={isExpr ? t(locale, 'fieldsWorkspaceAlreadyExpression') : undefined}
          onChange={() => {
            if (isExpr) return;
            // конвертація "на місці" — той самий шлях, що double-click у Classic FieldsPanel.
            dispatch({ type: 'SET_FIELD_EXPRESSION', fieldIdx, expression: `${tableLabel}.${field.path}` });
          }}
        />
        {t(locale, 'fieldsWorkspaceUseAsExpression')}
      </label>

      <div style={{ fontSize: 11, color: TOKENS.textMuted, lineHeight: 1.5, borderTop: `1px solid ${TOKENS.borderSubtle}`, paddingTop: 8 }}>
        {t(locale, 'fieldsWorkspacePropertiesHint')}
      </div>
    </div>
  );
}
