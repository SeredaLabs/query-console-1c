import * as React from 'react';
import type { QueryType } from '../../core/query/queryModel';
import type { BatchMemberInfo } from '../state/queryStore';
import { t, type MessageKey } from '../i18n';

/** Компактний перелік назв полів: перші кілька + «+N», а не просто кількість. */
const MAX_FIELD_NAMES = 4;
function formatFieldNames(names: string[]): string {
  if (names.length === 0) return t('common.noneSelected');
  if (names.length <= MAX_FIELD_NAMES) return names.join(', ');
  return `${names.slice(0, MAX_FIELD_NAMES).join(', ')} +${names.length - MAX_FIELD_NAMES}`;
}

/**
 * Бокова вертикальна смуга вкладок запитів пакета (замінює колишній
 * `writingMode: 'vertical-rl'` варіант — обертати довгі 1С-ідентифікатори
 * ВТ (типу `ВТОстаткиТоваровПоСкладамНаКонецПериода`) на бік було нечитабельно).
 * Компактні номери з кольоровою крапкою типу завжди видно; повна назва +
 * деталі — у картці по наведенню/фокусу. Дизайн картки (значок-сутність,
 * бейдж типу, іконки полів/джерел/умов, синій акцент ВТ) узгоджений з
 * користувачем на прототипі (Artifact-канва «Batch tab hover card»).
 */

interface SideTabsRailProps {
  items: BatchMemberInfo[];
  active: number;
  onSelect: (index: number) => void;
  testId?: string;
}

/** Повний опис типу — для title/aria (a11y), бейдж на картці показує лише коротку позначку. */
const TYPE_LABEL: Record<QueryType, MessageKey> = {
  select: 'sideTabs.type.select',
  createTemp: 'sideTabs.type.createTemp',
  appendTemp: 'sideTabs.type.appendTemp',
  dropTemp: 'sideTabs.type.dropTemp',
};

/** Коротка позначка на бейджі — тільки для операцій з ВТ; звичайний запит бейджа не показує. */
const BADGE_LABEL: Partial<Record<QueryType, MessageKey>> = {
  createTemp: 'sideTabs.badge.createTemp',
  appendTemp: 'sideTabs.badge.appendTemp',
  dropTemp: 'sideTabs.badge.dropTemp',
};

const ACCENT = 'var(--vscode-charts-purple, #b180d7)';
const ACCENT_SOFT = 'rgba(177, 128, 215, 0.16)';
const NEUTRAL = 'var(--vscode-descriptionForeground, #8b8b8b)';
const NEUTRAL_SOFT = 'rgba(139, 139, 139, 0.14)';

const CARD_WIDTH = 236;

/**
 * Вставляє zero-width space на межах PascalCase (наприклад, у
 * `ВТОстаткиТоваровПоСкладам`), щоб довгий ідентифікатор без пробілів
 * переносився в підказці по «словах», а не посеред слова.
 */
function camelBreak(name: string): string {
  return name.replace(/([а-яёa-z])([А-ЯЁA-Z])/g, '$1​$2');
}

function FieldsIcon(): React.ReactElement {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path d="M2 3h12M2 8h12M2 13h7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function TablesIcon(): React.ReactElement {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="3" width="12" height="10" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2 7.5h12M6.3 3v10" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  );
}

function ConditionsIcon(): React.ReactElement {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path d="M2.5 3h11l-4 5v4.5l-3 1.5V8L2.5 3z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

function EntityIcon({ color }: { color: string }): React.ReactElement {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2" width="12" height="12" rx="1.5" stroke={color} strokeWidth="1.4" />
      <path d="M2 8h12M8 2v12" stroke={color} strokeWidth="1.2" />
    </svg>
  );
}

function Tab({ info, index, isActive, onSelect }: {
  info: BatchMemberInfo;
  index: number;
  isActive: boolean;
  onSelect: () => void;
}): React.ReactElement {
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const cardRef = React.useRef<HTMLDivElement>(null);
  const isTemp = info.queryType !== 'select';
  const accent = isTemp ? ACCENT : NEUTRAL;
  const accentSoft = isTemp ? ACCENT_SOFT : NEUTRAL_SOFT;
  const badgeKey = BADGE_LABEL[info.queryType];
  // Картка існує в DOM лише під час наведення/фокуса — інакше кожна з N вкладок
  // одночасно рендерила б свою картку без left/top (fixed без офсетів лягає в
  // «статичну» позицію браузера), і всі N карток накладалися б в одному місці.
  // `anchor` — координати кнопки в момент показу; `pos` — фінальна, притиснута
  // до меж вікна позиція картки, порахована ПІСЛЯ монтування за її реальним
  // розміром (довжина імені через camelBreak() непередбачувано впливає на
  // висоту). До готовності `pos` картка невидима (visibility), щоб не
  // блимнути в неправильному місці.
  const [anchor, setAnchor] = React.useState<{ left: number; top: number; height: number } | null>(null);
  const [pos, setPos] = React.useState<{ left: number; top: number } | null>(null);

  function show(): void {
    const btn = btnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    setAnchor({ left: r.left, top: r.top, height: r.height });
    setPos(null);
  }
  function hide(): void {
    setAnchor(null);
    setPos(null);
  }

  React.useLayoutEffect(() => {
    if (!anchor || !cardRef.current) return;
    const cardHeight = cardRef.current.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Зазвичай зліва від вкладки (смуга — на правому краю вікна); якщо зліва
    // не вистачає місця (вузьке вікно) — перевертаємо праворуч від вкладки.
    let left = anchor.left - CARD_WIDTH - 8;
    if (left < 8) left = anchor.left + 24;
    left = Math.max(8, Math.min(left, vw - CARD_WIDTH - 8));
    let top = anchor.top + anchor.height / 2 - cardHeight / 2;
    top = Math.max(8, Math.min(top, vh - cardHeight - 8));
    setPos({ left, top });
  }, [anchor]);

  return (
    <button
      ref={btnRef}
      className="qc-side-tab"
      data-testid="side-tab"
      data-active={isActive || undefined}
      onClick={onSelect}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      style={{
        all: 'unset', boxSizing: 'border-box', position: 'relative', width: '100%',
        display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        padding: '9px 0', cursor: 'pointer',
        borderLeft: isActive ? '2px solid var(--vscode-focusBorder, #007fd4)' : '2px solid transparent',
        color: isActive ? 'var(--vscode-tab-activeForeground, #fff)' : 'var(--vscode-descriptionForeground, #aaa)',
        background: isActive ? 'var(--vscode-tab-activeBackground, #1e1e1e)' : undefined,
        fontWeight: isActive ? 600 : 400,
        fontFamily: 'var(--vscode-editor-font-family, monospace)',
        fontSize: 12,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: accent }} />
      {index + 1}
      {anchor && (
      <div
        ref={cardRef}
        className="qc-side-tab-card"
        style={{
          position: 'fixed', width: CARD_WIDTH,
          left: pos ? pos.left : anchor.left, top: pos ? pos.top : anchor.top,
          visibility: pos ? 'visible' : 'hidden',
          background: 'var(--vscode-editor-background, #1e1e1e)',
          border: '1px solid var(--qc-border)', borderRadius: 5,
          boxShadow: '0 6px 20px rgba(0,0,0,0.45)', padding: '10px 12px',
          fontFamily: 'var(--vscode-font-family, sans-serif)', textAlign: 'left',
          zIndex: 50, pointerEvents: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span
            title={t(TYPE_LABEL[info.queryType])}
            style={{
              width: 20, height: 20, borderRadius: 5, background: accentSoft, flexShrink: 0,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <EntityIcon color={accent} />
          </span>
          <div style={{ flexGrow: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--vscode-tab-activeForeground, #fff)', lineHeight: 1.35, overflowWrap: 'break-word' }}>
            {camelBreak(info.name)}
          </div>
          {badgeKey && (
            <span style={{
              fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3, color: accent, background: accentSoft,
              padding: '2px 7px', borderRadius: 9, whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              {t(badgeKey)}
            </span>
          )}
        </div>

        <div style={{ height: 1, background: 'var(--qc-border)', margin: '0 0 8px' }} />

        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <span style={{ color: 'var(--vscode-descriptionForeground, #8b8b8b)', flexShrink: 0, marginTop: 2 }}><FieldsIcon /></span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10, color: 'var(--vscode-descriptionForeground, #8b8b8b)', marginBottom: 3 }}>{t('sideTabs.fields')}</div>
            <div style={{ fontSize: 11.5, color: 'var(--vscode-tab-activeForeground, #fff)', fontFamily: 'var(--vscode-editor-font-family, monospace)', overflowWrap: 'break-word' }}>
              {formatFieldNames(info.fieldNames)}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <IconRow icon={<TablesIcon />} label={t('sideTabs.tablesCount')} value={info.tablesCount} />
          <IconRow icon={<ConditionsIcon />} label={t('sideTabs.conditionsCount')} value={info.conditionsCount} />
          {info.memberCount > 1 && <Row label={t('sideTabs.memberCount')} value={info.memberCount} />}
        </div>
      </div>
      )}
    </button>
  );
}

function IconRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }): React.ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--vscode-descriptionForeground, #8b8b8b)' }}>
      <span style={{ flexShrink: 0, display: 'inline-flex' }}>{icon}</span>
      <span style={{ flexGrow: 1 }}>{label}</span>
      <b style={{ fontSize: 11.5, color: 'var(--vscode-tab-activeForeground, #fff)', fontFamily: 'var(--vscode-editor-font-family, monospace)', fontWeight: 600 }}>{value}</b>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }): React.ReactElement {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 11.5, color: 'var(--vscode-descriptionForeground, #8b8b8b)' }}>
      <span>{label}</span>
      <b style={{ color: 'var(--vscode-tab-activeForeground, #fff)', fontFamily: 'var(--vscode-editor-font-family, monospace)', fontWeight: 500 }}>{value}</b>
    </div>
  );
}

export function SideTabsRail({ items, active, onSelect, testId }: SideTabsRailProps): React.ReactElement {
  return (
    <div
      data-testid={testId}
      style={{
        display: 'flex', flexDirection: 'column', overflowY: 'auto', maxHeight: '100%',
        borderLeft: '1px solid var(--qc-border)',
        background: 'var(--vscode-editorGroupHeader-tabsBackground, #252526)',
        flexShrink: 0, width: 40,
      }}
    >
      {items.map((info, i) => (
        <Tab key={i} info={info} index={i} isActive={i === active} onSelect={() => onSelect(i)} />
      ))}
    </div>
  );
}
