import * as vscode from 'vscode';
import * as path from 'path';
import { resolveCfPath } from './resolveCfPath';
import { loadMetadataWithFallback } from '../core/metadata/parser/loadMetadataSafe';
import { writeLastKnownGood } from '../core/metadata/lastKnownGoodCache';

/**
 * «1C: Rebuild metadata index» — теперь использует тот же dual-path
 * (direct JSON-снимок с прозрачным откатом на YAML, `loadMetadataSafe.ts`),
 * что и кнопка «Обновить кэш» внутри конструктора (`panel.ts`'s `refreshCache`
 * handler). Раньше эта команда вызывала ТОЛЬКО `parseConfiguration` (legacy
 * YAML-путь напрямую) — расходилось с тем, что делает "Обновить кэш", и
 * title честно называл её "Parse metadata to YAML" именно потому, что
 * больше она ничего не делала. Теперь оба входа в пересборку метаданных
 * ведут себя одинаково, и title/id могут быть implementation-neutral.
 */
export function registerParseCommand(
  context: vscode.ExtensionContext,
  channel: vscode.OutputChannel
): vscode.Disposable {
  return vscode.commands.registerCommand('1c.parseMetadata', () => {
    const cfPath = resolveCfPath();
    if (!cfPath) {
      vscode.window.showWarningMessage(
        vscode.l10n.t('Configuration export not found. Set its path in queryConsole.metadataPath.')
      );
      return;
    }
    const config = vscode.workspace.getConfiguration('queryConsole');
    const outSetting = config.get<string>('parserOutputPath') || 'tmp/parser_data';
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
    const outPath = path.isAbsolute(outSetting) ? outSetting : path.join(root, outSetting);
    const snapshotOutPath = path.join(outPath, 'snapshot');

    channel.appendLine(vscode.l10n.t('[1C Query] Rebuilding metadata index: {source} → {output}', { source: cfPath, output: outPath }));
    channel.show(true);
    try {
      const t = Date.now();
      const r = loadMetadataWithFallback(cfPath, snapshotOutPath, outPath);
      const fallbackNote = r.fallbackReason
        ? vscode.l10n.t(' (direct path failed: {reason})', { reason: r.fallbackReason })
        : '';
      channel.appendLine(
        vscode.l10n.t('[1C Query] Metadata index rebuilt via {source} in {duration} ms ({count} tables){fallback}', {
          source: r.source, duration: Date.now() - t, count: r.model.tables.length, fallback: fallbackNote,
        })
      );
      if (r.issues.length > 0) {
        channel.appendLine(vscode.l10n.t('[1C Query] Object parsing issues: {count}', { count: r.issues.length }));
        for (const issue of r.issues) channel.appendLine(`[1C Query]   ${issue.stage} ${issue.file ?? ''}: ${issue.message}`);
      }
      if (r.redirected) {
        channel.appendLine(vscode.l10n.t(
          '[1C Query] The existing "cf" directory is not owned by this extension; the new metadata generation was written alongside it at "{path}".',
          { path: outPath }
        ));
      }
      writeLastKnownGood(context.globalStorageUri.fsPath, cfPath, r.model);
      vscode.window.showInformationMessage(
        vscode.l10n.t('Metadata index rebuilt: {count} tables. Output: {path}', { count: r.model.tables.length, path: outPath })
      );
    } catch (e) {
      channel.appendLine(vscode.l10n.t('[1C Query] Rebuilding metadata index failed: {error}', { error: String(e) }));
      vscode.window.showErrorMessage(vscode.l10n.t('Rebuilding the metadata index failed: {error}', { error: String(e) }));
    }
  });
}
