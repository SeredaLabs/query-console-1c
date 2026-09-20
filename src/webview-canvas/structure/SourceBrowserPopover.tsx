import * as React from 'react';
import type { MetaTable } from '../../core/metadata/types';
import type { SelectedTable } from '../../core/query/queryModel';
import type { SupportedLocale } from '../../shared/locale';
import { MetadataTree } from '../components/MetadataTree';
import { TOKENS } from '../theme';

export interface SourceBrowserAnchor {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Phase 3E.1: тепер приймає ПОВНІСТЮ обчислений anchor (top/left/width/height,
 * вже затиснутий у доступний viewport/workspace простір — рахує
 * StructureWorkspace через `computeSourceAnchor`). Сам компонент більше не
 * знає фіксованих 340×520 — це були значення "за замовчуванням", які тепер
 * реально відповідають доступному простору.
 *
 * Той самий backdrop+absolute патерн, що вже є в JoinPopover (Toolbar.tsx).
 */
export function SourceBrowserPopover({
  locale,
  tables,
  loaded,
  selectedTables,
  onAddTable,
  tempTables,
  onAddTempTable,
  anchor,
  onClose,
}: {
  locale: SupportedLocale;
  tables: MetaTable[];
  loaded: boolean;
  selectedTables: SelectedTable[];
  onAddTable: (table: MetaTable) => void;
  tempTables?: MetaTable[];
  onAddTempTable?: (table: MetaTable) => void;
  anchor: SourceBrowserAnchor | null;
  onClose: () => void;
}): React.ReactElement {
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 10 }} onClick={onClose} />
      <div
        style={{
          position: 'absolute',
          top: anchor?.top ?? 40,
          left: anchor?.left ?? 8,
          zIndex: 11,
          width: anchor?.width ?? 340,
          height: anchor?.height ?? 480,
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 6,
          border: `1px solid ${TOKENS.border}`,
          background: TOKENS.surface1,
          boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        <MetadataTree
          locale={locale}
          tables={tables}
          loaded={loaded}
          selectedTables={selectedTables}
          onAddTable={onAddTable}
          tempTables={tempTables}
          onAddTempTable={onAddTempTable}
        />
      </div>
    </>
  );
}
