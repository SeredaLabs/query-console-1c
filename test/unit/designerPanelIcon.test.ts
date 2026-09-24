import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');

describe('Query Designer panel icon', () => {
  it('keeps the editor-tab icon only when the webview has no inline title icon', () => {
    const panelSource = fs.readFileSync(path.join(ROOT, 'src/extension/panel.ts'), 'utf8');
    const canvasSource = fs.readFileSync(path.join(ROOT, 'src/extension/canvasPanel.ts'), 'utf8');

    expect(panelSource).toContain('if (kind.hasInlineTitleIcon) {');
    expect(panelSource).toContain("'transparent.svg'");
    expect(panelSource).toContain('panel.iconPath = {');
    expect(panelSource).toContain("'query-builder-schema-light.svg'");
    expect(panelSource).toContain("'query-builder-schema-dark.svg'");
    expect(canvasSource).toContain('hasInlineTitleIcon: true');
  });

  it.each(['light', 'dark'])('keeps the %s asset small, vector and text-free', theme => {
    const iconPath = path.join(ROOT, `assets/images/query-builder-schema-${theme}.svg`);
    const source = fs.readFileSync(iconPath, 'utf8');

    expect(source).toContain('viewBox="0 0 24 24"');
    expect(source).not.toMatch(/<text\b/i);
    expect(Buffer.byteLength(source)).toBeLessThan(3072);
  });

  it('uses a text-free transparent SVG to suppress the Canvas tab fallback icon', () => {
    const source = fs.readFileSync(path.join(ROOT, 'assets/images/transparent.svg'), 'utf8');

    expect(source).toContain('viewBox="0 0 16 16"');
    expect(source).toContain('fill="none"');
    expect(source).not.toMatch(/<text\b/i);
  });

  it('shows the matching glyph beside the visible Canvas title', () => {
    const source = fs.readFileSync(
      path.join(ROOT, 'src/webview-canvas/components/DocumentBar.tsx'),
      'utf8',
    );

    expect(source).toContain('data-testid="query-builder-glyph"');
    expect(source).toContain('<ellipse cx="6.5" cy="5" rx="4" ry="2"');
    expect(source).toContain('<rect x="16.5" y="3.5" width="5" height="5"');
    expect(source).toContain('<rect x="16.5" y="15.5" width="5" height="5"');
    expect(source).toMatch(/<QueryBuilderGlyph\s*\/>[\s\S]*t\(locale, 'title'\)/);
  });
});
