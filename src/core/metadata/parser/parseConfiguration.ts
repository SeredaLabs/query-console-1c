import * as fs from 'fs';
import * as path from 'path';
import { parseXml, firstElementChild, childByLocalName, nodeText, clean } from './dom';
import { writeYaml } from './yamlWriter';
import { parseCatalog } from './catalog';
import { parseDocument } from './document';
import { parseConstant } from './constant';
import { parseEnum } from './enum';
import { parseExchangePlan } from './exchangePlan';
import { parseChartOfCharacteristicTypes } from './chartOfCharacteristicTypes';
import { parseChartOfAccounts } from './chartOfAccounts';
import { parseChartOfCalculationTypes } from './chartOfCalculationTypes';
import { parseBusinessProcess } from './businessProcess';
import { parseTask } from './task';
import { parseInformationRegister } from './informationRegister';
import { parseAccumulationRegister } from './accumulationRegister';
import { parseAccountingRegister } from './accountingRegister';
import { parseCalculationRegister } from './calculationRegister';
import { parseSequence } from './sequence';
import { parseDocumentJournal } from './documentJournal';
import { parseFilterCriteria } from './filterCriteria';
import { parseCommonAttribute } from './commonAttribute';
import type { ParsedObject, ParsedCommonAttribute } from './model';
import {
  cleanupStaleSiblings, stagingDirFor, finalizeStaging, commitGeneration,
  type MetadataBuildIssue,
} from './generationStore';
export type { MetadataBuildIssue } from './generationStore';

interface TypeHandler {
  subdir: string;
  parse: (el: any) => ParsedObject | null;
}

const HANDLERS: TypeHandler[] = [
  { subdir: 'Catalogs',                    parse: parseCatalog },
  { subdir: 'Documents',                   parse: parseDocument },
  { subdir: 'Constants',                   parse: parseConstant },
  { subdir: 'Enums',                       parse: parseEnum },
  { subdir: 'ExchangePlans',               parse: parseExchangePlan },
  { subdir: 'ChartsOfCharacteristicTypes', parse: parseChartOfCharacteristicTypes },
  { subdir: 'ChartsOfAccounts',            parse: parseChartOfAccounts },
  { subdir: 'ChartsOfCalculationTypes',    parse: parseChartOfCalculationTypes },
  { subdir: 'BusinessProcesses',           parse: parseBusinessProcess },
  { subdir: 'Tasks',                       parse: parseTask },
  { subdir: 'InformationRegisters',        parse: parseInformationRegister },
  { subdir: 'AccumulationRegisters',       parse: parseAccumulationRegister },
  { subdir: 'AccountingRegisters',         parse: parseAccountingRegister },
  { subdir: 'CalculationRegisters',        parse: parseCalculationRegister },
  { subdir: 'Sequences',                   parse: parseSequence },
  { subdir: 'DocumentJournals',            parse: parseDocumentJournal },
  { subdir: 'FilterCriteria',              parse: parseFilterCriteria },
];

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
  let skipped = 0;
  const objects: IndexEntry[] = [];
  const issues: MetadataBuildIssue[] = [];

  try {
    for (const h of HANDLERS) {
      const dir = path.join(cfPath, h.subdir);
      if (!fs.existsSync(dir)) continue;
      for (const file of fs.readdirSync(dir)) {
        if (!file.endsWith('.xml')) continue;
        const source = `${h.subdir}/${file}`;
        let obj: ParsedObject | null = null;
        let parseFailure: string | undefined;
        try {
          const xml = fs.readFileSync(path.join(dir, file), 'utf8');
          const doc = parseXml(xml);
          // parseXml/firstElementChild/h.parse деградируют до null на плохом XML,
          // а не бросают (см. test/unit/cfParser.test.ts) — это НЕ то же самое,
          // что "нет ошибки": без явного сообщения ниже такой файл молча пропадал
          // бы из диагностики (§8 требует видимость recoverable-проблем).
          const objectEl = doc ? firstElementChild(doc.documentElement) : null;
          obj = objectEl ? h.parse(objectEl) : null;
          if (!obj) parseFailure = doc ? 'не найден распознаваемый объект в XML' : 'не удалось разобрать XML';
        } catch (e) {
          parseFailure = message(e);
          obj = null;
        }
        if (!obj) {
          issues.push({ file: source, stage: 'parse', message: parseFailure ?? 'неизвестная ошибка разбора', fatal: false });
          skipped++;
          continue;
        }
        obj.source = source;
        try {
          writeYaml(path.join(stagingDir, h.subdir, `${obj.name}.yaml`), obj);
        } catch (e) {
          issues.push({ file: source, stage: 'write', message: message(e), fatal: false });
          skipped++;
          continue;
        }
        counts[obj.kind] = (counts[obj.kind] || 0) + 1;
        objects.push({
          type: obj.kind,
          name: obj.name,
          fullName: obj.fullName,
          file: `${h.subdir}/${obj.name}.yaml`,
        });
      }
    }

    const commonAttributes = parseCommonAttributes(cfPath, issues);

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

function parseCommonAttributes(cfPath: string, issues: MetadataBuildIssue[]): ParsedCommonAttribute[] {
  const dir = path.join(cfPath, 'CommonAttributes');
  if (!fs.existsSync(dir)) return [];
  const result: ParsedCommonAttribute[] = [];
  for (const file of fs.readdirSync(dir).sort()) {
    if (!file.endsWith('.xml')) continue;
    try {
      const xml = fs.readFileSync(path.join(dir, file), 'utf8');
      const doc = parseXml(xml);
      const el = doc ? firstElementChild(doc.documentElement) : null;
      const ca = el ? parseCommonAttribute(el) : null;
      if (ca) result.push(ca);
    } catch (e) {
      issues.push({ file: `CommonAttributes/${file}`, stage: 'parse', message: message(e), fatal: false });
    }
  }
  return result;
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
