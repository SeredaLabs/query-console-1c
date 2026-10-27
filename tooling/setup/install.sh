#!/usr/bin/env bash
# tooling/setup/install.sh — подготовка окружения для сборки и тестов 1C: Query Constructor.
#
# Что делает (по шагам):
#   1. Проверяет Node.js (>= 20; рекомендуется 22) и npm.
#   2. При наличии apt доустанавливает системные пакеты для node-gyp
#      (build-essential, python3, git) — общий toolchain на случай нативных
#      сборок; нативного биндинга tree-sitter в зависимостях нет
#      (web-tree-sitter — чистый WASM, devDependency).
#   3. npm install — зависимости расширения и тестов.
#   4. npm run build — сборка extension + webview в out/.
#   5. (--e2e)  ставит браузеры Playwright для e2e-тестов.
#   6. (--wasm) пересобирает tree-sitter-sdbl.wasm из tmp/tree-sitter-bsl
#               (опциональный внешний oracle для разработки, V2; не нужен
#               для сборки, тестов и релиза; требует emscripten).
#
# Использование:
#   npm run setup --              # системные пакеты (если apt) + npm install + build
#   npm run setup -- --e2e        # то же + браузеры Playwright
#   npm run setup -- --wasm       # то же + пересборка SDBL-грамматики в .wasm
#   npm run setup -- --no-system  # пропустить установку системных пакетов
#   npm run setup -- --e2e --wasm
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

WITH_E2E=0
WITH_WASM=0
WITH_SYSTEM=1

for arg in "$@"; do
  case "$arg" in
    --e2e)        WITH_E2E=1 ;;
    --wasm)       WITH_WASM=1 ;;
    --no-system)  WITH_SYSTEM=0 ;;
    -h|--help)
      # Печатаем шапку-комментарий (со строки 2 до первой не-комментной строки).
      awk 'NR>=2 && /^#/ { sub(/^# ?/, ""); print; next } NR>=2 { exit }' "${BASH_SOURCE[0]}"
      exit 0 ;;
    *)
      echo "Неизвестный аргумент: $arg (см. --help)" >&2
      exit 1 ;;
  esac
done

log() { echo "[install] $*"; }

# sudo, если мы не root и sudo доступен; иначе пусто (команды идут как есть).
SUDO=""
if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
  SUDO="sudo"
fi

# --- 1. Node.js / npm -------------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  echo "[install] ОШИБКА: Node.js не найден. Установите Node.js >= 20 (рекомендуется 22)." >&2
  echo "          https://nodejs.org/  или  nvm install 22" >&2
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
log "Node.js $(node --version), npm $(npm --version)"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "[install] ОШИБКА: нужна Node.js >= 20 (текущая major: $NODE_MAJOR)." >&2
  exit 1
fi

# --- 2. Системные пакеты (общий toolchain для node-gyp) ---------------------
if [ "$WITH_SYSTEM" -eq 1 ] && command -v apt-get >/dev/null 2>&1; then
  PKGS=(build-essential python3 git)
  MISSING=()
  for p in "${PKGS[@]}"; do
    dpkg -s "$p" >/dev/null 2>&1 || MISSING+=("$p")
  done
  if [ "${#MISSING[@]}" -gt 0 ]; then
    log "Доустанавливаю системные пакеты: ${MISSING[*]}"
    $SUDO apt-get update
    $SUDO apt-get install -y --no-install-recommends "${MISSING[@]}"
  else
    log "Системные пакеты уже установлены: ${PKGS[*]}"
  fi
elif [ "$WITH_SYSTEM" -eq 1 ]; then
  log "apt не найден — пропускаю системные пакеты (убедитесь, что есть compiler toolchain + python3 для node-gyp)."
fi

# --- 3. npm install ---------------------------------------------------------
log "npm install ..."
npm install

# --- 4. Сборка --------------------------------------------------------------
log "npm run build (extension + webview) ..."
npm run build
log "Сборка готова: out/extension/extension.js, out/webview/main.js"

# --- 5. Playwright (e2e) ----------------------------------------------------
if [ "$WITH_E2E" -eq 1 ]; then
  log "Установка браузеров Playwright (chromium) ..."
  if command -v apt-get >/dev/null 2>&1; then
    npx playwright install --with-deps chromium
  else
    npx playwright install chromium
  fi
  log "Playwright готов — запуск: npm run test:e2e"
fi

# --- 6. Пересборка SDBL-грамматики в WASM (опционально) ---------------------
if [ "$WITH_WASM" -eq 1 ]; then
  if [ -d "tmp/tree-sitter-bsl" ]; then
    log "Пересборка tree-sitter-sdbl.wasm (tooling/scripts/build-wasm.sh) ..."
    bash tooling/scripts/build-wasm.sh
  else
    echo "[install] ПРОПУСК --wasm: нет tmp/tree-sitter-bsl." >&2
    echo "          Положите репозиторий tree-sitter-bsl в tmp/tree-sitter-bsl; нужен emscripten." >&2
  fi
fi

echo
log "Готово. Дальше:"
echo "    npm run dev        # сборка + запуск VS Code с расширением"
echo "    npm run test:unit  # юнит-тесты (Vitest)"
[ "$WITH_E2E" -eq 1 ] && echo "    npm run test:e2e   # e2e-тесты (Playwright)"
echo "    npm run parse -- --cf <путь-к-cf> --out <вывод>   # CLI-парсер метаданных"
