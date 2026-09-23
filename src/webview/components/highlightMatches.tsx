import * as React from 'react';
import { highlightRanges } from '../metadataTreeModel';

/**
 * `text` with every search-token occurrence wrapped in `<mark>` — shared by the
 * Classic metadata tree and the Canvas Source Browser (each passes its own
 * highlight background).
 */
export function highlightMatches(text: string, tokens: string[], background: string): React.ReactNode {
  const merged = highlightRanges(text, tokens);
  if (merged.length === 0) return text;
  const parts: React.ReactNode[] = [];
  let pos = 0;
  merged.forEach(([start, end], i) => {
    if (start > pos) parts.push(text.slice(pos, start));
    parts.push(
      <mark key={i} style={{ background, color: 'inherit', borderRadius: 2 }}>
        {text.slice(start, end)}
      </mark>
    );
    pos = end;
  });
  if (pos < text.length) parts.push(text.slice(pos));
  return <>{parts}</>;
}
