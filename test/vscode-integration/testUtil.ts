import * as fs from 'fs';
import * as path from 'path';

/**
 * Находит корень репозитория, поднимаясь от `startDir` до каталога с `package.json`.
 * Не завязывается на точную глубину вложенности `out/test-integration/...`,
 * которую задаёт tsconfig.test-integration.json — устойчиво к её изменению.
 */
export function findRepoRoot(startDir: string): string {
  let dir = startDir;
  while (!fs.existsSync(path.join(dir, 'package.json'))) {
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(`findRepoRoot: package.json не найден при подъёме от ${startDir}`);
    }
    dir = parent;
  }
  return dir;
}

export const REPO_ROOT = findRepoRoot(__dirname);
export const FIXTURE_CF = path.join(REPO_ROOT, 'test/fixtures/cf');

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Опрашивает `check` до `true` либо до истечения `timeoutMs` — вместо фиксированного
 * `sleep`, чтобы не делать тесты медленнее или более хрупкими, чем нужно. */
export async function waitUntil(check: () => boolean, timeoutMs: number, intervalMs = 200): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return true;
    await sleep(intervalMs);
  }
  return check();
}
