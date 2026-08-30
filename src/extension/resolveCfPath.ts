import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { findConfigurationXmlDir } from '../core/metadata/findCfRoot';

export function resolveCfPath(): string {
  const config = vscode.workspace.getConfiguration('queryConsole');
  const custom = config.get<string>('metadataPath');
  if (custom && fs.existsSync(custom)) return custom;

  const folders = vscode.workspace.workspaceFolders ?? [];

  for (const folder of folders) {
    const candidate = path.join(folder.uri.fsPath, 'src', 'cf');
    if (fs.existsSync(candidate)) return candidate;
  }

  for (const folder of folders) {
    const found = findConfigurationXmlDir(folder.uri.fsPath);
    if (found) return found;
  }

  return '';
}
