---
source_version: 2
translation_status: current
---

# Налаштування

[English](../en/settings.md) · [Українська](../uk/settings.md) · [Русский](../ru/settings.md)

## Доступні налаштування

| Налаштування | Типово | Дія |
|---|---:|---|
| `queryConsole.metadataPath` | порожньо | Каталог `cf`; порожнє значення вмикає пошук |
| `queryConsole.parserOutputPath` | `tmp/parser_data` | Каталог похідних метаданих і кешу |
| `queryConsole.openInNewWindow` | `true` | Відкрити конструктор в окремому вікні VS Code |
| `queryConsole.queryTextEditorV2` | `false` | Увімкнути експериментальний редактор v2 |

## Область і шляхи

Використовуються налаштування активної робочої області. `metadataPath` має бути
абсолютним; відносний `parserOutputPath` розв’язується від кореня першої робочої області.

Зміна шляху не перебудовує метадані автоматично. Після неї виконайте
**1С: Перебудувати індекс метаданих**.
