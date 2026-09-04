/**
 * Dual-path fallback (ТЗ v2.1 §51/§52) — подготовка к возможному PR-10, ещё не
 * production consumer path (см. комментарий модуля loadMetadataSafe.ts).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as snapshotBuilder from '../../src/core/metadata/parser/snapshotBuilder';
import { loadMetadataWithFallback } from '../../src/core/metadata/parser/loadMetadataSafe';
import { parseConfiguration } from '../../src/core/metadata/parser/parseConfiguration';
import { loadMetadataFromYaml } from '../../src/core/metadata/yamlLoader';

const FIXTURE_CF = path.resolve(__dirname, '../fixtures/cf');

let tmpDir: string;

afterEach(() => {
  vi.restoreAllMocks();
  if (tmpDir && fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
});

function freshCfCopy(): { cfPath: string; snapshotOutPath: string; yamlOutPath: string } {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'load-safe-'));
  const cfPath = path.join(tmpDir, 'cf-src');
  fs.cpSync(FIXTURE_CF, cfPath, { recursive: true });
  return {
    cfPath,
    snapshotOutPath: path.join(tmpDir, 'snapshot-out'),
    yamlOutPath: path.join(tmpDir, 'yaml-out'),
  };
}

describe('loadMetadataWithFallback', () => {
  it('direct-путь отрабатывает успешно — source="direct-snapshot", fallbackReason отсутствует', () => {
    const { cfPath, snapshotOutPath, yamlOutPath } = freshCfCopy();
    const r = loadMetadataWithFallback(cfPath, snapshotOutPath, yamlOutPath);

    expect(r.source).toBe('direct-snapshot');
    expect(r.fallbackReason).toBeUndefined();
    expect(r.model.tables.length).toBeGreaterThan(0);
  });

  it('direct-путь бросает исключение — прозрачный откат на YAML-путь, тот же итоговый результат', () => {
    const { cfPath, snapshotOutPath, yamlOutPath } = freshCfCopy();
    const spy = vi.spyOn(snapshotBuilder, 'buildMetadataSnapshotFromXml').mockImplementation(() => {
      throw new Error('симулированный сбой direct-пути');
    });

    // Главная проверка: вызов НЕ бросает наружу, несмотря на сбой внутри.
    expect(() => loadMetadataWithFallback(cfPath, snapshotOutPath, yamlOutPath)).not.toThrow();

    const r = loadMetadataWithFallback(cfPath, snapshotOutPath, yamlOutPath);
    expect(r.source).toBe('yaml-fallback');
    expect(r.fallbackReason).toBe('симулированный сбой direct-пути');
    // Откат даёт РЕАЛЬНУЮ, корректную модель через существующий production путь —
    // не пустую заглушку.
    expect(r.model.tables.length).toBeGreaterThan(0);

    spy.mockRestore();
  });

  it('исключение без Error (строка/объект) тоже корректно попадает в fallbackReason', () => {
    const { cfPath, snapshotOutPath, yamlOutPath } = freshCfCopy();
    vi.spyOn(snapshotBuilder, 'buildMetadataSnapshotFromXml').mockImplementation(() => {
      // eslint-disable-next-line @typescript-eslint/no-throw-literal
      throw 'строковый сбой';
    });

    const r = loadMetadataWithFallback(cfPath, snapshotOutPath, yamlOutPath);
    expect(r.source).toBe('yaml-fallback');
    expect(r.fallbackReason).toBe('строковый сбой');
  });

  it('откат даёт МОДЕЛЬ, ИДЕНТИЧНУЮ прямому вызову существующего production-пути', () => {
    const { cfPath, snapshotOutPath, yamlOutPath } = freshCfCopy();
    vi.spyOn(snapshotBuilder, 'buildMetadataSnapshotFromXml').mockImplementation(() => {
      throw new Error('симулированный сбой');
    });
    const r = loadMetadataWithFallback(cfPath, snapshotOutPath, yamlOutPath);

    // Независимая, отдельная сборка того же источника существующим путём —
    // должна дать РОВНО ту же модель, что и откат.
    const independentYamlOutPath = path.join(tmpDir, 'independent-yaml-out');
    const summary = parseConfiguration(cfPath, independentYamlOutPath);
    const independentModel = loadMetadataFromYaml(summary.outCfDir);

    expect(r.model).toEqual(independentModel);
  });
});
