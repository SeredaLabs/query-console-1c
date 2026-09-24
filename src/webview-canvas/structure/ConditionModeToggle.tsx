import * as React from 'react';
import type { SupportedLocale } from '../../shared/locale';
import { t } from '../i18n';
import { TOKENS } from '../theme';

export type ConditionMode = 'field' | 'custom';

/** Shared "simple field / custom expression" condition-mode selector. */
export function ConditionModeToggle({
  locale,
  mode,
  onChange,
}: {
  locale: SupportedLocale;
  mode: ConditionMode;
  onChange: (mode: ConditionMode) => void;
}): React.ReactElement {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {(['field', 'custom'] as ConditionMode[]).map(m => {
        const active = m === mode;
        return (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            style={{
              flex: 1,
              fontSize: 11,
              fontWeight: active ? 600 : 400,
              padding: '4px 6px',
              borderRadius: 4,
              cursor: 'pointer',
              border: `1px solid ${active ? TOKENS.accent : TOKENS.border}`,
              background: active ? `color-mix(in srgb, ${TOKENS.accent} 12%, transparent)` : 'transparent',
              color: active ? TOKENS.accent : TOKENS.textSecondary,
            }}
          >
            {t(locale, m === 'field' ? 'structureJoinModeField' : 'structureJoinModeCustom')}
          </button>
        );
      })}
    </div>
  );
}
