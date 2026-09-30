import type { MetaField, MetaTable, TableKind } from '../core/metadata/types';
import type { SupportedLocale } from './locale';

export type RefId = { kind: TableKind; name: string };

export type HostMsg =
  | {
      type: 'init'; hasInitialQuery: boolean; queryTextEditorV2: boolean; locale?: SupportedLocale;
      /** Classic may offer switching to Canvas (opt-in preview). Absent = no. */
      canvasAvailable?: boolean;
    }
  | { type: 'metadataTree'; tables: MetaTable[] }
  | { type: 'refFields'; ref: RefId; fields: MetaField[] }
  | { type: 'refreshResult'; ok: boolean; message: string }
  | { type: 'loadModel'; text: string };

export type WebviewMsg =
  | { type: 'ready' }
  | { type: 'expandRef'; ref: RefId }
  | { type: 'insertText'; text: string }
  | { type: 'cancel' }
  | { type: 'refreshCache' }
  /** Reload the same panel with the other designer UI, opening `text` (the
   * current model's generated query) there. The host keeps the editor binding. */
  | { type: 'switchDesigner'; target: DesignerMode; text: string };

export type DesignerMode = 'classic' | 'canvas';
