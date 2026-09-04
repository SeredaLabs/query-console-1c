import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { parseCf } from '../core/metadata/cfParser';
import { buildCachePath, writeCache } from '../core/metadata/cacheBuilder';
import { isCacheValid, readCache } from '../core/metadata/cacheLoader';
import { loadMetadataCached, rebuildModelCache } from '../core/metadata/modelCache';
import { parseConfiguration } from '../core/metadata/parser/parseConfiguration';
import { resolveManagedCfDir } from '../core/metadata/parser/generationStore';
import { loadMetadataSnapshotFirst } from '../core/metadata/parser/loadMetadataSafe';
import { createMetadataRepository } from '../core/metadata/metadataRepository';
import { generate } from '../core/query/sdblGenerator';
import { insertResult } from './insertResult';
import type { SavedEditorState } from './insertResult';
import type { HostMsg, WebviewMsg } from '../shared/messages';
import type { MetadataModel } from '../core/metadata/types';
import type { QueryModel } from '../core/query/queryModel';

function nonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function getHtml(webview: vscode.Webview, scriptUri: vscode.Uri, codiconCssUri: vscode.Uri, n: string): string {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${n}'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource};">
  <link rel="stylesheet" href="${webview.asWebviewUri(codiconCssUri)}">
  <title>1С: Конструктор запроса</title>
</head>
<body style="margin:0;padding:0;height:100vh;">
  <div id="root" style="height:100%;"></div>
  <script nonce="${n}" src="${webview.asWebviewUri(scriptUri)}"></script>
</body>
</html>`;
}

function resolveOutPath(context: vscode.ExtensionContext): string {
  const config = vscode.workspace.getConfiguration('queryConsole');
  const outSetting = config.get<string>('parserOutputPath') || 'tmp/parser_data';
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? context.extensionUri.fsPath;
  return path.isAbsolute(outSetting) ? outSetting : path.join(root, outSetting);
}

async function loadMetadata(
  cfPath: string,
  outPath: string,
  context: vscode.ExtensionContext,
  channel: vscode.OutputChannel
): Promise<MetadataModel> {
  const cfYamlDir = resolveManagedCfDir(outPath);
  const configYaml = path.join(cfYamlDir, 'configuration.yaml');

  // PR-10 (ТЗ §55 P1.4, Production Metadata Switch): пока НЕТ управляемой YAML-
  // генерации — пробуем прямой XML→JSON снимок первым (быстрее на холодной
  // сборке, см. docs/PERFORMANCE_BASELINE.md: 1.6-1.9x на двух независимых
  // реальных конфигурациях), с тёплым переиспользованием уже закоммиченного
  // снимка на повторных открытиях (source: 'direct-snapshot-cached') — так что
  // после первого успеха этот путь остаётся быстрым, а не только один раз.
  // При ЛЮБОМ сбое direct-пути (в т.ч. на конфигурации, которую мы не видели
  // при валидации PR-08/09) — прозрачный откат на существующий, годами
  // проверенный YAML-путь (см. loadMetadataSafe.ts) — поведение НЕ хуже, чем
  // было до этого PR. Область применения намеренно узкая (ТЗ §47): УЖЕ
  // существующая YAML-генерация (обычный случай для возвращающегося
  // пользователя) продолжает идти НИЖЕ, через `loadMetadataCached`, вообще не
  // тронутый этим PR; «Обновить кэш» (refreshCache-обработчик) тоже не
  // переключён — остаётся отдельным, ещё не сделанным шагом.
  if (!fs.existsSync(configYaml) && cfPath) {
    const snapshotOutPath = path.join(outPath, 'snapshot');
    const t = Date.now();
    const r = loadMetadataSnapshotFirst(cfPath, snapshotOutPath, outPath);
    const fallbackNote = r.fallbackReason ? ` (direct-путь не удался: ${r.fallbackReason})` : '';
    channel.appendLine(
      `[1C Query] metadata built via ${r.source} in ${Date.now() - t}ms (${r.model.tables.length} tables)${fallbackNote}`
    );
    return r.model;
  }

  if (fs.existsSync(configYaml)) {
    channel.appendLine(`[1C Query] Loading metadata from YAML: ${cfYamlDir}`);
    const t = Date.now();
    const model = loadMetadataCached(cfYamlDir);
    channel.appendLine(`[1C Query] metadata loaded in ${Date.now() - t}ms (${model.tables.length} tables)`);
    return model;
  }

  // Fallback: XML parsing + cache
  if (!cfPath) return { version: 1, tables: [] };
  const cachePath = buildCachePath(context.globalStorageUri.fsPath, cfPath);
  if (isCacheValid(cachePath, cfPath)) {
    const cached = readCache(cachePath);
    if (cached && cached.tables.length > 0) {
      channel.appendLine(`[1C Query] From cache: ${cached.tables.length} tables`);
      return cached;
    }
  }
  channel.appendLine(`[1C Query] Parsing metadata from XML: ${cfPath}`);
  for (const sub of ['Catalogs', 'Documents']) {
    const dir = path.join(cfPath, sub);
    if (fs.existsSync(dir)) {
      const files = (fs.readdirSync(dir) as string[]).filter(f => f.endsWith('.xml'));
      channel.appendLine(`[1C Query] ${sub}/: ${files.length} XML files`);
      if (files.length > 0) {
        const firstPath = path.join(dir, files[0]);
        const firstXml: string = fs.readFileSync(firstPath, 'utf8');
        channel.appendLine(`[1C Query] First file: ${files[0]}`);
        channel.appendLine(`[1C Query] First 300 chars: ${firstXml.slice(0, 300).replace(/\n/g, '↵')}`);
      }
    } else {
      channel.appendLine(`[1C Query] ${sub}/: directory not found`);
    }
  }
  const model = parseCf(cfPath);
  channel.appendLine(`[1C Query] Parsed ${model.tables.length} tables`);
  writeCache(cachePath, model);
  return model;
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
    '1С: Конструктор запроса',
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
      const initMsg: HostMsg = { type: 'init', hasInitialQuery: !!initialQueryText, queryTextEditorV2 };
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
        vscode.window.showWarningMessage('Не найдена выгрузка конфигурации. Укажите путь в настройке queryConsole.metadataPath');
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
        vscode.window.showInformationMessage('Выберите хотя бы одну таблицу и одно поле');
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
        const reply: HostMsg = { type: 'refreshResult', ok: false, message: 'Не найден путь к выгрузке конфигурации' };
        panel.webview.postMessage(reply);
        return;
      }
      try {
        const parsed = parseConfiguration(cfPath, outPath);
        // 7.8.1: повторный парсинг переписывает YAML (новый mtime) и инвалидирует
        // model-cache.json. Сразу перестраиваем консолидированный JSON-кэш, чтобы
        // следующее открытие конструктора было «тёплым» (быстрым), а не платило
        // полный холодный разбор YAML (~13 с). Каталог — РЕАЛЬНЫЙ committed (мог
        // быть перенаправлен в cf-managed, ТЗ §7), не пересчитанный заново.
        const cfYamlDir = parsed.outCfDir;
        const t = Date.now();
        const rebuilt = rebuildModelCache(cfYamlDir);
        channel.appendLine(`[1C Query] model-cache rebuilt in ${Date.now() - t}ms (${rebuilt.tables.length} tables)`);
        metadataModel = rebuilt;
        const reply: HostMsg = { type: 'refreshResult', ok: true, message: 'Кэш обновлён.' };
        panel.webview.postMessage(reply);
      } catch (e) {
        const reply: HostMsg = { type: 'refreshResult', ok: false, message: `Ошибка парсинга: ${e}` };
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
