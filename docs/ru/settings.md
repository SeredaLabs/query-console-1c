---
source_version: 3
translation_status: current
---

# ⚙️ Настройки

[English](../en/settings.md) · [Українська](../uk/settings.md) · [Русский](../ru/settings.md)

## 📋 Доступные настройки

| Настройка | По умолчанию | Действие |
|---|---:|---|
| `queryConsole.metadataPath` | пусто | Каталог `cf`; пустое значение включает поиск |
| `queryConsole.parserOutputPath` | `tmp/parser_data` | Каталог производных метаданных и кеша |
| `queryConsole.openInNewWindow` | `true` | Открыть конструктор в отдельном окне VS Code |
| `queryConsole.queryTextEditorV2` | `false` | Включить экспериментальный редактор v2 |

## 🗺️ Область и пути

Используются настройки активной рабочей области. `metadataPath` должен быть
абсолютным; относительный `parserOutputPath` разрешается от корня первой рабочей области.

Изменение пути не перестраивает метаданные автоматически. После него выполните
**1С: Перестроить индекс метаданных**.
