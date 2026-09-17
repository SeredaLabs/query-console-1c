import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { isCanvasPreviewEnabled } from '../../src/extension/canvasPreview';

const root = path.resolve(__dirname, '../..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
  contributes: {
    commands: Array<{ command: string }>;
    configuration: { properties: Record<string, { type: string; default: unknown }> };
    menus: { commandPalette: Array<{ command: string; when: string }> };
  };
};
const launchJson = JSON.parse(fs.readFileSync(path.join(root, '.vscode/launch.json'), 'utf8')) as {
  configurations: Array<{ env?: Record<string, string> }>;
};
const vscodeIgnore = fs.readFileSync(path.join(root, '.vscodeignore'), 'utf8');

describe('Canvas preview setup', () => {
  it('only enables automatic preview in an opted-in Extension Development Host', () => {
    expect(isCanvasPreviewEnabled(true, { QUERY_CONSOLE_CANVAS_PREVIEW: '1' })).toBe(true);
    expect(isCanvasPreviewEnabled(false, { QUERY_CONSOLE_CANVAS_PREVIEW: '1' })).toBe(false);
    expect(isCanvasPreviewEnabled(true, {})).toBe(false);
  });

  it('builds and typechecks Canvas for the release package', () => {
    expect(packageJson.scripts.build).toContain('build:canvas');
    expect(packageJson.scripts.typecheck).toContain('typecheck:canvas');
    expect(packageJson.scripts['preview:canvas']).toContain('QUERY_CONSOLE_CANVAS_PREVIEW=1');
    expect(vscodeIgnore).not.toContain('out/webview/canvasApp.js');
    expect(vscodeIgnore).toContain('out/canvas-preview-extension/**');
  });

  it('hides New Builder until its experimental setting is enabled', () => {
    const setting = packageJson.contributes.configuration.properties['queryConsole.enableNewBuilderPreview'];
    expect(setting).toMatchObject({ type: 'boolean', default: false });
    expect(packageJson.contributes.commands.some(
      command => command.command === '1c.queryConstructorCanvas',
    )).toBe(true);
    expect(packageJson.contributes.menus.commandPalette).toContainEqual({
      command: '1c.queryConstructorCanvas',
      when: 'config.queryConsole.enableNewBuilderPreview',
    });
  });

  it('enables the preview flag for the F5 Extension Development Host', () => {
    expect(launchJson.configurations.some(
      (configuration) => configuration.env?.QUERY_CONSOLE_CANVAS_PREVIEW === '1',
    )).toBe(true);
  });
});
