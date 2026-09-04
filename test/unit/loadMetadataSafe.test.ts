/**
 * Dual-path load + warm cache (ТЗ v2.1 §51/§55 P1.4, PR-10 — production
 * consumer path, see loadMetadataSafe.ts module comment and panel.ts).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as snapshotBuilder from '../../src/core/metadata/parser/snapshotBuilder';
import { loadMetadataWithFallback, loadMetadataSnapshotFirst } from '../../src/core/metadata/parser/loadMetadataSafe';
import { parseConfiguration } from '../../src/core/metadata/parser/parseConfiguration';
import { loadMetadataFromYaml } from '../../src/core/metadata/yamlLoader';
import { modelCachePath } from '../../src/core/metadata/modelCache';
import { resolveManagedCfDir } from '../../src/core/metadata/parser/generationStore';

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

  it('откат оставляет ТЁПЛЫЙ model-cache.json, как и обычная сборка (следующий open — быстрый hit)', () => {
    const { cfPath, snapshotOutPath, yamlOutPath } = freshCfCopy();
    vi.spyOn(snapshotBuilder, 'buildMetadataSnapshotFromXml').mockImplementation(() => {
      throw new Error('симулированный сбой');
    });
    loadMetadataWithFallback(cfPath, snapshotOutPath, yamlOutPath);

    const cfYamlDir = path.join(yamlOutPath, 'cf');
    expect(fs.existsSync(modelCachePath(cfYamlDir))).toBe(true);
  });
});

describe('loadMetadataSnapshotFirst (production entry point, panel.ts)', () => {
  it('нет закоммиченного снимка — собирает direct-путём, source="direct-snapshot"', () => {
    const { cfPath, snapshotOutPath, yamlOutPath } = freshCfCopy();
    const r = loadMetadataSnapshotFirst(cfPath, snapshotOutPath, yamlOutPath);
    expect(r.source).toBe('direct-snapshot');
    expect(r.model.tables.length).toBeGreaterThan(0);
  });

  it('свежий закоммиченный снимок — тёплое чтение, source="direct-snapshot-cached", XML заново НЕ парсится', () => {
    const { cfPath, snapshotOutPath, yamlOutPath } = freshCfCopy();
    const first = loadMetadataSnapshotFirst(cfPath, snapshotOutPath, yamlOutPath);
    expect(first.source).toBe('direct-snapshot');

    // Второй вызов ловит buildMetadataSnapshotFromXml — если бы он был вызван,
    // это доказывало бы, что тёплый путь НЕ сработал (полный повторный XML-парсинг).
    const spy = vi.spyOn(snapshotBuilder, 'buildMetadataSnapshotFromXml');
    const second = loadMetadataSnapshotFirst(cfPath, snapshotOutPath, yamlOutPath);

    expect(second.source).toBe('direct-snapshot-cached');
    expect(second.model).toEqual(first.model);
    expect(spy).not.toHaveBeenCalled();
  });

  it('XML изменился ПОСЛЕ коммита снимка — снимок считается устаревшим, происходит rebuild', () => {
    const { cfPath, snapshotOutPath, yamlOutPath } = freshCfCopy();
    loadMetadataSnapshotFirst(cfPath, snapshotOutPath, yamlOutPath);

    // Коснуться источника XML (обновить mtime) — имитация правки конфигурации
    // пользователем ПОСЛЕ того, как снимок уже был закоммичен.
    const anyXml = path.join(cfPath, 'Catalogs', fs.readdirSync(path.join(cfPath, 'Catalogs'))[0]);
    const future = new Date(Date.now() + 5000);
    fs.utimesSync(anyXml, future, future);

    const spy = vi.spyOn(snapshotBuilder, 'buildMetadataSnapshotFromXml');
    const r = loadMetadataSnapshotFirst(cfPath, snapshotOutPath, yamlOutPath);

    expect(r.source).toBe('direct-snapshot'); // rebuilt, не cached
    expect(spy).toHaveBeenCalled();
  });

  it('закоммиченный снимок повреждён — деградирует до rebuild, а не бросает', () => {
    const { cfPath, snapshotOutPath, yamlOutPath } = freshCfCopy();
    loadMetadataSnapshotFirst(cfPath, snapshotOutPath, yamlOutPath);

    const committedDir = resolveManagedCfDir(snapshotOutPath);
    fs.writeFileSync(path.join(committedDir, 'metadata-snapshot.json'), '{ повреждённый json');

    expect(() => loadMetadataSnapshotFirst(cfPath, snapshotOutPath, yamlOutPath)).not.toThrow();
    const r = loadMetadataSnapshotFirst(cfPath, snapshotOutPath, yamlOutPath);
    expect(r.model.tables.length).toBeGreaterThan(0);
  });
});
