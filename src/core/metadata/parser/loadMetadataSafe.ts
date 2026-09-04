/**
 * Dual-path load with warm cache (ТЗ v2.1 §51 Rollbackability, §55 P1.4
 * Production Metadata Switch, PR-10).
 *
 * `loadMetadataSnapshotFirst` is the production entry point wired into
 * `panel.ts` (see there) for the "no YAML generation exists yet" cold-build
 * case: it tries the direct XML→JSON snapshot path (`buildMetadataSnapshotFromXml`,
 * PR-08) first, reusing an already-committed snapshot when it is still fresh
 * relative to `cfPath`'s XML (same freshness contract as `modelCache.ts`'s
 * `loadMetadataCached`, just compared against the XML source directly instead
 * of an intermediate YAML directory). If the direct path throws for ANY reason
 * — including on the very first (uncached) build — the caller transparently
 * falls back to the existing, years-proven YAML path
 * (`parseConfiguration`+`rebuildModelCache`, which also keeps that path's own
 * warm `model-cache.json` populated for next time, exactly as before this PR).
 * The only cost of a fallback is one extra failed attempt, never data loss or
 * a crash — see `loadMetadataWithFallback` below.
 *
 * Scope of this production switch is deliberately narrow (ТЗ §47 PR-by-PR
 * safety rule): `panel.ts` only calls this when NO YAML generation exists on
 * disk yet (brand-new project, or after the YAML dir was removed) — an
 * existing YAML generation (the overwhelmingly common case for a returning
 * user) keeps going through the exact same `loadMetadataCached` path as
 * always, completely untouched by this file. The explicit «Обновить кэш»
 * command also still always rebuilds via the YAML path unconditionally — not
 * switched in this PR, to keep the change to one clearly bounded slice.
 */
import * as fs from 'fs';
import * as path from 'path';
import { resolveManagedCfDir, isOwnedGeneration } from './generationStore';
import { buildMetadataSnapshotFromXml, readMetadataSnapshot, snapshotFileMtimeMs } from './snapshotBuilder';
import { HANDLERS } from './xmlScan';
import { parseConfiguration } from './parseConfiguration';
import { rebuildModelCache } from '../modelCache';
import type { MetadataModel } from '../types';

/** Newest mtimeMs among the TOP-LEVEL `.xml` files directly inside `dir` — no
 * recursion. Mirrors EXACTLY what `scanConfigurationObjects` (xmlScan.ts) reads
 * for one kind subdirectory: `fs.readdirSync(dir)` filtered to `.xml`, nothing
 * nested. 0 if inaccessible/missing. */
function newestTopLevelXmlMtime(dir: string): number {
  let max = 0;
  try {
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.xml')) continue;
      max = Math.max(max, fs.statSync(path.join(dir, file)).mtimeMs);
    }
  } catch {
    // missing/inaccessible directory — treat as 0
  }
  return max;
}

/** Subdirectories `scanConfigurationObjects`/`scanCommonAttributes` (xmlScan.ts)
 * actually read — the ONLY ones relevant to a snapshot's freshness. */
const RELEVANT_SUBDIRS = [...HANDLERS.map(h => h.subdir), 'CommonAttributes'];

/**
 * Newest mtimeMs across only the top-level `.xml` files the direct path
 * actually reads (see `RELEVANT_SUBDIRS`/`newestTopLevelXmlMtime`) — the
 * freshness basis for `loadMetadataSnapshotFirst`.
 *
 * Deliberately NOT recursive and NOT scanning the whole `cfPath` tree — found
 * by measuring against a real configuration (docs/PERFORMANCE_BASELINE.md),
 * two compounding reasons: (1) `cfPath` commonly also contains CommonForms/
 * CommonPictures/DataProcessors/Reports/etc — thousands of files our parser
 * never touches (one real config: 20132 files under `cfPath` total, vs 1422
 * our parser actually reads); (2) EACH object under a relevant subdirectory
 * (e.g. `Catalogs/Валюты.xml`) commonly has its OWN same-named subdirectory
 * holding that object's forms/templates/modules (e.g. `Catalogs/Валюты/Forms/...`)
 * — recursing into `RELEVANT_SUBDIRS` still hit 8452 files that way, not the
 * true 1422. `scanConfigurationObjects` itself never descends into those —
 * matching its exact (non-recursive) read pattern here made this freshness
 * check ~6x cheaper (measured), turning a ~256ms warm check into one close to
 * `readMetadataSnapshot`'s own ~44ms.
 */
function newestRelevantMtime(cfPath: string): number {
  let max = 0;
  for (const subdir of RELEVANT_SUBDIRS) {
    max = Math.max(max, newestTopLevelXmlMtime(path.join(cfPath, subdir)));
  }
  return max;
}

export interface SafeMetadataLoadResult {
  model: MetadataModel;
  /** 'direct-snapshot-cached' — reused an already-committed, still-fresh snapshot
   * (warm hit, no XML re-parse); 'direct-snapshot' — the direct XML→JSON path
   * rebuilt and succeeded; 'yaml-fallback' — the direct path threw, and the
   * existing production YAML path was used instead. */
  source: 'direct-snapshot-cached' | 'direct-snapshot' | 'yaml-fallback';
  /** The direct path's exception message — present ONLY when source ===
   * 'yaml-fallback', for diagnostics (why the fallback was needed). */
  fallbackReason?: string;
}

/**
 * `snapshotOutPath` and `yamlOutPath` MUST be different root directories (see
 * `snapshotBuilder.ts` — `generationStore.ts` fixes a `cf`/`cf-managed` child
 * name under whatever root it is given).
 */
export function loadMetadataWithFallback(
  cfPath: string,
  snapshotOutPath: string,
  yamlOutPath: string,
): SafeMetadataLoadResult {
  try {
    const built = buildMetadataSnapshotFromXml(cfPath, snapshotOutPath);
    return { model: built.model, source: 'direct-snapshot' };
  } catch (e) {
    const fallbackReason = e instanceof Error ? e.message : String(e);
    // rebuildModelCache (not loadMetadataFromYaml directly) so the existing
    // warm model-cache.json is populated too — a fallback must leave behind
    // exactly the same warm-path state a pre-PR-10 build would have, so the
    // NEXT open (which goes through panel.ts's unconditional
    // `fs.existsSync(configYaml)` → `loadMetadataCached` branch once a YAML
    // dir exists) is a fast cache hit, not a surprise second full rebuild.
    const yaml = parseConfiguration(cfPath, yamlOutPath);
    const model = rebuildModelCache(yaml.outCfDir);
    return { model, source: 'yaml-fallback', fallbackReason };
  }
}

/**
 * Warm-checked entry point: reuses an already-committed snapshot when it is
 * still fresh relative to `cfPath`'s XML; otherwise rebuilds via
 * {@link loadMetadataWithFallback}. This is what makes repeat opens after the
 * first successful direct build fast (~10-45ms per docs/PERFORMANCE_BASELINE.md)
 * instead of re-parsing the full XML tree every time.
 */
export function loadMetadataSnapshotFirst(
  cfPath: string,
  snapshotOutPath: string,
  yamlOutPath: string,
): SafeMetadataLoadResult {
  const committedDir = resolveManagedCfDir(snapshotOutPath);
  if (isOwnedGeneration(committedDir)) {
    try {
      if (snapshotFileMtimeMs(committedDir) >= newestRelevantMtime(cfPath)) {
        return { model: readMetadataSnapshot(committedDir).model, source: 'direct-snapshot-cached' };
      }
    } catch {
      // missing/corrupt snapshot file despite a valid ownership marker — fall
      // through to a full rebuild below, same as a stale cache.
    }
  }
  return loadMetadataWithFallback(cfPath, snapshotOutPath, yamlOutPath);
}
