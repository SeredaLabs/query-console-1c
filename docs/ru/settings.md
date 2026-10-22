<!--
source_version: 6
translation_status: current
-->

<h1>
  <a href="../ru/settings.md" title="Русский">
    <picture>
      <source media="(max-width: 1000px)" srcset="../../assets/images/lang/ru-icon-active.svg">
      <img align="right" src="../../assets/images/lang/ru-button-active.svg" alt="Русский" height="32">
    </picture>
  </a>
  <a href="../uk/settings.md" title="Українська">
    <picture>
      <source media="(max-width: 1000px)" srcset="../../assets/images/lang/uk-icon.svg">
      <img align="right" src="../../assets/images/lang/uk-button.svg" alt="Українська" height="32">
    </picture>
  </a>
  <a href="../en/settings.md" title="English">
    <picture>
      <source media="(max-width: 1000px)" srcset="../../assets/images/lang/en-icon.svg">
      <img align="right" src="../../assets/images/lang/en-button.svg" alt="English" height="32">
    </picture>
  </a>
  ⚙️ Настройки
</h1>

## 📋 Доступные настройки

| Настройка | По умолчанию | Действие |
|---|---:|---|
| `queryConsole.metadataPath` | пусто | Каталог `cf`; пустое значение включает поиск |
| `queryConsole.parserOutputPath` | `tmp/parser_data` | Каталог производных метаданных и кеша |
| `queryConsole.openInNewWindow` | `true` | Открыть конструктор в отдельном окне VS Code и включить компактный режим, если он поддерживается |
| `queryConsole.queryDiagnosticsEnabled` | `true` | Предупреждать о литерале запроса, который конструктор не разбирает или не применит |
| `queryConsole.enableNewBuilderPreview` | `false` | Показать Canvas Preview; функциональный baseline завершён, UX/release review продолжается |

## 🗺️ Область и пути

Используются настройки активной рабочей области. `metadataPath` должен быть
абсолютным; относительный `parserOutputPath` разрешается от корня первой рабочей области.

Изменение пути не перестраивает метаданные автоматически. После него выполните
**1С: Перестроить индекс метаданных**.
