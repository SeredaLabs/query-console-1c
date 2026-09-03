# Архитектура

Статус: **операционный документ**. Он описывает границы, которые нужны для
стабильности ядра. Команды разработки описаны в [DEVELOPMENT.md](DEVELOPMENT.md),
границы поддержки -- в [CORE_LIMITATIONS.md](CORE_LIMITATIONS.md).

## Принцип

Логика, которую можно проверить без VS Code и браузера, находится в `src/core`.
`src/extension` адаптирует VS Code API, а `src/webview` только отображает и
редактирует модель. Единственный контракт обмена host ↔ webview --
[`src/shared/messages.ts`](../src/shared/messages.ts).

```
VS Code / BSL editor
        │ commands, active editor, filesystem
        ▼
src/extension ───── postMessage ─────► src/webview (React)
        │                                  │ user actions
        │                                  ▼
        └────────────── src/core ◄── QueryModel
                         │
                         ├── metadata: XML export -> YAML -> JSON cache -> MetadataModel
                         └── query:    SDBL text <-> QueryModel <-> SDBL text
```

## Слои и ответственность

| Слой | Каталог | Ответственность | Не должен знать о |
|---|---|---|---|
| Интеграция | `src/extension` | команды, активный редактор, webview, файловые пути, вставка BSL-литерала | React-состоянии и правилах разбора SDBL |
| Ядро метаданных | `src/core/metadata` | XML-выгрузка 1С, YAML и cache, `MetadataModel` | VS Code и React |
| Ядро запроса | `src/core/query` | `QueryModel`, lexer/parser/generator SDBL, трансформации и семантическая проверка | VS Code, React, UI filesystem |
| Интерфейс | `src/webview` | React-компоненты, локальное UI-состояние, редактирование модели, сообщения host | прямой доступ к файлам и VS Code API |
| Общий контракт | `src/shared/messages.ts` | типы сообщений host ↔ webview | детали реализации каждого слоя |

## Потоки данных

### Метаданные

1. `resolveCfPath.ts` находит XML-выгрузку или берёт
   `queryConsole.metadataPath`.
2. `parseConfiguration.ts` строит YAML в `queryConsole.parserOutputPath`.
3. `yamlLoader.ts`/`modelCache.ts` загружают `MetadataModel` и передают её в
   webview через сообщения `init`/`loadModel`.
4. UI использует модель только для дерева таблиц, полей, типов и локальной
   семантической проверки.

YAML и JSON-cache -- производные артефакты, а XML-выгрузка -- внешний вход. Cache
не является источником истины и требует ручного обновления после изменения XML.

### Запрос

1. Команда из `extension.ts` читает BSL около курсора через `queryAtCursor.ts`.
2. Для существующего статического литерала `parseBatch` превращает SDBL в
   `QueryModel`; для нового запроса создаётся начальная модель.
3. Webview редактирует `QueryModel` через store и передаёт изменения сообщениями.
4. `sdblGenerator.ts` генерирует SDBL из модели, а `insertResult.ts` вставляет
   или заменяет BSL-литерал в редакторе.

`parseBatch` -- tolerant parser для восстановления модели, а не сертификация
корректности произвольного SDBL. Условия безопасного round-trip определены в
[CORE_LIMITATIONS.md](CORE_LIMITATIONS.md).

## Ключевые контракты

- `QueryModel` в `src/core/query/queryModel.ts` -- центральная модель, общая для
  parser, generator и UI. Изменение её формы требует проверки обоих направлений:
  `parse -> generate` и `model -> generate`.
- `MetadataModel` в `src/core/metadata/types.ts` -- контракт между XML/YAML
  конвейером и конструктором. Изменение типов или стандартных полей требует тестов
  parser + loader + resolver.
- `messages.ts` -- versionless runtime-контракт. Каждое новое сообщение должно
  обрабатываться в extension и webview и иметь тест соответствующего поведения.
- Команды и настройки в `package.json` -- публичный контракт расширения; их
  идентификаторы нельзя менять без совместимой миграции.

## Точки повышенного риска

- `src/extension/panel.ts` объединяет metadata lifecycle, асинхронность и весь
  message bridge; изменения здесь требуют отдельной проверки host/webview сценария.
- `src/core/query/sdblParser.ts` и `sdblGenerator.ts` нужно изменять парно:
  новая поддержанная конструкция должна иметь тесты parse, generate и round-trip.
- `src/core/metadata/parser/parseConfiguration.ts` изменяет cache, от которого
  сразу зависит интерфейс. Текущие неатомарность и частичный импорт зафиксированы
  в [KNOWN_ISSUES.md](KNOWN_ISSUES.md).

## Проверка границ

`npm run typecheck` и `npm run test:unit` проверяют ядро в Node;
`npm run test:e2e` проверяет статический webview harness. Полноценного Extension
Host теста пока нет, поэтому сценарии команд и реального VS Code API остаются
риском, а не подтверждённой гарантией.
