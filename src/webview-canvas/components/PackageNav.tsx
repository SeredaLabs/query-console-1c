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
 * Redesign polish (2026-09-20/21): "Створює/Доповнює/Видаляє ВТ" в
 * `QueryIdentity` тепер має semantic-колір ролі (§4/§9 узгодженого
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

/**
 * Visual polish (2026-09-21, round 2): package-member marker перейшов з
 * окремої `codicon-database` іконки на маленьку top-right status dot —
 * та сама `PackageTempTableRelation[]` (`derivePackageTempTableContinuity`),
 * жодної нової логіки, лише інший спосіб її показати. Dot належить ЛИШЕ
 * PRODUCER-ролі цього конкретного члена (creates/appends/drops) --- член,
 * що ЛИШЕ споживає (`consumes`) чужу ВТ, дота не отримує (explicit
 * design decision: "consumer SELECT залишається без dot" --- маркер
 * позначає операцію НАД ВТ, а не факт читання).
 */
function memberDotColor(relations: PackageTempTableRelation[] | undefined): string | undefined {
  if (!relations) return undefined;
  if (relations.some(r => r.role === 'creates')) return TOKENS.success;
  if (relations.some(r => r.role === 'appends')) return TOKENS.warning;
  if (relations.some(r => r.role === 'drops')) return TOKENS.danger;
  return undefined;
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

/**
 * Visual polish (2026-09-21): ОДНА спільна "мова" контролів для всього
 * PackageNav — Package numbers, UNION SELECT members, QueryIdentity, Add,
 * overflow "⋯" усі мають однакову висоту/radius/border, щоб читатись як
 * одна навігаційна панель, а не набір випадкових текстових кнопок (explicit
 * design feedback: "the bar looks like a sequence of loose text/buttons").
 * Це ЛИШЕ presentation-константи — жодного нового domain/behavior.
 */
const CONTROL_HEIGHT = 24;
const CONTROL_RADIUS = 4;

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
  gap: 6,
  padding: '0 10px',
  borderBottom: `1px solid ${TOKENS.border}`,
  background: TOKENS.surface2,
  fontSize: 12,
  overflow: 'hidden',
};

/** Тонкий вертикальний роздільник між трьома концептуальними зонами
 * (Package / Query identity / UNION) — subtle, не "порожній" gap. */
/** Visual polish (2026-09-21, round 2): слабший і коротший, ніж раніше —
 * тепер, коли Package/Identity/UNION самі bordered, три виразні `|` поруч
 * читались як зайвий "паркан" (§12 explicit feedback). `borderSubtle` (той
 * самий приглушений indent-guide токен, що вже використовує канва) замість
 * повного `border`. */
const NAV_DIVIDER: React.CSSProperties = { width: 1, height: 12, background: TOKENS.borderSubtle, margin: '0 2px', flexShrink: 0 };

const GROUP_LABEL: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  color: TOKENS.textMuted,
  whiteSpace: 'nowrap',
  flexShrink: 0,
  height: CONTROL_HEIGHT,
};

/**
 * Один спільний "control box" (border+radius+height), яким тепер
 * побудовано і сегментовану групу номерів (обгортка), і QueryIdentity, і
 * compact n/total pill, і secondary "+ Об'єднання" — та сама card language,
 * що вже є в решті New Builder (`TOKENS.border`/`surface1`), просто
 * застосована до навігаційних контролів (explicit design requirement §6:
 * "All controls should share height/radius/border/hover/focus language").
 */
const CONTROL_BOX: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  height: CONTROL_HEIGHT,
  border: `1px solid ${TOKENS.border}`,
  borderRadius: CONTROL_RADIUS,
  background: TOKENS.surface1,
  flexShrink: 0,
};

/**
 * Один переюзаний presentation-primitive для "номер/SELECT-чипа" (§11: "one
 * tiny presentation primitive... reuse for BOTH Package members and UNION
 * SELECT members" — жодного нового domain-стану, лише спільний рендер).
 * Delete-affordance (`codicon-close`) --- ЗАВЖДИ в DOM з `opacity:0`, тому
 * hover/focus НІКОЛИ не змінює ширину чипа/не зсуває сусідів (explicit
 * test scenario §13: "positions of 7 and 8 MUST NOT change").
 */
function NavMemberChip({
  label,
  title,
  active,
  onSelect,
  onRemove,
  removeTitle,
  divider,
  dot,
}: {
  label: string;
  title?: string;
  active: boolean;
  onSelect: () => void;
  onRemove?: () => void;
  removeTitle?: string;
  divider: boolean;
  dot?: React.ReactNode;
}): React.ReactElement {
  return (
    <span
      className="qcc-nav-chip"
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        height: '100%',
        borderRight: divider ? `1px solid ${TOKENS.border}` : undefined,
        background: active ? TOKENS.surfaceSelected : 'transparent',
      }}
    >
      <button
        type="button"
        title={title}
        onClick={onSelect}
        disabled={active}
        style={{
          border: 'none',
          background: 'transparent',
          color: active ? TOKENS.accent : TOKENS.textSecondary,
          fontWeight: active ? 700 : 400,
          fontSize: 12,
          cursor: active ? 'default' : 'pointer',
          padding: '0 7px',
          height: '100%',
          minWidth: 22,
        }}
      >
        {label}
      </button>
      {/* Bug fix (2026-09-21, round 2 visual QA): раніше reserved-простір
          для × був padding-right НА самій number-кнопці, тож геометричний
          центр кнопки (куди клікають автоматизовані інструменти й trackpad
          "клік по центру") опинявся впритул до invisible close-зони —
          flaky клік іноді "потрапляв" у видалення замість вибору. Тепер
          reserved-простір --- окремий непроклікуваний spacer ПІСЛЯ кнопки
          (у звичайному flow), а не її власний padding: кнопка залишається
          вузькою навколо тексту, close сидить лише над spacer'ом. */}
      {onRemove && <span aria-hidden style={{ width: 13, flexShrink: 0 }} />}
      {dot && (
        <span style={{ position: 'absolute', top: 1, right: 1, pointerEvents: 'none' }}>
          {dot}
        </span>
      )}
      {onRemove && (
        <button
          type="button"
          className="qcc-nav-chip-close"
          title={removeTitle}
          onClick={e => {
            e.stopPropagation();
            onRemove();
          }}
          style={{
            position: 'absolute',
            right: 2,
            top: '50%',
            transform: 'translateY(-50%)',
            border: 'none',
            background: TOKENS.surface2,
            color: TOKENS.danger,
            borderRadius: 3,
            width: 15,
            height: 15,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          <span className="codicon codicon-close" style={{ fontSize: 9 }} />
        </button>
      )}
    </span>
  );
}

/**
 * Спільний square "+"-control для Package Add і UNION Add (§3/§11 — той
 * самий visual grammar, однакова висота з `NavMemberChip`/`CONTROL_BOX`).
 */
function NavAddButton({ title, onClick }: { title: string; onClick: () => void }): React.ReactElement {
  return (
    <button
      type="button"
      className="qcc-btn"
      title={title}
      onClick={onClick}
      style={{
        ...CONTROL_BOX,
        width: CONTROL_HEIGHT,
        justifyContent: 'center',
        cursor: 'pointer',
        color: TOKENS.accent,
        fontSize: 14,
        fontWeight: 600,
        padding: 0,
      }}
    >
      +
    </button>
  );
}

const COMPACT_NAV_BTN: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  fontSize: 11,
  padding: '0 5px',
  height: '100%',
  color: TOKENS.textSecondary,
};

const UNION_KEYWORD_BTN: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: 0.3,
  padding: '0 4px',
  height: CONTROL_HEIGHT,
  // Design review (2026-09-19): раніше chartOrange — "кричало" на
  // користувача, ніби ОБ'ЄДНАТИ ВСЕ це команда, а не режим композиції.
  // Нейтральний textSecondary пояснює контекст, не привертаючи зайвої
  // уваги; єдиний акцентний колір у стрічці — активний SELECT-чип
  // (TOKENS.accent) і role-колір QueryIdentity.
  color: TOKENS.textSecondary,
  whiteSpace: 'nowrap',
};

/** Кількість SELECT-чипів, показаних повністю inline, перш ніж стиснути в
 * компактний "n/total ‹ ›" режим (design review 2026-09-19). */
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
 * container query замість viewport query — див. `useContainerWidth`).
 * НЕ змінені цим presentation-only проходом (explicit §12 constraint). */
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
 * Redesign (2026-09-21, presentation-only pass): попередній прохід уже
 * реалізував Package/QueryIdentity/UNION responsive поведінку правильно за
 * функціоналом, але виглядало як "набір розрізнених кнопок" (explicit
 * feedback). Цей прохід НЕ змінює жодної поведінки/reducer/domain --- лише
 * візуальну "мову" контролів (`CONTROL_BOX`/`NavMemberChip`/`NavAddButton`,
 * §1-11 узгодженого прототипу), щоб Package/Query/UNION читались як ОДНА
 * IDE navigation surface.
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

  const identityMaxWidth = isNarrow ? 100 : 200;
  const accent = roleAccent(queryType);

  return (
    <div style={{ minWidth: 0 }}>
      <div ref={barRef} style={BAR_STYLE}>
        <span style={GROUP_LABEL} title={t(locale, 'packageConceptTooltip')}>
          <span className="codicon codicon-package" style={{ fontSize: 13 }} />
          {!isNarrow && t(locale, 'sidebarPackage')}
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
          title={
            queryType === 'select'
              ? activeName
              : `${t(locale, queryType === 'createTemp' ? 'packageIdentityRoleCreates' : queryType === 'appendTemp' ? 'packageIdentityRoleAppends' : 'packageIdentityRoleDrops')} ${tempTableName || activeName}`
          }
          onClick={() => {
            const rect = identityRef.current?.getBoundingClientRect();
            setIdentityAnchor(rect ? { top: rect.bottom + 4, left: rect.left } : { top: 40, left: 8 });
          }}
          style={{
            ...CONTROL_BOX,
            cursor: 'pointer',
            gap: 6,
            padding: '0 8px',
            minWidth: 0,
            flex: '0 1 auto',
          }}
        >
          <span
            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: identityMaxWidth, color: TOKENS.text, fontWeight: 600 }}
          >
            {queryType === 'select' ? activeName : (tempTableName || activeName)}
          </span>
          {/* Visual polish (2026-09-21, round 2): database-іконка + другий
              рядок з дієсловом ("Створює ВТ") прибрані (§3/§4 explicit
              feedback: "занадто важко і дублює інформацію") --- тип операції
              тепер передається ЛИШЕ кольором маленького "ВТ" badge (та сама
              `roleAccent`), popover (клік) і `title` цієї кнопки лишаються
              повним текстовим джерелом семантики для accessibility (§15). */}
          {queryType !== 'select' && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                lineHeight: 1,
                padding: '2px 4px',
                borderRadius: 3,
                color: accent,
                background: accent ? `color-mix(in srgb, ${accent} 18%, transparent)` : undefined,
                flexShrink: 0,
              }}
            >
              {t(locale, 'queryIdentityTempBadge')}
            </span>
          )}
          <span style={{ color: TOKENS.textMuted, flexShrink: 0 }}>▾</span>
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
          narrow={isNarrow}
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
              style={{ ...CONTROL_BOX, width: CONTROL_HEIGHT, justifyContent: 'center', cursor: 'pointer', padding: 0 }}
            >
              <span className="codicon codicon-ellipsis" style={{ fontSize: 13 }} />
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
 * inline (сегментована група `NavMemberChip` — до `PACKAGE_INLINE_LIMIT`/
 * wide container) і compact (`n/total ‹ ›` у тому самому `CONTROL_BOX`, що й
 * UNION-версія нижче — свідомо ОДНАКОВА interaction grammar, щоб Package і
 * UNION відчувались частинами однієї системи, §6/§11).
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

  /**
   * Visual polish (2026-09-21, round 2): status dot замість окремої
   * `codicon-database` іконки --- accessible через `tabIndex`+`title` (§15:
   * колір ЛИШЕ shortcut, повна операція+ім'я ВТ завжди в tooltip через
   * `tempTableTooltip`, той самий hover/focus highlight-механізм для
   * пов'язаних package-членів, що й раніше).
   */
  function memberDot(i: number, relations: PackageTempTableRelation[] | undefined, outside: boolean): React.ReactElement | undefined {
    const color = memberDotColor(relations);
    if (!color || !relations) return undefined;
    return (
      <span
        tabIndex={0}
        role="img"
        aria-label={tempTableTooltip(locale, relations)}
        title={tempTableTooltip(locale, relations)}
        onMouseEnter={() => setHighlightedMembers(relatedMemberIndices(i, relations))}
        onMouseLeave={() => setHighlightedMembers(null)}
        onFocus={() => setHighlightedMembers(relatedMemberIndices(i, relations))}
        onBlur={() => setHighlightedMembers(null)}
        style={{
          display: 'block',
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: color,
          cursor: 'default',
          outline: 'none',
          pointerEvents: 'auto',
          ...(outside ? { position: 'absolute', top: -2, right: -2 } : {}),
        }}
      />
    );
  }

  if (!compact) {
    return (
      <>
        <span style={{ ...CONTROL_BOX, overflow: 'hidden' }}>
          {Array.from({ length: batchCount }, (_, i) => {
            const isActive = i === active;
            const relations = continuity.get(i);
            const highlighted = highlightedMembers?.has(i) ?? false;
            return (
              <span key={i} style={{ position: 'relative', height: '100%', boxShadow: highlighted ? `inset 0 -2px 0 0 ${TOKENS.accent}` : undefined }}>
                <NavMemberChip
                  label={`${i + 1}`}
                  title={batchMemberName(state, i)}
                  active={isActive}
                  onSelect={() => dispatch({ type: 'SET_ACTIVE_BATCH', index: i })}
                  onRemove={batchCount > 1 ? () => dispatch({ type: 'REMOVE_BATCH_QUERY', index: i }) : undefined}
                  removeTitle={`${t(locale, 'packageRemove')} ${i + 1}`}
                  divider={i < batchCount - 1}
                  dot={memberDot(i, relations, false)}
                />
              </span>
            );
          })}
        </span>
        {showAdd && <NavAddButton title={t(locale, 'packageAddQuery')} onClick={() => dispatch({ type: 'ADD_BATCH_QUERY' })} />}
      </>
    );
  }

  const relations = continuity.get(active);
  const highlighted = highlightedMembers !== null && highlightedMembers.size > 0;
  return (
    <>
      <span className="qcc-nav-chip" style={{ ...CONTROL_BOX, position: 'relative', gap: 2, padding: batchCount > 1 ? '0 15px 0 2px' : '0 2px', boxShadow: highlighted ? `inset 0 -2px 0 0 ${TOKENS.accent}` : undefined }}>
        <button
          type="button"
          className="qcc-btn"
          title={t(locale, 'packageUnionPrev')}
          disabled={active === 0}
          onClick={() => dispatch({ type: 'SET_ACTIVE_BATCH', index: active - 1 })}
          style={{ ...COMPACT_NAV_BTN, opacity: active === 0 ? 0.4 : 1 }}
        >
          ‹
        </button>
        <span style={{ color: TOKENS.text, fontWeight: 600, whiteSpace: 'nowrap', fontSize: 12 }} title={batchMemberName(state, active)}>
          {active + 1}/{batchCount}
        </span>
        <button
          type="button"
          className="qcc-btn"
          title={t(locale, 'packageUnionNext')}
          disabled={active === batchCount - 1}
          onClick={() => dispatch({ type: 'SET_ACTIVE_BATCH', index: active + 1 })}
          style={{ ...COMPACT_NAV_BTN, opacity: active === batchCount - 1 ? 0.4 : 1 }}
        >
          ›
        </button>
        {memberDot(active, relations, true)}
        {batchCount > 1 && (
          <button
            type="button"
            className="qcc-nav-chip-close"
            title={`${t(locale, 'packageRemove')} ${active + 1}`}
            onClick={() => dispatch({ type: 'REMOVE_BATCH_QUERY', index: active })}
            style={{ border: 'none', background: 'transparent', color: TOKENS.danger, cursor: 'pointer', fontSize: 11, padding: '0 4px', height: '100%', display: 'flex', alignItems: 'center' }}
          >
            <span className="codicon codicon-close" />
          </button>
        )}
      </span>
      {showAdd && <NavAddButton title={t(locale, 'packageAddQuery')} onClick={() => dispatch({ type: 'ADD_BATCH_QUERY' })} />}
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
 * Design review (2026-09-19, redesigned 2026-09-21): УНІВЕРСАЛЬНИЙ
 * інструмент "об'єднання запитів" (ОБЪЕДИНИТЬ/ОБЪЕДИНИТЬ ВСЕ,
 * `QueryState.queryList`/`activeQuery` — той самий домен, що вже давно
 * працює в Classic `UnionsTab.tsx`/`ADD_QUERY`/`REMOVE_QUERY`/
 * `SET_ACTIVE_QUERY`/`SET_QUERY_DISTINCT`, жодних нових reducer actions)
 * навмисно НЕ отримав окремої вкладки чи persistent-стрічки — вбудований у
 * ЦЕЙ САМИЙ рядок PackageNav.
 *
 * Коли union ще немає (queryList.length<=1) — компактна secondary-дія
 * (merge-іконка + текст у тому самому `CONTROL_BOX`, §7 explicit
 * requirement "not a large disabled-looking grey text"). Коли є 2-4 SELECT
 * (і достатньо широкий контейнер) — сегментована група `NavMemberChip`,
 * той самий primitive, що й Package. Понад {@link UNION_INLINE_LIMIT} АБО
 * на medium/narrow container width (`compact` prop від `PackageNav`) —
 * стиснуто в `n/total ‹ ›`.
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
  narrow,
}: {
  locale: SupportedLocale;
  state: QueryState;
  dispatch: React.Dispatch<QueryAction>;
  onFirstUnionCreated: () => void;
  compact: boolean;
  showAdd: boolean;
  narrow: boolean;
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
        style={{ ...CONTROL_BOX, gap: 5, padding: '0 8px', cursor: 'pointer', color: TOKENS.textSecondary, flexShrink: 0 }}
      >
        <span className="codicon codicon-git-merge" style={{ fontSize: 12 }} />
        {!narrow && t(locale, 'packageAddUnion')}
      </button>
    );
  }

  const [showMapping, setShowMapping] = React.useState(false);

  // Visual QA (2026-09-21): на вузькому container width повний label
  // ("⑂ Об'єднання" + mapping-кнопка) разом з bordered-контролами (важче за
  // старий plain-текст на тому самому breakpoint) виштовхував "⋯" overflow
  // trigger за межі видимої області (`overflow:hidden` на BAR_STYLE просто
  // відрізав його, а не переносив на новий рядок) --- лишаємо тут ЛИШЕ
  // merge-іконку без тексту/mapping-кнопки; сам mapping лишається
  // доступним на wide/medium.
  const unionLabel = narrow ? (
    <span className="codicon codicon-git-merge" style={{ fontSize: 12, color: TOKENS.textMuted, flexShrink: 0 }} title={t(locale, 'packageUnionLabelTooltip')} />
  ) : (
    <span style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0, color: TOKENS.textMuted }} title={t(locale, 'packageUnionLabelTooltip')}>
      <span className="codicon codicon-git-merge" style={{ fontSize: 12, marginRight: 3 }} />
      {t(locale, 'packageUnionLabel')}
      <button
        type="button"
        className="qcc-btn"
        title={t(locale, 'packageUnionMappingButton')}
        onClick={() => setShowMapping(true)}
        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: TOKENS.textMuted, opacity: 0.75, padding: '0 3px', height: CONTROL_HEIGHT, display: 'flex', alignItems: 'center' }}
      >
        <span className="codicon codicon-list-flat" style={{ fontSize: 11 }} />
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
        <span className="qcc-nav-chip" style={{ ...CONTROL_BOX, position: 'relative', gap: 2, padding: '0 15px 0 2px' }}>
          <button
            type="button"
            className="qcc-btn"
            title={t(locale, 'packageUnionPrev')}
            disabled={active === 0}
            onClick={() => dispatch({ type: 'SET_ACTIVE_QUERY', index: active - 1 })}
            style={{ ...COMPACT_NAV_BTN, opacity: active === 0 ? 0.4 : 1 }}
          >
            ‹
          </button>
          <span style={{ color: TOKENS.text, fontWeight: 600, whiteSpace: 'nowrap', fontSize: 12 }}>
            {active + 1}/{queryList.length}
          </span>
          <button
            type="button"
            className="qcc-btn"
            title={t(locale, 'packageUnionNext')}
            disabled={active === queryList.length - 1}
            onClick={() => dispatch({ type: 'SET_ACTIVE_QUERY', index: active + 1 })}
            style={{ ...COMPACT_NAV_BTN, opacity: active === queryList.length - 1 ? 0.4 : 1 }}
          >
            ›
          </button>
          {/* Visual polish (2026-09-21, round 2): compact UNION раніше НЕ мав
              жодного способу видалити active SELECT (§8 explicit critical
              gap) --- той самий inline hover-`×` grammar, що вже працює для
              compact Package (§6), НЕ окремий overflow-запис, бо на
              medium-width тут немає спільного kebab-меню взагалі (те з'являється
              лише на narrow). REMOVE_QUERY, жодної нової дії. */}
          <button
            type="button"
            className="qcc-nav-chip-close"
            title={t(locale, 'packageUnionRemove')}
            onClick={() => dispatch({ type: 'REMOVE_QUERY', index: active })}
            style={{ position: 'absolute', right: 2, top: '50%', transform: 'translateY(-50%)', border: 'none', background: TOKENS.surface2, color: TOKENS.danger, borderRadius: 3, width: 15, height: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, cursor: 'pointer', outline: 'none' }}
          >
            <span className="codicon codicon-close" style={{ fontSize: 9 }} />
          </button>
        </span>
        {!narrow && keywordLabel && (
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
        {showAdd && <NavAddButton title={t(locale, 'packageUnionAdd')} onClick={() => dispatch({ type: 'ADD_QUERY' })} />}
      </span>
    );
  }

  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
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
            {/* Кожен SELECT-чип — власний `CONTROL_BOX` (не одна суцільна
                сегментована смуга, як у Package): між чипами завжди сидить
                UNION/UNION ALL keyword-текст, тож "одна нерозривна група"
                тут візуально не має сенсу — окремі бокси того самого
                border/radius/height "мовою" читаються як частина ОДНІЄЇ
                системи контролів без штучного злиття. */}
            <span style={{ ...CONTROL_BOX, overflow: 'hidden' }}>
              <NavMemberChip
                label={`${i + 1}`}
                title={active ? q.name : `${t(locale, 'packageUnionGoToPrefix')} ${i + 1}`}
                active={active}
                onSelect={() => dispatch({ type: 'SET_ACTIVE_QUERY', index: i })}
                onRemove={() => dispatch({ type: 'REMOVE_QUERY', index: i })}
                removeTitle={t(locale, 'packageUnionRemove')}
                divider={false}
              />
            </span>
          </React.Fragment>
        );
      })}
      {showAdd && <NavAddButton title={t(locale, 'packageUnionAdd')} onClick={() => dispatch({ type: 'ADD_QUERY' })} />}
    </span>
  );
}
