import * as React from 'react';
import type { MetaTable } from '../../core/metadata/types';
import { Chevron } from './Chevron';
import { MetaKindIcon } from './MetaKindIcon';
import { ROW, TREE_ROW_GAP } from '../sharedStyles';

interface Props {
  label: string;
  title: string;
  kind: MetaTable['kind'] | null;
  children: React.ReactNode;
  depth?: number;
  defaultExpanded?: boolean;
}

export function FieldSourceGroup({ label, title, kind, children, depth = 0, defaultExpanded = true }: Props): React.ReactElement {
  const [expanded, setExpanded] = React.useState(defaultExpanded);
  return (
    <div data-field-group={label}>
      <div role="button" aria-label={label} tabIndex={0} aria-expanded={expanded} className="qc-row" title={title}
        onClick={() => setExpanded(value => !value)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(value => !value); }
          else if (e.key === 'ArrowLeft') { e.preventDefault(); setExpanded(false); }
          else if (e.key === 'ArrowRight') { e.preventDefault(); setExpanded(true); }
        }}
        style={{ ...ROW, paddingLeft: 8 + depth * 16, justifyContent: 'flex-start',
          gap: TREE_ROW_GAP, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}>
        <Chevron expanded={expanded} />
        <MetaKindIcon kind={kind} />
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      </div>
      {expanded && children}
    </div>
  );
}
