<p align="center">
  <img src="assets/images/readme-hero.png" alt="1C: Конструктор запросов — визуальное проектирование запросов SDBL с учётом метаданных в VS Code">
</p>

<p>
  <a href="https://github.com/SeredaLabs/query-console-1c/blob/main/README.ru.md"><img align="right" src="https://img.shields.io/badge/%F0%9F%87%B7%F0%9F%87%BA-%D0%A0%D1%83%D1%81%D1%81%D0%BA%D0%B8%D0%B9-397FD8?style=flat-square" alt="Документация на русском"></a>
  <a href="https://github.com/SeredaLabs/query-console-1c/blob/main/README.uk.md"><img align="right" src="https://img.shields.io/badge/%F0%9F%87%BA%F0%9F%87%A6-%D0%A3%D0%BA%D1%80%D0%B0%D1%97%D0%BD%D1%81%D1%8C%D0%BA%D0%B0-3B4658?style=flat-square" alt="Документація українською"></a>
  <a href="https://github.com/SeredaLabs/query-console-1c/blob/main/README.md"><img align="right" src="https://img.shields.io/badge/%F0%9F%87%AC%F0%9F%87%A7-English-3B4658?style=flat-square" alt="English documentation"></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=SeredaLabs.query-console-1c"><img src="https://img.shields.io/badge/VS_Code-Marketplace-397FD8?style=flat-square&logo=visualstudiocode&logoColor=white" alt="Установить из VS Code Marketplace"></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=SeredaLabs.query-console-1c"><img src="https://vsmarketplacebadges.dev/version-short/SeredaLabs.query-console-1c.svg" alt="Версия в VS Code Marketplace"></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=SeredaLabs.query-console-1c"><img src="https://vsmarketplacebadges.dev/installs-short/SeredaLabs.query-console-1c.svg" alt="Количество установок из VS Code Marketplace"></a>
  <img src="https://img.shields.io/badge/VS_Code-1.90%2B-4B5563?style=flat-square" alt="Требуется VS Code 1.90 или новее">
  <a href="https://github.com/SeredaLabs/query-console-1c/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-0F766E?style=flat-square" alt="Лицензия MIT"></a>
</p>

<br clear="both">

🧩 **1C: Конструктор запросов** — расширение VS Code для визуального создания и
редактирования SDBL-запросов с учётом метаданных и вставки их как статических
BSL-строк — без подключения к базе и выполнения запроса.

![Анимированная демонстрация: поиск в метаданных SFK, выбор полей, добавление условия и сортировки и проверка сгенерированного SDBL-запроса](docs/images/query-constructor-demo.gif)

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
После изменения выгрузки выполните команду **1С: Перестроить индекс метаданных**.

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
