<p align="center">
  <img src="assets/images/readme-hero.png" alt="1C: Конструктор запитів — візуальне проєктування запитів SDBL з урахуванням метаданих у VS Code">
</p>

<p>
  <a href="https://github.com/SeredaLabs/query-console-1c/blob/main/README.ru.md"><img align="right" src="https://img.shields.io/badge/%F0%9F%87%B7%F0%9F%87%BA-%D0%A0%D1%83%D1%81%D1%81%D0%BA%D0%B8%D0%B9-3B4658?style=flat-square" alt="Документация на русском"></a>
  <a href="https://github.com/SeredaLabs/query-console-1c/blob/main/README.uk.md"><img align="right" src="https://img.shields.io/badge/%F0%9F%87%BA%F0%9F%87%A6-%D0%A3%D0%BA%D1%80%D0%B0%D1%97%D0%BD%D1%81%D1%8C%D0%BA%D0%B0-397FD8?style=flat-square" alt="Документація українською"></a>
  <a href="https://github.com/SeredaLabs/query-console-1c/blob/main/README.md"><img align="right" src="https://img.shields.io/badge/%F0%9F%87%AC%F0%9F%87%A7-English-3B4658?style=flat-square" alt="English documentation"></a>
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

![Анімована демонстрація: пошук у метаданих SFK, вибір полів, додавання умови й сортування та перевірка згенерованого SDBL-запиту](docs/images/query-constructor-demo.gif)

## ✨ Що вміє розширення

| Можливість | Доступні інструменти |
| --- | --- |
| 🧩 **Візуальне конструювання** | Таблиці, поля, з’єднання, умови, групування, сортування та підсумки |
| 🧱 **Складна структура запиту** | Об’єднання, тимчасові таблиці, пакети, параметри віртуальних таблиць та індекси |
| 🗂️ **Робота з метаданими** | Пошук, типи полів і зв’язки з файлового XML-вивантаження 1С |
| 🔄 **Повторне редагування** | Розбір, перевірка, форматування, відкриття та заміна підтримуваних статичних SDBL-рядків |
| 🧪 **Інструменти тексту запиту** | Коментарі, редактор виразів і необов’язковий експериментальний «Текст запиту v2» |
| 🌍 **Локалізований інтерфейс** | Англійська, українська та російська мови інтерфейсу й документації |

## 🚀 Швидкий старт

1. Установіть розширення з [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=SeredaLabs.query-console-1c).
2. Відкрийте `.bsl` і поставте курсор у статичний запит або місце вставлення.
3. У контекстному меню редактора виберіть **1С: Конструктор запитів**, а потім
   **Лише текст запиту** або **З кодом обробки результату**.
4. Побудуйте запит і натисніть **ОК**, щоб вставити або замінити BSL-рядок.

> ⚠️ **Важливо:** Варіант з обробкою результату генерує BSL-обгортку.
> Розширення не підключається до бази 1С і не виконує запити.

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

Перед роботою зі складним або згенерованим текстом перегляньте
[повний перелік обмежень](docs/uk/limitations.md).

## 📚 Документація

| Початок роботи | Ресурси проєкту |
| --- | --- |
| [Посібник користувача](docs/uk/index.md) | [Посібник розробника англійською](docs/development/index.md) |
| [Початок роботи](docs/uk/getting-started.md) | [Як зробити внесок](CONTRIBUTING.md) |
| [Конструктор запитів](docs/uk/query-designer.md) | [Журнал змін](CHANGELOG.md) |
| [Усунення проблем](docs/uk/troubleshooting.md) | [Відомі проблеми англійською](docs/development/known-issues.md) |

## 💬 Зворотний зв’язок

Повідомляйте про відтворювані помилки та пропозиції у
[GitHub Issues](https://github.com/SeredaLabs/query-console-1c/issues). Не додавайте
конфіденційні конфігурації.

## 📄 Ліцензія та авторство

MIT — див. [LICENSE](LICENSE). Атрибуцію сторонніх матеріалів наведено у
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

Проєкт розпочався як форк
[AlekseyUAM/query_console_vscode](https://github.com/AlekseyUAM/query_console_vscode)
і тепер незалежно підтримується SeredaLabs.
