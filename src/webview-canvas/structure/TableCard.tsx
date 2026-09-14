import * as React from 'react';
import { describeFieldTypes } from '../../core/metadata/describeType';
import type { MetaField, MetaTable } from '../../core/metadata/types';
import { defaultTableAlias, type SelectedField, type SelectedTable } from '../../core/query/queryModel';
import { MetaKindIcon } from '../../webview/components/MetaKindIcon';
import type { SupportedLocale } from '../../shared/locale';
import { t } from '../i18n';
import { TOKENS } from '../theme';
import type { Pos } from './layout';

/**
 * Phase 5 — стандартизована geometry (design principle: "Source nodes use
 * standardized geometry. Content adapts to node geometry, not node geometry
 * to content."). Картка ЗАВЖДИ 240×232 незалежно від кількості полів —
 * fields-область має фіксовану висоту з internal scroll, а не intrinsic
 * growth. Це дозволило прибрати ResizeObserver/onMeasured/setCardSize
 * (Phase 3C) — cardSize() у usePositions.ts тепер завжди повертає ту саму
 * константу, вимірювати нічого не треба.
 *
 * Phase 5.1 — інформаційніший two-level field row (design brief): технічне
 * ім'я лишається ПЕРШИМ рядком (primary identity), синонім+тип — другим,
 * приглушеним. geometry картки (240×232) і сама fields-viewport висота (192)
 * НЕ змінюються, просто видно менше рядків одночасно (internal scroll — як і
 * раніше — покриває решту).
 *
 * Phase 5.2 — visual density correction: перша ітерація two-level row (38px,
 * gap 6 до іконки, textMuted для secondary) вийшла "IDE B-" — забагато
 * vertical whitespace й icon-колонка, secondary text занадто темний.
 * `ROW_HEIGHT` 38→35, icon-колонка 20→16px із меншим gap, secondary —
 * `TOKENS.textSecondary` (muted, але читабельний) замість `textMuted`
 * (disabledForeground — призначений для вимкнених елементів, не для
 * другорядного, але ЧИТАБЕЛЬНОГО тексту). Інформаційна модель НЕ змінена —
 * лише compact IDE density.
 */
const CARD_WIDTH = 240;
const HEADER_HEIGHT = 40;
const ROW_HEIGHT = 35;
const FIELDS_VIEWPORT_HEIGHT = 192;
const CARD_HEIGHT = HEADER_HEIGHT + FIELDS_VIEWPORT_HEIGHT; // 232, фіксовано
const ROW_ICON_COL_WIDTH = 14; // == MetaKindIcon size у header — щоб іконки лежали на одній вертикальній лінії
const ROW_CHECKBOX_COL_WIDTH = 20;

function isReferenceField(field: MetaField): boolean {
  return field.types.some(ty => ty.ref);
}

/**
 * Компактне представлення reference-типу для РЯДКА картки (design brief:
 * "do NOT show long platform type... use compact reference presentation:
 * `→ Контрагенты`" — без префікса виду метаданих, на відміну від повного
 * `describeFieldTypes()`, який лишається для tooltip). Не-reference типи
 * тут не чіпаємо — вони вже компактні (`Строка(100)`, `Число(15,2)`...).
 */
function compactFieldTypeSummary(field: MetaField): string {
  const parts = field.types.map(ty => {
    if (ty.ref) return `→ ${ty.ref.name}`;
    if (ty.primitive === 'Строка') return ty.length ? `Строка(${ty.length})` : 'Строка';
    if (ty.primitive === 'Число') {
      if (ty.digits) return `Число(${ty.digits}${ty.fractionDigits ? `,${ty.fractionDigits}` : ''})`;
      return 'Число';
    }
    if (ty.primitive) return ty.primitive;
    return ty.raw;
  });
  return parts.filter((s): s is string => !!s).join(' | ');
}

/** Синонім показуємо, лише якщо він реально відрізняється від технічного імені — не дублюємо (design brief). */
function meaningfulSynonym(field: MetaField): string | undefined {
  if (!field.synonym) return undefined;
  return field.synonym.trim() === field.name.trim() ? undefined : field.synonym;
}

/** Другий рядок картки: `Synonym · Type` або просто `Type`, якщо синоніма немає/він == імені. */
function secondaryLineText(field: MetaField): string {
  const synonym = meaningfulSynonym(field);
  const typeText = compactFieldTypeSummary(field);
  if (synonym && typeText) return `${synonym} · ${typeText}`;
  return synonym ?? typeText;
}

/**
 * Tooltip — детальний рівень (design brief §Tooltip): технічне ім'я +
 * синонім (якщо відрізняється) окремим рядком, потім ПОВНИЙ
 * `describeFieldTypes()` (не компактний, з повним ім'ям виду метаданих для
 * reference — саме тут це доречно, на відміну від рядка картки).
 */
function fieldTooltip(field: MetaField): string {
  const synonym = meaningfulSynonym(field);
  const fullType = describeFieldTypes(field);
  const lines = [field.name];
  if (synonym) lines.push(synonym);
  if (fullType) lines.push(fullType);
  return lines.join('\n');
}

/**
 * `React.memo` + callback-сигнатури, що приймають `table.id`/шлях параметром
 * (замість того, щоб батько curry'їв їх у `.map()`) — Phase 3C performance
 * pass: батько (StructureWorkspace) тепер може передавати ОДИН стабільний
 * `useCallback` на всі картки, і чисте pan/zoom (transform змінюється, але
 * position/meta/selected конкретної картки — ні) більше не перерендерює
 * кожну TableCard.
 */
export const TableCard = React.memo(function TableCard({
  locale,
  table,
  meta,
  position,
  selected,
  dimmed,
  selectedFields,
  zoom,
  onSelect,
  onRemove,
  onToggleField,
  onDragTo,
}: {
  locale: SupportedLocale;
  table: SelectedTable;
  meta: MetaTable | undefined;
  position: Pos;
  selected: boolean;
  /** Phase 5 focus/dimming — true, коли є selection, але ця картка не в focus-наборі. */
  dimmed: boolean;
  selectedFields: SelectedField[];
  zoom: number;
  onSelect: (tableId: string) => void;
  onRemove: (tableId: string) => void;
  onToggleField: (tableId: string, path: string, checked: boolean) => void;
  onDragTo: (tableId: string, pos: Pos) => void;
}): React.ReactElement {
  const dragRef = React.useRef<{ startScreen: Pos; startPos: Pos } | null>(null);

  const onHeaderPointerDown = (e: React.PointerEvent): void => {
    e.stopPropagation();
    // setPointerCapture кидає NotFoundError для деяких джерел pointer-подій
    // (підтверджено live QA: headless/CDP-driven кліки) — сама можливість
    // не критична для роботи drag (позиція оновлюється й без неї через
    // звичайний bubbling), лише підвищує стійкість, коли курсор виходить за
    // межі елемента. Необроблений виняток тут раніше зривав подальшу обробку
    // pointerup/click в CanvasSurface.
    try {
      (e.target as Element).setPointerCapture(e.pointerId);
    } catch {
      /* no-op — див. коментар вище */
    }
    dragRef.current = { startScreen: { x: e.clientX, y: e.clientY }, startPos: position };
    onSelect(table.id);
  };
  const onHeaderPointerMove = (e: React.PointerEvent): void => {
    if (!dragRef.current) return;
    e.stopPropagation();
    const dx = (e.clientX - dragRef.current.startScreen.x) / zoom;
    const dy = (e.clientY - dragRef.current.startScreen.y) / zoom;
    onDragTo(table.id, { x: dragRef.current.startPos.x + dx, y: dragRef.current.startPos.y + dy });
  };
  const onHeaderPointerUp = (e: React.PointerEvent): void => {
    e.stopPropagation();
    dragRef.current = null;
    try {
      (e.target as Element).releasePointerCapture(e.pointerId);
    } catch {
      /* no-op — див. коментар у onHeaderPointerDown */
    }
  };

  const alias = defaultTableAlias(table);
  const virtualLabel = table.virtual ? (meta?.virtual?.slice ?? t(locale, 'structureVirtualTable')) : null;

  return (
    <div
      className="qcc-card"
      style={{
        position: 'absolute',
        left: position.x,
        top: position.y,
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        borderRadius: 6,
        border: `1px solid ${selected ? TOKENS.accent : TOKENS.border}`,
        boxShadow: selected ? `0 0 0 1px ${TOKENS.accent}` : 'none',
        background: TOKENS.surface1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        userSelect: 'none',
        opacity: dimmed ? 0.45 : 1,
      }}
      onClick={e => {
        e.stopPropagation();
        onSelect(table.id);
      }}
    >
      <div
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
        style={{
          height: HEADER_HEIGHT,
          minHeight: HEADER_HEIGHT,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '0 8px',
          cursor: 'grab',
          borderBottom: `1px solid ${TOKENS.border}`,
          // Phase 5.4 — header/body мали занадто близьку luminance у деяких
          // темах (`surface2` ~= `surface1`), тож border-bottom сам по собі
          // не читався периферійним зором. `color-mix` з foreground дає
          // ПОСЛІДОВНИЙ крок відділення в обох напрямках теми без нового
          // хардкодженого кольору: у dark (світлий foreground) — трохи
          // світліше за body, у light (темний foreground) — трохи темніше.
          background: `color-mix(in srgb, ${TOKENS.text} 6%, ${TOKENS.surface1})`,
        }}
      >
        {meta ? (
          <MetaKindIcon kind={meta.kind} size={14} />
        ) : (
          <span className="codicon codicon-table" style={{ fontSize: 14, opacity: 0.75, flexShrink: 0 }} />
        )}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0, lineHeight: 1.25 }}>
          <div
            title={table.fullName}
            style={{
              fontSize: 13,
              fontWeight: 600,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {table.fullName}
          </div>
          <div style={{ fontSize: 10.5, color: TOKENS.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {alias}
            {virtualLabel ? ` · ${virtualLabel}` : ''}
          </div>
        </div>
        <button
          type="button"
          className="qcc-card-remove"
          title={t(locale, 'structureRemoveSource')}
          onClick={e => {
            e.stopPropagation();
            onRemove(table.id);
          }}
          style={{
            flexShrink: 0,
            border: 'none',
            background: 'transparent',
            color: TOKENS.textMuted,
            cursor: 'pointer',
            fontSize: 12,
            padding: '2px 4px',
            // selected: завжди повністю видима незалежно від hover (inline
            // style переважає CSS-клас `.qcc-card-remove{opacity:.35}`).
            ...(selected ? { opacity: 1 } : {}),
          }}
        >
          ✕
        </button>
      </div>

      <div className="qcc-card-fields" style={{ height: FIELDS_VIEWPORT_HEIGHT, overflowY: 'auto' }}>
        {(meta?.fields ?? []).map(field => {
          const checked = selectedFields.some(f => f.tableId === table.id && f.path === field.name && !f.expression);
          const ref = isReferenceField(field);
          const secondary = secondaryLineText(field);
          return (
            <div
              key={field.name}
              title={fieldTooltip(field)}
              className="qcc-field-row"
              onClick={e => {
                // Bug fix: клік по полю раніше бульбашився до кореневого
                // div картки, чий onClick викликає onSelect(table.id) —
                // вибір ПОЛЯ для SELECT мимоволі відкривав Inspector
                // (селекція картки/фокус), хоча мав би стосуватись лише
                // inclusion-стану поля. Табличка обирається/фокусується
                // ТІЛЬКИ через header (onHeaderPointerDown), не через тіло
                // з полями.
                e.stopPropagation();
                onToggleField(table.id, field.name, !checked);
              }}
              style={{
                height: ROW_HEIGHT,
                display: 'flex',
                alignItems: 'center',
                // Phase 5.6 — вирівняти icon-колонку з header (gap 6,
                // padding 8px), щоб field-іконки та header-іконка лежали
                // на одній вертикальній лінії (reference mockup).
                gap: 6,
                padding: '0 8px',
                cursor: 'pointer',
                // Phase 5.7 — попередні 10% alpha на кількох підряд
                // включених рядках усе одно читались як суцільний
                // green/selection-подібний блок (gap analysis: "green ✓ вже
                // достатньо сильний inclusion indicator, background має бути
                // extremely weak"). Знижено до 5% — checkbox (✓) лишається
                // ЄДИНИМ основним inclusion-індикатором, тінт — ледь помітний
                // scan-aid, а не другий сильний сигнал. Roздільник рядків —
                // ще на крок тихіший (color-mix 50% замість суцільного
                // borderSubtle), щоб не читався як table/grid лінія.
                background: checked ? `color-mix(in srgb, ${TOKENS.success} 5%, transparent)` : 'transparent',
                borderBottom: `1px solid color-mix(in srgb, ${TOKENS.borderSubtle} 50%, transparent)`,
              }}
              onPointerDown={e => e.stopPropagation()}
            >
              <span
                className={`codicon codicon-${ref ? 'references' : 'symbol-field'}`}
                style={{
                  width: ROW_ICON_COL_WIDTH,
                  flexShrink: 0,
                  fontSize: 14,
                  // Phase 5.6 — гліф codicon центрується в своїй колонці
                  // (а не покладається на природний side-bearing шрифту),
                  // щоб він однаково лежав по вертикальній лінії з
                  // MetaKindIcon у header незалежно від конкретного гліфа.
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  // Phase 5.3: reference — важливіша семантика, тому трохи
                  // сильніша (opacity 1) за ordinary-поле (0.75, quiet
                  // scanning aid) — кольори НЕ мінялись, лише opacity-крок.
                  opacity: ref ? 1 : 0.75,
                  color: ref ? TOKENS.accent : TOKENS.textSecondary,
                }}
              />
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 0, lineHeight: 1.25 }}>
                <span
                  style={{
                    fontSize: 12.5,
                    fontWeight: 500,
                    color: TOKENS.text,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {field.name}
                </span>
                {secondary && (
                  <span
                    style={{
                      fontSize: 10.5,
                      // Phase 5.3: `textSecondary` (descriptionForeground) сам
                      // по собі був на межі "disabled" на реальних dark-темах
                      // (gap analysis: "muted != disabled"). Один крок
                      // контрасту вгору без нового токена — той самий
                      // foreground, applied з opacity, а не окремий
                      // приглушений колірний токен.
                      color: TOKENS.text,
                      opacity: 0.75,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {secondary}
                  </span>
                )}
              </span>
              <span style={{ width: ROW_CHECKBOX_COL_WIDTH, flexShrink: 0, display: 'flex', justifyContent: 'flex-end' }}>
                {/*
                  Phase 5.5 — та сама візуальна мова inclusion, що й
                  `AddControl` у Source Browser (MetadataTree.tsx): тиха
                  codicon-іконка (не суцільний закрашений checkbox-квадрат),
                  зелена (`TOKENS.success`) і завжди повної непрозорості коли
                  включено, приглушена й посилюється на hover рядка, коли ні —
                  один спільний inclusion-мова для Source Browser і TableCard.
                  Клікабельна область і toggle-семантика (весь рядок) — та
                  сама, що була в попередньому checkbox-варіанті.
                */}
                <span
                  className={`codicon codicon-${checked ? 'check' : 'add'} ${checked ? '' : 'qcc-field-toggle'}`}
                  style={{ fontSize: 12, color: checked ? TOKENS.success : TOKENS.textSecondary, ...(checked ? { opacity: 1 } : {}) }}
                />
              </span>
            </div>
          );
        })}
        {(meta?.fields ?? []).length === 0 && (
          <div style={{ padding: 8, fontSize: 12, color: TOKENS.textMuted }}>{t(locale, 'structureNoFields')}</div>
        )}
      </div>
    </div>
  );
});
