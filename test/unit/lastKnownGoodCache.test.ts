import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { writeLastKnownGood, readLastKnownGood, LAST_KNOWN_GOOD_VERSION } from '../../src/core/metadata/lastKnownGoodCache';
import type { MetadataModel } from '../../src/core/metadata/types';

const MODEL: MetadataModel = {
  version: 1,
  tables: [
    { kind: 'Справочник', name: 'Тест', fullName: 'Справочник.Тест', fields: [] },
  ],
};

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lkg-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('writeLastKnownGood + readLastKnownGood round-trip', () => {
  it('persists and restores the model exactly, with a builtAtMs timestamp', () => {
    const before = Date.now();
    writeLastKnownGood(tmpDir, '/project-a/src/cf', MODEL);
    const restored = readLastKnownGood(tmpDir, '/project-a/src/cf');

    expect(restored).not.toBeNull();
    expect(restored!.cacheVersion).toBe(LAST_KNOWN_GOOD_VERSION);
    expect(restored!.model).toEqual(MODEL);
    expect(restored!.builtAtMs).toBeGreaterThanOrEqual(before);
  });

  it('keys by cfPath — different configs do not collide', () => {
    const modelB: MetadataModel = { version: 1, tables: [] as MetadataModel['tables'] };
    writeLastKnownGood(tmpDir, '/project-a/src/cf', MODEL);
    writeLastKnownGood(tmpDir, '/project-b/src/cf', { ...MODEL, tables: [] });

    // project-b's write is skipped (empty model, see below) — project-a's
    // last-known-good must be unaffected.
    expect(readLastKnownGood(tmpDir, '/project-a/src/cf')?.model).toEqual(MODEL);
    expect(readLastKnownGood(tmpDir, '/project-b/src/cf')).toBeNull();
    void modelB;
  });

  it('readLastKnownGood returns null when nothing was ever written for this cfPath', () => {
    expect(readLastKnownGood(tmpDir, '/never/written/cf')).toBeNull();
  });

  it('readLastKnownGood returns null for a corrupted file (not valid JSON)', () => {
    writeLastKnownGood(tmpDir, '/project-c/src/cf', MODEL);
    // Найдём файл, который только что записали, и испортим его.
    const files = fs.readdirSync(tmpDir);
    expect(files).toHaveLength(1);
    fs.writeFileSync(path.join(tmpDir, files[0]), '{ повреждённый json');

    expect(readLastKnownGood(tmpDir, '/project-c/src/cf')).toBeNull();
  });

  it('readLastKnownGood returns null when cacheVersion does not match', () => {
    writeLastKnownGood(tmpDir, '/project-d/src/cf', MODEL);
    const files = fs.readdirSync(tmpDir);
    const filePath = path.join(tmpDir, files[0]);
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    fs.writeFileSync(filePath, JSON.stringify({ ...raw, cacheVersion: 999 }));

    expect(readLastKnownGood(tmpDir, '/project-d/src/cf')).toBeNull();
  });
});

describe('writeLastKnownGood — пустая модель не считается "good"', () => {
  it('не пишет файл вовсе для модели с 0 таблиц', () => {
    writeLastKnownGood(tmpDir, '/empty/src/cf', { version: 1, tables: [] });
    expect(fs.readdirSync(tmpDir)).toEqual([]);
    expect(readLastKnownGood(tmpDir, '/empty/src/cf')).toBeNull();
  });

  it('не перезаписывает существующий хороший снимок деградированным (пустым) результатом', () => {
    writeLastKnownGood(tmpDir, '/project-e/src/cf', MODEL);
    writeLastKnownGood(tmpDir, '/project-e/src/cf', { version: 1, tables: [] });

    expect(readLastKnownGood(tmpDir, '/project-e/src/cf')?.model).toEqual(MODEL);
  });
});

describe('writeLastKnownGood — best-effort, не бросает на сбое записи', () => {
  it('не бросает, если storageDir указывает на несуществующий недоступный путь', () => {
    // Родитель — существующий файл (не каталог): mkdirSync внутри провалится.
    const blockerFile = path.join(tmpDir, 'blocker');
    fs.writeFileSync(blockerFile, 'x');
    const badStorageDir = path.join(blockerFile, 'nested');

    expect(() => writeLastKnownGood(badStorageDir, '/whatever/cf', MODEL)).not.toThrow();
  });
});

// Architecture audit P2 (2026-09-22): раньше писалось напрямую в целевой файл
// (fs.writeFileSync(target, …)) — прерванная запись могла оставить target
// усечённым/повреждённым и УНИЧТОЖИТЬ единственную страховку на случай, когда
// все остальные пути загрузки уже отказали. Теперь пишем во временный файл и
// атомарно renameSync поверх цели.
describe('writeLastKnownGood — атомарная запись (temp + rename)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('успешная запись не оставляет временных файлов — ровно один итоговый файл', () => {
    writeLastKnownGood(tmpDir, '/project-f/src/cf', MODEL);
    const files = fs.readdirSync(tmpDir);
    expect(files).toHaveLength(1);
    expect(files[0]).not.toContain('.tmp-');
  });

  it('сбой ПОСЛЕ записи временного файла (renameSync бросает) — старый target остаётся ЦЕЛЫМ, временный файл убирается', async () => {
    // Сначала — настоящий успешный good-снимок через РЕАЛЬНУЮ (немокнутую)
    // реализацию, который симулированный сбой ниже НЕ должен тронуть.
    writeLastKnownGood(tmpDir, '/project-g/src/cf', MODEL);
    const before = readLastKnownGood(tmpDir, '/project-g/src/cf');
    expect(before?.model).toEqual(MODEL);

    // Node's `fs` module экспорты не configurable — vi.spyOn(fs, ...) не может
    // их подменить напрямую; мокаем модуль целиком через vi.doMock (реальные
    // реализации для всего, кроме renameSync — importActual).
    vi.resetModules();
    vi.doMock('fs', async () => {
      const actual = await vi.importActual<typeof fs>('fs');
      return {
        ...actual,
        renameSync: () => {
          throw new Error('симулированный сбой переименования (диск переполнен на середине)');
        },
      };
    });
    const { writeLastKnownGood: writeMocked } = await import('../../src/core/metadata/lastKnownGoodCache');

    const updatedModel: MetadataModel = {
      version: 1,
      tables: [{ kind: 'Справочник', name: 'Другой', fullName: 'Справочник.Другой', fields: [] }],
    };
    expect(() => writeMocked(tmpDir, '/project-g/src/cf', updatedModel)).not.toThrow();

    vi.doUnmock('fs');
    vi.resetModules();

    // Старый last-known-good НЕ повреждён и НЕ заменён — сбой renameSync
    // произошёл ДО того, как что-либо тронуло сам target.
    const after = readLastKnownGood(tmpDir, '/project-g/src/cf');
    expect(after?.model).toEqual(MODEL);

    // Ни одного осиротевшего .tmp-* файла в каталоге хранения.
    const leftoverTmp = fs.readdirSync(tmpDir).filter(f => f.includes('.tmp-'));
    expect(leftoverTmp).toEqual([]);
  });

  it('конкурентные записи для РАЗНЫХ cfPath используют разные временные имена (нет коллизии)', () => {
    writeLastKnownGood(tmpDir, '/project-h1/src/cf', MODEL);
    writeLastKnownGood(tmpDir, '/project-h2/src/cf', MODEL);
    expect(readLastKnownGood(tmpDir, '/project-h1/src/cf')?.model).toEqual(MODEL);
    expect(readLastKnownGood(tmpDir, '/project-h2/src/cf')?.model).toEqual(MODEL);
    expect(fs.readdirSync(tmpDir)).toHaveLength(2);
  });
});
