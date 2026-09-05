import { defineConfig } from '@vscode/test-cli';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Extension Host integration tests (ТЗ п.4 "закрыть integration gap") — реальный
// VS Code (Electron) запускает наше расширение и открывает test/fixtures/vscode-workspace
// как рабочую область. В отличие от test/e2e/webview.spec.ts (Playwright, статический
// HTML-харнесс с мок vscode API), здесь команды, message bridge создания панели и
// вставка/замена BSL-литерала проверяются через РЕАЛЬНЫЙ vscode API.
export default defineConfig({
  files: 'out/test-integration/test/vscode-integration/**/*.test.js',
  workspaceFolder: path.join(__dirname, 'test/fixtures/vscode-workspace'),
  mocha: {
    // @vscode/test-cli defaults to 'tdd' (suite/test) — 'bdd' (describe/it) matches
    // the style already used across test/unit/*.test.ts (vitest).
    ui: 'bdd',
    timeout: 30000,
  },
  // Repo может лежать глубоко во вложенных каталогах (особенно на macOS) — тогда
  // дефолтный `<repo>/.vscode-test/user-data` даёт unix-socket путь длиннее ~103
  // символов и Electron падает с EINVAL при старте. Короткий путь под os.tmpdir()
  // не зависит от глубины расположения репозитория.
  launchArgs: [`--user-data-dir=${path.join(os.tmpdir(), 'qc1c-vscode-test-user-data')}`],
});
