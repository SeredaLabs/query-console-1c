import * as React from 'react';
import { Chevron } from './Chevron';
import type { QueryAnalysisQuery, QueryAnalysisResult, NavigateFn } from '../../core/query/queryAnalysisService';
import { t } from '../i18n';

export interface QueryStructurePanelProps {
  result: QueryAnalysisResult;
  /** Переводит курсор к вхождению фрагмента в тексте — best-effort навигация
   * (design-док, риск п.0.3: простой поиск по тексту, не точные source-range с
   * уровня отдельного узла модели). Диапазон `query.textRange` (свой `;`-блок)
   * ограничивает поиск ИМ — иначе клик по полю «Результата» мог бы подсветить
   * одноимённое поле в чужом временном блоке пакета. */
  onNavigate: NavigateFn;
}

const MONO = 'var(--vscode-editor-font-family, monospace)';

/** Мелкая приглушённая надпись-категория (тот же приём, что и заголовки секций
 * в панелях VS Code — Outline/SCM) — не соперничает по вниманию с самими данными. */
const GROUP_LABEL: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  color: 'var(--vscode-descriptionForeground)',
};

const SECTION_HEADER: React.CSSProperties = {
  ...GROUP_LABEL,
  display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer',
  padding: '6px 0',
};

const ICON: React.CSSProperties = { fontSize: 13, opacity: 0.75, flexShrink: 0 };

const ITEM: React.CSSProperties = {
  padding: '6px 4px 6px 20px',
  margin: '0 -4px',
  borderRadius: 3,
  borderBottom: '1px solid var(--qc-border)',
  cursor: 'pointer',
  lineHeight: 1.4,
};

const ITEM_MAIN: React.CSSProperties = { fontSize: 12.5 };

const ITEM_SUB: React.CSSProperties = {
  color: 'var(--vscode-descriptionForeground)',
  fontSize: 11,
  fontFamily: MONO,
  marginTop: 2,
};

/** Строка с hover-подсветкой — визуально показывает, что клик по ней переведёт
 * курсор в текст (сама подсветка + постоянный разделитель между строками, иначе
 * длинные многострочные условия сливаются друг с другом). */
function NavItem({ onClick, children }: { onClick: () => void; children: React.ReactNode }): React.ReactElement {
  const [hover, setHover] = React.useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ ...ITEM, background: hover ? 'var(--vscode-toolbar-hoverBackground, rgba(90,93,94,0.4))' : 'transparent' }}
    >
      {children}
    </div>
  );
}

function Section({ title, icon, count, defaultOpen = true, children }: {
  title: string; icon: string; count: number; defaultOpen?: boolean; children: React.ReactNode;
}): React.ReactElement {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={SECTION_HEADER} onClick={() => setOpen(v => !v)}>
        <Chevron expanded={open} size={10} />
        <span className={`codicon codicon-${icon}`} style={ICON} />
        <span>{title} ({count})</span>
      </div>
      {open && count > 0 && <div>{children}</div>}
    </div>
  );
}

/** Поля/источники/соединения/условия ОДНОГО запроса (результат или один временный
 * блок) — общая часть для «Результата» и каждой временной таблицы ниже. */
function QueryBlock({ query, onNavigate }: { query: QueryAnalysisQuery; onNavigate: NavigateFn }): React.ReactElement {
  return (
    <>
      <Section title={t('structure.fields')} icon="symbol-field" count={query.fields.length}>
        {query.fields.map((f, i) => (
          <NavItem key={i} onClick={() => onNavigate(f.expression, query.textRange)}>
            <div style={ITEM_MAIN}>{f.alias}</div>
            <div style={ITEM_SUB}>{f.expression}</div>
          </NavItem>
        ))}
      </Section>

      <Section title={t('structure.sources')} icon="table" count={query.sources.length}>
        {query.sources.map((s, i) => (
          <NavItem key={i} onClick={() => onNavigate(s.fullName, query.textRange)}>
            <div style={ITEM_MAIN}>{s.alias}</div>
            <div style={ITEM_SUB}>{s.fullName}</div>
          </NavItem>
        ))}
      </Section>

      <Section title={t('structure.joins')} icon="git-merge" count={query.joins.length}>
        {query.joins.map((j, i) => (
          <NavItem key={i} onClick={() => onNavigate(j.rightAlias, query.textRange)}>
            <div style={ITEM_MAIN}>{j.leftAlias} → {j.rightAlias}</div>
            <div style={ITEM_SUB}>{j.keyword}</div>
          </NavItem>
        ))}
      </Section>

      <Section title={t('structure.conditions')} icon="filter" count={query.conditions.length}>
        {query.conditions.map((c, i) => (
          <NavItem key={i} onClick={() => onNavigate(c.text, query.textRange)}>
            <div style={{ ...ITEM_MAIN, fontFamily: MONO, fontSize: 11 }}>{c.text}</div>
          </NavItem>
        ))}
      </Section>
    </>
  );
}

/**
 * Панель «Структура запроса» (design-док, разделы 7-8) — read-only, данные из
 * `QueryAnalysisService.analyze()` (та же функция, что и статус-бар/«Проверить»,
 * design-док риск п.0.2/0.14). Collapse-паттерн секций — тот же `Chevron`, что уже
 * используется в `DbTreePanel.tsx` (визуальная консистентность с остальным UI).
 *
 * Реальные пакетные запросы 1С почти всегда состоят из нескольких `ПОМЕСТИТЬ ВТ_…`
 * блоков — это порядок ВЫЧИСЛЕНИЯ, а не то, что запрос ВОЗВРАЩАЕТ. Поэтому «Результат»
 * (последний запрос пакета) оформлен как отдельный акцентный блок и раскрыт по
 * умолчанию, а временные таблицы — под приглушённым заголовком, свёрнутым по
 * умолчанию (это детали вычисления, а не то, что интересует в первую очередь).
 */
export function QueryStructurePanel({ result, onNavigate }: QueryStructurePanelProps): React.ReactElement {
  if (!result.result) {
    return <div style={{ color: 'var(--vscode-descriptionForeground)' }}>{t('structure.empty')}</div>;
  }
  return (
    <div>
      <div style={{
        fontWeight: 'bold',
        fontSize: 13,
        paddingBottom: 8,
        marginBottom: 12,
        borderBottom: '1px solid var(--qc-border)',
      }}>
        {t('dialog.queryText.structure')}
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600, fontSize: 12, marginBottom: 6 }}>
          <span className="codicon codicon-output" style={ICON} />
          <span>{t('structure.result')}</span>
        </div>
        <QueryBlock query={result.result} onNavigate={onNavigate} />
      </div>

      {result.tempTables.length > 0 && (
        <Section title={t('structure.tempTables')} icon="database" count={result.tempTables.length} defaultOpen={false}>
          {result.tempTables.map((tt, i) => (
            <div
              key={i}
              style={{
                marginBottom: 10,
                paddingLeft: 8,
                borderLeft: '2px solid var(--qc-border)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600, fontSize: 11, fontFamily: MONO, marginBottom: 4, color: 'var(--vscode-charts-blue, #3794ff)' }}>
                <span className="codicon codicon-database" style={{ ...ICON, fontSize: 12 }} />
                <span>{tt.name}</span>
              </div>
              <QueryBlock query={tt} onNavigate={onNavigate} />
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}
