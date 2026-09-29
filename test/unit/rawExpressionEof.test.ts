import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildSync } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'raw-expression-eof-'));
const worker = join(dir, 'worker.cjs');
beforeAll(() => buildSync({
  entryPoints: [resolve('test/helpers/rawExpressionEofWorker.ts')],
  bundle: true, platform: 'node', format: 'cjs', outfile: worker,
}));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

// A regression must kill only its child, never exhaust the Vitest/extension host.
// These bounds contain broken code; they are not production performance limits.
function run(mode: string, text: string) {
  const child = spawnSync(process.execPath, ['--max-old-space-size=128', worker, mode, text], {
    encoding: 'utf8', timeout: 5000, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024,
  });
  expect({ status: child.status, signal: child.signal, error: child.error?.message }, child.stderr)
    .toEqual({ status: 0, signal: null, error: undefined });
  return JSON.parse(child.stdout);
}

const cases = [
  ['C13 GROUP', 'ВЫБРАТЬ 1\nСГРУППИРОВАТЬ ПО ЕСТЬNULL(', '1, 0)'],
  ['C14 ORDER function', 'ВЫБРАТЬ 1\nУПОРЯДОЧИТЬ ПО ЕСТЬNULL(', '1, 0)'],
  ['C14 ORDER comparison', 'ВЫБРАТЬ 1 КАК Код\nУПОРЯДОЧИТЬ ПО Код = (', '1)'],
  ['C15 INDEX', 'ВЫБРАТЬ 1 КАК Код ПОМЕСТИТЬ ВТ\nИНДЕКСИРОВАТЬ ПО ЕСТЬNULL(', 'Код, 0)'],
];
const errorPattern = /^Ошибка разбора 2:\d+ — ожидался символ «\)» \(получено «<конец>»\)$/;
for (const [name, unfinished, ending] of cases) {
  describe(name, () => {
    it.each([unfinished, unfinished + '(1)'])('rejects EOF with an open outer parenthesis: %s', text => {
      const result = run('parse', text);
      expect(result.error).toMatch(errorPattern);
      expect(result.attempt).toEqual({ ok: false, error: result.error });
    });
    it('reports a parse problem during editing', () => {
      const problems = run('diagnostics', unfinished);
      expect(problems).toHaveLength(1);
      expect(problems[0].kind).toBe('parse');
      expect(problems[0].message).toMatch(errorPattern);
      expect(problems[0].end).toBeGreaterThan(problems[0].start);
    });
    it('builds a controlled semantic snapshot', () => {
      expect(['recovered', 'unavailable']).toContain(run('snapshot', unfinished).completeness);
    });
    it('accepts the closed expression at EOF', () => {
      const text = unfinished + ending;
      expect(run('parse', text).attempt.ok).toBe(true);
      expect(run('diagnostics', text)).toEqual([]);
      expect(run('snapshot', text).completeness).toBe('complete');
    });
  });
}
