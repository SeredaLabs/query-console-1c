import * as vscode from 'vscode';
import { createDesignerPanel, designerKind } from './panel';
import type { SavedEditorState } from './insertResult';

/**
 * New Builder (Canvas) panel: the same host as Classic (`panel.ts`'s
 * `createDesignerPanel` — HTML/CSP, metadata loading, message bridge,
 * `insertResult()` with its stale-document guards, new-window option), only
 * with the Canvas bundle and title. Canvas-specific host behavior, if ever
 * needed, belongs in `DesignerPanelKind`, not in a copy of the bridge.
 *
 * Transitional: the Classic/Canvas toggle (`switchDesigner`) already reaches
 * Canvas inside one designer panel. Removing the separate Canvas command means
 * deleting this wrapper and its registration only; `designerKind('canvas')`
 * stays in panel.ts.
 */
export function createCanvasPanel(
  context: vscode.ExtensionContext,
  cfPath: string,
  channel: vscode.OutputChannel,
  savedEditor?: SavedEditorState,
  initialQueryText?: string
): vscode.WebviewPanel {
  const panel = createDesignerPanel(context, cfPath, channel, designerKind('canvas'), savedEditor, initialQueryText);
  channel.appendLine(vscode.l10n.t('[1C Query] New Builder (Preview) panel opened.'));
  return panel;
}
