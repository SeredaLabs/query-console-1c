import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
