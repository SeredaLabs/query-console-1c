/**
 * PR-08 (ТЗ v2.1 §10, §55 P1.2) — New Snapshot Prototype.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadMetadataFromYaml } from '../../src/core/metadata/yamlLoader';
import { parseConfiguration } from '../../src/core/metadata/parser/parseConfiguration';
import { isOwnedGeneration, resolveManagedCfDir } from '../../src/core/metadata/parser/generationStore';
import {
  commitMetadataSnapshot, readMetadataSnapshot, buildMetadataSnapshotFromXml,
  SNAPSHOT_FORMAT_VERSION,
} from '../../src/core/metadata/parser/snapshotBuilder';
import type { MetadataModel } from '../../src/core/metadata/types';

const FIXTURE_CF = path.resolve(__dirname, '../fixtures/cf');

let tmpDir: string;

afterEach(() => {
  vi.restoreAllMocks();
  if (tmpDir && fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
});

function freshTmpDir(): string {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapshot-'));
  return tmpDir;
}

const SAMPLE_MODEL: MetadataModel = {
  version: 1,
  tables: [{ kind: 'Справочник', name: 'Валюты', fullName: 'Справочник.Валюты', fields: [] }],
};

describe('commitMetadataSnapshot / readMetadataSnapshot — та же safety-инфраструктура, что и YAML (PR-02)', () => {
  it('коммитит снимок, помечает владением, читается обратно с тем же formatVersion/model', () => {
    const root = freshTmpDir();
    const result = commitMetadataSnapshot(SAMPLE_MODEL, root);

    expect(result.redirected).toBe(false);
    expect(isOwnedGeneration(result.targetDir)).toBe(true);

    const back = readMetadataSnapshot(result.targetDir);
    expect(back.formatVersion).toBe(SNAPSHOT_FORMAT_VERSION);
    expect(back.model).toEqual(SAMPLE_MODEL);
  });

  it('повторный commit заменяет предыдущую генерацию (staging нигде не остаётся, как и у YAML)', () => {
    const root = freshTmpDir();
    commitMetadataSnapshot(SAMPLE_MODEL, root);
    const updated: MetadataModel = { version: 1, tables: [...SAMPLE_MODEL.tables, {
      kind: 'Документ', name: 'ТестДок', fullName: 'Документ.ТестДок', fields: [],
    }] };
    const result2 = commitMetadataSnapshot(updated, root);

    expect(result2.redirected).toBe(false);
    expect(fs.readdirSync(root)).toEqual(['cf']); // ни .building-*, ни .previous-*
    expect(readMetadataSnapshot(result2.targetDir).model).toEqual(updated);
  });

  it('resolveManagedCfDir из generationStore.ts находит закоммиченный снимок так же, как и YAML-генерацию', () => {
    const root = freshTmpDir();
    const result = commitMetadataSnapshot(SAMPLE_MODEL, root);
    expect(resolveManagedCfDir(root)).toBe(result.targetDir);
  });
});

describe('buildMetadataSnapshotFromXml — direct-путь (без YAML) на реальной фикстуре', () => {
  it('снимок не теряет данные и не расходится с независимо построенным YAML-путём (old-vs-new)', () => {
    const root = freshTmpDir();
    const cfPath = path.join(root, 'cf-src');
    fs.cpSync(FIXTURE_CF, cfPath, { recursive: true });
    const snapshotOutPath = path.join(root, 'snapshot-out');

    const built = buildMetadataSnapshotFromXml(cfPath, snapshotOutPath);

    expect(built.issues).toEqual([]);
    expect(built.model.tables.length).toBeGreaterThan(0);

    // Снимок должен нести РОВНО ту же модель, что уже построена и возвращена
    // build'ом (не перечитывать заново с диска что-то другое).
    const persisted = readMetadataSnapshot(built.snapshot.targetDir);
    expect(persisted.model).toEqual(built.model);

    // Old-vs-new (ТЗ §55 P1.3): НЕЗАВИСИМО строим ту же конфигурацию через
    // существующий production YAML-путь (parseConfiguration + loadMetadataFromYaml,
    // отдельный XML→YAML прогон, не используемый direct-путём вообще) и сверяем
    // итоговую модель — совпадение доказывает, что пропуск YAML-прослойки не
    // меняет результат, а не просто "работает без исключений".
    const yamlOutPath = path.join(root, 'yaml-out');
    const yamlSummary = parseConfiguration(cfPath, yamlOutPath);
    expect(yamlSummary.issues).toEqual([]);
    const viaYaml = loadMetadataFromYaml(yamlSummary.outCfDir);
    expect(persisted.model).toEqual(viaYaml);
  });
});
