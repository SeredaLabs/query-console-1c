# 📚 Документация проекта

> **🟢 Статус:** актуальный индекс. Код и автоматизированные тесты имеют
> приоритет, если они расходятся с текстом.

## 🧭 Быстрая навигация

| Если нужно | Откройте |
|---|---|
| Понять продукт и начать работу | [README.md](../../../README.md) |
| Изменять код или контракты | [ARCHITECTURE.md](ARCHITECTURE.md) → [DEVELOPMENT.md](DEVELOPMENT.md) |
| Проверить безопасность изменений SDBL | [CORE_LIMITATIONS.md](CORE_LIMITATIONS.md) → [KNOWN_ISSUES.md](KNOWN_ISSUES.md) |
| Выбрать следующую работу | [ROADMAP.md](ROADMAP.md) |
| Запустить проверку на конфигурации 1С | [corpus-testing.md](corpus-testing.md) |

---

## 🚀 Начните здесь

- [README.md](../../../README.md) -- возможности, установка и ежедневное использование
  расширения.
- [ARCHITECTURE.md](ARCHITECTURE.md) -- границы слоёв, контракты и потоки данных.
- [ROADMAP.md](ROADMAP.md) -- текущая цель и приоритеты стабилизации.

## 🧠 Состояние ядра

- [1c-query-language.md](1c-query-language.md) -- структурный контракт SDBL-парсера.
- [CORE_LIMITATIONS.md](CORE_LIMITATIONS.md) -- гарантии и границы безопасной
  работы ядра.
- [KNOWN_ISSUES.md](KNOWN_ISSUES.md) -- подтверждённые неисправленные дефекты и
  технический долг.

## 🧪 Разработка и проверка

- [DEVELOPMENT.md](DEVELOPMENT.md) -- локальная разработка, сборка, тесты и релиз.
- [corpus-testing.md](corpus-testing.md) -- воспроизводимая регрессия и запуск
  внешнего corpus/oracle-конвейера.

## 🛠️ Дополнительный tooling

Эти инструменты нужны только для внешнего corpus/oracle-конвейера или исследования
реального конструктора 1С; они не входят в VSIX и не являются CI-gate.

- [tooling/1c-export/README.md](../../../tooling/1c-export/README.md) -- внешняя
  обработка 1С для создания metadata-query corpus.
- [tooling/real-constructor/README.md](../../../tooling/real-constructor/README.md) --
  необязательная операционная инструкция для tooling `real-constructor` и
  среды разработки с кластером 1С.

## 🗂️ История

[history/](../README.md) содержит завершённые фазовые отчёты, аудит и прежние
спецификации и планы. Это доказательная база для исследований, но не инструкция
для текущей разработки и не backlog.
