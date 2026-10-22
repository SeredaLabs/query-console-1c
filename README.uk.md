<!--
source_version: 8
translation_status: current
-->

<p align="center">
  <img src="assets/images/readme-hero.png" alt="1C: Конструктор запитів — візуальне проєктування запитів SDBL з урахуванням метаданих у VS Code">
</p>

<p>
  <a href="https://github.com/SeredaLabs/query-console-1c/blob/main/README.ru.md" title="Русский">
    <picture>
      <source media="(max-width: 1000px)" srcset="https://raw.githubusercontent.com/SeredaLabs/query-console-1c/main/assets/images/lang/ru-icon.png">
      <img align="right" src="https://raw.githubusercontent.com/SeredaLabs/query-console-1c/main/assets/images/lang/ru-button.png" alt="Русский" height="32">
    </picture>
  </a>
  <a href="https://github.com/SeredaLabs/query-console-1c/blob/main/README.uk.md" title="Українська">
    <picture>
      <source media="(max-width: 1000px)" srcset="https://raw.githubusercontent.com/SeredaLabs/query-console-1c/main/assets/images/lang/uk-icon-active.png">
      <img align="right" src="https://raw.githubusercontent.com/SeredaLabs/query-console-1c/main/assets/images/lang/uk-button-active.png" alt="Українська" height="32">
    </picture>
  </a>
  <a href="https://github.com/SeredaLabs/query-console-1c/blob/main/README.md" title="English">
    <picture>
      <source media="(max-width: 1000px)" srcset="https://raw.githubusercontent.com/SeredaLabs/query-console-1c/main/assets/images/lang/en-icon.png">
      <img align="right" src="https://raw.githubusercontent.com/SeredaLabs/query-console-1c/main/assets/images/lang/en-button.png" alt="English" height="32">
    </picture>
  </a>
  <a href="https://marketplace.visualstudio.com/items?itemName=SeredaLabs.query-console-1c"><img src="https://img.shields.io/badge/VS_Code-Marketplace-397FD8?style=flat-square&logo=visualstudiocode&logoColor=white" alt="Установити з VS Code Marketplace"></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=SeredaLabs.query-console-1c"><img src="https://vsmarketplacebadges.dev/version-short/SeredaLabs.query-console-1c.svg" alt="Версія у VS Code Marketplace"></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=SeredaLabs.query-console-1c"><img src="https://vsmarketplacebadges.dev/installs-short/SeredaLabs.query-console-1c.svg" alt="Кількість установлень із VS Code Marketplace"></a>
  <img src="https://img.shields.io/badge/VS_Code-1.90%2B-4B5563?style=flat-square" alt="Потрібен VS Code 1.90 або новіший">
  <a href="https://github.com/SeredaLabs/query-console-1c/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-0F766E?style=flat-square" alt="Ліцензія MIT"></a>
</p>

<br clear="both">

🧩 **1C: Конструктор запитів** — розширення VS Code для візуального створення й
редагування SDBL-запитів з урахуванням метаданих та вставлення їх як статичних
BSL-рядків — без підключення до бази й виконання запиту.

![Демонстрація українською: пошук метаданих, новий редактор довільних виразів із шаблонами функцій та автодоповненням, редагування SDBL і відновлення після помилкової правки](docs/images/query-constructor-demo.uk.gif)

[Переглянути відео (WebM)](docs/videos/query-constructor-demo.uk.webm) ·
[Пояснення демонстрації](docs/uk/query-designer.md#-сценарій-демонстрації)

Записано з Classic WebView на тестових метаданих із редактором **Текст запиту**.
Інтерфейс і пояснення локалізовано; ключові слова SDBL та імена метаданих
не змінюються. Запит не виконується.

## ✨ Що вміє розширення

| Можливість | Доступні інструменти |
| --- | --- |
| 🧩 **Візуальне конструювання** | Таблиці, поля, з’єднання, умови, групування, сортування та підсумки |
| 🧱 **Складна структура запиту** | Об’єднання, тимчасові таблиці, пакети, параметри віртуальних таблиць та індекси |
| 🗂️ **Робота з метаданими** | Пошук, типи полів і зв’язки з файлового XML-вивантаження 1С |
| 🔍 **Підказки, автодоповнення та діагностика** | Підказки по полях/таблицях/віртуальних таблицях/параметрах, автодоповнення по `.`/`&` і попередження про розбір — прямо в тексті запиту, без конструктора |
| 🔄 **Повторне редагування** | Розбір, перевірка, форматування, відкриття та заміна підтримуваних статичних SDBL-рядків |
| 🧪 **Інструменти тексту запиту** | Коментарі, редактор виразів і редактор «Текст запиту» з форматуванням, перевіркою, структурою та параметрами |
| 🌍 **Локалізований інтерфейс** | Англійська, українська та російська мови інтерфейсу й документації |

## 🚀 Швидкий старт

1. Установіть розширення з [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=SeredaLabs.query-console-1c).
2. Відкрийте `.bsl` і поставте курсор у статичний запит або місце вставлення.
3. У контекстному меню редактора виберіть **1С: Конструктор запитів**, а потім
   **Лише текст запиту** або **З кодом обробки результату**.
4. Побудуйте запит і натисніть **ОК**, щоб вставити або замінити BSL-рядок.

> ⚠️ **Важливо:** Варіант з обробкою результату генерує BSL-обгортку.
> Розширення не підключається до бази 1С і не виконує запити.

## 🧪 Експериментальний Новий конструктор

Canvas має завершений функціональний baseline редагування й залишається
необов’язковим Preview. Увімкніть `queryConsole.enableNewBuilderPreview`, потім
виконайте **1C: Новий конструктор (Preview)** у палітрі команд. Він підтримує
рекурсивні підзапити-джерела, тимчасові таблиці, основні форми віртуальних
таблиць, підсумки/індекси, UNION і контекстний редактор виразів. Межі можливостей,
які лише зберігаються, визначає [актуальна матриця](docs/design/new-builder/feature-baseline.md).
UX/accessibility та підготовка релізу залишаються окремою роботою; Classic доступний.

## 🗂️ Налаштування метаданих

Укажіть у `queryConsole.metadataPath` каталог `cf` файлового XML-вивантаження
або залиште значення порожнім для пошуку `Configuration.xml` у робочій області.
Після зміни вивантаження виконайте команду **1С: Перебудувати індекс метаданих**.

## ✅ Вимоги

- VS Code 1.90 або новіший.
- Відкритий у редакторі файл `.bsl`.
- Файлове XML-вивантаження з 1C:Enterprise або BAS для роботи з метаданими.

## ⚠️ Відомі обмеження

- Повторно відкрити можна лише підтримувані статичні BSL-рядки.
- Перевірка не є повним компілятором 1С.
- Деякі форми параметрів віртуальних таблиць не можна безпечно відтворити.

- Коментарі зберігаються, але коментар усередині виразу може переміститися до заголовка секції.

Перед роботою зі складним або згенерованим текстом перегляньте
[повний перелік обмежень](docs/uk/limitations.md).

## 📚 Документація

| Початок роботи | Ресурси проєкту |
| --- | --- |
| [Посібник користувача](docs/uk/index.md) | [Посібник розробника англійською](docs/development/index.md) |
| [Початок роботи](docs/uk/getting-started.md) | [Як зробити внесок](CONTRIBUTING.md) |
| [Конструктор запитів](docs/uk/query-designer.md) | [Журнал змін](CHANGELOG.md) |
| [Підказки, автодоповнення та діагностика](docs/uk/hover-and-completion.md) | [Відомі проблеми англійською](docs/development/known-issues.md) |
| [Усунення проблем](docs/uk/troubleshooting.md) | |

## 💬 Зворотний зв’язок

Повідомляйте про відтворювані помилки та пропозиції у
[GitHub Issues](https://github.com/SeredaLabs/query-console-1c/issues). Не додавайте
конфіденційні конфігурації.

## 📄 Ліцензія та авторство

MIT — див. [LICENSE](LICENSE). Атрибуцію сторонніх матеріалів наведено у
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
