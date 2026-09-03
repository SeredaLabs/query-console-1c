# Известные проблемы

Статус: **операционный backlog**. Здесь фиксируются подтверждённые неисправленные
дефекты, а не исторические предположения. Приоритеты работ -- в
[ROADMAP.md](ROADMAP.md); безопасное поведение до исправления -- в
[CORE_LIMITATIONS.md](CORE_LIMITATIONS.md).

## Критические: возможна тихая потеря данных или ложное подтверждение корректности

- **Tolerant parser может принять ошибочное выражение.** `parseBatch` сохраняет
  нераспознанные части как `custom`-текст; поэтому `validateBatchText` может
  разрешить «Применить» для синтаксически неверного оператора или функции. Нужен
  strict expression validator либо внешний grammar/oracle gate для этого сценария.
  Владельцы: `src/core/query/sdblParser.ts`, `validateBatch.ts`.
- **Параметры виртуальных таблиц теряются при `parse -> generate`.**
  `РегистрБухгалтерии.*.Субконто(&Период, &Условие)` теряет оба параметра.
  Формы с тремя и более аргументами (`РегистрРасчета.*.ДанныеГрафика`,
  `ФактическийПериодДействия`, `Последовательность.*.Границы`) могут попасть в
  общий `[period, condition]` fallback и сместить аргументы. Владельцы:
  `src/core/query/sdblParser.ts`, `queryModel.ts`, `sdblGenerator.ts`.

## Высокие: неверная модель, неполная проверка или отсутствие test gate

- **XML-импорт публикует частичную metadata model.** `parseConfiguration` удаляет
  старый YAML, пропускает отдельные XML с ошибкой и записывает новый индекс;
  `panel.ts` не показывает `skipped`. Нужны staged output, атомарная замена и
  диагностика. Владельцы: `src/core/metadata/parser/parseConfiguration.ts`,
  `src/extension/panel.ts`.
- **Cache метаданных может быть устаревшим.** Наличие `configuration.yaml`
  считается достаточным, XML-выгрузка автоматически не сравнивается с cache.
  Владелец: `src/extension/panel.ts`.
- **Неполная поддержка metadata reference types.** `typeParser.ts` распознаёт
  только часть ссылок 1С; неизвестные виды теряются как пустой тип. Владельцы:
  `src/core/metadata/parser/typeParser.ts`, `yamlLoader.ts`.
- **Локальная семантика не проверяет поля и навигацию.** Проверяется существование
  таблиц, но не реквизиты, поля и обращения через точку. Владелец:
  `src/core/query/semanticValidator.ts`.
- **План обмена `*.Изменения` даёт ложный semantic failure.** Подтаблица не
  представлена в YAML-cache, поэтому полный semantic прогон нельзя сделать жёстким
  CI-gate. Владельцы: metadata parser и `semanticValidator.ts`.
- **Нет Extension Host integration test.** `npm run test:e2e` запускает только
  статический webview harness; команды, host ↔ webview сообщения, metadata lifecycle
  и вставка BSL через реальный VS Code API не покрыты.
- **Независимая tree-sitter SDBL-проверка не работает в CI.** WASM-грамматика не
  коммитится и не собирается release workflow; локальный oracle не является CI-gate.

## Средние

- `parseConfiguration.ts`: `writeYaml` находится вне `try/catch`; ошибка записи
  одного объекта может прервать импорт всей конфигурации.
- Запись YAML и JSON cache неатомарна: падение посреди записи оставляет
  повреждённый файл без понятной диагностики.
- Symlink-каталоги не находятся auto-discovery (`resolveCfPath.ts` /
  `findCfRoot.ts`).
- `RENAME_QUERY` не сбрасывает комментарии участника `ОБЪЕДИНЕНИЕ`; влияние пока
  не подтверждено, но поведение не имеет regression-теста.

## Низкие / для наблюдения

- `generate`/`generatedText` в `src/shared/messages.ts` -- мёртвый message pair.
- Fallback `insertResult.ts` срабатывает также при переключении неактивной вкладки,
  а не только когда редактор закрыт.
- После долгого `await metadataReady` `panel.ts` теоретически может отправить
  сообщение уже закрытой панели; это ещё не подтверждено runtime-воспроизведением.

## Правило обновления

Новый пункт добавляется только с воспроизведением или ссылкой на тест/код. После
исправления его удаляют отсюда, добавляют regression-тест и при необходимости
обновляют [CORE_LIMITATIONS.md](CORE_LIMITATIONS.md).
