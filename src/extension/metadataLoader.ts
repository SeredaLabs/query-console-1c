import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { loadMetadataCached } from '../core/metadata/modelCache';
import { writeLastKnownGood, readLastKnownGood } from '../core/metadata/lastKnownGoodCache';
import { resolveManagedCfDir } from '../core/metadata/parser/generationStore';
import { loadMetadataSnapshotFirst, newestRelevantMtime } from '../core/metadata/parser/loadMetadataSafe';
import type { MetadataModel } from '../core/metadata/types';

/**
 * Вынесено из panel.ts (createPanel): та же логика загрузки метаданных нужна
 * И для панели конструктора, И для hover-провайдера (queryHoverProvider.ts) — оба
 * не должны держать по своей копии этого деликатного fallback-каскада
 * (direct XML→JSON → его собственный YAML-откат → уже закоммиченная YAML-генерация
 * → last-known-good → честная пустая модель).
 */
export function resolveOutPath(context: vscode.ExtensionContext): string {
  const config = vscode.workspace.getConfiguration('queryConsole');
  const outSetting = config.get<string>('parserOutputPath') || 'tmp/parser_data';
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? context.extensionUri.fsPath;
  return path.isAbsolute(outSetting) ? outSetting : path.join(root, outSetting);
}

export async function loadMetadata(
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
  // docs/development/performance.md: 1.6-1.9x на двух независимых реальных
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
