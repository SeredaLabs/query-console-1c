import * as React from 'react';
import { createPortal } from 'react-dom';
import type { SupportedLocale } from '../../shared/locale';
import {
  assembleBatch,
  batchMemberName,
  compoundQueryType,
  compoundTempTableName,
  derivePackageTempTableContinuity,
  type PackageTempTableRelation,
  type QueryAction,
  type QueryState,
} from '../../webview/state/queryStore';
import { t } from '../i18n';
import { DIMENSIONS, TOKENS } from '../theme';
import { QueryIdentityPopover, type QueryIdentityAnchor } from './QueryIdentityPopover';
import { UnionMappingPopover } from './UnionMappingPopover';

/**
 * Phase 12B: будує текст tooltip'а маркера тимчасової таблиці з
 * `PackageTempTableRelation[]` (одного package-члена) — без жодної логіки
 * резолюції зв'язків тут, лише форматування вже готових даних
 * (`derivePackageTempTableContinuity`, `snapshots.ts`).
 */
function tempTableTooltip(locale: SupportedLocale, relations: PackageTempTableRelation[]): string {
  const queryLabel = (i: number) => `${t(locale, 'packageTempTableQueryLabel')} ${i + 1}`;
  const producer = relations.find(r => r.role === 'creates' || r.role === 'appends');
  const drops = relations.find(r => r.role === 'drops');
  const consumes = relations.filter(r => r.role === 'consumes');
  const blocks: string[] = [];

  if (producer) {
    const verb = producer.role === 'creates' ? t(locale, 'packageTempTableCreatesPrefix') : t(locale, 'packageTempTableAppendsPrefix');
    let block = `${verb} ${producer.tempTableName}`;
    if (producer.relatedMembers.length > 0) {
      block += `\n\n${t(locale, 'packageTempTableUsedByPrefix')} ${producer.relatedMembers.map(queryLabel).join(', ')}`;
    }
    if (producer.droppedBy !== undefined) {
      block += `\n\n${t(locale, 'packageTempTableDestroyedAtPrefix')} ${queryLabel(producer.droppedBy)}`;
    }
    blocks.push(block);
  }

  if (drops) {
    // contributorsOf(lifetime) завжди [createIndex, ...appendIndices] — 0-й
    // елемент гарантовано create (він хронологічно раніший за будь-який
    // append того самого lifetime), решта — appends, у порядку пакета.
    let block = `${t(locale, 'packageTempTableDropsPrefix')} ${drops.tempTableName}`;
    if (drops.relatedMembers.length > 0) {
      const [creator, ...appenders] = drops.relatedMembers;
      block += `\n\n${t(locale, 'packageTempTableCreatedFromPrefix')} ${queryLabel(creator)}`;
      if (appenders.length > 0) {
        block += `\n${t(locale, 'packageTempTableAppendedFromPrefix')} ${appenders.map(queryLabel).join(', ')}`;
      }
    }
    blocks.push(block);
  }

  if (consumes.length === 1) {
    const from = consumes[0].relatedMembers.map(queryLabel).join(', ');
    blocks.push(`${t(locale, 'packageTempTableConsumesPrefix')} ${consumes[0].tempTableName}\n\n${t(locale, 'packageTempTableCreatedFromPrefix')} ${from}`);
  } else if (consumes.length > 1) {
    const lines = consumes.map(r => `${r.tempTableName} — ${r.relatedMembers.map(queryLabel).join(', ')}`);
    blocks.push(`${t(locale, 'packageTempTableConsumesHeaderPrefix')}\n${lines.join('\n')}`);
  }

  return blocks.join('\n\n');
}

/** Усі package-члени, пов'язані з тим самим набором тимчасових таблиць, що й `relations` — для hover/focus highlight. */
function relatedMemberIndices(memberIndex: number, relations: PackageTempTableRelation[]): Set<number> {
  const out = new Set<number>();
  for (const r of relations) {
    for (const m of r.relatedMembers) if (m !== memberIndex) out.add(m);
    if (r.droppedBy !== undefined && r.droppedBy !== memberIndex) out.add(r.droppedBy);
  }
  return out;
}

/**
 * Redesign polish (2026-09-21): "Створює/Доповнює/Видаляє ВТ" в
 * `QueryIdentity` тепер має semantic-колір ролі (§4/§11 узгодженого
 * прототипу) — ЛИШЕ прив'язка існуючого `QueryType` до вже наявних
 * `TOKENS.success/warning/danger`, жодної нової семантики домену. `select`
 * лишається нейтральним (жодного кольору) — семантика "звичайний запит", а
 * не producer/consumer ролі.
 */
function roleAccent(queryType: 'select' | 'createTemp' | 'appendTemp' | 'dropTemp'): string | undefined {
  switch (queryType) {
    case 'createTemp': return TOKENS.success;
    case 'appendTemp': return TOKENS.warning;
    case 'dropTemp': return TOKENS.danger;
    default: return undefined;
  }
}

function roleIcon(queryType: 'select' | 'createTemp' | 'appendTemp' | 'dropTemp'): string {
  return queryType === 'dropTemp' ? 'trash' : 'database';
}

/**
 * Redesign polish (2026-09-21): вимірює РЕАЛЬНУ ширину контейнера
 * PackageNav (не `window.innerWidth`) — компонент живе всередині гнучкого
 * webview layout (Inspector/panels можуть звужувати робочу область
 * незалежно від розміру вікна редактора), тож container query через
 * `ResizeObserver` коректніший за viewport-based media query тут.
 */
function useContainerWidth(ref: React.RefObject<HTMLElement>): number {
  const [width, setWidth] = React.useState(2000);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width;
      if (w !== undefined) setWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

const BAR_STYLE: React.CSSProperties = {
  height: DIMENSIONS.packageNav,
  minHeight: DIMENSIONS.packageNav,
  // `minWidth: 0` — без цього flex-item за замовчуванням (`min-width: auto`)
  // не стискається нижче min-content своїх дітей усередині flex-column
  // кореня (`ROOT_STYLE`), тож `useContainerWidth`/`ResizeObserver` НІКОЛИ не
  // побачить вузьку ширину — класична flexbox-пастка, знайдена під час
  // responsive QA цього redesign (2026-09-21).
  minWidth: 0,
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '0 12px',
  borderBottom: `1px solid ${TOKENS.border}`,
  background: TOKENS.surface2,
  fontSize: 12,
  overflow: 'hidden',
};

const NAV_DIVIDER: React.CSSProperties = { width: 1, height: 14, background: TOKENS.border, margin: '0 2px', flexShrink: 0 };

const GROUP_LABEL: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  color: TOKENS.textSecondary,
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

const NUMBER_BTN: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  fontSize: 12,
  padding: '2px 4px',
  borderRadius: 3,
  color: TOKENS.textSecondary,
};

/**
 * Design review (2026-09-20, color consolidation): "+"/"✕" були однаково
 * сірими по всій стрічці — важко відрізнити додавання від видалення на
 * швидкий погляд. `success`/`chart*` токени зарезервовані під інші
 * семантики (field-inclusion, JOIN-kind), тому тут — `accent` для "+" (та
 * сама семантика, що вже читається як "активна дія" в чипах) і `danger` для
 * видалення (тільки на hover-reveal, щоб не додавати тривожності в стані
 * спокою).
 */
const ADD_BTN: React.CSSProperties = { ...NUMBER_BTN, fontWeight: 700, color: TOKENS.accent };
const REMOVE_ICON_BTN: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  fontSize: 10,
  padding: '0 2px',
  color: TOKENS.danger,
  lineHeight: 1,
};

const UNION_KEYWORD_BTN: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: 0.3,
  padding: '2px 3px',
  // Design review (2026-09-19): раніше chartOrange — "кричало" на
  // користувача, ніби ОБ'ЄДНАТИ ВСЕ це команда, а не режим композиції.
  // Нейтральний textSecondary + окремий muted label ("⑂ Об'єднання:")
  // пояснює контекст, не привертаючи зайвої уваги; єдиний акцентний
  // колір у стрічці — активний SELECT-чип (TOKENS.accent).
  color: TOKENS.textSecondary,
  whiteSpace: 'nowrap',
};

const UNION_LABEL: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  color: TOKENS.textMuted,
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

/**
 * Design review (2026-09-19, polish pass): члени UNION навмисно виглядають
 * НЕ так, як пакетні `[n]` (bracket-text) — округлий chip з м'яким фоном на
 * активному стані відрізняє "SELECT у межах поточного запиту" від "запит
 * пакета", щоб користувач не плутав два різних виміри навігації.
 */
const UNION_CHIP_ACTIVE: React.CSSProperties = {
  border: 'none',
  cursor: 'default',
  fontSize: 11,
  fontWeight: 600,
  padding: '1px 6px',
  borderRadius: 3,
  background: TOKENS.surfaceSelected,
  color: TOKENS.accent,
};

const UNION_CHIP_INACTIVE: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  fontSize: 11,
  fontWeight: 400,
  padding: '1px 6px',
  borderRadius: 3,
  color: TOKENS.textSecondary,
};

/** Кількість SELECT-чипів, показаних повністю inline, перш ніж стиснути в
 * компактний "SELECT n/total ‹ ›" режим (design review 2026-09-19). */
const UNION_INLINE_LIMIT = 4;

/**
 * Redesign polish (2026-09-21): та сама ідея, що вже давно є в
 * `UNION_INLINE_LIMIT` — Package section тепер ТЕЖ стискається в
 * `n/total ‹ ›`, замість необмеженого inline-рендеру всіх номерів
 * (raw `overflow:hidden` без цього просто відрізав би доступ до
 * пізніх package-членів на 10-20 queries — саме той антипатерн, від якого
 * прямо просили відмовитись).
 */
const PACKAGE_INLINE_LIMIT = 8;

/** container-width пороги (§10 узгодженого прототипу, адаптовано під
 * container query замість viewport query — див. `useContainerWidth`). */
const MEDIUM_MAX = 760;
const NARROW_MAX = 480;

/**
 * Phase 3E: package navigation переїхала з Sidebar → Пакет (PackagePanel,
 * видалено) у компактну глобальну стрічку над WorkspaceNav — той самий
 * `QueryState.batchSaved`/`activeBatch` і ті самі `SET_ACTIVE_BATCH`/
 * `ADD_BATCH_QUERY` actions, жодної нової domain-семантики. Move/remove
 * (раніше в PackagePanel) свідомо не перенесені сюди — окреме майбутнє
 * рішення, не Phase 3E scope.
 *
 * Redesign (2026-09-21): узгоджений прототип (PackageNav — Package/Query
 * identity/UNION як ОДНА система + responsive поведінка) реалізовано БЕЗ
 * зміни domain/reducer — див. коментарі нижче в кожній секції щодо того, що
 * саме презентаційне, а що лишається спільним з Phase 12.
 */
export function PackageNav({
  locale,
  state,
  dispatch,
  onOpenAdditional,
}: {
  locale: SupportedLocale;
  state: QueryState;
  dispatch: React.Dispatch<QueryAction>;
  onOpenAdditional: () => void;
}): React.ReactElement {
  const batch = React.useMemo(() => assembleBatch(state), [state]);
  const activeName = batchMemberName(state, state.activeBatch);
  const queryType = compoundQueryType(state);
  const tempTableName = compoundTempTableName(state);

  const barRef = React.useRef<HTMLDivElement>(null);
  const barWidth = useContainerWidth(barRef);
  const isNarrow = barWidth <= NARROW_MAX;
  const isMedium = !isNarrow && barWidth <= MEDIUM_MAX;

  // PackageNav Quick Actions (2026-09-20): current-query identity відкриває
  // невеликий anchored popover (`QueryIdentityPopover`) замість переходу на
  // вкладку "Додатково" для НАЙЧАСТІШОГО випадку — позначити активний
  // package-член як createTemp/appendTemp/dropTemp. Anchor рахується від
  // getBoundingClientRect самого triggera (той самий підхід, що вже дає
  // `SourceBrowserAnchor` для Source Browser popover) --- необхідно, бо
  // BAR_STYLE має `overflow: hidden` (responsive fix), тому popover рендериться
  // через `createPortal` у `document.body`, а не як звичайний absolute-child.
  const identityRef = React.useRef<HTMLButtonElement>(null);
  const [identityAnchor, setIdentityAnchor] = React.useState<QueryIdentityAnchor | null>(null);

  // Phase 12B: похідна (не-domain) temp-table continuity — лише читання, жодних
  // нових reducer actions. Порожня Map, коли в пакеті немає жодної тимчасової
  // таблиці — PackageNav лишається настільки ж компактним, як і сьогодні.
  const continuity = React.useMemo(() => derivePackageTempTableContinuity(state), [state]);
  const [highlightedMembers, setHighlightedMembers] = React.useState<Set<number> | null>(null);

  // Design review (2026-09-19): одноразова контекстна підказка — з'являється
  // ЛИШЕ в момент створення першого union-члена (не при кожному відкритті),
  // ховається по dismiss або якщо union знову звели до 1 SELECT.
  const [showUnionHint, setShowUnionHint] = React.useState(false);
  React.useEffect(() => {
    if (state.queryList.length <= 1) setShowUnionHint(false);
  }, [state.queryList.length]);

  const overflowRef = React.useRef<HTMLButtonElement>(null);
  const [overflowAnchor, setOverflowAnchor] = React.useState<QueryIdentityAnchor | null>(null);

  const identityMaxWidth = isNarrow ? 110 : 220;
  const accent = roleAccent(queryType);

  return (
    <div style={{ minWidth: 0 }}>
      <div ref={barRef} style={BAR_STYLE}>
        <span style={GROUP_LABEL} title={t(locale, 'packageConceptTooltip')}>
          <span className="codicon codicon-package" style={{ fontSize: 12 }} />
          {!isNarrow && `${t(locale, 'sidebarPackage')}:`}
        </span>

        <PackageSwitcher
          locale={locale}
          state={state}
          dispatch={dispatch}
          batchCount={batch.members.length}
          compact={batch.members.length > PACKAGE_INLINE_LIMIT || isMedium || isNarrow}
          continuity={continuity}
          highlightedMembers={highlightedMembers}
          setHighlightedMembers={setHighlightedMembers}
          showAdd={!isNarrow}
        />

        <span style={NAV_DIVIDER} />
        <button
          ref={identityRef}
          type="button"
          className="qcc-btn"
          title={t(locale, 'queryIdentityOpenTitle')}
          onClick={() => {
            const rect = identityRef.current?.getBoundingClientRect();
            setIdentityAnchor(rect ? { top: rect.bottom + 4, left: rect.left } : { top: 40, left: 8 });
          }}
          style={{
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            flex: '0 1 auto',
            minWidth: 0,
            margin: '0 2px',
            padding: '1px 3px',
            borderRadius: 3,
          }}
        >
          {queryType === 'select' ? (
            <span
              title={activeName}
              style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: identityMaxWidth, color: TOKENS.text, fontWeight: 600 }}
            >
              {activeName} ▾
            </span>
          ) : (
            <>
              <span
                title={tempTableName || activeName}
                style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: identityMaxWidth, color: TOKENS.text, fontWeight: 600, lineHeight: 1.3 }}
              >
                {tempTableName || activeName}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: accent, fontWeight: 500, fontSize: 10.5, lineHeight: 1.3 }}>
                <span className={`codicon codicon-${roleIcon(queryType)}`} style={{ fontSize: 10 }} />
                {t(locale, queryType === 'createTemp' ? 'packageIdentityRoleCreates' : queryType === 'appendTemp' ? 'packageIdentityRoleAppends' : 'packageIdentityRoleDrops')} ▾
              </span>
            </>
          )}
        </button>
        {identityAnchor && (
          <QueryIdentityPopover
            locale={locale}
            state={state}
            dispatch={dispatch}
            anchor={identityAnchor}
            onClose={() => setIdentityAnchor(null)}
            onOpenAdditional={onOpenAdditional}
          />
        )}
        <span style={NAV_DIVIDER} />
        <UnionStrip
          locale={locale}
          state={state}
          dispatch={dispatch}
          onFirstUnionCreated={() => setShowUnionHint(true)}
          compact={state.queryList.length > UNION_INLINE_LIMIT || isMedium || isNarrow}
          showAdd={!isNarrow}
        />

        {isNarrow && (
          <>
            <span style={{ flex: 1 }} />
            <button
              ref={overflowRef}
              type="button"
              className="qcc-btn"
              title={t(locale, 'packageNavMoreActions')}
              onClick={() => {
                const rect = overflowRef.current?.getBoundingClientRect();
                setOverflowAnchor(rect ? { top: rect.bottom + 4, left: Math.max(8, rect.right - 220) } : { top: 40, left: 8 });
              }}
              style={{ ...NUMBER_BTN, flexShrink: 0 }}
            >
              <span className="codicon codicon-ellipsis" />
            </button>
            {overflowAnchor && (
              <PackageNavOverflowMenu
                locale={locale}
                state={state}
                dispatch={dispatch}
                anchor={overflowAnchor}
                onClose={() => setOverflowAnchor(null)}
              />
            )}
          </>
        )}
      </div>
      {showUnionHint && (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 6,
            padding: '5px 12px',
            fontSize: 11,
            color: TOKENS.textMuted,
            background: TOKENS.surface1,
            borderBottom: `1px solid ${TOKENS.border}`,
          }}
        >
          <span className="codicon codicon-info" style={{ fontSize: 12, flexShrink: 0, marginTop: 1 }} />
          <span style={{ flex: 1, minWidth: 0 }}>{t(locale, 'packageUnionHint')}</span>
          <button
            type="button"
            className="qcc-btn"
            title={t(locale, 'packageUnionHintDismiss')}
            onClick={() => setShowUnionHint(false)}
            style={{ border: 'none', background: 'transparent', color: TOKENS.textMuted, cursor: 'pointer', fontSize: 12, padding: '0 2px', flexShrink: 0 }}
          >
            <span className="codicon codicon-close" />
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Redesign (2026-09-21): package-level navigation, винесена з тіла
 * `PackageNav` — той самий `assembleBatch`/`SET_ACTIVE_BATCH`/
 * `ADD_BATCH_QUERY`/`REMOVE_BATCH_QUERY`, жодних нових actions. Два режими:
 * inline (усі номери, як і раніше — до `PACKAGE_INLINE_LIMIT`/wide viewport)
 * і compact (`n/total ‹ ›`, той самий паттерн, що вже давно має
 * `UnionStrip` для SELECT-членів — свідомо ОДНАКОВА interaction grammar,
 * щоб Package і UNION відчувались частинами однієї системи).
 */
function PackageSwitcher({
  locale,
  state,
  dispatch,
  batchCount,
  compact,
  continuity,
  highlightedMembers,
  setHighlightedMembers,
  showAdd,
}: {
  locale: SupportedLocale;
  state: QueryState;
  dispatch: React.Dispatch<QueryAction>;
  batchCount: number;
  compact: boolean;
  continuity: Map<number, PackageTempTableRelation[]>;
  highlightedMembers: Set<number> | null;
  setHighlightedMembers: (s: Set<number> | null) => void;
  showAdd: boolean;
}): React.ReactElement {
  const active = state.activeBatch;

  if (!compact) {
    return (
      <>
        {Array.from({ length: batchCount }, (_, i) => {
          const isActive = i === active;
          const relations = continuity.get(i);
          const highlighted = highlightedMembers?.has(i) ?? false;
          return (
            <span
              key={i}
              className="qcc-union-chip"
              style={{
                display: 'flex',
                alignItems: 'center',
                borderRadius: 3,
                boxShadow: highlighted ? `inset 0 -2px 0 0 ${TOKENS.accent}` : undefined,
              }}
            >
              <button
                type="button"
                className="qcc-btn"
                title={batchMemberName(state, i)}
                onClick={() => {
                  if (!isActive) dispatch({ type: 'SET_ACTIVE_BATCH', index: i });
                }}
                style={{
                  ...NUMBER_BTN,
                  color: isActive ? TOKENS.accent : TOKENS.textSecondary,
                  fontWeight: isActive ? 700 : 400,
                }}
              >
                {isActive ? `[${i + 1}]` : `${i + 1}`}
              </button>
              {relations && (
                <span
                  tabIndex={0}
                  className="codicon codicon-database"
                  title={tempTableTooltip(locale, relations)}
                  onMouseEnter={() => setHighlightedMembers(relatedMemberIndices(i, relations))}
                  onMouseLeave={() => setHighlightedMembers(null)}
                  onFocus={() => setHighlightedMembers(relatedMemberIndices(i, relations))}
                  onBlur={() => setHighlightedMembers(null)}
                  style={{ fontSize: 10, color: TOKENS.textMuted, cursor: 'default', padding: '0 1px', outline: 'none' }}
                />
              )}
              {batchCount > 1 && (
                <button
                  type="button"
                  className="qcc-union-remove"
                  title={`${t(locale, 'packageRemove')} ${i + 1}`}
                  onClick={() => dispatch({ type: 'REMOVE_BATCH_QUERY', index: i })}
                  style={REMOVE_ICON_BTN}
                >
                  <span className="codicon codicon-trash" />
                </button>
              )}
            </span>
          );
        })}
        {showAdd && (
          <button
            type="button"
            className="qcc-btn"
            title={t(locale, 'packageAddQuery')}
            onClick={() => dispatch({ type: 'ADD_BATCH_QUERY' })}
            style={ADD_BTN}
          >
            +
          </button>
        )}
      </>
    );
  }

  const relations = continuity.get(active);
  const highlighted = highlightedMembers !== null && highlightedMembers.size > 0;
  return (
    <>
      <span className="qcc-union-chip" style={{ display: 'flex', alignItems: 'center', gap: 2, boxShadow: highlighted ? `inset 0 -2px 0 0 ${TOKENS.accent}` : undefined }}>
        <button
          type="button"
          className="qcc-btn"
          title={t(locale, 'packageUnionPrev')}
          disabled={active === 0}
          onClick={() => dispatch({ type: 'SET_ACTIVE_BATCH', index: active - 1 })}
          style={{ ...NUMBER_BTN, opacity: active === 0 ? 0.4 : 1 }}
        >
          ‹
        </button>
        <span style={{ color: TOKENS.text, fontWeight: 600, whiteSpace: 'nowrap' }} title={batchMemberName(state, active)}>
          {active + 1}/{batchCount}
        </span>
        <button
          type="button"
          className="qcc-btn"
          title={t(locale, 'packageUnionNext')}
          disabled={active === batchCount - 1}
          onClick={() => dispatch({ type: 'SET_ACTIVE_BATCH', index: active + 1 })}
          style={{ ...NUMBER_BTN, opacity: active === batchCount - 1 ? 0.4 : 1 }}
        >
          ›
        </button>
        {relations && (
          <span
            tabIndex={0}
            className="codicon codicon-database"
            title={tempTableTooltip(locale, relations)}
            onMouseEnter={() => setHighlightedMembers(relatedMemberIndices(active, relations))}
            onMouseLeave={() => setHighlightedMembers(null)}
            onFocus={() => setHighlightedMembers(relatedMemberIndices(active, relations))}
            onBlur={() => setHighlightedMembers(null)}
            style={{ fontSize: 10, color: TOKENS.textMuted, cursor: 'default', padding: '0 1px', outline: 'none' }}
          />
        )}
        {batchCount > 1 && (
          <button
            type="button"
            className="qcc-union-remove"
            title={`${t(locale, 'packageRemove')} ${active + 1}`}
            onClick={() => dispatch({ type: 'REMOVE_BATCH_QUERY', index: active })}
            style={REMOVE_ICON_BTN}
          >
            <span className="codicon codicon-trash" />
          </button>
        )}
      </span>
      {showAdd && (
        <button
          type="button"
          className="qcc-btn"
          title={t(locale, 'packageAddQuery')}
          onClick={() => dispatch({ type: 'ADD_BATCH_QUERY' })}
          style={ADD_BTN}
        >
          +
        </button>
      )}
    </>
  );
}

/**
 * Redesign (2026-09-21): вузький viewport ховає ЛИШЕ додаткові/деструктивні
 * дії (видалення активного package-запиту/SELECT, mapping-popover) за
 * kebab-меню — навігація (Package n/total, Query Identity, UNION n/total)
 * лишається завжди видимою inline, бо це те, без чого користувач не може
 * зрозуміти "де я" (§10 explicit critical requirement). Той самий
 * anchored+portal паттерн, що й `QueryIdentityPopover`.
 */
function PackageNavOverflowMenu({
  locale,
  state,
  dispatch,
  anchor,
  onClose,
}: {
  locale: SupportedLocale;
  state: QueryState;
  dispatch: React.Dispatch<QueryAction>;
  anchor: QueryIdentityAnchor;
  onClose: () => void;
}): React.ReactElement {
  const ROW: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 10px',
    fontSize: 12,
    color: TOKENS.text,
    background: 'transparent',
    border: 'none',
    width: '100%',
    textAlign: 'left',
    cursor: 'pointer',
  };

  function run(action: QueryAction) {
    dispatch(action);
    onClose();
  }

  const batch = assembleBatch(state);
  const hasUnion = state.queryList.length > 1;

  return createPortal(
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 1000 }} onClick={onClose} />
      <div
        style={{
          position: 'fixed',
          top: anchor.top,
          left: Math.min(anchor.left, Math.max(8, window.innerWidth - 236)),
          zIndex: 1001,
          width: 228,
          borderRadius: 6,
          border: `1px solid ${TOKENS.border}`,
          background: TOKENS.surface1,
          boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
          padding: 4,
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={e => e.stopPropagation()}
      >
        <button type="button" className="qcc-btn" style={ROW} onClick={() => run({ type: 'ADD_BATCH_QUERY' })}>
          <span className="codicon codicon-add" style={{ color: TOKENS.accent }} />
          {t(locale, 'packageAddQuery')}
        </button>
        {batch.members.length > 1 && (
          <button type="button" className="qcc-btn" style={ROW} onClick={() => run({ type: 'REMOVE_BATCH_QUERY', index: state.activeBatch })}>
            <span className="codicon codicon-trash" style={{ color: TOKENS.danger }} />
            {t(locale, 'packageNavRemoveActiveQuery')}
          </button>
        )}
        <div style={{ height: 1, background: TOKENS.borderSubtle, margin: '4px 6px' }} />
        <button type="button" className="qcc-btn" style={ROW} onClick={() => run({ type: 'ADD_QUERY' })}>
          <span className="codicon codicon-add" style={{ color: TOKENS.accent }} />
          {t(locale, 'packageUnionAdd')}
        </button>
        {hasUnion && (
          <button type="button" className="qcc-btn" style={ROW} onClick={() => run({ type: 'REMOVE_QUERY', index: state.activeQuery })}>
            <span className="codicon codicon-trash" style={{ color: TOKENS.danger }} />
            {t(locale, 'packageNavRemoveActiveSelect')}
          </button>
        )}
      </div>
    </>,
    document.body
  );
}

/**
 * Design review (2026-09-19): УНІВЕРСАЛЬНИЙ інструмент "об'єднання
 * запитів" (ОБЪЕДИНИТЬ/ОБЪЕДИНИТЬ ВСЕ, `QueryState.queryList`/
 * `activeQuery` — той самий домен, що вже давно працює в Classic
 * `UnionsTab.tsx`/`ADD_QUERY`/`REMOVE_QUERY`/`SET_ACTIVE_QUERY`/
 * `SET_QUERY_DISTINCT`, жодних нових reducer actions) навмисно НЕ отримав
 * окремої вкладки чи persistent-стрічки — за прямим запитом користувача
 * вбудований у ЦЕЙ САМИЙ рядок PackageNav, щоб не додавати висоти.
 * `queryList`/`activeQuery` — per-active-batch-member state (входить у
 * snapshot `batchSaved`, як і `selectedFields`/`conditions`/...), тому
 * коректно перемикається разом із пакетом.
 *
 * Коли union ще немає (queryList.length<=1) — лише тиха "+ Об'єднання"
 * текстова кнопка, без жодного додаткового шуму для звичайного запиту.
 * Коли є 2-4 SELECT (і достатньо широкий контейнер) — показані повністю
 * inline: `[1] — UNION — [2] +`. Понад {@link UNION_INLINE_LIMIT} АБО на
 * medium/narrow container width (redesign 2026-09-21, `compact` prop від
 * `PackageNav`) — стиснуто в `n/total ‹ ›`.
 *
 * Ключове слово між чипами i-1 та i визначається `queryList[i].distinct`
 * (те саме, що генератор читає в `generateDocument`: true → ОБЪЕДИНИТЬ,
 * false → ОБЪЕДИНИТЬ ВСЕ) — клік по слову перемикає САМЕ ЦЕ значення.
 */
function UnionStrip({
  locale,
  state,
  dispatch,
  onFirstUnionCreated,
  compact,
  showAdd,
}: {
  locale: SupportedLocale;
  state: QueryState;
  dispatch: React.Dispatch<QueryAction>;
  onFirstUnionCreated: () => void;
  compact: boolean;
  showAdd: boolean;
}): React.ReactElement {
  const queryList = state.queryList;

  if (queryList.length <= 1) {
    return (
      <button
        type="button"
        className="qcc-btn"
        title={t(locale, 'packageUnionAdd')}
        onClick={() => {
          dispatch({ type: 'ADD_QUERY' });
          onFirstUnionCreated();
        }}
        style={{ ...NUMBER_BTN, flexShrink: 0, color: TOKENS.textMuted }}
      >
        {t(locale, 'packageAddUnion')}
      </button>
    );
  }

  const [showMapping, setShowMapping] = React.useState(false);

  const unionLabel = (
    <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
      <span style={UNION_LABEL} title={t(locale, 'packageUnionLabelTooltip')}>
        <span className="codicon codicon-git-merge" style={{ fontSize: 12 }} />
        {t(locale, 'packageUnionLabel')}
      </span>
      <button
        type="button"
        className="qcc-btn"
        title={t(locale, 'packageUnionMappingButton')}
        onClick={() => setShowMapping(true)}
        style={{ ...NUMBER_BTN, padding: '2px 3px' }}
      >
        <span className="codicon codicon-list-flat" style={{ fontSize: 12 }} />
      </button>
      {showMapping && (
        <UnionMappingPopover locale={locale} state={state} dispatch={dispatch} onClose={() => setShowMapping(false)} />
      )}
    </span>
  );

  if (compact) {
    const active = state.activeQuery;
    const keywordLabel = active > 0 ? (queryList[active].distinct ? t(locale, 'packageUnionKeywordDistinct') : t(locale, 'packageUnionKeywordAll')) : null;
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        {unionLabel}
        <button
          type="button"
          className="qcc-btn"
          title={t(locale, 'packageUnionPrev')}
          disabled={active === 0}
          onClick={() => dispatch({ type: 'SET_ACTIVE_QUERY', index: active - 1 })}
          style={{ ...NUMBER_BTN, opacity: active === 0 ? 0.4 : 1 }}
        >
          ‹
        </button>
        <span style={{ color: TOKENS.text, fontWeight: 600, whiteSpace: 'nowrap' }}>
          {active + 1}/{queryList.length}
        </span>
        <button
          type="button"
          className="qcc-btn"
          title={t(locale, 'packageUnionNext')}
          disabled={active === queryList.length - 1}
          onClick={() => dispatch({ type: 'SET_ACTIVE_QUERY', index: active + 1 })}
          style={{ ...NUMBER_BTN, opacity: active === queryList.length - 1 ? 0.4 : 1 }}
        >
          ›
        </button>
        {keywordLabel && (
          <button
            type="button"
            className="qcc-btn"
            title={queryList[active].distinct ? t(locale, 'packageUnionKeywordDistinctTooltip') : t(locale, 'packageUnionKeywordAllTooltip')}
            onClick={() => dispatch({ type: 'SET_QUERY_DISTINCT', index: active, distinct: !queryList[active].distinct })}
            style={UNION_KEYWORD_BTN}
          >
            {keywordLabel} ▾
          </button>
        )}
        {showAdd && (
          <button
            type="button"
            className="qcc-btn"
            title={t(locale, 'packageUnionAdd')}
            onClick={() => dispatch({ type: 'ADD_QUERY' })}
            style={ADD_BTN}
          >
            +
          </button>
        )}
      </span>
    );
  }

  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
      {unionLabel}
      {queryList.map((q, i) => {
        const active = i === state.activeQuery;
        return (
          <React.Fragment key={i}>
            {i > 0 && (
              <button
                type="button"
                className="qcc-btn"
                title={q.distinct ? t(locale, 'packageUnionKeywordDistinctTooltip') : t(locale, 'packageUnionKeywordAllTooltip')}
                onClick={() => dispatch({ type: 'SET_QUERY_DISTINCT', index: i, distinct: !q.distinct })}
                style={UNION_KEYWORD_BTN}
              >
                {q.distinct ? t(locale, 'packageUnionKeywordDistinct') : t(locale, 'packageUnionKeywordAll')} ▾
              </button>
            )}
            <span className="qcc-union-chip" style={{ display: 'flex', alignItems: 'center' }}>
              <button
                type="button"
                title={active ? q.name : `${t(locale, 'packageUnionGoToPrefix')} ${i + 1}`}
                onClick={() => {
                  if (!active) dispatch({ type: 'SET_ACTIVE_QUERY', index: i });
                }}
                style={active ? UNION_CHIP_ACTIVE : UNION_CHIP_INACTIVE}
              >
                {i + 1}
              </button>
              <button
                type="button"
                className="qcc-union-remove"
                title={t(locale, 'packageUnionRemove')}
                onClick={() => dispatch({ type: 'REMOVE_QUERY', index: i })}
                style={REMOVE_ICON_BTN}
              >
                <span className="codicon codicon-trash" />
              </button>
            </span>
          </React.Fragment>
        );
      })}
      {showAdd && (
        <button
          type="button"
          className="qcc-btn"
          title={t(locale, 'packageUnionAdd')}
          onClick={() => dispatch({ type: 'ADD_QUERY' })}
          style={ADD_BTN}
        >
          +
        </button>
      )}
    </span>
  );
}
