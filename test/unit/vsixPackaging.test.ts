import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';

/**
 * Architecture audit P2 (2026-09-22): `.vscodeignore` used to be a denylist
 * (`out/cli/**`, `out/test-integration/**`, `out/corpus-verify/**`) — it missed
 * ANY future or leftover build byproduct under `out/`, and a real one was
 * found: `out/canvas-preview-extension/` (~3MB, a whole nested copy of the
 * extension from an earlier packaging experiment) was silently included in the
 * VSIX. `.vscodeignore` is now an allowlist for `out/` — only the two files/
 * directories the shipped extension actually loads (`package.json`'s "main",
 * `canvasPanel.ts`/`panel.ts`'s `out/webview/*` references) survive; anything
 * else under `out/` (known today or added later) is excluded by default.
 *
 * This runs the REAL `vsce ls` (not a hand-rolled ignore-pattern re-implementation)
 * against whatever is currently built under `out/` — the same tool `npm run
 * package`/the release workflow uses — so it catches an actual packaging
 * regression, not just a change to the ignore file's text. Requires a prior
 * `npm run build` (already true in CI — release.yml runs `build` before
 * `test:unit`); skips gracefully in a local dev shell that hasn't built yet.
 */
const ROOT = path.resolve(__dirname, '../..');
const EXTENSION_ENTRY = path.join(ROOT, 'out/extension/extension.js');
const built = fs.existsSync(EXTENSION_ENTRY);

describe.skipIf(!built)('VSIX packaging (out/ allowlist, real vsce ls)', () => {
  let packaged: string[] = [];

  beforeAll(() => {
    packaged = execFileSync('npx', ['vsce', 'ls'], { cwd: ROOT, encoding: 'utf8' })
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);
  });

  it('packages exactly the shipped out/ artifacts — no leftover build byproducts', () => {
    const outEntries = packaged.filter(f => f.startsWith('out/')).sort();
    expect(outEntries).toEqual([
      'out/extension/extension.js',
      'out/webview/canvasApp.js',
      'out/webview/codicon.css',
      'out/webview/codicon.ttf',
      'out/webview/main.js',
    ]);
  });

  it('never packages a source map', () => {
    expect(packaged.some(f => f.startsWith('out/') && f.endsWith('.map'))).toBe(false);
  });

  it('never packages a nested extension copy (regression: out/canvas-preview-extension)', () => {
    expect(packaged.some(f => f.includes('canvas-preview-extension'))).toBe(false);
  });
});

if (!built) {
  // eslint-disable-next-line no-console
  console.warn('[vsixPackaging.test.ts] out/extension/extension.js not built — run `npm run build` first. Packaging checks skipped for this run.');
}
