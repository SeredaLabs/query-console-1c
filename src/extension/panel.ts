import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { loadMetadataCached } from '../core/metadata/modelCache';
import { writeLastKnownGood, readLastKnownGood } from '../core/metadata/lastKnownGoodCache';
import { resolveManagedCfDir } from '../core/metadata/parser/generationStore';
import { loadMetadataSnapshotFirst, loadMetadataWithFallback, newestRelevantMtime } from '../core/metadata/parser/loadMetadataSafe';
import { createMetadataRepository } from '../core/metadata/metadataRepository';
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
  // PR-10 widened (ТЗ §55 P1.4, Production Metadata Switch): пробуем прямой
  // XML→JSON снимок первым для ЛЮБОГО заданного cfPath — не только когда ещё
  // нет YAML-генерации (изначальный узкий PR-10), но и когда она УЖЕ есть
  // (обычный случай для возвращающегося пользователя). `loadMetadataSnapshotFirst`
  // сам решает: тёплое чтение уже закоммиченного снимка (самый частый случай
  // после первого перехода — быстрее на холодной сборке, см.
  // docs/PERFORMANCE_BASELINE.md: 1.6-1.9x на двух независимых реальных
  // конфигурациях) или rebuild с прозрачным откатом на существующий, годами
  // проверенный YAML-путь при сбое direct-пути (см. loadMetadataSafe.ts).
  //
  // Если бы ДАЖЕ откат (сам YAML-путь) бросил исключение — раньше (до этого
  // изменения) это стало бы необработанным отказом промиса `metadataReady`
  // (см. createPanel), а не грациозным переходом дальше, как делал оригинальный
  // код до PR-10. Перехватываем здесь и даём шанс уже прочитанному тёплому
  // YAML-кэшу (если он есть) или легаси XML-парсеру ниже — то же поведение,
  // что было всегда, на случай, когда откажут ОБА пути метаданных сразу.
  // Last-known-good (см. lastKnownGoodCache.ts): context.globalStorageUri
  // гарантированно доступен на запись независимо от состояния workspace-
  // каталога outPath — заменяет прежний legacy-фолбэк parseCf (только
  // Catalogs/Documents, только CatalogRef/DocumentRef, см. git history)
  // настоящей последней успешной ПОЛНОЙ моделью.
  const lkgDir = context.globalStorageUri.fsPath;

  if (cfPath) {
    const snapshotOutPath = path.join(outPath, 'snapshot');
    const t = Date.now();
    try {
      const r = loadMetadataSnapshotFirst(cfPath, snapshotOutPath, outPath);
      const fallbackNote = r.fallbackReason
        ? vscode.l10n.t(' (direct path failed: {reason})', { reason: r.fallbackReason })
        : '';
      channel.appendLine(
        vscode.l10n.t('[1C Query] Metadata built via {source} in {duration} ms ({count} tables){fallback}', {
          source: r.source, duration: Date.now() - t, count: r.model.tables.length, fallback: fallbackNote,
        })
      );
      writeLastKnownGood(lkgDir, cfPath, r.model);
      return r.model;
    } catch (e) {
      channel.appendLine(vscode.l10n.t(
        '[1C Query] Direct path and YAML fallback failed: {error}; trying committed YAML or last known good metadata.',
        { error: String(e) }
      ));
    }
  }

  const cfYamlDir = resolveManagedCfDir(outPath);
  const configYaml = path.join(cfYamlDir, 'configuration.yaml');
  if (fs.existsSync(configYaml)) {
    channel.appendLine(vscode.l10n.t('[1C Query] Loading metadata from YAML: {path}', { path: cfYamlDir }));
    const t = Date.now();
    const model = loadMetadataCached(cfYamlDir);
    channel.appendLine(vscode.l10n.t('[1C Query] Metadata loaded in {duration} ms ({count} tables)', {
      duration: Date.now() - t, count: model.tables.length,
    }));
    // Residual gap (KNOWN_ISSUES.md "Cache метаданных может быть устаревшим"):
    // эта ветка выполняется только когда direct-путь И его собственный
    // YAML-откат уже оба упали (см. catch выше) — свежая пересборка сейчас
    // недоступна, повторять тот же неудавшийся rebuild бессмысленно. Но мы
    // всё ещё можем ОБНАРУЖИТЬ устаревание относительно XML (та же основа,
    // что и у основного пути — `newestRelevantMtime`) и явно сообщить об
    // этом, вместо тихой выдачи возможно устаревших метаданных как будто они
    // актуальны.
    if (cfPath && fs.statSync(configYaml).mtimeMs < newestRelevantMtime(cfPath)) {
      channel.appendLine(vscode.l10n.t(
        '[1C Query] WARNING: YAML at {yamlPath} is older than XML at {xmlPath}; rebuilding failed, so displayed metadata may be stale.',
        { yamlPath: cfYamlDir, xmlPath: cfPath }
      ));
    }
    writeLastKnownGood(lkgDir, cfPath, model);
    return model;
  }

  // Последний рубеж: и direct-путь, и его YAML-откат уже оба упали (см. catch
  // выше), либо ещё ни разу не строилась YAML-генерация в этой рабочей
  // области. Раньше здесь работал legacy `parseCf` — узкий парсер (только
  // Catalogs/Documents, только CatalogRef/DocumentRef, никаких регистров и
  // прочих видов метаданных) со своим кэшем в том же globalStorageUri (см.
  // git history). Last-known-good — та же гарантированно доступная на запись
  // директория, но хранит НАСТОЯЩУЮ последнюю успешную ПОЛНУЮ модель, а не
  // урезанную заново построенную. Если last-known-good тоже нет (самое первое
  // открытие сразу упало) — честная пустая модель предпочтительнее тихой
  // деградации до Catalogs+Documents.
  if (cfPath) {
    const lkg = readLastKnownGood(lkgDir, cfPath);
    if (lkg) {
      channel.appendLine(vscode.l10n.t(
        '[1C Query] WARNING: metadata could not be rebuilt; using last known good snapshot from {date} ({count} tables).',
        { date: new Date(lkg.builtAtMs).toISOString(), count: lkg.model.tables.length }
      ));
      return lkg.model;
    }
    channel.appendLine(vscode.l10n.t('[1C Query] Metadata could not be built and no last known good snapshot exists.'));
  }
  return { version: 1, tables: [] };
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
        metadataModel = r.model;
        writeLastKnownGood(context.globalStorageUri.fsPath, cfPath, r.model);
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
