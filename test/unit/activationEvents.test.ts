/**
 * Guards against regressing the activation-event fix (post-release audit P1 #1):
 * hover/completion/document providers are registered inside `activate()`, but
 * before this fix the only activation event was `onCommand:queryConsole1c.openFromRange`
 * — a `.bsl` file the user just opens and hovers/types in, without ever invoking one
 * of our commands first, would never activate the extension at all, so those
 * providers would silently never run. `onStartupFinished` guarantees activation
 * regardless of which command (if any) the user invokes first.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const packageJson = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8')
) as { activationEvents: string[] };

describe('package.json activationEvents', () => {
  it('includes onStartupFinished so hover/completion/etc. work without the user invoking a command first', () => {
    expect(packageJson.activationEvents).toContain('onStartupFinished');
  });
});
