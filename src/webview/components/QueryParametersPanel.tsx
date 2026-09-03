import * as React from 'react';
import type { QueryAnalysisParameter, NavigateFn } from '../../core/query/queryAnalysisService';

export interface QueryParametersPanelProps {
  parameters: QueryAnalysisParameter[];
  /** Best-effort переход к первому вхождению `&Имя` в тексте — тот же принцип, что и
   * навигация из QueryStructurePanel (design-док, риск п.0.3: поиск по тексту, без
   * точных source-range). Параметр общий для всего пакета — диапазон не передаётся,
   * поиск идёт по всему тексту (в отличие от полей/источников из QueryStructurePanel,
   * у которых есть свой `;`-блок). */
  onNavigate: NavigateFn;
}

const LABEL: React.CSSProperties = { color: 'var(--vscode-descriptionForeground)', fontSize: 11 };
const ICON: React.CSSProperties = { fontSize: 13, opacity: 0.75, flexShrink: 0 };

function ParameterItem({ p, onNavigate }: { p: QueryAnalysisParameter; onNavigate: NavigateFn }): React.ReactElement {
  const [hover, setHover] = React.useState(false);
  return (
    <div
      onClick={() => onNavigate(`&${p.name}`)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '6px 4px',
        margin: '0 -4px',
        borderRadius: 3,
        borderBottom: '1px solid var(--qc-border)',
        cursor: 'pointer',
        background: hover ? 'var(--vscode-toolbar-hoverBackground, rgba(90,93,94,0.4))' : 'transparent',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className="codicon codicon-symbol-parameter" style={ICON} />
        <span style={{ fontWeight: 'bold', fontSize: 12.5 }}>&{p.name}</span>
      </div>
      <div style={{ ...LABEL, paddingLeft: 19 }}>Использований: {p.usageCount}</div>
    </div>
  );
}

/**
 * Панель «Параметры запроса» (design-док, раздел 9) — из того же
 * `QueryAnalysisService.analyze()`, что и статус-бар/«Структура» (design-док риск
 * п.0.2/0.14). Установка ЗНАЧЕНИЙ параметров сюда сознательно НЕ входит (v1-граница,
 * design-док раздел 20) — но переход к месту использования в тексте (как в
 * QueryStructurePanel) входит, это не редактирование.
 *
 * «Предполагаемый тип» из мокапа раздела 9 (там это ИЛЛЮСТРАЦИЯ примера, не жёсткое
 * требование текста) сознательно не реализован: проверено — готового резолвера
 * «путь поля → тип по метаданным» в кодовой базе нет, есть только приватная,
 * НЕПЕРЕИСПОЛЬЗУЕМАЯ логика этого рода, уже задублированная дважды
 * (`canonicalizeFieldCasing.ts`, `resolveBuilderStar.ts`). Третья копия ради
 * иллюстративного поля — именно тот scope creep, которого явно избегает design-док
 * («не роздувати задачу»). Если понадобится позже — эту логику стоит один раз вынести
 * в переиспользуемую функцию, а не дублировать снова.
 */
export function QueryParametersPanel({ parameters, onNavigate }: QueryParametersPanelProps): React.ReactElement {
  if (parameters.length === 0) {
    return <div style={{ color: 'var(--vscode-descriptionForeground)' }}>Параметров нет.</div>;
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
        Параметры запроса
      </div>
      {parameters.map(p => (
        <ParameterItem key={p.name} p={p} onNavigate={onNavigate} />
      ))}
    </div>
  );
}
