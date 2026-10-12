// TEMPORARY: deliberately failing test to verify that the `main` ruleset blocks a
// PR with a red `verify`. This branch and PR are closed and deleted after the check.
import { it, expect } from 'vitest';
it('ruleset probe: intentionally red', () => { expect(1).toBe(2); });
