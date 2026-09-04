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
 * `buildMetadataSnapshotFromXml` reuses the CURRENT production path unchanged —
 * `parseConfiguration` (which itself calls the per-object-kind XML handlers) to
 * build/commit the YAML generation, then the already-exported
 * `loadMetadataFromYaml` to get a `MetadataModel` — rather than re-implementing
 * XML traversal/per-object issue-tracking a second time to reach the same
 * `MetaTable[]` a different way (see PR-08 investigation: that traversal lives
 * entirely inside `parseConfiguration.ts` and is not separable from YAML-writing
 * without duplicating it). The only genuinely new step is committing the
 * resulting model as a versioned JSON snapshot alongside the YAML generation.
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
  type CommitResult,
} from './generationStore';
import { parseConfiguration, type ParseSummary } from './parseConfiguration';
import { loadMetadataFromYaml } from '../yamlLoader';
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
  yaml: ParseSummary;
  snapshot: CommitResult;
  model: MetadataModel;
}

/** End-to-end прототип: XML → (существующий) parseConfiguration → (существующий)
 * loadMetadataFromYaml → committed JSON snapshot. См. комментарий модуля. */
export function buildMetadataSnapshotFromXml(
  cfPath: string,
  yamlOutPath: string,
  snapshotOutPath: string,
): SnapshotBuildResult {
  const yaml = parseConfiguration(cfPath, yamlOutPath);
  const model = loadMetadataFromYaml(yaml.outCfDir);
  const snapshot = commitMetadataSnapshot(model, snapshotOutPath);
  return { yaml, snapshot, model };
}
