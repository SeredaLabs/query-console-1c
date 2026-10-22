<!--
source_version: 6
translation_status: current
-->

<h1>
  <a href="../ru/settings.md" title="Русский">
    <picture>
      <source media="(max-width: 1000px)" srcset="../../assets/images/lang/ru-icon.svg">
      <img align="right" src="../../assets/images/lang/ru-button.svg" alt="Русский" height="32">
    </picture>
  </a>
  <a href="../uk/settings.md" title="Українська">
    <picture>
      <source media="(max-width: 1000px)" srcset="../../assets/images/lang/uk-icon-active.svg">
      <img align="right" src="../../assets/images/lang/uk-button-active.svg" alt="Українська" height="32">
    </picture>
  </a>
  <a href="../en/settings.md" title="English">
    <picture>
      <source media="(max-width: 1000px)" srcset="../../assets/images/lang/en-icon.svg">
      <img align="right" src="../../assets/images/lang/en-button.svg" alt="English" height="32">
    </picture>
  </a>
  ⚙️ Налаштування
</h1>

## 📋 Доступні налаштування

| Налаштування | Типово | Дія |
|---|---:|---|
| `queryConsole.metadataPath` | порожньо | Каталог `cf`; порожнє значення вмикає пошук |
| `queryConsole.parserOutputPath` | `tmp/parser_data` | Каталог похідних метаданих і кешу |
| `queryConsole.openInNewWindow` | `true` | Відкрити конструктор в окремому вікні VS Code й увімкнути компактний режим, якщо він підтримується |
| `queryConsole.queryDiagnosticsEnabled` | `true` | Попереджати про літерал запиту, який конструктор не розбирає або не застосує |
| `queryConsole.enableNewBuilderPreview` | `false` | Показати Canvas Preview; функціональний baseline завершено, UX/release review триває |

## 🗺️ Область і шляхи

Використовуються налаштування активної робочої області. `metadataPath` має бути
абсолютним; відносний `parserOutputPath` розв’язується від кореня першої робочої області.

Зміна шляху не перебудовує метадані автоматично. Після неї виконайте
**1С: Перебудувати індекс метаданих**.
