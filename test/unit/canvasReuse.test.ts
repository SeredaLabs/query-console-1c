/**
 * Canvas must reuse Classic code instead of keeping its own copies (a copy is
 * how Canvas once ended up with a weaker apply gate). Pins the duplicates that
 * were removed; apply gate and metadata tree have their own pins
 * (applyGate.test.ts, metadataTreeModel.test.ts).
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SRC = path.resolve(__dirname, '../../src');
const read = (rel: string): string => fs.readFileSync(path.join(SRC, rel), 'utf8');

function listFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? listFiles(full) : /\.tsx?$/.test(e.name) ? [full] : [];
  });
}

describe('Canvas reuses Classic code instead of copying it', () => {
  it('no local copies of the host bridge or ResizeHandle', () => {
    expect(fs.existsSync(path.join(SRC, 'webview-canvas/bridge.ts'))).toBe(false);
    expect(fs.existsSync(path.join(SRC, 'webview-canvas/components/ResizeHandle.tsx'))).toBe(false);
  });

  it('the condition operator list is defined once (webview/conditionOperators.ts)', () => {
    const offenders = [...listFiles(path.join(SRC, 'webview')), ...listFiles(path.join(SRC, 'webview-canvas'))]
      .filter((f) => /const\s+OPERATORS\s*:/.test(fs.readFileSync(f, 'utf8')))
      .map((f) => path.relative(SRC, f));
    expect(offenders).toEqual([]);
  });

  it('Canvas sorting takes its source fields from Classic distinctFieldRefs', () => {
    expect(read('webview-canvas/sorting/SortingWorkspace.tsx')).toContain('distinctFieldRefs(state.selectedFields)');
  });

  it('the Canvas panel host is the Classic designer host (panel.ts createDesignerPanel)', () => {
    const src = read('extension/canvasPanel.ts');
    expect(src).toContain('createDesignerPanel(');
    expect(src).not.toMatch(/onDidReceiveMessage|function getHtml|function nonce/);
  });

  it('query generation stays local to the WebView instead of using a dead host round-trip', () => {
    const messages = read('shared/messages.ts');
    const panel = read('extension/panel.ts');
    expect(messages).not.toMatch(/generatedText|type:\s*'generate'/);
    expect(panel).not.toMatch(/sdblGenerator|msg\.type === 'generate'/);
  });

  it('condition-mode controls do not create a Toolbar/JoinManagerPopover import cycle', () => {
    const popover = read('webview-canvas/structure/JoinManagerPopover.tsx');
    const toggle = read('webview-canvas/structure/ConditionModeToggle.tsx');
    expect(popover).toContain("from './ConditionModeToggle'");
    expect(popover).not.toContain("from './Toolbar'");
    expect(toggle).not.toMatch(/from '\.\/(?:Toolbar|JoinManagerPopover)'/);
  });
});
