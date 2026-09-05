/**
 * Диагностический сканер (KNOWN_ISSUES.md "Параметры некоторых виртуальных
 * таблиц теряются при parse -> generate"). Синтетические `.bsl`-фикстуры здесь
 * НЕ заменяют реальную проверку 2026-09-05 (две реальные production-конфигурации,
 * см. docs/KNOWN_ISSUES.md) — они только проверяют, что сам сканер (обход
 * каталога, извлечение, парсинг, агрегация hits) работает корректно.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { scanUnsafeVirtualTables } from '../../src/cli/scanUnsafeVirtualTables';

let tmpDir: string;

afterEach(() => {
  if (tmpDir && fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeBsl(root: string, rel: string, content: string): void {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

describe('scanUnsafeVirtualTables', () => {
  it('не находит hits, когда виртуальные таблицы вызваны с ≤2 аргументами (реальный наблюдаемый случай)', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-safe-'));
    writeBsl(tmpDir, 'CommonModules/Тест/Ext/Module.bsl', [
      'Процедура Тест()',
      '\tЗапрос.Текст = "ВЫБРАТЬ Т.Период',
      '\t|ИЗ РегистрРасчета.Начисления.ДанныеГрафика(Регистратор = &парам) КАК Т";',
      'КонецПроцедуры',
    ].join('\n'));

    const report = scanUnsafeVirtualTables(tmpDir);
    expect(report.bslFiles).toBe(1);
    expect(report.extracted).toBe(1);
    expect(report.hits).toEqual([]);
  });

  it('находит hit, когда виртуальная таблица вызвана с 3+ аргументами (известное, но не встреченное в реальных конфигурациях искажение)', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-unsafe-'));
    writeBsl(tmpDir, 'CommonModules/Тест/Ext/Module.bsl', [
      'Процедура Тест()',
      '\tЗапрос.Текст = "ВЫБРАТЬ Т.Период',
      '\t|ИЗ РегистрРасчета.Начисления.ДанныеГрафика(&А, &Б, &В) КАК Т";',
      'КонецПроцедуры',
    ].join('\n'));

    const report = scanUnsafeVirtualTables(tmpDir);
    expect(report.hits).toHaveLength(1);
    expect(report.hits[0].table).toBe('РегистрРасчета.Начисления.ДанныеГрафика');
    expect(report.hits[0].file).toBe(path.join('CommonModules', 'Тест', 'Ext', 'Module.bsl'));
  });

  it('несуществующий каталог — 0 файлов, 0 hits, без исключения', () => {
    const report = scanUnsafeVirtualTables(path.join(os.tmpdir(), 'does-not-exist-' + Date.now()));
    expect(report.bslFiles).toBe(0);
    expect(report.hits).toEqual([]);
  });
});
