/**
 * Диагностика KNOWN_ISSUES.md "Параметры некоторых виртуальных таблиц теряются
 * при parse -> generate": сканирует ВСЕ реально извлекаемые тексты запросов из
 * реальной выгрузки конфигурации (`CONFIG_DIR`, тот же каталог, что и у `extract`)
 * через наш собственный `parseBatch` + `findUnsafeVirtualTables` (тот же код,
 * что блокирует «Применить» в App.tsx) и сообщает о каждом найденном случае
 * `unsafeExtraArgs` — то есть о реальном вызове виртуальной таблицы с 3+
 * позиционными аргументами, которые generate() молча потерял бы.
 *
 * 2026-09-05: прогнан против двух независимых реальных production-конфигураций
 * пользователя (не в репозитории) — 0 срабатываний на ~4347 успешно
 * распарсенных запросах, см. docs/KNOWN_ISSUES.md. Этот файл делает ту разовую
 * проверку переиспользуемой — она НЕ встроена в `corpus:test`/CI (там нет
 * доступа к реальной выгрузке), запускается вручную с `CONFIG_DIR`, указывающим
 * на реальный экспорт конфигурации.
 *
 * Запуск: CONFIG_DIR=/path/to/real/cf npm run corpus:scan-unsafe-vt
 */
import * as fs from 'fs';
import * as path from 'path';
import { getConfig } from './corpusConfig';
import { extractQueryStrings, extractQueriesFromXml } from '../core/query/extractQueryStrings';
import { parseBatch } from '../core/query/sdblParser';
import { findUnsafeVirtualTables } from '../core/query/semanticValidator';

export interface UnsafeVirtualTableHit {
  /** Путь исходного файла относительно просканированного корня. */
  file: string;
  /** Номер строки начала текста запроса внутри исходного файла. */
  lineStart: number;
  /** Полное имя виртуальной таблицы (см. `findUnsafeVirtualTables`). */
  table: string;
}

export interface ScanReport {
  bslFiles: number;
  extracted: number;
  parseFailures: number;
  hits: UnsafeVirtualTableHit[];
}

function walk(dir: string, ext: string): string[] {
  const out: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, ext));
    else if (entry.isFile() && full.endsWith(ext)) out.push(full);
  }
  return out;
}

/**
 * Сканирует `cfRoot` (реальная или синтетическая выгрузка конфигурации, тот же
 * layout, что читает `extract`) на предмет реальных вызовов виртуальных таблиц
 * с потерянными 3+ аргументами. Не бросает на отдельных файлах/запросах,
 * которые не читаются или не парсятся тем же tolerant-парсером, что и
 * конструктор — они просто не в счёт (см. `parseFailures`).
 */
export function scanUnsafeVirtualTables(cfRoot: string): ScanReport {
  const bslFiles = walk(cfRoot, '.bsl').sort();
  const reportsDir = path.join(cfRoot, 'Reports');
  const xmlFiles = fs.existsSync(reportsDir) ? walk(reportsDir, '.xml').sort() : [];

  let extracted = 0;
  let parseFailures = 0;
  const hits: UnsafeVirtualTableHit[] = [];

  const scanExtracted = (file: string, queries: { text: string; lineStart: number }[]): void => {
    const rel = path.relative(cfRoot, file);
    for (const q of queries) {
      extracted++;
      try {
        const doc = parseBatch(q.text);
        for (const table of findUnsafeVirtualTables(doc)) {
          hits.push({ file: rel, lineStart: q.lineStart, table });
        }
      } catch {
        parseFailures++;
      }
    }
  };

  for (const file of bslFiles) {
    let source: string;
    try {
      source = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    scanExtracted(file, extractQueryStrings(source));
  }
  for (const file of xmlFiles) {
    let source: string;
    try {
      source = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    scanExtracted(file, extractQueriesFromXml(source));
  }

  return { bslFiles: bslFiles.length, extracted, parseFailures, hits };
}

// ---- CLI ----

export function run(): void {
  const cfg = getConfig();
  const cfRoot = cfg.configDir;

  if (!fs.existsSync(cfRoot)) {
    console.error(`Каталог не найден: ${cfRoot} (укажите CONFIG_DIR=/path/to/real/cf)`);
    process.exit(1);
  }

  const report = scanUnsafeVirtualTables(cfRoot);
  console.log(`Каталог: ${cfRoot}`);
  console.log(`.bsl файлов: ${report.bslFiles}`);
  console.log(`Извлечено запросов: ${report.extracted}`);
  console.log(`Не распарсились (не в счёт): ${report.parseFailures}`);
  console.log(`unsafeExtraArgs hits: ${report.hits.length}`);
  for (const h of report.hits) {
    console.log(`  ${h.file}:${h.lineStart}  ->  ${h.table}`);
  }

  if (report.hits.length > 0) {
    console.error(
      '\nНайдены реальные вызовы виртуальных таблиц с потерянными 3+ аргументами — см. docs/KNOWN_ISSUES.md.'
    );
    process.exit(1);
  }
}

if (require.main === module) {
  run();
}
