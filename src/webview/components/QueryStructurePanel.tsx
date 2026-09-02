import * as React from 'react';
import { Chevron } from './Chevron';
import type { QueryAnalysisResult } from '../../core/query/queryAnalysisService';

export interface QueryStructurePanelProps {
  result: QueryAnalysisResult;
  /** Переводит курсор к первому вхождению фрагмента в тексте — best-effort навигация
   * (design-док, риск п.0.3): `QueryModel` не несёт per-узловых source-range, точное
   * прокидывание диапазонов через лексер/парсер — отдельная, более объёмная работа,
   * оставленная за рамками v1. Простой поиск по тексту покрывает типовой случай
   * (раздел 8 design-дока) без него. */
  onNavigate: (searchText: string) => void;
}

const SECTION_HEADER: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer',
  padding: '4px 0', fontWeight: 'bold',
};

const ITEM_SUB: React.CSSProperties = {
  color: 'var(--vscode-descriptionForeground)',
  fontSize: 11,
};

/** Строка с hover-подсветкой (тот же приём, что и в QueryParametersPanel) — визуально
 * показывает, что клик по ней переведёт курсор в текст. */
function NavItem({ onClick, children }: { onClick: () => void; children: React.ReactNode }): React.ReactElement {
  const [hover, setHover] = React.useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '3px 4px 3px 18px',
        margin: '0 -4px',
        borderRadius: 3,
        cursor: 'pointer',
        background: hover ? 'var(--vscode-toolbar-hoverBackground, rgba(90,93,94,0.4))' : 'transparent',
      }}
    >
      {children}
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }): React.ReactElement {
  const [open, setOpen] = React.useState(true);
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={SECTION_HEADER} onClick={() => setOpen(v => !v)}>
        <Chevron expanded={open} />
        <span>{title} ({count})</span>
      </div>
      {open && count > 0 && <div>{children}</div>}
    </div>
  );
}

/**
 * Панель «Структура запроса» (design-док, разделы 7-8) — read-only, данные из
 * `QueryAnalysisService.analyze()` (та же функция, что и статус-бар/«Проверить»,
 * design-док риск п.0.2/0.14). Клик по элементу — best-effort переход к тексту
 * (см. `onNavigate`), collapse-паттерн секций — тот же `Chevron`, что уже
 * используется в `DbTreePanel.tsx` (визуальная консистентность с остальным UI).
 */
export function QueryStructurePanel({ result, onNavigate }: QueryStructurePanelProps): React.ReactElement {
  return (
    <div>
      <div style={{ fontWeight: 'bold', marginBottom: 8 }}>Структура запроса</div>

      <Section title="Поля" count={result.fields.length}>
        {result.fields.map((f, i) => (
          <NavItem key={i} onClick={() => onNavigate(f.expression)}>
            <div>{f.alias}</div>
            <div style={ITEM_SUB}>{f.expression}</div>
          </NavItem>
        ))}
      </Section>

      <Section title="Источники" count={result.sources.length}>
        {result.sources.map((s, i) => (
          <NavItem key={i} onClick={() => onNavigate(s.fullName)}>
            <div>{s.alias}</div>
            <div style={ITEM_SUB}>{s.fullName}</div>
          </NavItem>
        ))}
      </Section>

      <Section title="Соединения" count={result.joins.length}>
        {result.joins.map((j, i) => (
          <NavItem key={i} onClick={() => onNavigate(j.rightAlias)}>
            <div>{j.leftAlias} → {j.rightAlias}</div>
            <div style={ITEM_SUB}>{j.keyword}</div>
          </NavItem>
        ))}
      </Section>

      <Section title="Условия" count={result.conditions.length}>
        {result.conditions.map((c, i) => (
          <NavItem key={i} onClick={() => onNavigate(c.text)}>
            {c.text}
          </NavItem>
        ))}
      </Section>
    </div>
  );
}
