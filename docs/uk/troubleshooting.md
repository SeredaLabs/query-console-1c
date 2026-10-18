<!--
source_version: 3
translation_status: current
-->

<h1>
  <a href="../ru/troubleshooting.md" title="Русский">
    <picture>
      <source media="(max-width: 1000px)" srcset="../../assets/images/lang/ru-icon.svg">
      <img align="right" src="../../assets/images/lang/ru-button.svg" alt="Русский" height="32">
    </picture>
  </a>
  <a href="../uk/troubleshooting.md" title="Українська">
    <picture>
      <source media="(max-width: 1000px)" srcset="../../assets/images/lang/uk-icon-active.svg">
      <img align="right" src="../../assets/images/lang/uk-button-active.svg" alt="Українська" height="32">
    </picture>
  </a>
  <a href="../en/troubleshooting.md" title="English">
    <picture>
      <source media="(max-width: 1000px)" srcset="../../assets/images/lang/en-icon.svg">
      <img align="right" src="../../assets/images/lang/en-button.svg" alt="English" height="32">
    </picture>
  </a>
  🧯 Усунення проблем
</h1>

## ❓ Команда відсутня

Контекстне підменю показується лише для `.bsl`. Команду **1С: Перебудувати
індекс метаданих** шукайте в палітрі команд. Перевірте, що розширення ввімкнено, а версія
VS Code — 1.90 або новіша.

## 🔍 Запит не виявлено

Поставте курсор усередину статичного BSL-рядка. SDBL має починатися з `ВЫБРАТЬ`,
`УНИЧТОЖИТЬ`, `SELECT` або `DROP` після коментарів і пробілів; рядок `SELECT` із
кодом нативного SQL (`--`, `/* */`, `@name`, `[name]`) пропускається. Динамічна конкатенація не
підтримується.

## 🗂️ Немає таблиць або полів

Перевірте `queryConsole.metadataPath` і наявність `Configuration.xml`, а потім
виконайте **1С: Перебудувати індекс метаданих**. Застарілий кеш зазвичай перебудовується
автоматично при наступному відкритті; команда форсує перебудову раніше.

## ❌ Не застосовуються зміни тексту

Ручну зміну неможливо подати поточною моделлю. Спростіть копію до підтримуваної
конструкції або скасуйте операцію, щоб зберегти попередню модель. Див.
[⚠️ обмеження](limitations.md) перед повторною спробою.

## 💬 Як повідомити про відтворювану проблему

Додайте версії VS Code і розширення, ОС, налаштування, найменший безпечний запит
і точні кроки. Не публікуйте конфіденційне вивантаження конфігурації.
