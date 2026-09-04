/**
 * PR-09 (ТЗ v2.1 §55 P1.3) — Snapshot Validation.
 *
 * Валидация нового JSON-снимка (PR-08, snapshotBuilder.ts) на РЕПРЕЗЕНТАТИВНОЙ
 * реальной конфигурации — БиблиотекаСтандартныхПодсистем (БСП), 558 объектов /
 * 713 таблиц, та же фикстура, что и `corpusRegression.test.ts`/
 * `bench/metadataPerf.ts`/`docs/PERFORMANCE_BASELINE.md`. `snapshotBuilder.test.ts`
 * уже проверяет корректность на МАЛЕНЬКОЙ синтетической фикстуре (2 объекта) —
 * здесь та же проверка боевого масштаба, где реально могли бы всплыть
 * структуры, которых нет в маленькой фикстуре (виртуальные таблицы, табличные
 * части, множественные виды метаданных).
 *
 * В репозитории нет исходного XML для БСП (только уже распарсенный YAML —
 * см. docs/corpus-testing.md) — поэтому вход здесь тот же, что получил бы
 * `buildMetadataSnapshotFromXml` ПОСЛЕ своего шага `parseConfiguration`:
 * `loadMetadataFromYaml` на уже закоммиченном YAML-каталоге. XML→YAML для этой
 * фикстуры не тестируется здесь (её и нельзя протестировать без исходного XML) —
 * важна ТОЛЬКО эквивалентность old-vs-new на уровне снимка (ТЗ §55 P1.3
 * "old-vs-new migration comparison").
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadMetadataFromYaml } from '../../src/core/metadata/yamlLoader';
import { loadMetadataCached, modelCachePath } from '../../src/core/metadata/modelCache';
import { commitMetadataSnapshot, readMetadataSnapshot } from '../../src/core/metadata/parser/snapshotBuilder';

const REAL_CF_YAML = path.resolve(__dirname, '../fixtures/corpus/metadata/cf');
const REAL_CACHE_PATH = modelCachePath(REAL_CF_YAML);

let tmpDir: string;

// `loadMetadataCached` пишет model-cache.json РЯДОМ с фикстурой (production
// поведение по кэшированию) — до/после теста подчищаем, чтобы не оставить
// сгенерированный файл в test/fixtures и не подхватить чужой протёкший кэш
// (см. тот же приём в bench/metadataPerf.ts).
beforeEach(() => { if (fs.existsSync(REAL_CACHE_PATH)) fs.rmSync(REAL_CACHE_PATH); });
afterEach(() => {
  if (fs.existsSync(REAL_CACHE_PATH)) fs.rmSync(REAL_CACHE_PATH);
  if (tmpDir && fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('Snapshot validation — представительная реальная конфигурация (БСП, 558 объектов)', () => {
  it('снимок структурно эквивалентен существующему production-пути (old-vs-new)', () => {
    const viaOldPath = loadMetadataCached(REAL_CF_YAML); // существующий production JSON-cache (modelCache.ts)
    const viaYaml = loadMetadataFromYaml(REAL_CF_YAML);   // та же конверсия, без cache-слоя

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapshot-validation-'));
    const result = commitMetadataSnapshot(viaYaml, tmpDir);
    const persisted = readMetadataSnapshot(result.targetDir);

    expect(persisted.model).toEqual(viaOldPath);
    // Тот же масштаб, что задокументирован в docs/PERFORMANCE_BASELINE.md.
    expect(persisted.model.tables.length).toBe(713);
  });

  it('снимок сохраняет виртуальные/составные структуры без потерь через JSON (не только плоские поля)', () => {
    const viaYaml = loadMetadataFromYaml(REAL_CF_YAML);
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapshot-validation-'));
    const result = commitMetadataSnapshot(viaYaml, tmpDir);
    const persisted = readMetadataSnapshot(result.targetDir);

    const withVirtual = viaYaml.tables.filter(t => t.virtual);
    const withTabular = viaYaml.tables.filter(t => (t.tabularSections?.length ?? 0) > 0);
    // На маленькой (2 объекта) фикстуре snapshotBuilder.test.ts этих структур
    // нет вовсе — это НОВОЕ покрытие, специфичное к реальному масштабу.
    expect(withVirtual.length).toBeGreaterThan(0);
    expect(withTabular.length).toBeGreaterThan(0);
    for (const t of withVirtual) {
      expect(persisted.model.tables.find(x => x.fullName === t.fullName)?.virtual).toEqual(t.virtual);
    }
    for (const t of withTabular) {
      expect(persisted.model.tables.find(x => x.fullName === t.fullName)?.tabularSections).toEqual(t.tabularSections);
    }
  });
});
