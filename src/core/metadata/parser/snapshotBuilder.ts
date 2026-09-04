/**
 * New Snapshot Prototype (ТЗ v2.1 §10, §55 P1.2).
 *
 * Committed, explicitly format-versioned, consolidated JSON snapshot of
 * `MetadataModel` — reuses `generationStore.ts`'s staged-build + ownership-marker
 * + logical-commit machinery (PR-02) AS-IS: that store is directory-content-
 * agnostic (never inspects staging contents), so the same last-known-good/
 * atomic-switch guarantees that already protect the YAML generation apply to a
 * JSON snapshot exactly as-is, with zero changes to generationStore.ts.
 *
 * `buildMetadataSnapshotFromXml` reuses the SAME per-object-kind XML handlers as
 * the production YAML path (`xmlScan.ts`'s `scanConfigurationObjects`/
 * `scanCommonAttributes`, extracted from `parseConfiguration.ts` without changing
 * its behavior) and the SAME `ParsedObject[] -> MetadataModel` conversion as the
 * production YAML path (`yamlLoader.ts`'s `buildMetadataModel`, extracted from
 * `loadMetadataFromYaml` without changing its behavior) — but skips the YAML
 * file round-trip entirely: XML is parsed directly into memory, converted
 * directly into a `MetadataModel`, and committed as JSON. This is "direct" per
 * §55 P1.2's wording, not merely "reuses `parseConfiguration` as a black box"
 * (an earlier version of this function did the latter — see git history).
 *
 * `snapshotOutPath` MUST be a directory root DIFFERENT from the YAML build's
 * `outPath` — `generationStore.ts` hardcodes a `cf`/`cf-managed` child name
 * under whatever root it is given, so this snapshot lineage needs its own root
 * to avoid colliding with the real YAML `cf` generation.
 *
 * YAML remains the production path — `panel.ts` is untouched, nothing here is
 * wired into any runtime consumer yet (production switch is a later PR-10).
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  cleanupStaleSiblings, stagingDirFor, finalizeStaging, commitGeneration,
  type CommitResult, type MetadataBuildIssue,
} from './generationStore';
import { scanConfigurationObjects, scanCommonAttributes } from './xmlScan';
import { buildMetadataModel } from '../yamlLoader';
import type { MetadataModel } from '../types';

/** Расширяется только когда предыдущий persisted-формат перестаёт гарантировать
 * эквивалентную семантику (ТЗ §10) — не при каждом структурном изменении JSON. */
export const SNAPSHOT_FORMAT_VERSION = 1;

export interface MetadataSnapshotFile {
  formatVersion: number;
  model: MetadataModel;
}

const SNAPSHOT_FILE_NAME = 'metadata-snapshot.json';

/**
 * Коммитит уже построенную модель как JSON-снимок через staged-build +
 * ownership-marker + logical-commit (generationStore.ts, без изменений).
 */
export function commitMetadataSnapshot(model: MetadataModel, snapshotOutPath: string): CommitResult {
  cleanupStaleSiblings(snapshotOutPath);
  const stagingDir = stagingDirFor(snapshotOutPath);
  fs.mkdirSync(stagingDir, { recursive: true });
  const file: MetadataSnapshotFile = { formatVersion: SNAPSHOT_FORMAT_VERSION, model };
  try {
    fs.writeFileSync(path.join(stagingDir, SNAPSHOT_FILE_NAME), JSON.stringify(file));
    finalizeStaging(stagingDir);
  } catch (e) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    throw e instanceof Error ? e : new Error(String(e));
  }
  return commitGeneration(stagingDir, snapshotOutPath);
}

/** Читает уже закоммиченный снимок (каталог — см. `resolveManagedCfDir` из
 * generationStore.ts). Используется тестами и будущей валидацией (PR-09) — ещё
 * НЕ production consumer path. */
export function readMetadataSnapshot(committedDir: string): MetadataSnapshotFile {
  const raw = fs.readFileSync(path.join(committedDir, SNAPSHOT_FILE_NAME), 'utf8');
  return JSON.parse(raw) as MetadataSnapshotFile;
}

export interface SnapshotBuildResult {
  snapshot: CommitResult;
  model: MetadataModel;
  /** Recoverable per-object проблемы разбора (ТЗ §8) — та же семантика, что и
   * `ParseSummary.issues` у `parseConfiguration.ts` (per-object failure не
   * останавливает сборку снимка). */
  issues: MetadataBuildIssue[];
}

/**
 * Direct end-to-end прототип (ТЗ §55 P1.2): XML → (общие с production YAML-
 * путём) обработчики `xmlScan.ts` → (общая с production YAML-путём) конверсия
 * `buildMetadataModel` → committed JSON snapshot. НЕ строит и не читает YAML —
 * см. комментарий модуля.
 */
export function buildMetadataSnapshotFromXml(cfPath: string, snapshotOutPath: string): SnapshotBuildResult {
  const { objects, issues } = scanConfigurationObjects(cfPath);
  const commonAttributes = scanCommonAttributes(cfPath, issues);
  const model = buildMetadataModel(objects, commonAttributes);
  const snapshot = commitMetadataSnapshot(model, snapshotOutPath);
  return { snapshot, model, issues };
}
