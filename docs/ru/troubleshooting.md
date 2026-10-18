<!--
source_version: 3
translation_status: current
-->

<h1>
  <a href="../ru/troubleshooting.md" title="Русский">
    <picture>
      <source media="(max-width: 1000px)" srcset="../../assets/images/lang/ru-icon-active.svg">
      <img align="right" src="../../assets/images/lang/ru-button-active.svg" alt="Русский" height="32">
    </picture>
  </a>
  <a href="../uk/troubleshooting.md" title="Українська">
    <picture>
      <source media="(max-width: 1000px)" srcset="../../assets/images/lang/uk-icon.svg">
      <img align="right" src="../../assets/images/lang/uk-button.svg" alt="Українська" height="32">
    </picture>
  </a>
  <a href="../en/troubleshooting.md" title="English">
    <picture>
      <source media="(max-width: 1000px)" srcset="../../assets/images/lang/en-icon.svg">
      <img align="right" src="../../assets/images/lang/en-button.svg" alt="English" height="32">
    </picture>
  </a>
  🧯 Устранение проблем
</h1>

## ❓ Команда отсутствует

Контекстное подменю отображается только для `.bsl`. Команду **1С: Перестроить
индекс метаданных** ищите в палитре команд. Проверьте, что расширение включено, а версия
VS Code — 1.90 или новее.

## 🔍 Запрос не обнаружен

Поместите курсор внутрь статической BSL-строки. SDBL должен начинаться с
`ВЫБРАТЬ`, `УНИЧТОЖИТЬ`, `SELECT` или `DROP` после комментариев и пробелов;
строка `SELECT` с кодом нативного SQL (`--`, `/* */`, `@name`, `[name]`)
пропускается. Динамическая
конкатенация не поддерживается.

## 🗂️ Нет таблиц или полей

Проверьте `queryConsole.metadataPath` и наличие `Configuration.xml`, затем
выполните **1С: Перестроить индекс метаданных**. Устаревший кеш обычно перестраивается
автоматически при следующем открытии; команда форсирует перестройку раньше.

## ❌ Изменения текста не применяются

Ручное изменение невозможно представить текущей моделью. Упростите копию до
поддерживаемой конструкции или отмените операцию, чтобы сохранить прежнюю модель.
См. [⚠️ ограничения](limitations.md) перед повторной попыткой.

## 💬 Как сообщить о воспроизводимой проблеме

Приложите версии VS Code и расширения, ОС, настройки, наименьший безопасный
запрос и точные шаги. Не публикуйте конфиденциальную выгрузку конфигурации.
