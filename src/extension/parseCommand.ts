import * as vscode from 'vscode';
import * as path from 'path';
import { resolveCfPath } from './resolveCfPath';
import { parseConfiguration } from '../core/metadata/parser/parseConfiguration';

export function registerParseCommand(channel: vscode.OutputChannel): vscode.Disposable {
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

    channel.appendLine(vscode.l10n.t('[1C Query] Parsing metadata: {source} → {output}', { source: cfPath, output: outPath }));
    channel.show(true);
    try {
      const s = parseConfiguration(cfPath, outPath);
      const c = s.counts;
      const total = Object.values(c).reduce((a, b) => a + b, 0);
      channel.appendLine(vscode.l10n.t(
        '[1C Query] Catalogs: {catalogs} Documents: {documents} Constants: {constants} Enums: {enums}; skipped: {skipped}',
        { catalogs: c['Справочник'] || 0, documents: c['Документ'] || 0, constants: c['Константа'] || 0,
          enums: c['Перечисление'] || 0, skipped: s.skipped }
      ));
      if (s.issues.length > 0) {
        channel.appendLine(vscode.l10n.t('[1C Query] Object parsing issues: {count}', { count: s.issues.length }));
        for (const issue of s.issues) channel.appendLine(`[1C Query]   ${issue.stage} ${issue.file ?? ''}: ${issue.message}`);
      }
      if (s.redirected) {
        channel.appendLine(vscode.l10n.t(
          '[1C Query] The existing "cf" directory is not owned by this extension; the new metadata generation was written alongside it at "{path}".',
          { path: s.outCfDir }
        ));
      }
      vscode.window.showInformationMessage(
        vscode.l10n.t('Parsed objects: {count}. Output: {path}', { count: total, path: s.outCfDir })
      );
    } catch (e) {
      channel.appendLine(vscode.l10n.t('[1C Query] Parsing failed: {error}', { error: String(e) }));
      vscode.window.showErrorMessage(vscode.l10n.t('Metadata parsing failed: {error}', { error: String(e) }));
    }
  });
}
