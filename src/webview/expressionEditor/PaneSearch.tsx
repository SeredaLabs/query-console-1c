import * as React from 'react';
import { INPUT } from '../sharedStyles';

interface Props {
  inputRef: React.RefObject<HTMLInputElement>;
  value: string;
  placeholder: string;
  testId: string;
  onChange: (value: string) => void;
  /** ↓ / Enter — перейти в дерево під полем пошуку. */
  onEnterTree: () => void;
}

/** Єдине поле пошуку панелі «Поля»/«Функції». Esc з непорожнім текстом очищає
 * його (і не закриває модалку — подія позначається `preventDefault`). */
export function PaneSearch({ inputRef, value, placeholder, testId, onChange, onEnterTree }: Props): React.ReactElement {
  return (
    <div style={{ position: 'relative', margin: '0 8px 6px' }}>
      <span
        className="codicon codicon-search"
        style={{ position: 'absolute', left: 7, top: '50%', transform: 'translateY(-50%)', fontSize: 13, opacity: 0.7, pointerEvents: 'none' }}
      />
      <input
        ref={inputRef}
        type="text"
        value={value}
        placeholder={placeholder}
        data-testid={testId}
        spellCheck={false}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'ArrowDown' || e.key === 'Enter') { e.preventDefault(); onEnterTree(); }
          else if (e.key === 'Escape' && value) { e.preventDefault(); onChange(''); }
        }}
        style={{ ...INPUT, width: '100%', boxSizing: 'border-box', padding: '4px 8px 4px 26px' }}
      />
    </div>
  );
}
