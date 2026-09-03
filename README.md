# 1C: Query Constructor

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/SeredaLabs.query-console-1c?label=VS%20Code%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=SeredaLabs.query-console-1c)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/SeredaLabs.query-console-1c?label=Installs)](https://marketplace.visualstudio.com/items?itemName=SeredaLabs.query-console-1c)
[![License: MIT](https://img.shields.io/badge/license-MIT-0f766e.svg)](LICENSE)

> A visual SDBL query constructor for 1C in VS Code.

![1C: Query Constructor](assets/images/constructor.png)

[🇺🇦 Українська](#-українська) · [🇷🇺 Русский](#-русский) · [🇬🇧 English](#-english)

---

## 🇺🇦 Українська

### Що це

**1C: Query Constructor** -- візуальний конструктор запитів 1С для VS Code,
натхненний «Конструктором запиту» з Конфігуратора та EDT. Він читає XML-вивантаження
конфігурації, будує дерево таблиць і полів та генерує SDBL-запит у форматі BSL-рядка.

**Потрібно:** VS Code 1.90+ і, для роботи з метаданими, файлове XML-вивантаження
конфігурації 1С.

### Можливості

- Візуальна побудова запитів: таблиці, поля, умови, групування, з'єднання,
  об'єднання, тимчасові таблиці та пакетні запити.
- Дерево метаданих «таблиці → поля → типи → зв'язки» з багатослівним пошуком.
- Відкриття підтримуваного SDBL-тексту під курсором, структурна перевірка та
  повернення ручних правок у модель конструктора.
- Підсвітка SDBL, форматування виразів і збереження коментарів `//...` між
  циклами «відкрити → правити → зберегти».
- Експериментальний редактор «Текст запроса» v2 з перевіркою, пошуком і панелями
  «Структура»/«Параметри».

### Швидкий старт

1. Встановіть розширення з [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=SeredaLabs.query-console-1c).
2. Відкрийте `.bsl` файл, поставте курсор у запит або в потрібну позицію.
3. Оберіть у контекстному меню **«1С: Конструктор запроса»** →
   **«Только текст запроса»** або **«С обработкой результата»**.
4. Зберіть або відредагуйте запит, натисніть **«ОК»** -- розширення вставить новий
   або замінить відкритий BSL-літерал.

Для конфігурації з власними таблицями вкажіть шлях до XML-вивантаження або
дозвольте розширенню знайти `Configuration.xml`, після чого натисніть
**«Обновить кэш»**.

### Команди та налаштування

| Команда | Призначення |
|---|---|
| `1С: Только текст запроса` | Відкрити конструктор без обробки результату |
| `1С: С обработкой результата` | Відкрити конструктор у сценарії з обробкою результату |
| `1С: Распарсить метаданные в YAML` | Примусово перебудувати metadata cache |

| Налаштування | Призначення |
|---|---|
| `queryConsole.metadataPath` | Шлях до каталогу XML-вивантаження `cf`; порожній -- автовизначення |
| `queryConsole.parserOutputPath` | Каталог metadata cache; за замовчуванням `tmp/parser_data` |
| `queryConsole.openInNewWindow` | Відкривати конструктор в окремому вікні VS Code |
| `queryConsole.queryTextEditorV2` | Увімкнути експериментальний редактор тексту запиту v2 |

### Важливо знати

- Валідація не є повним компілятором SDBL: вона не гарантує коректність усіх
  довільних виразів, полів і навігації через крапку.
- Пошук запиту під курсором підтримує статичні BSL-рядки, що починаються з
  `ВЫБРАТЬ` або `УНИЧТОЖИТЬ`.
- Round-trip небезпечний для `РегистрБухгалтерии.*.Субконто(...)` та деяких
  віртуальних таблиць із трьома+ параметрами. Не застосовуйте до них ручні зміни
  через конструктор до виправлення.

Повні межі підтримки: [CORE_LIMITATIONS.md](docs/CORE_LIMITATIONS.md).

### Документація та внесок

[Документація проєкту](docs/README.md) містить архітектуру, поточні відомі
проблеми, roadmap, інструкції розробки та corpus testing.

---

## 🇷🇺 Русский

### Что это

**1C: Query Constructor** -- визуальный конструктор запросов 1С для VS Code,
вдохновлённый «Конструктором запроса» из Конфигуратора и EDT. Он читает
XML-выгрузку конфигурации, строит дерево таблиц и полей и генерирует SDBL-запрос
в формате BSL-строки.

**Требуется:** VS Code 1.90+ и, для работы с метаданными, файловая XML-выгрузка
конфигурации 1С.

### Возможности

- Визуальное построение запросов: таблицы, поля, условия, группировка, соединения,
  объединения, временные таблицы и пакетные запросы.
- Дерево метаданных «таблицы → поля → типы → связи» с поиском по нескольким словам.
- Открытие поддерживаемого SDBL-текста под курсором, структурная проверка и
  возврат ручных правок в модель конструктора.
- Подсветка SDBL, форматирование выражений и сохранение комментариев `//...`
  между циклами «открыть → править → сохранить».
- Экспериментальный редактор «Текст запроса» v2 с проверкой, поиском и панелями
  «Структура»/«Параметры».

### Быстрый старт

1. Установите расширение из [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=SeredaLabs.query-console-1c).
2. Откройте `.bsl` файл, поставьте курсор в запрос или в нужную позицию.
3. Выберите в контекстном меню **«1С: Конструктор запроса»** →
   **«Только текст запроса»** или **«С обработкой результата»**.
4. Соберите или отредактируйте запрос, нажмите **«ОК»** -- расширение вставит новый
   или заменит открытый BSL-литерал.

Для конфигурации с собственными таблицами укажите путь к XML-выгрузке или
разрешите расширению найти `Configuration.xml`, затем нажмите **«Обновить кэш»**.

### Команды и настройки

| Команда | Назначение |
|---|---|
| `1С: Только текст запроса` | Открыть конструктор без обработки результата |
| `1С: С обработкой результата` | Открыть конструктор в сценарии с обработкой результата |
| `1С: Распарсить метаданные в YAML` | Принудительно пересобрать metadata cache |

| Настройка | Назначение |
|---|---|
| `queryConsole.metadataPath` | Путь к каталогу XML-выгрузки `cf`; пусто -- автоопределение |
| `queryConsole.parserOutputPath` | Каталог metadata cache; по умолчанию `tmp/parser_data` |
| `queryConsole.openInNewWindow` | Открывать конструктор в отдельном окне VS Code |
| `queryConsole.queryTextEditorV2` | Включить экспериментальный редактор текста запроса v2 |

### Важно знать

- Валидация не является полным компилятором SDBL: она не гарантирует корректность
  всех произвольных выражений, полей и навигации через точку.
- Поиск запроса под курсором поддерживает статические BSL-строки, начинающиеся с
  `ВЫБРАТЬ` или `УНИЧТОЖИТЬ`.
- Round-trip небезопасен для `РегистрБухгалтерии.*.Субконто(...)` и некоторых
  виртуальных таблиц с тремя+ параметрами. Не применяйте к ним ручные изменения
  через конструктор до исправления.

Полные границы поддержки: [CORE_LIMITATIONS.md](docs/CORE_LIMITATIONS.md).

### Документация и участие

[Документация проекта](docs/README.md) содержит архитектуру, текущие известные
проблемы, roadmap, инструкции разработки и corpus testing.

---

## 🇬🇧 English

### What It Is

**1C: Query Constructor** is a visual SDBL query constructor for VS Code,
inspired by the query constructor in 1C Configurator and EDT. It reads a 1C
configuration XML export, builds a table-and-field tree, and emits an SDBL query
as a BSL string literal.

**Requirements:** VS Code 1.90+ and, for metadata-aware work, a file-based XML
export of a 1C configuration.

### Highlights

- Visual query building: tables, fields, conditions, grouping, joins, unions,
  temporary tables, and query batches.
- A metadata tree of tables, fields, types, and relations with multi-keyword search.
- Opening supported SDBL text at the cursor, structural validation, and manual
  edits that round-trip into the constructor model.
- SDBL highlighting, expression formatting, and `//...` comment preservation
  across open, edit, and save cycles.
- An experimental Query Text v2 editor with validation, search, and Structure /
  Parameters panels.

### Quick Start

1. Install the extension from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=SeredaLabs.query-console-1c).
2. Open a `.bsl` file and place the cursor in a query or at the desired insertion point.
3. In the context menu choose **"1С: Конструктор запроса"** →
   **"Только текст запроса"** or **"С обработкой результата"**.
4. Build or edit the query, then select **OK**. The extension inserts a new BSL
   literal or replaces the one that was opened.

For a configuration with custom tables, set the XML-export path or let the
extension find `Configuration.xml`, then select **"Обновить кэш"**.

### Commands and Settings

| Command | Purpose |
|---|---|
| `1С: Только текст запроса` | Open the constructor without result handling |
| `1С: С обработкой результата` | Open the constructor in the result-handling flow |
| `1С: Распарсить метаданные в YAML` | Force a metadata-cache rebuild |

| Setting | Purpose |
|---|---|
| `queryConsole.metadataPath` | Path to the `cf` XML export; empty means auto-detect |
| `queryConsole.parserOutputPath` | Metadata-cache directory; defaults to `tmp/parser_data` |
| `queryConsole.openInNewWindow` | Open the constructor in a separate VS Code window |
| `queryConsole.queryTextEditorV2` | Enable the experimental Query Text v2 editor |

### Important Limitations

- Validation is not a complete SDBL compiler: it does not guarantee every
  arbitrary expression, field, or dotted navigation.
- Cursor lookup supports static BSL strings beginning with `ВЫБРАТЬ` or
  `УНИЧТОЖИТЬ`.
- Round-tripping is unsafe for `РегистрБухгалтерии.*.Субконто(...)` and some
  virtual tables with three or more parameters. Do not apply manual edits to
  these queries through the constructor until this is fixed.

Read the complete [core limitations](docs/CORE_LIMITATIONS.md).

### Documentation and Contributing

The [project documentation](docs/README.md) covers architecture, current known
issues, the roadmap, development, and corpus testing.

---

## License

MIT -- see [LICENSE](LICENSE). Third-party notices for icons are in
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

This project started as a fork of
[AlekseyUAM/query_console_vscode](https://github.com/AlekseyUAM/query_console_vscode)
(original author: Aleksey Yudanov, [overview article](https://infostart.ru/1c/articles/2724730/))
and is now developed and maintained independently.
