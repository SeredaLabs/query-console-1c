# Разработка

Текущая архитектура и границы слоёв описаны в
[ARCHITECTURE.md](ARCHITECTURE.md). Пользовательское описание расширения -- в
[корневом README](../README.md).

## Предпосылки и быстрый старт

Нужны Node.js 20+ (рекомендуется 22), npm и VS Code. Для базовой работы:

```bash
npm install
npm run build
npm run dev
```

`npm run dev` собирает extension и webview и запускает VS Code с
`--extensionDevelopmentPath=.`. Полная подготовка локального окружения:

```bash
npm run setup --              # зависимости и сборка
npm run setup -- --e2e        # дополнительно браузер Playwright
npm run setup -- --help       # другие опции, включая локальный WASM oracle
```

Dev Container необязателен: для него нужен Docker, а `npm run setup -- --docker`
устанавливает нужные инструменты. Конфигурация контейнера хранится в `.devcontainer/`.

## Основные команды

| Команда | Назначение |
|---|---|
| `npm run build` | собрать extension и webview в `out/` |
| `npm run typecheck` | проверить TypeScript отдельно для extension/core и webview |
| `npm test` | основной локальный gate: typecheck + unit тесты |
| `npm run test:e2e` | Playwright-проверка статического webview harness |
| `npm run parse -- --cf <dir> --out <dir>` | собрать YAML метаданных из XML-выгрузки |
| `npm run package` | собрать VSIX |

`npm run test:e2e` не запускает реальный VS Code Extension Host. Этот пробел
зафиксирована в [KNOWN_ISSUES.md](KNOWN_ISSUES.md).

## Метаданные и локальный cache

```bash
npm run parse -- --cf <путь-к-выгрузке> --out <путь-к-выводу>
```

- `--cf` -- каталог XML-выгрузки 1С; по умолчанию CLI ищет `src/cf`.
- `--out` -- каталог YAML; по умолчанию `tmp/parser_data`.

Результат содержит `cf/configuration.yaml` и YAML-объекты по видам метаданных.
Это производный cache: не коммитьте его и обновляйте после изменения XML. Текущий
импорт неатомарен и может пропустить отдельные XML -- см.
[CORE_LIMITATIONS.md](CORE_LIMITATIONS.md) и [KNOWN_ISSUES.md](KNOWN_ISSUES.md).

## Тесты и регрессия SDBL

- Unit тесты находятся в `test/unit/`; закоммиченный корпус из 1976 запросов
  проверяет `parseBatch`/`generateBatch` в `corpusRegression.test.ts`.
- E2E тесты находятся в `test/e2e/` и проверяют webview через Playwright.
- `assertValidSdbl` использует tree-sitter только когда локально есть
  `test/fixtures/tree-sitter-sdbl.wasm`. Артефакт не коммитится и не собирается
  CI, поэтому не является независимой CI-гарантией.

Для oracle-прогона против другой конфигурации нужны XML-выгрузка, база 1С и MCP
`1c-md`. Инструкция и правила обновления snapshot -- в
[corpus-testing.md](corpus-testing.md).

## Релиз

```bash
npm version <version>
git push --follow-tags
```

Workflow [release.yml](../.github/workflows/release.yml) выполняет verify на pull
request и push в `main`, а для тега `v*` упаковывает VSIX и создаёт GitHub Release.
Локальная сборка: `npm run package`.

## Документация

Начинайте с [docs/README.md](README.md). Текущими источниками являются архитектура,
границы ядра, backlog и roadmap; фазовые отчёты и старые планы находятся в
[history/](history/README.md) только как архив доказательств.
