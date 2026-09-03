# 1C: Query Constructor

[🇺🇦 Українська](#українська) · [🇷🇺 Русский](#русский) · [🇬🇧 English](#english)

![1C: Query Constructor](assets/images/constructor.png)

---

## Українська

Візуальний конструктор запитів 1С для VS Code — аналог «Конструктора запиту» з
Конфігуратора/EDT. Працює з конфігурацією 1С, вивантаженою у файли (`.xml` —
метадані, `.bsl` — код): будує дерево «таблиці → поля → типи → зв'язки», дає
зібрати запит мишею і генерує текст мовою запитів 1С (SDBL).

### Можливості

- Парсинг метаданих конфігурації в кеш (без Конфігуратора/EDT).
- Візуальна побудова запиту — таблиці, поля, умови, групування, з'єднання,
  об'єднання, тимчасові таблиці, пакет запитів.
- Пошук по дереву метаданих за кількома ключовими словами одразу, з
  підсвіткою збігів і навігацією між результатами (стрілочки/`Enter`).
- Підсвітка синтаксису SDBL (ключові слова, функції, рядки, дати, параметри)
  у тексті запиту й виразів.
- Відкриття вже збереженого тексту запиту з перевіркою синтаксису й наявності
  таблиць у метаданих.
- Ручне редагування тексту запиту з поверненням правок у модель конструктора.
- Збереження коментарів `//…` у тексті запиту між циклами «відкрити → правити
  → зберегти».
- (Експериментально, вимкнено за замовчуванням) нове вікно «Текст запроса»:
  тулбар (форматування, перевірка, пошук), панелі «Структура»/«Параметри»,
  захист від втрати незбережених змін — вмикається налаштуванням
  `queryConsole.queryTextEditorV2`.

### Як користуватись

1. У файлі `.bsl` викликати команду **«1С: Конструктор запроса»** — з
   контекстного меню (права кнопка миші) або палітри команд (`Ctrl+Shift+P`).
2. Якщо курсор стоїть усередині вже збереженого запиту — відкриється саме він;
   інакше розширення запропонує створити новий.
3. Зберіть запит мишею (вкладки «Таблиці і поля», «Умови», «Групування» тощо),
   або натисніть **«Запрос»** внизу, щоб побачити й за потреби вручну
   відредагувати текст SDBL — кнопка **«Применить»** перепарсить правки назад
   у модель конструктора (з тією ж перевіркою, що й при відкритті запиту).
4. **ОК** — вставляє (для нового запиту) або замінює (для вже відкритого)
   текст у позиції курсора, у форматі, потрібному синтаксису 1С (рядковий
   літерал з переносами `|`).

Прапорець **«Сохранять комментарии»** (увімкнено за замовчуванням) визначає,
чи переживуть коментарі `//…` цикл правки. Вони прив'язані до полів/контейнерів
запиту, а не до позиції в тексті, тому переживають перестановку полів і
зникають разом зі своїм полем.

### Кеш метаданих

Конструктор працює з кешем розібраних метаданих, а не з вивантаженням напряму.

- Шлях до вивантаження автовизначається (пошук `Configuration.xml` по всій
  робочій області) або задається вручну через `queryConsole.metadataPath`.
- Після зміни метаданих конфігурації натисніть **«Обновить кэш»** — це
  перепарсить вивантаження.

### Налаштування

| Налаштування | Опис |
|---|---|
| `queryConsole.metadataPath` | Шлях до каталогу вивантаження `cf` (пусто → автовизначення) |
| `queryConsole.parserOutputPath` | Каталог результату парсингу (за замовчуванням `tmp/parser_data`) |
| `queryConsole.openInNewWindow` | Відкривати конструктор в окремому вікні VS Code |
| `queryConsole.queryTextEditorV2` | Експериментальне вікно «Текст запроса» v2 (вимкнено за замовчуванням) |

### Розробка

Архітектура, структура коду, збірка з джерел, тести й реліз — у
[`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md).

---

## Русский

Визуальный конструктор запросов 1С для VS Code — аналог «Конструктора запроса»
из Конфигуратора/EDT. Работает с конфигурацией 1С, выгруженной в файлы
(`.xml` — метаданные, `.bsl` — код): строит дерево «таблицы → поля → типы →
связи», даёт собрать запрос мышью и генерирует текст на языке запросов 1С
(SDBL).

### Возможности

- Парсинг метаданных конфигурации в кэш (без Конфигуратора/EDT).
- Визуальное построение запроса — таблицы, поля, условия, группировка,
  соединения, объединения, временные таблицы, пакет запросов.
- Поиск по дереву метаданных сразу по нескольким ключевым словам, с
  подсветкой совпадений и навигацией между результатами (стрелочки/`Enter`).
- Подсветка синтаксиса SDBL (ключевые слова, функции, строки, даты,
  параметры) в тексте запроса и выражений.
- Открытие уже сохранённого текста запроса с проверкой синтаксиса и наличия
  таблиц в метаданных.
- Ручное редактирование текста запроса с возвратом правок в модель
  конструктора.
- Сохранение комментариев `//…` в тексте запроса между циклами «открыть →
  править → сохранить».
- (Экспериментально, выключено по умолчанию) новое окно «Текст запроса»:
  тулбар (форматирование, проверка, поиск), панели «Структура»/«Параметры»,
  защита от потери несохранённых изменений — включается настройкой
  `queryConsole.queryTextEditorV2`.

### Как пользоваться

1. В файле `.bsl` вызвать команду **«1С: Конструктор запроса»** — из
   контекстного меню (правая кнопка мыши) или палитры команд
   (`Ctrl+Shift+P`).
2. Если курсор стоит внутри уже сохранённого запроса — откроется именно он;
   иначе расширение предложит создать новый.
3. Соберите запрос мышью (вкладки «Таблицы и поля», «Условия», «Группировка»
   и т.д.), либо нажмите **«Запрос»** внизу, чтобы увидеть и при необходимости
   вручную отредактировать текст SDBL — кнопка **«Применить»** перепарсит
   правки обратно в модель конструктора (с той же проверкой, что и при
   открытии запроса).
4. **ОК** — вставляет (для нового запроса) или заменяет (для уже открытого)
   текст в позиции курсора, в формате, требуемом синтаксисом 1С (строковый
   литерал с переносами `|`).

Флажок **«Сохранять комментарии»** (включён по умолчанию) определяет,
переживут ли комментарии `//…` цикл правки. Они привязаны к полям/контейнерам
запроса, а не к позиции в тексте, поэтому переживают перестановку полей и
исчезают вместе со своим полем.

### Кэш метаданных

Конструктор работает с кэшем разобранных метаданных, а не с выгрузкой
напрямую.

- Путь к выгрузке автоопределяется (поиск `Configuration.xml` по всей рабочей
  области) или задаётся вручную через `queryConsole.metadataPath`.
- После изменения метаданных конфигурации нажмите **«Обновить кэш»** — это
  перепарсит выгрузку.

### Настройки

| Настройка | Описание |
|---|---|
| `queryConsole.metadataPath` | Путь к каталогу выгрузки `cf` (пусто → автоопределение) |
| `queryConsole.parserOutputPath` | Каталог результата парсинга (по умолчанию `tmp/parser_data`) |
| `queryConsole.openInNewWindow` | Открывать конструктор в отдельном окне VS Code |
| `queryConsole.queryTextEditorV2` | Экспериментальное окно «Текст запроса» v2 (выключено по умолчанию) |

### Разработка

Архитектура, структура кода, сборка из исходников, тесты и релиз — в
[`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md).

---

## English

A visual SDBL query constructor for 1C in VS Code — equivalent to the "Query
Constructor" from Configurator/EDT. Works against a 1C configuration exported
to files (`.xml` — metadata, `.bsl` — code): builds a "tables → fields →
types → joins" tree, lets you assemble a query with the mouse, and generates
1C query-language (SDBL) text.

### Features

- Parses configuration metadata into a cache (no Configurator/EDT needed).
- Visual query building — tables, fields, conditions, grouping, joins,
  unions, temp tables, query batches.
- Multi-keyword search across the metadata tree, with match highlighting and
  next/previous navigation (arrows/`Enter`).
- SDBL syntax highlighting (keywords, functions, strings, dates, parameters)
  in the query and expression text.
- Opens an existing query's text with syntax and metadata validation.
- Manual text editing that round-trips back into the constructor's model.
- Preserves `//…` comments in the query text across edit cycles.
- (Experimental, off by default) a new "Query text" dialog: toolbar (format,
  check, search), "Structure"/"Parameters" panels, unsaved-changes
  protection — enabled via `queryConsole.queryTextEditorV2`.

### Usage

1. In a `.bsl` file, run **"1С: Конструктор запроса"** — from the right-click
   context menu or the command palette (`Ctrl+Shift+P`).
2. If the cursor is inside an existing saved query, that query opens; if not,
   the extension offers to start a new one.
3. Build the query with the mouse ("Tables and fields", "Conditions",
   "Grouping", etc.), or click **"Запрос"** at the bottom to view — and if
   needed, hand-edit — the generated SDBL text. **"Применить"** re-parses
   your edits back into the constructor's model, with the same validation
   used when opening a query.
4. **OK** inserts (for a new query) or replaces (for an already-open one) the
   text at the cursor, formatted the way 1C's syntax requires (a string
   literal with `|` line continuations).

The **"Сохранять комментарии"** checkbox (on by default) controls whether
`//…` comments survive an edit cycle. They're attached to the query's
fields/containers rather than to a text position, so they survive field
reordering and disappear along with their field.

### Metadata cache

The constructor works off a cache of parsed metadata rather than the raw
export.

- The export path is auto-detected (searches the workspace for
  `Configuration.xml`) or set explicitly via `queryConsole.metadataPath`.
- After changing the configuration's metadata, click **"Обновить кэш"** to
  re-parse the export.

### Settings

| Setting | Description |
|---|---|
| `queryConsole.metadataPath` | Path to the `cf` export directory (empty → auto-detect) |
| `queryConsole.parserOutputPath` | Directory for parser output (default `tmp/parser_data`) |
| `queryConsole.openInNewWindow` | Open the constructor in a separate VS Code window |
| `queryConsole.queryTextEditorV2` | Experimental "Query text" v2 dialog (off by default) |

### Development

Architecture, code layout, building from source, tests and releases — see
[`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md).

---

## Лицензия / License

MIT — see [`LICENSE`](LICENSE). Third-party notices (icons) —
[`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).

This project started as a fork of
[AlekseyUAM/query_console_vscode](https://github.com/AlekseyUAM/query_console_vscode)
(original author: Aleksey Yudanov, [overview article](https://infostart.ru/1c/articles/2724730/))
and is now developed and maintained independently.
