/**
 * Frozen, reviewable baseline for the semantic resolver's shadow-mode sweep.
 *
 * The sweep intentionally contains expected disagreements: the newer resolver
 * is position-aware while the legacy one is not. A summary count alone cannot
 * show whether a changed disagreement is an intended improvement or a new
 * regression, so this module records every disagreement's stable identity and
 * classification for review.
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { buildYamlResolver } from '../../src/core/metadata/buildYamlResolver';
import {
  runShadowModeSweep,
  summarize,
  type ShadowModeCase,
  type ShadowModeClassification,
} from './shadowMode';

export interface GoldenQuery {
  file: string;
  valid: boolean;
  input: string;
}

interface ShadowModeDisagreement {
  classification: Exclude<ShadowModeClassification, 'sameResolved' | 'bothUnknown'>;
  oldSignature?: string;
  newSignature?: string;
}

export interface ShadowModeBaseline {
  schemaVersion: 1;
  corpusSha256: string;
  validQueries: number;
  candidatePositions: number;
  summary: Record<ShadowModeClassification, number>;
  disagreements: Record<string, ShadowModeDisagreement>;
}

export interface ShadowModeSweepResult {
  baseline: ShadowModeBaseline;
  errors: Array<{ file: string; error: string }>;
}

export const CORPUS_DIR = path.resolve(__dirname, '../../test/fixtures/corpus');
export const GOLDEN_PATH = path.join(CORPUS_DIR, 'golden.jsonl');
export const BASELINE_PATH = path.join(CORPUS_DIR, 'shadow-mode-baseline.json');

export function loadGoldenQueries(): GoldenQuery[] {
  return fs.readFileSync(GOLDEN_PATH, 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as GoldenQuery);
}

function caseKey(file: string, item: ShadowModeCase): string {
  return `${file}:${item.position}:${item.alias}`;
}

export function runCorpusShadowModeSweep(golden = loadGoldenQueries()): ShadowModeSweepResult {
  const resolver = buildYamlResolver(path.join(CORPUS_DIR, 'metadata', 'cf'));
  const allCases: ShadowModeCase[] = [];
  const errors: Array<{ file: string; error: string }> = [];
  const disagreements: Record<string, ShadowModeDisagreement> = {};

  for (const query of golden) {
    if (!query.valid) continue;
    try {
      const cases = runShadowModeSweep(query.input, resolver);
      allCases.push(...cases);
      for (const item of cases) {
        // `bothUnknown` is an agreement that neither resolver can resolve the
        // candidate (often a metadata path head, not an alias). Keep its count
        // in the summary, but do not bloat the detailed disagreement review.
        if (item.classification === 'sameResolved' || item.classification === 'bothUnknown') continue;
        disagreements[caseKey(query.file, item)] = {
          classification: item.classification,
          ...(item.oldSignature ? { oldSignature: item.oldSignature } : {}),
          ...(item.newSignature ? { newSignature: item.newSignature } : {}),
        };
      }
    } catch (error) {
      errors.push({ file: query.file, error: error instanceof Error ? error.message : String(error) });
    }
  }

  const orderedDisagreements = Object.fromEntries(
    Object.entries(disagreements).sort(([left], [right]) => left.localeCompare(right)),
  );
  const corpusText = fs.readFileSync(GOLDEN_PATH);
  return {
    baseline: {
      schemaVersion: 1,
      corpusSha256: crypto.createHash('sha256').update(corpusText).digest('hex'),
      validQueries: golden.filter((query) => query.valid).length,
      candidatePositions: allCases.length,
      summary: summarize(allCases),
      disagreements: orderedDisagreements,
    },
    errors,
  };
}

export function loadShadowModeBaseline(): ShadowModeBaseline {
  return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) as ShadowModeBaseline;
}

/** Preserve the previously reviewed artifact if generation is interrupted. */
export function writeShadowModeBaseline(baseline: ShadowModeBaseline): void {
  const tempPath = `${BASELINE_PATH}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(baseline, null, 2)}\n`);
  fs.renameSync(tempPath, BASELINE_PATH);
}

export function formatShadowModeBaselineDiff(before: ShadowModeBaseline, after: ShadowModeBaseline): string {
  const lines: string[] = ['# Shadow-mode baseline diff', ''];
  if (before.schemaVersion !== after.schemaVersion) {
    lines.push(`- Schema: ${before.schemaVersion} -> ${after.schemaVersion}`);
  }
  if (before.corpusSha256 !== after.corpusSha256) {
    lines.push('- Golden corpus content changed. Regenerate and review this baseline with the corpus change.');
  }
  if (before.validQueries !== after.validQueries) {
    lines.push(`- Valid queries: ${before.validQueries} -> ${after.validQueries}`);
  }
  if (before.candidatePositions !== after.candidatePositions) {
    lines.push(`- Candidate positions: ${before.candidatePositions} -> ${after.candidatePositions}`);
  }

  const summaryChanges = (Object.keys(before.summary) as ShadowModeClassification[])
    .filter((classification) => before.summary[classification] !== after.summary[classification])
    .map((classification) =>
      `- ${classification}: ${before.summary[classification]} -> ${after.summary[classification]}`,
    );
  if (summaryChanges.length > 0) lines.push('', '## Classification totals', ...summaryChanges);

  const keys = new Set([...Object.keys(before.disagreements), ...Object.keys(after.disagreements)]);
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  for (const key of [...keys].sort((left, right) => left.localeCompare(right))) {
    const oldValue = before.disagreements[key];
    const newValue = after.disagreements[key];
    if (!oldValue) added.push(key);
    else if (!newValue) removed.push(key);
    else if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) changed.push(key);
  }

  const addPreview = (heading: string, values: string[]) => {
    if (values.length === 0) return;
    lines.push('', `## ${heading} (${values.length})`, ...values.slice(0, 20).map((value) => `- ${value}`));
    if (values.length > 20) lines.push(`- ... and ${values.length - 20} more`);
  };
  addPreview('New disagreements', added);
  addPreview('Resolved disagreements', removed);
  addPreview('Changed disagreements', changed);

  if (lines.length === 2) lines.push('Baseline unchanged.');
  return `${lines.join('\n')}\n`;
}

export function baselinesEqual(left: ShadowModeBaseline, right: ShadowModeBaseline): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
