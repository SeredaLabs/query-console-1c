import * as React from 'react';
import { TOKENS } from '../theme';
import { joinKindVisual, type JoinKindLabel } from './joinKind';

const KINDS: JoinKindLabel[] = ['INNER', 'LEFT', 'FULL'];

/**
 * Segmented picker для типу з'єднання — спільний для Join creation popover
 * (Toolbar.tsx) і Inspector.tsx, щоб обидва місця виглядали й поводились
 * однаково (gap analysis: "не має кольорової ідентифікації типів... хотілось
 * іконками виділяти типи"). Кожен тип — власна іконка + колір
 * (`joinKindVisual`), обраний варіант підсвічується заливкою тим самим
 * кольором (не accent — accent лишається за graph selection).
 */
export function JoinKindPicker({
  value,
  onChange,
}: {
  value: JoinKindLabel;
  onChange: (kind: JoinKindLabel) => void;
}): React.ReactElement {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {KINDS.map(kind => {
        const visual = joinKindVisual(kind, TOKENS);
        const active = kind === value;
        return (
          <button
            key={kind}
            type="button"
            onClick={() => onChange(kind)}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              padding: '4px 0',
              fontSize: 11,
              fontWeight: active ? 600 : 400,
              borderRadius: 4,
              cursor: 'pointer',
              border: `1px solid ${active ? visual.color : TOKENS.border}`,
              background: active ? `color-mix(in srgb, ${visual.color} 16%, transparent)` : 'transparent',
              color: active ? visual.color : TOKENS.textSecondary,
            }}
          >
            <span className={`codicon codicon-${visual.icon}`} style={{ fontSize: 12 }} />
            {kind}
          </button>
        );
      })}
    </div>
  );
}
