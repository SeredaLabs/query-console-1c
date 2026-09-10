/**
 * Phase 1c of the semantic-core roadmap (memory: project-semantic-core-roadmap).
 * Pure staleness-guard logic — same generation-counter pattern already proven in
 * `queryDiagnosticsController.ts`, tested here in isolation from vscode.
 */
import { describe, it, expect } from 'vitest';
import { SnapshotRequestGuard } from '../../src/core/semantic/snapshotRequestGuard';

describe('SnapshotRequestGuard', () => {
  it('a token is not stale if no newer request has begun', () => {
    const guard = new SnapshotRequestGuard();
    const token = guard.beginRequest();
    expect(guard.isStale(token)).toBe(false);
  });

  it('a token becomes stale once a newer request begins', () => {
    const guard = new SnapshotRequestGuard();
    const first = guard.beginRequest();
    const second = guard.beginRequest();
    expect(guard.isStale(first)).toBe(true);
    expect(guard.isStale(second)).toBe(false);
  });

  it('each beginRequest call issues a distinct, increasing token', () => {
    const guard = new SnapshotRequestGuard();
    const tokens = [guard.beginRequest(), guard.beginRequest(), guard.beginRequest()];
    expect(new Set(tokens).size).toBe(3);
    expect(tokens[0]).toBeLessThan(tokens[1]);
    expect(tokens[1]).toBeLessThan(tokens[2]);
  });

  it('guards are independent of one another', () => {
    const a = new SnapshotRequestGuard();
    const b = new SnapshotRequestGuard();
    const tokenA = a.beginRequest();
    b.beginRequest();
    b.beginRequest();
    expect(a.isStale(tokenA)).toBe(false);
  });
});
