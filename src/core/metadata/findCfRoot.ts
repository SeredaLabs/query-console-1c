import * as fs from 'fs';
import * as path from 'path';

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.github',
  '.vscode',
  '.devcontainer',
  'out',
  'dist',
  'build',
  'tmp',
  'coverage',
  'test-results',
  'playwright-report',
]);

/**
 * Ищет каталог с выгрузкой конфигурации 1С (маркер — файл Configuration.xml
 * в его корне) в поддереве searchRoot, обходя его в ширину и пропуская
 * служебные каталоги. Возвращает путь к каталогу с Configuration.xml или
 * null, если ничего не нашлось в пределах maxDepth.
 */
export function findConfigurationXmlDir(
  searchRoot: string,
  maxDepth = 6,
  fsImpl: Pick<typeof fs, 'existsSync' | 'readdirSync'> = fs
): string | null {
  if (!fsImpl.existsSync(searchRoot)) return null;

  let queue: Array<{ dir: string; depth: number }> = [{ dir: searchRoot, depth: 0 }];

  while (queue.length > 0) {
    const next: Array<{ dir: string; depth: number }> = [];
    for (const { dir, depth } of queue) {
      if (fsImpl.existsSync(path.join(dir, 'Configuration.xml'))) return dir;
      if (depth >= maxDepth) continue;

      let entries: fs.Dirent[];
      try {
        entries = fsImpl.readdirSync(dir, { withFileTypes: true }) as fs.Dirent[];
      } catch {
        continue;
      }

      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        if (!entry.isDirectory()) continue;
        if (IGNORED_DIRS.has(entry.name)) continue;
        next.push({ dir: path.join(dir, entry.name), depth: depth + 1 });
      }
    }
    queue = next;
  }

  return null;
}
