<p align="center">
  <img src="assets/images/icon.png" width="112" alt="Иконка 1C: Конструктор запросов">
</p>

<h1 align="center">1C: Конструктор запросов</h1>

<p align="center">
  <strong>Создавайте и редактируйте запросы 1С SDBL визуально, не покидая VS Code.</strong>
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=SeredaLabs.query-console-1c"><img src="https://img.shields.io/visual-studio-marketplace/v/SeredaLabs.query-console-1c?style=flat-square&logo=visualstudiocode&label=Marketplace" alt="Версия в VS Code Marketplace"></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=SeredaLabs.query-console-1c"><img src="https://img.shields.io/visual-studio-marketplace/i/SeredaLabs.query-console-1c?style=flat-square&color=2563eb" alt="Количество установок из VS Code Marketplace"></a>
  <a href="https://github.com/SeredaLabs/query-console-1c/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-0f766e?style=flat-square" alt="Лицензия MIT"></a>
</p>

<p align="center">
  <a href="https://github.com/SeredaLabs/query-console-1c/blob/main/README.md">English</a> · <a href="https://github.com/SeredaLabs/query-console-1c/blob/main/README.uk.md">Українська</a> · <strong>Русский</strong>
</p>

![Конструктор запроса с метаданными, выбранными таблицами и полями](docs/images/query-constructor.png)

Расширение читает файловую выгрузку конфигурации 1С, показывает таблицы и поля
в визуальном конструкторе и записывает результат как статическую BSL-строку.
Поддерживаемый запрос под курсором можно снова открыть для визуального редактирования.

## ✨ Что умеет расширение

| Возможность | Доступные инструменты |
| --- | --- |
| 🧩 **Визуальное конструирование** | Таблицы, поля, соединения, условия, группировка, сортировка и итоги |
| 🧱 **Сложная структура запроса** | Объединения, временные таблицы, пакеты, параметры виртуальных таблиц и индексы |
| 🗂️ **Работа с метаданными** | Поиск, типы полей и связи из файловой XML-выгрузки 1С |
| 🔄 **Повторное редактирование** | Разбор, проверка, форматирование, открытие и замена поддерживаемых статических SDBL-строк |
| 🧪 **Инструменты текста запроса** | Комментарии, редактор выражений и необязательный экспериментальный «Текст запроса v2» |
| 🌍 **Локализованный интерфейс** | Английский, украинский и русский языки интерфейса и документации |

## 🚀 Быстрый старт

1. Установите расширение из [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=SeredaLabs.query-console-1c).
2. Откройте `.bsl` и поместите курсор в статический запрос или место вставки.
3. В контекстном меню редактора выберите **1С: Конструктор запросов**, затем
   **Только текст запроса** или **С кодом обработки результата**.
4. Постройте запрос и нажмите **ОК**, чтобы вставить или заменить BSL-строку.

> ⚠️ **Важно:** Вариант с обработкой результата генерирует BSL-обёртку.
> Расширение не подключается к базе 1С и не выполняет запросы.

## 🗂️ Настройка метаданных

Укажите в `queryConsole.metadataPath` каталог `cf` файловой XML-выгрузки или
оставьте значение пустым для поиска `Configuration.xml` в рабочей области.
После изменения выгрузки выполните команду **1С: Разобрать метаданные в YAML**.

## ✅ Требования

- VS Code 1.90 или новее.
- Открытый в редакторе файл `.bsl`.
- Файловая XML-выгрузка из 1C:Enterprise или BAS для работы с метаданными.

## ⚠️ Известные ограничения

- Повторно открыть можно только поддерживаемые статические BSL-строки.
- Проверка не является полным компилятором 1С.
- Некоторые формы параметров виртуальных таблиц нельзя безопасно восстановить.

Перед работой со сложным или сгенерированным текстом ознакомьтесь с
[полным списком ограничений](docs/ru/limitations.md).

## 📚 Документация

| Начало работы | Ресурсы проекта |
| --- | --- |
| [Руководство пользователя](docs/ru/index.md) | [Руководство разработчика на английском](docs/development/index.md) |
| [Начало работы](docs/ru/getting-started.md) | [Как внести вклад](CONTRIBUTING.md) |
| [Конструктор запросов](docs/ru/query-designer.md) | [Журнал изменений](CHANGELOG.md) |
| [Устранение проблем](docs/ru/troubleshooting.md) | [Известные проблемы на английском](docs/development/known-issues.md) |

## 💬 Обратная связь

Сообщайте о воспроизводимых ошибках и предложениях в
[GitHub Issues](https://github.com/SeredaLabs/query-console-1c/issues). Не
прикладывайте конфиденциальные конфигурации.

## 📄 Лицензия и авторство

MIT — см. [LICENSE](LICENSE). Атрибуция сторонних материалов приведена в
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

Проект начинался как форк
[AlekseyUAM/query_console_vscode](https://github.com/AlekseyUAM/query_console_vscode)
и теперь независимо поддерживается SeredaLabs.
