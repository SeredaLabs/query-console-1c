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
- **Параметры некоторых виртуальных таблиц теряются при `parse -> generate`.**
  Подтверждено (PR-04, ТЗ §31: parse → несвязанная правка → generate,
  `test/unit/virtualTableRoundTrip.test.ts`): формы с тремя и более аргументами
  (`РегистрРасчета.*.ДанныеГрафика`, `ФактическийПериодДействия`,
  `Последовательность.*.Границы`) попадают в общий `[period, condition]`
  fallback — 3-й и последующие аргументы молча пропадают; ≤2 аргументов —
  LOSSLESS. Настоящая раскладка позиций для этих видов неизвестна (нет
  evidence для конкретной арности/имён параметров) — просто расширять
  `[period, condition]` вслепую было бы её выдумыванием без основания.
  Apply-blocking реализован (PR-05 «Apply Safety», ТЗ §54 P0.5):
  `parseVirtualParams` ставит `VirtualParams.unsafeExtraArgs`, когда позиция 3+
  непустая; `findUnsafeVirtualTables` (`semanticValidator.ts`) находит такие
  таблицы рекурсивно (включая подзапросы), кнопка «ОК» в `App.tsx` блокируется
  до записи в редактор. Само искажение параметров при parse→generate НЕ
  исправлено — нужна evidence по реальной раскладке позиций (см. выше),
  поэтому пункт остаётся здесь. Владельцы: `src/core/query/sdblParser.ts`,
  `semanticValidator.ts`.
  (`РегистрБухгалтерии.*.Субконто` и безымянный слот `ВидыСубконто` у
  `Остатки`/`Обороты`/`ОборотыДтКт`/`ОстаткиИОбороты` — тот же класс бага,
  уже исправлен в PR-04: `accountingPositionKeys`/`accountingParamFields` в
  `queryModel.ts`/`accountingVirtualParams.ts`, покрыт
  `test/unit/virtualTableRoundTrip.test.ts` и `accountingVirtualParams.test.ts`.)

## Высокие: неверная модель, неполная проверка или отсутствие test gate

- **Cache метаданных может быть устаревшим (частично исправлено, PR-10).**
  На ОСНОВНОМ пути (`loadMetadataSnapshotFirst`, задействован при любом
  заданном `cfPath` — см. PR-10 widen) устаревший снимок ТЕПЕРЬ обнаруживается:
  mtime закоммиченного снимка сравнивается с mtime XML-файлов в 17 распознаваемых
  подкаталогах (`newestRelevantMtime`, `loadMetadataSafe.ts`) — при более новом
  XML происходит rebuild, а не тихая выдача старых данных. Подтверждено вручную
  на двух реальных конфигурациях (изменение mtime реального XML-файла
  корректно триггерит rebuild). Остаточный узкий случай: отдельная ветка
  `loadMetadataCached`/`configuration.yaml` (используется только когда `cfPath`
  не задан, либо когда И direct-путь, И его YAML-откат оба упали) по-прежнему
  проверяет только `fs.existsSync`, без сравнения с mtime XML — но эта ветка
  в нормальном режиме почти не задействуется. Владелец: `src/extension/panel.ts`,
  `src/core/metadata/parser/loadMetadataSafe.ts`.
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

- Запись JSON-side-кэшей (`cacheBuilder.ts`, `modelCache.ts`) неатомарна: падение
  посреди записи оставляет повреждённый файл без понятной диагностики (сама YAML-
  генерация уже защищена staged-build + logical commit — PR-02, см. ниже).
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
