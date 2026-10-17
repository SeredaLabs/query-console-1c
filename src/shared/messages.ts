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
  /** `loadId` names this load in the webview's `baseline` report (C32).
   * `sourceText` is the query as opened from the document — also after a
   * Classic ↔ Canvas switch, when `text` is the other UI's generated text (U1). */
  | { type: 'loadModel'; text: string; loadId?: number; sourceText?: string };

export type WebviewMsg =
  | { type: 'ready' }
  | { type: 'expandRef'; ref: RefId }
  | { type: 'insertText'; text: string }
  /** U1/C32: request only a no-write close against the host's accepted baseline.
   * A changed text or missing baseline must never fall through to insertion. */
  | { type: 'closeIfUnchanged'; text: string }
  /** C32: the text Apply would write right after load `loadId` was opened — the
   * host keeps the first one for the source query and closes an unchanged Apply
   * without writing. */
  | { type: 'baseline'; loadId: number; text: string }
  | { type: 'cancel' }
  | { type: 'refreshCache' }
  /** Reload the same panel with the other designer UI, opening `text` (the
   * current model's generated query) there. The host keeps the editor binding. */
  | { type: 'switchDesigner'; target: DesignerMode; text: string };

export type DesignerMode = 'classic' | 'canvas';
