import * as vscode from 'vscode';
import { createMetadataRepository } from '../core/metadata/metadataRepository';
import type { MetadataModel } from '../core/metadata/types';
import type { HostMsg, WebviewMsg } from '../shared/messages';
import { normalizeLocale } from '../shared/locale';
import { loadMetadata, resolveOutPath } from './metadataLoader';

/**
 * New Builder (Canvas) panel. Phase 1 — shell only (без metadata). Phase 2
 * додає завантаження метаданих для Sidebar — ТІЄЮ Ж, спільною host-side
 * інфраструктурою, що й Classic panel.ts (`loadMetadata`/`resolveOutPath`/
 * `createMetadataRepository` — не Classic UI, а вже спільний шар для обох
 * панелей). Протокол — ті самі HostMsg/WebviewMsg: 'init'/'ready'/'cancel'
 * (Phase 1) + 'metadataTree' (Phase 2), усі вже існували в messages.ts.
 * 'expandRef'/'generate'/'insertText'/'refreshCache' Canvas поки не надсилає —
 * Structure/Fields ще не реалізовані.
 */

function nonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function getHtml(webview: vscode.Webview, scriptUri: vscode.Uri, codiconCssUri: vscode.Uri, n: string): string {
  return `<!DOCTYPE html>
<html lang="${normalizeLocale(vscode.env.language)}">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${n}'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource};">
  <link rel="stylesheet" href="${webview.asWebviewUri(codiconCssUri)}">
  <title>${vscode.l10n.t('1C: Query Builder (Preview)')}</title>
</head>
<body style="margin:0;padding:0;height:100vh;">
  <div id="root" style="height:100%;"></div>
  <script nonce="${n}" src="${webview.asWebviewUri(scriptUri)}"></script>
</body>
</html>`;
}

export function createCanvasPanel(
  context: vscode.ExtensionContext,
  cfPath: string,
  channel: vscode.OutputChannel
): vscode.WebviewPanel {
  const panel = vscode.window.createWebviewPanel(
    '1c.queryConstructorCanvas',
    vscode.l10n.t('1C: Query Builder (Preview)'),
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'out', 'webview')],
      retainContextWhenHidden: true,
    }
  );

  const scriptUri = vscode.Uri.joinPath(context.extensionUri, 'out', 'webview', 'canvasApp.js');
  const codiconCssUri = vscode.Uri.joinPath(context.extensionUri, 'out', 'webview', 'codicon.css');
  const n = nonce();
  panel.webview.html = getHtml(panel.webview, scriptUri, codiconCssUri, n);

  const outPath = resolveOutPath(context);
  let metadataModel: MetadataModel = { version: 1, tables: [] };
  const metadataReady = loadMetadata(cfPath, outPath, context, channel).then(m => { metadataModel = m; });

  panel.webview.onDidReceiveMessage(async (msg: WebviewMsg) => {
    if (msg.type === 'ready') {
      const initMsg: HostMsg = {
        type: 'init',
        hasInitialQuery: false,
        queryTextEditorV2: false,
        locale: normalizeLocale(vscode.env.language),
      };
      panel.webview.postMessage(initMsg);
      await metadataReady;
      const repository = createMetadataRepository(metadataModel.tables);
      const reply: HostMsg = { type: 'metadataTree', tables: [...repository.getTables()] };
      panel.webview.postMessage(reply);
      if (repository.getTables().length === 0 && !cfPath) {
        vscode.window.showWarningMessage(
          vscode.l10n.t('Configuration export not found. Set its path in queryConsole.metadataPath.')
        );
      }
    } else if (msg.type === 'cancel') {
      panel.dispose();
    }
    // Інші WebviewMsg-варіанти (expandRef/generate/insertText/refreshCache)
    // Phase 2 не надсилає — Structure/Fields ще не реалізовані, а Sidebar
    // показує лише верхньорівневі об'єкти метаданих (без drill-down у поля).
  });

  channel.appendLine(vscode.l10n.t('[1C Query] New Builder (Preview) panel opened.'));

  // Той самий механізм, що й Classic (panel.ts) — і те саме, вже існуюче
  // налаштування `queryConsole.openInNewWindow` (спільне для обох панелей,
  // не нове). За замовчуванням (undefined) і при true — виносимо в окреме
  // вікно; лише явне false лишає у вкладці поточного вікна.
  const cfg = vscode.workspace.getConfiguration('queryConsole');
  if (cfg.get<boolean>('openInNewWindow') !== false) {
    Promise.resolve(
      vscode.commands.executeCommand('workbench.action.moveEditorToNewWindow')
    ).then(undefined, () => { /* команда недоступна — лишаємось у вкладці */ });
  }

  return panel;
}
