/**
 * Phase 3b of the semantic-core roadmap (memory: project-semantic-core-roadmap).
 *
 * Corpus-wide shadow-mode sweep: runs `runShadowModeSweep` (shadowMode.ts) over
 * all 1976 real queries in the committed golden corpus and reports a
 * classification breakdown. Per Refinement 4/5, this is a DIAGNOSTIC report,
 * not a pass/fail gate on disagreement count — "20 disagreements out of
 * 10,000 sounds fine until you learn all 20 are the new resolver confidently
 * resolving to the WRONG table." Raw counts alone can't distinguish EXPECTED
 * disagreements (e.g. right-nested JOIN condition scoping, where the new
 * resolver is correctly MORE restrictive than the old flat lookup) from real
 * regressions.
 *
 * The only hard gate here is `oldResolvedNewUnknown` with a NON-nested (no
 * joinCondition-only) explanation being absent is NOT checked automatically —
 * that adjudication needs a human per case. What IS asserted mechanically:
 * the sweep never throws over the whole corpus, and produces at least one
 * case (i.e. the harness is actually exercised, not silently a no-op).
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { runShadowModeSweep, summarize, type ShadowModeCase } from '../../src/core/semantic/shadowMode';
import { buildYamlResolver } from '../../src/core/metadata/buildYamlResolver';

interface Golden { file: string; valid: boolean; input: string; query_text: string; }

const CORPUS_DIR = path.resolve(__dirname, '../fixtures/corpus');
const GOLDEN = path.join(CORPUS_DIR, 'golden.jsonl');

const golden: Golden[] = fs.existsSync(GOLDEN)
  ? fs.readFileSync(GOLDEN, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l))
  : [];

describe('shadow-mode: корпусный прогон (діагностика, НЕ жорсткий гейт за кількістю розбіжностей)', () => {
  const resolver = buildYamlResolver(path.join(CORPUS_DIR, 'metadata', 'cf'));

  it('golden-эталон присутствует и непуст', () => {
    expect(golden.length).toBeGreaterThan(0);
  });

  it('ніколи не падає на всьому корпусі й дає непорожній звіт по класифікаціях', () => {
    const allCases: ShadowModeCase[] = [];
    const perFileErrors: Array<{ file: string; error: string }> = [];

    for (const g of golden) {
      if (!g.valid) continue;
      try {
        allCases.push(...runShadowModeSweep(g.input, resolver));
      } catch (e) {
        perFileErrors.push({ file: g.file, error: e instanceof Error ? e.message : String(e) });
      }
    }

    expect(perFileErrors, `Sweep впав на ${perFileErrors.length} файлах:\n${perFileErrors.slice(0, 10).map((f) => `  ${f.file} — ${f.error}`).join('\n')}`).toEqual([]);
    expect(allCases.length).toBeGreaterThan(0);

    const summary = summarize(allCases);
    const total = allCases.length;
    const pct = (n: number) => ((n / total) * 100).toFixed(1);
    // eslint-disable-next-line no-console
    console.log(
      `Shadow-mode corpus sweep: ${total} candidate positions across ${golden.filter((g) => g.valid).length} queries\n` +
        Object.entries(summary)
          .map(([k, v]) => `  ${k}: ${v} (${pct(v)}%)`)
          .join('\n'),
    );
  });
});
