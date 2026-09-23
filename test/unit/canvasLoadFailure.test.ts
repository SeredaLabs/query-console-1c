import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { tryOpenBatch } from '../../src/core/query/validateBatch';

/**
 * Load-failure fix (2026-09-22, architecture audit P1 #2): Canvas's 'loadModel'
 * handler used to silently drop a failed `tryOpenBatch` on the floor — Canvas
 * stayed empty, indistinguishable from opening the command with no query under
 * the cursor. `canvasPanel.ts` had already captured `savedEditor` (the ORIGINAL
 * document range) before the webview even attempted to parse — so a user who
 * then built a fresh query in the "empty" Canvas and clicked Save would have
 * `insertResult()` overwrite that original range with unrelated text, a real
 * data-loss risk, not just a UX gap.
 *
 * The fix mirrors Classic (`webview/App.tsx`'s `loadError`): a failed
 * `tryOpenBatch` now sets `loadError` and renders a full-panel blocking overlay
 * whose only exit is Close (`cancel`), which `canvasPanel.ts` already disposes
 * on WITHOUT ever calling `insertResult`.
 */
describe('Canvas load-failure data path (tryOpenBatch, shared with Classic)', () => {
  it('a malformed query under the cursor fails tryOpenBatch with a non-empty error (what loadError would be set to)', () => {
    const r = tryOpenBatch('ВЫБРАТЬ ИЗ ИЗ');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.length).toBeGreaterThan(0);
  });

  it('a valid query still opens successfully (no false-positive overlay)', () => {
    const r = tryOpenBatch('ВЫБРАТЬ Валюты.Код ИЗ Справочник.Валюты КАК Валюты');
    expect(r.ok).toBe(true);
  });
});

/**
 * Pins the fix at the source level: Canvas's 'loadModel' handler must branch on
 * `tryOpenBatch`'s result and set `loadError` on failure instead of silently
 * doing nothing, the overlay must actually block interaction (full-panel
 * `position: fixed`, high `zIndex`), and closing it must go through `cancel`,
 * never `insertText` — so a future refactor can't silently reintroduce the
 * "parse failure looks like an empty document" bug or accidentally wire the
 * overlay's Close button to Save.
 */
describe('src/webview-canvas/App.tsx surfaces load failure instead of silently emptying', () => {
  const APP_TSX = path.resolve(__dirname, '../../src/webview-canvas/App.tsx');
  const src = fs.readFileSync(APP_TSX, 'utf8');

  it('gets loadError from the session hook shared with Classic (useDesignerSession)', () => {
    expect(src).toMatch(/const \{[^}]*\bloadError\b[^}]*\} = useDesignerSession\(dispatch/);
    expect(src).not.toMatch(/tryOpenBatch\(/);
  });

  it('the shared session sets loadError on a failed tryOpenBatch and clears it on success', () => {
    const hook = fs.readFileSync(path.resolve(__dirname, '../../src/webview/hooks/useDesignerSession.ts'), 'utf8');
    expect(hook).toMatch(/if\s*\(r\.ok\)\s*\{[\s\S]*?setLoadError\(null\)[\s\S]*?\}/);
    expect(hook).toMatch(/else\s+setLoadError\(r\.error\)/);
  });

  it('Classic uses the same session hook (one loadModel/loading implementation)', () => {
    const classic = fs.readFileSync(path.resolve(__dirname, '../../src/webview/App.tsx'), 'utf8');
    expect(classic).toContain('useDesignerSession(dispatch');
    expect(classic).not.toMatch(/tryOpenBatch\(/);
  });

  it('renders a loading overlay until metadata and the initial query arrive', () => {
    expect(src).toMatch(/\{loading && loadError == null && \(/);
    expect(src).toContain('data-testid="canvas-loading-overlay"');
  });

  it('renders a full-panel blocking overlay when loadError is set', () => {
    expect(src).toContain('loadError != null');
    expect(src).toContain("position: 'fixed', inset: 0");
  });

  it('the overlay\'s close action posts cancel, not insertText', () => {
    const closeFnMatch = src.match(/const handleClose = React\.useCallback\(\(\) => \{([^}]*)\}/s);
    expect(closeFnMatch).not.toBeNull();
    expect(closeFnMatch![1]).toContain("type: 'cancel'");
    expect(closeFnMatch![1]).not.toContain('insertText');
  });
});

describe('the Canvas panel disposes on cancel without writing to the document', () => {
  it('canvasPanel.ts delegates to the shared designer host (panel.ts createDesignerPanel)', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../src/extension/canvasPanel.ts'), 'utf8');
    expect(src).toContain('createDesignerPanel(');
    expect(src).not.toMatch(/onDidReceiveMessage/);
  });

  it("the shared host's cancel branch never calls insertResult", () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../src/extension/panel.ts'), 'utf8');
    const cancelBranch = src.match(/else if \(msg\.type === 'cancel'\) \{([^}]*)\}/s);
    expect(cancelBranch).not.toBeNull();
    expect(cancelBranch![1]).not.toContain('insertResult');
    expect(cancelBranch![1]).toContain('panel.dispose()');
  });
});
