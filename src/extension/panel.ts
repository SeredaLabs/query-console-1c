import * as vscode from 'vscode';
import * as path from 'path';
import { writeLastKnownGood } from '../core/metadata/lastKnownGoodCache';
import { loadMetadataWithFallback } from '../core/metadata/parser/loadMetadataSafe';
import { createMetadataRepository } from '../core/metadata/metadataRepository';
import { resolveOutPath, loadMetadata, isTrustworthyForLastKnownGood } from './metadataLoader';
import { setMetadataResolver } from './metadataResolverCache';
import { buildResolverFromTables } from '../core/metadata/buildModelResolver';
import { generate } from '../core/query/sdblGenerator';
import { insertResult } from './insertResult';
import type { SavedEditorState } from './insertResult';
import type { HostMsg, WebviewMsg } from '../shared/messages';
import type { MetadataModel } from '../core/metadata/types';
import type { QueryModel } from '../core/query/queryModel';
import { normalizeLocale } from '../shared/locale';

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
  <title>${vscode.l10n.t('1C: Query Designer')}</title>
</head>
<body style="margin:0;padding:0;height:100vh;">
  <div id="root" style="height:100%;"></div>
  <script nonce="${n}" src="${webview.asWebviewUri(scriptUri)}"></script>
</body>
</html>`;
}

export function createPanel(
  context: vscode.ExtensionContext,
  cfPath: string,
  channel: vscode.OutputChannel,
  savedEditor?: SavedEditorState,
  initialQueryText?: string
): vscode.WebviewPanel {
  const panel = vscode.window.createWebviewPanel(
    '1c.queryConstructor',
    vscode.l10n.t('1C: Query Designer'),
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'out', 'webview')],
      retainContextWhenHidden: true,
    }
  );

  const scriptUri = vscode.Uri.joinPath(context.extensionUri, 'out', 'webview', 'main.js');
  const codiconCssUri = vscode.Uri.joinPath(context.extensionUri, 'out', 'webview', 'codicon.css');
  const n = nonce();
  panel.webview.html = getHtml(panel.webview, scriptUri, codiconCssUri, n);

  const outPath = resolveOutPath(context);
  let metadataModel: MetadataModel = { version: 1, tables: [] };
  const metadataReady = loadMetadata(cfPath, outPath, context, channel).then(m => { metadataModel = m; });

  panel.webview.onDidReceiveMessage(async (msg: WebviewMsg) => {
    if (msg.type === 'ready') {
      // 7.8.2: сразу сообщаем вебвью, ждать ли загрузку модели запроса, чтобы оно
      // показало индикатор загрузки и не мигало пустым конструктором до заполнения.
      const queryTextEditorV2 = vscode.workspace.getConfiguration('queryConsole').get<boolean>('queryTextEditorV2', false);
      const initMsg: HostMsg = {
        type: 'init',
        hasInitialQuery: !!initialQueryText,
        queryTextEditorV2,
        locale: normalizeLocale(vscode.env.language),
      };
      panel.webview.postMessage(initMsg);
      await metadataReady;
      // PR-07 (ТЗ §11/§55 P1.1): доставка metadataTree в webview идёт через
      // MetadataRepository, а не напрямую по `metadataModel.tables` — repository
      // строится по требованию из ТЕКУЩЕГО массива, поэтому переживает переприсвоение
      // `metadataModel` при refreshCache без отдельной синхронизации. `[...]` —
      // getTables() возвращает readonly-массив (§11), а поле HostMsg.tables — нет.
      const repository = createMetadataRepository(metadataModel.tables);
      const reply: HostMsg = { type: 'metadataTree', tables: [...repository.getTables()] };
      panel.webview.postMessage(reply);
      if (initialQueryText) {
        const loadMsg: HostMsg = { type: 'loadModel', text: initialQueryText };
        panel.webview.postMessage(loadMsg);
      }
      if (repository.getTables().length === 0 && !cfPath) {
        vscode.window.showWarningMessage(
          vscode.l10n.t('Configuration export not found. Set its path in queryConsole.metadataPath.')
        );
      }
    } else if (msg.type === 'expandRef') {
      await metadataReady;
      const ref = msg.ref;
      const repository = createMetadataRepository(metadataModel.tables);
      const table = repository.findTable(ref.kind, ref.name);
      const reply: HostMsg = { type: 'refFields', ref, fields: table?.fields ?? [] };
      panel.webview.postMessage(reply);
    } else if (msg.type === 'generate') {
      const text = generate(msg.model as QueryModel);
      if (!text) {
        vscode.window.showInformationMessage(vscode.l10n.t('Select at least one table and one field.'));
        return;
      }
      const reply: HostMsg = { type: 'generatedText', text };
      panel.webview.postMessage(reply);
    } else if (msg.type === 'insertText') {
      await insertResult(msg.text, savedEditor);
      panel.dispose();
    } else if (msg.type === 'cancel') {
      panel.dispose();
    } else if (msg.type === 'refreshCache') {
      if (!cfPath) {
        const reply: HostMsg = {
          type: 'refreshResult',
          ok: false,
          message: vscode.l10n.t('Configuration export path not found.'),
        };
        panel.webview.postMessage(reply);
        return;
      }
      try {
        // PR-10 widened: «Обновить кэш» — явный запрос пользователя "пересобрать
        // сейчас", поэтому используется `loadMetadataWithFallback` (ВСЕГДА
        // rebuild), а не `loadMetadataSnapshotFirst` (у которого есть тёплая
        // проверка свежести — неверная семантика для явного refresh). Прямой
        // XML→JSON путь пробуется первым, с прозрачным откатом на существующий
        // YAML-путь при сбое (см. loadMetadataSafe.ts) — тот же снимок, что и
        // холодное открытие конструктора использует и переиспользует дальше.
        const snapshotOutPath = path.join(outPath, 'snapshot');
        const t = Date.now();
        const r = loadMetadataWithFallback(cfPath, snapshotOutPath, outPath);
        const fallbackNote = r.fallbackReason
          ? vscode.l10n.t(' (direct path failed: {reason})', { reason: r.fallbackReason })
          : '';
        channel.appendLine(
          vscode.l10n.t('[1C Query] Refresh: metadata rebuilt via {source} in {duration} ms ({count} tables){fallback}', {
            source: r.source, duration: Date.now() - t, count: r.model.tables.length, fallback: fallbackNote,
          })
        );
        if (r.issues.length > 0) {
          channel.appendLine(vscode.l10n.t('[1C Query] Object parsing issues: {count}', { count: r.issues.length }));
          for (const issue of r.issues) channel.appendLine(`[1C Query]   ${issue.stage} ${issue.file ?? ''}: ${issue.message}`);
        }
        metadataModel = r.model;
        // Post-release audit P1 №6: не даём случайному пустому rebuild (например,
        // временно недоступный/опустевший каталог экспорта) затереть последний
        // РЕАЛЬНО рабочий last-known-good — сам результат ЭТОГО refresh
        // по-прежнему честно показывается пользователю ниже (unknown != invalid),
        // затирается только то, что переживает как страховка на будущие сбои.
        if (isTrustworthyForLastKnownGood(r.model)) {
          writeLastKnownGood(context.globalStorageUri.fsPath, cfPath, r.model);
        } else {
          channel.appendLine(vscode.l10n.t(
            '[1C Query] WARNING: rebuilt metadata has 0 tables; not overwriting the last known good snapshot.'
          ));
        }
        setMetadataResolver(cfPath, buildResolverFromTables(r.model.tables));

        // Post-release audit P1 №3: раньше вебвью узнавало про «Обновить кэш»
        // ТОЛЬКО через `refreshResult` (ok/message для тоста) — дерево метаданих,
        // валідація тексту (`buildResolver()` в App.tsx) і DbTree лишалися на
        // СТАРІЙ моделі до перезавантаження вікна. Пересилаємо свіжий
        // `metadataTree` так само, як при `ready` — `SET_METADATA` у webview
        // оновлює лише спільний `metadataCatalogRef`, не чіпаючи вже вибрані
        // таблиці/поля користувача (безпечно навіть посеред редагування).
        const repository = createMetadataRepository(metadataModel.tables);
        const treeReply: HostMsg = { type: 'metadataTree', tables: [...repository.getTables()] };
        panel.webview.postMessage(treeReply);

        const reply: HostMsg = { type: 'refreshResult', ok: true, message: vscode.l10n.t('Metadata cache updated.') };
        panel.webview.postMessage(reply);
      } catch (e) {
        const reply: HostMsg = {
          type: 'refreshResult',
          ok: false,
          message: vscode.l10n.t('Metadata parsing failed: {error}', { error: String(e) }),
        };
        panel.webview.postMessage(reply);
      }
    }
  });

  // 7.8.3: по запросу открываем конструктор в ОТДЕЛЬНОМ окне (а не во вкладке-панели
  // внутри основного окна VS Code). Свежесозданный webview становится активным
  // редактором, поэтому штатная команда «Переместить редактор в новое окно»
  // выносит его в плавающее окно. Фича доступна с VS Code 1.85; на платформах без
  // поддержки команда просто игнорируется (ошибку гасим).
  const cfg = vscode.workspace.getConfiguration('queryConsole');
  if (cfg.get<boolean>('openInNewWindow') !== false) {
    Promise.resolve(
      vscode.commands.executeCommand('workbench.action.moveEditorToNewWindow')
    ).then(undefined, () => { /* команда недоступна — остаёмся во вкладке */ });
  }

  return panel;
}
