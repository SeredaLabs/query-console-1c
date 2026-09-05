import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { getConfig } from './corpusConfig';
import { extractQueryStrings, extractQueriesFromXml } from '../core/query/extractQueryStrings';
import type { ExtractedQuery } from '../core/query/extractQueryStrings';

// Реэкспорт — чтобы существующие импортёры (test/unit/extractQueries.test.ts,
// scanUnsafeVirtualTables.ts) не зависели от того, что сама логика извлечения
// переехала в src/core/query/extractQueryStrings.ts (см. её файловый комментарий:
// причина переезда — CLI-guard этого файла "схлопывается" при совместном
// esbuild-бандлинге с другим CLI-скриптом).
export { unescapeXmlEntities, extractQueryStrings, extractQueriesFromXml } from '../core/query/extractQueryStrings';
export type { ExtractedQuery } from '../core/query/extractQueryStrings';

/**
 * Имя файла корпуса для запроса `idx` из источника `rel`. Обычно
 * `${rel}_${idx+1}.txt`, но длинные пути (глубокая вложенность форм) могут дать имя
 * длиннее лимита файловой системы (255 байт). В этом случае префикс пути
 * усекается по границе символов до бюджета, а уникальность сохраняет короткий
 * sha1-хэш полного `rel`: `${усечённый}-${hash8}_${idx+1}.txt`.
 */
export function corpusFileName(rel: string, idx: number): string {
  const MAX_NAME_BYTES = 255;
  const suffix = `_${idx + 1}.txt`;
  const base = `${rel}${suffix}`;
  if (Buffer.byteLength(base, 'utf8') <= MAX_NAME_BYTES) return base;
  const hash = crypto.createHash('sha1').update(rel).digest('hex').slice(0, 8);
  const tail = `-${hash}${suffix}`;
  const budget = MAX_NAME_BYTES - Buffer.byteLength(tail, 'utf8');
  let truncated = '';
  let used = 0;
  for (const chunk of rel) {
    const b = Buffer.byteLength(chunk, 'utf8');
    if (used + b > budget) break;
    truncated += chunk;
    used += b;
  }
  return `${truncated}${tail}`;
}

// ---- CLI ----

function readSource(file: string): string | null {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function walk(dir: string, ext: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full, ext));
    } else if (entry.isFile() && full.endsWith(ext)) {
      out.push(full);
    }
  }
  return out;
}

export function run(): void {
  const cfg = getConfig();
  const cfRoot = cfg.configDir;
  const outDir = cfg.queryCorpusDir;

  if (!fs.existsSync(cfRoot)) {
    console.error(`Каталог не найден: ${cfRoot}`);
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });

  const seen = new Set<string>();
  let found = 0;
  let uniqueWritten = 0;

  const writeQuery = (q: ExtractedQuery, rel: string, idx: number): void => {
    found++;
    if (seen.has(q.text)) return;
    seen.add(q.text);
    uniqueWritten++;
    const outFile = path.join(outDir, corpusFileName(rel, idx));
    fs.writeFileSync(outFile, q.text, 'utf8');
  };

  // .bsl: код модулей по всему CONFIG_DIR.
  const bslFiles = walk(cfRoot, '.bsl').sort();
  for (const file of bslFiles) {
    const source = readSource(file);
    if (source === null) continue;
    const rel = path.relative(cfRoot, file).split(path.sep).join('-');
    extractQueryStrings(source).forEach((q, idx) => writeQuery(q, rel, idx));
  }

  // .xml: макеты СКД — только поддерево Reports/ (см. spec 2026-06-13).
  const reportsDir = path.join(cfRoot, 'Reports');
  if (fs.existsSync(reportsDir)) {
    const xmlFiles = walk(reportsDir, '.xml').sort();
    for (const file of xmlFiles) {
      const source = readSource(file);
      if (source === null) continue;
      const rel = path.relative(cfRoot, file).split(path.sep).join('-');
      extractQueriesFromXml(source).forEach((q, idx) => writeQuery(q, rel, idx));
    }
  }

  console.log(`found=${found} uniqueWritten=${uniqueWritten}`);
}

if (require.main === module) {
  run();
}
