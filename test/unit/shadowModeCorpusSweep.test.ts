/**
 * Phase 3b of the semantic-core roadmap (memory: project-semantic-core-roadmap).
 *
 * Corpus-wide shadow-mode sweep: runs `runShadowModeSweep` over every valid
 * committed golden query. Expected resolver disagreements cannot be judged by
 * a raw count, so the test compares their reviewed identities and
 * classifications with `shadow-mode-baseline.json`. Any semantic change must
 * be inspected and regenerated explicitly via `corpus:shadow-baseline`; it is
 * never a silent update made only to turn the test green.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import {
  BASELINE_PATH,
  baselinesEqual,
  formatShadowModeBaselineDiff,
  loadGoldenQueries,
  loadShadowModeBaseline,
  runCorpusShadowModeSweep,
} from '../../tooling/corpus-verify/shadowModeBaseline';

const golden = loadGoldenQueries();

describe('shadow-mode: corpus sweep with a reviewable disagreement baseline', () => {

  it('golden-эталон присутствует и непуст', () => {
    expect(golden.length).toBeGreaterThan(0);
  });

  it('matches the reviewed baseline rather than only reporting disagreement totals', () => {
    expect(fs.existsSync(BASELINE_PATH), `Missing ${BASELINE_PATH}`).toBe(true);
    const { baseline: live, errors } = runCorpusShadowModeSweep(golden);
    expect(errors, `Sweep failed on ${errors.length} files:\n${errors.slice(0, 10).map((error) => `  ${error.file}: ${error.error}`).join('\n')}`).toEqual([]);

    const reviewed = loadShadowModeBaseline();
    expect(
      baselinesEqual(reviewed, live),
      `Shadow-mode disagreements changed. Review the semantic effect, then regenerate with ` +
        '`npm run corpus:shadow-baseline -- --write` and explain the diff in the change.\n\n' +
        formatShadowModeBaselineDiff(reviewed, live),
    ).toBe(true);
  });
});
