import * as fs from 'fs';
import * as path from 'path';
import { parseXml, firstElementChild, childByLocalName, nodeText, clean } from './dom';
import { writeYaml } from './yamlWriter';
import type { ParsedCommonAttribute } from './model';
import {
  cleanupStaleSiblings, stagingDirFor, finalizeStaging, commitGeneration,
  type MetadataBuildIssue,
} from './generationStore';
import { scanConfigurationObjects, scanCommonAttributes } from './xmlScan';
export type { MetadataBuildIssue } from './generationStore';

export interface ParseSummary {
  counts: Record<string, number>;
  skipped: number;
  outCfDir: string;
  /** Recoverable per-object проблемы (не остановили генерацию) — ТЗ §8. */
  issues: MetadataBuildIssue[];
  /** true, если существующий `cf` не был распознан как наш и генерация
   * закоммичена рядом, в `cf-managed` (ТЗ §7 — старый unowned вывод не тронут). */
  redirected: boolean;
}

interface IndexEntry {
  type: string;
  name: string;
  fullName: string;
  file: string;
}

/**
 * Строит новую генерацию метаданных и коммитит её (ТЗ §6-9, PR-02).
 *
 * Генерация N (текущий `cf`/`cf-managed`) остаётся полностью нетронутой и
 * обслуживаемой на всём протяжении сборки — весь вывод пишется в staging-каталог,
 * который никто ещё не читает. Переключение на N+1 — одна операция commit
 * (см. `generationStore.ts`), выполняемая только после того, как staging-каталог
 * полностью готов (индекс записан, маркер владения проставлен). Если сборка падает
 * на любом этапе ДО commit — исключение прокидывается вызывающему коду, staging
 * удаляется, N остаётся current (last-known-good, §9).
 *
 * Per-object ошибки чтения/разбора/записи — recoverable, попадают в `issues` и не
 * останавливают генерацию (как и раньше — `skipped` считает то же самое). Ошибка
 * записи индекса/маркера — generation-integrity failure, валит всю сборку.
 */
export function parseConfiguration(cfPath: string, outPath: string): ParseSummary {
  if (!fs.existsSync(cfPath)) {
    throw new Error(`Каталог выгрузки конфигурации не найден: ${cfPath}`);
  }

  cleanupStaleSiblings(outPath);
  const stagingDir = stagingDirFor(outPath);
  fs.mkdirSync(stagingDir, { recursive: true });

  const counts: Record<string, number> = {};
  const objects: IndexEntry[] = [];

  // Обход XML → ParsedObject[] переиспользован как есть из xmlScan.ts (PR-08
  // completion) — тот же самый код, что производит ParsedObject для прямого
  // JSON-снимка (snapshotBuilder.ts), без изменения поведения этого пути:
  // `issues`/`skipped` для parse-стадии остаются побайтово теми же.
  const { objects: parsedObjects, issues } = scanConfigurationObjects(cfPath);
  let skipped = issues.length;

  try {
    for (const obj of parsedObjects) {
      // obj.source всегда задан scanConfigurationObjects как `${subdir}/${file}`
      // (тот же subdir, что раньше использовался напрямую для пути записи).
      const subdir = path.dirname(obj.source!);
      try {
        writeYaml(path.join(stagingDir, subdir, `${obj.name}.yaml`), obj);
      } catch (e) {
        issues.push({ file: obj.source, stage: 'write', message: message(e), fatal: false });
        skipped++;
        continue;
      }
      counts[obj.kind] = (counts[obj.kind] || 0) + 1;
      objects.push({
        type: obj.kind,
        name: obj.name,
        fullName: obj.fullName,
        file: `${subdir}/${obj.name}.yaml`,
      });
    }

    const commonAttributes = scanCommonAttributes(cfPath, issues);

    try {
      writeConfigurationIndex(cfPath, stagingDir, objects, commonAttributes);
    } catch (e) {
      throw new Error(`Не удалось записать индекс генерации: ${message(e)}`);
    }
    finalizeStaging(stagingDir);
  } catch (e) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    throw e instanceof Error ? e : new Error(message(e));
  }

  const { targetDir, redirected } = commitGeneration(stagingDir, outPath);
  return { counts, skipped, outCfDir: targetDir, issues, redirected };
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function writeConfigurationIndex(
  cfPath: string,
  outCfDir: string,
  objects: IndexEntry[],
  commonAttributes: ParsedCommonAttribute[],
): void {
  let name = '';
  let synonym: string | undefined;
  const confXml = path.join(cfPath, 'Configuration.xml');
  if (fs.existsSync(confXml)) {
    const doc = parseXml(fs.readFileSync(confXml, 'utf8'));
    const el = doc ? firstElementChild(doc.documentElement) : null;
    const props = el ? childByLocalName(el, 'Properties') : null;
    if (props) {
      name = nodeText(childByLocalName(props, 'Name'));
      const syn = childByLocalName(props, 'Synonym');
      const item = syn ? childByLocalName(syn, 'item') : null;
      synonym = item ? nodeText(childByLocalName(item, 'content')) || undefined : undefined;
    }
  }
  writeYaml(
    path.join(outCfDir, 'configuration.yaml'),
    clean({ version: 1, name, synonym, objects, commonAttributes: commonAttributes.length ? commonAttributes : undefined }),
  );
}
