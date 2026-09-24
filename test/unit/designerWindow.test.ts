import { describe, expect, it } from 'vitest';
import { moveDesignerToCompactWindow } from '../../src/extension/designerWindow';

describe('moveDesignerToCompactWindow', () => {
  it('moves the designer first and then enables compact mode in the focused auxiliary window', async () => {
    const calls: string[] = [];

    await moveDesignerToCompactWindow(true, async command => {
      calls.push(command);
    });

    expect(calls).toEqual([
      'workbench.action.moveEditorToNewWindow',
      'workbench.action.enableCompactAuxiliaryWindow',
    ]);
  });

  it('does nothing when opening in a new window is disabled', async () => {
    const calls: string[] = [];

    await moveDesignerToCompactWindow(false, async command => {
      calls.push(command);
    });

    expect(calls).toEqual([]);
  });

  it('does not target the current window with compact mode when the move fails', async () => {
    const calls: string[] = [];

    await expect(moveDesignerToCompactWindow(true, async command => {
      calls.push(command);
      throw new Error('command unavailable');
    })).resolves.toBeUndefined();

    expect(calls).toEqual(['workbench.action.moveEditorToNewWindow']);
  });

  it('keeps the successfully opened auxiliary window when compact mode is unavailable', async () => {
    const calls: string[] = [];

    await expect(moveDesignerToCompactWindow(true, async command => {
      calls.push(command);
      if (command === 'workbench.action.enableCompactAuxiliaryWindow') {
        throw new Error('command unavailable');
      }
    })).resolves.toBeUndefined();

    expect(calls).toEqual([
      'workbench.action.moveEditorToNewWindow',
      'workbench.action.enableCompactAuxiliaryWindow',
    ]);
  });
});
