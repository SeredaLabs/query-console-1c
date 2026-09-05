/**
 * Общий XML→ParsedObject[] обход, разделяемый между двумя consumer'ами (PR-08
 * completion, ТЗ §55 P1.2 "reuse current XML handlers; build direct committed
 * snapshot"):
 *  - `parseConfiguration.ts` — построение YAML-генерации (пишет каждый объект
 *    на диск сразу после разбора);
 *  - `snapshotBuilder.ts` — прямой JSON-снимок БЕЗ YAML-прослойки (собирает
 *    объекты в памяти, не пишет per-object файлы вообще).
 *
 * Извлечено из `parseConfiguration.ts` БЕЗ изменения поведения (чистое
 * выделение) — именно эта функция производила `ParsedObject`, прежде чем
 * `parseConfiguration.ts` писал его в YAML; здесь запись убрана, разбор и
 * учёт `issues` (`stage: 'parse'`) остались побайтово теми же.
 */
import * as fs from 'fs';
import * as path from 'path';
import { parseXml, firstElementChild } from './dom';
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
import type { MetadataBuildIssue } from './generationStore';

export interface TypeHandler {
  subdir: string;
  parse: (el: any) => ParsedObject | null;
}

export const HANDLERS: TypeHandler[] = [
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

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Разбирает КАЖДЫЙ XML-объект под `cfPath` (все виды из `HANDLERS`) в память —
 * без записи per-object файлов. Recoverable-ошибки чтения/разбора одного файла
 * попадают в `issues` (`stage: 'parse'`, `fatal: false`) и не останавливают
 * обход остальных — тот же контракт, что и раньше был у `parseConfiguration.ts`
 * (см. `test/unit/parseConfiguration.test.ts`: "per-object failure не валит всю
 * генерацию").
 */
export function scanConfigurationObjects(cfPath: string): { objects: ParsedObject[]; issues: MetadataBuildIssue[] } {
  const objects: ParsedObject[] = [];
  const issues: MetadataBuildIssue[] = [];

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
        // а не бросают — без явного сообщения ниже такой файл молча пропадал
        // бы из диагностики (ТЗ §8).
        const objectEl = doc ? firstElementChild(doc.documentElement) : null;
        obj = objectEl ? h.parse(objectEl) : null;
        if (!obj) parseFailure = doc ? 'не найден распознаваемый объект в XML' : 'не удалось разобрать XML';
      } catch (e) {
        parseFailure = message(e);
        obj = null;
      }
      if (!obj) {
        issues.push({ file: source, stage: 'parse', message: parseFailure ?? 'неизвестная ошибка разбора', fatal: false });
        continue;
      }
      obj.source = source;
      objects.push(obj);
    }
  }

  return { objects, issues };
}

/** Извлечено из `parseConfiguration.ts` без изменения поведения (было приватной
 * `parseCommonAttributes`) — переименовано во избежание коллизии имени с
 * XML-обработчиком `parseCommonAttribute` (единственное число). */
export function scanCommonAttributes(cfPath: string, issues: MetadataBuildIssue[]): ParsedCommonAttribute[] {
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
