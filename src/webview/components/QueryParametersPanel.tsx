import * as React from 'react';
import type { QueryAnalysisParameter } from '../../core/query/queryAnalysisService';

export interface QueryParametersPanelProps {
  parameters: QueryAnalysisParameter[];
}

const ITEM: React.CSSProperties = { padding: '6px 0', borderBottom: '1px solid var(--qc-border)' };
const LABEL: React.CSSProperties = { color: 'var(--vscode-descriptionForeground)', fontSize: 11 };

/**
 * Панель «Параметры запроса» (design-док, раздел 9) — read-only, из того же
 * `QueryAnalysisService.analyze()`, что и статус-бар/«Структура» (design-док риск
 * п.0.2/0.14). Установка значений параметров сюда сознательно НЕ входит (v1-граница,
 * design-док раздел 20).
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
export function QueryParametersPanel({ parameters }: QueryParametersPanelProps): React.ReactElement {
  if (parameters.length === 0) {
    return <div style={{ color: 'var(--vscode-descriptionForeground)' }}>Параметров нет.</div>;
  }
  return (
    <div>
      <div style={{ fontWeight: 'bold', marginBottom: 8 }}>Параметры запроса</div>
      {parameters.map(p => (
        <div key={p.name} style={ITEM}>
          <div style={{ fontWeight: 'bold' }}>&{p.name}</div>
          <div style={LABEL}>Использований: {p.usageCount}</div>
        </div>
      ))}
    </div>
  );
}
