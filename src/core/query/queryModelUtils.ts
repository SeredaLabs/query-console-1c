/**
 * Model-level query utilities — операции над `QueryModel`, не относящиеся к
 * генерации SDBL-текста (не переотрисовывают выражения, не форматируют). Раньше
 * жили в `sdblGenerator.ts` и импортировались оттуда `qualifyBareFields.ts`,
 * `unionModel.ts`, `queryAnalysisService.ts` — что создавало два circular import
 * (`sdblGenerator ↔ unionModel`, `sdblParser → qualifyBareFields → sdblGenerator →
 * sdblParser`), разорванных ad hoc injection-хуком (`setSubqueryParser`). Этот
 * модуль — общий leaf owner: зависит только от `queryModel.ts`, ничего не
 * импортирует из `sdblGenerator`/`sdblParser`/`unionModel`/UI/semantic-слоя.
 *
 * `fieldExpr` сюда НЕ перенесён: содержит generation-specific форматирование
 * (`formatSelectExpression` → `exprFormatter`) и остаётся в `sdblGenerator.ts`.
 */
import type { QueryModel, SelectedTable, SelectedField } from './queryModel';
import { defaultTableAlias } from './queryModel';

/**
 * Карта псевдонимов источников `tableId → alias`: явный `SelectedTable.alias`,
 * иначе `defaultTableAlias` с дедупликацией числовым суффиксом при коллизии
 * (порядок — как в `tables`). Единый источник правды для генератора (`generate`,
 * секции УПОРЯДОЧИТЬ/ИТОГИ), `qualifyBareFields` (квалификация голых полей) и
 * read-only анализа (`queryAnalysisService`).
 */
export function resolveAliases(tables: SelectedTable[]): Map<string, string> {
  const seen = new Set<string>();
  const result = new Map<string, string>();
  for (const t of tables) {
    const base = defaultTableAlias(t);
    let alias = base;
    let counter = 1;
    while (seen.has(alias)) {
      alias = base + counter;
      counter++;
    }
    seen.add(alias);
    result.set(t.id, alias);
  }
  return result;
}

/** Источник — прямая проекция табличной части (3+ сегмента полного имени, не подзапрос/виртуальная таблица). */
export function isTabularSectionSource(t: SelectedTable | undefined): boolean {
  if (!t || t.subquery || t.virtual) return false;
  return t.fullName.split('.').length >= 3;
}

/**
 * Автопсевдоним квалифицированного поля `<alias>.<path>` без явного `КАК`.
 * Конструктор 1С склеивает ВСЕ сегменты пути (`Родитель.Имя` → `РодительИмя`),
 * предварительно отбрасывая ведущий `Ссылка` у источника-ТЧ (где `Ссылка` —
 * навигация к владельцу; `Ссылка.Контрагент` → `Контрагент`). У справочника/
 * регистра ведущий `Ссылка` сохраняется (`Ссылка.Наименование` →
 * `СсылкаНаименование`). Голое (неквалифицированное) поле сюда не попадает —
 * ему даётся последний сегмент.
 */
export function qualifiedAutoAlias(path: string, tabularSource: boolean): string {
  let segs = path.split('.');
  if (tabularSource && segs.length > 1 && segs[0].toUpperCase() === 'ССЫЛКА') {
    segs = segs.slice(1);
  }
  return segs.join('');
}

/**
 * Синтезированный автопсевдоним простого поля выборки без явного `КАК`, как его
 * ставит конструктор 1С. Квалифицированному полю (`Алиас.Путь`) — склейка
 * сегментов (с отбрасыванием ведущего `Ссылка` у ТЧ), голому — последний сегмент.
 * Источник поля определяется по `model.tables`. Единая точка правды для
 * генератора (`fieldLine`), выравнивания колонок объединения (`unionModel`) и
 * read-only анализа (`queryAnalysisService`).
 */
export function synthesizedFieldAlias(model: QueryModel, field: SelectedField): string {
  if (field.qualified) {
    // Нерезолвимая навигация по источнику-ВТ: автопсевдоним = ПОЛНЫЙ точечный путь
    // дословно (`СтавкаНДС.Перечисление`), без склейки сегментов (фаза 6.18, парсер
    // `markDottedAutoAlias`).
    if (field.autoAliasDotted) return field.path;
    const t = model.tables.find(tb => tb.id === field.tableId);
    return qualifiedAutoAlias(field.path, isTabularSectionSource(t));
  }
  return field.path.split('.').pop() ?? field.path;
}

/**
 * Ключевое слово соединения по галочкам «Все». Конструктор 1С сохраняет ПРАВОЕ
 * соединение как есть (не нормализует перестановкой в ЛЕВОЕ). Единая точка правды
 * для генератора и read-only анализа (`queryAnalysisService`) — раньше
 * `queryAnalysisService.ts` держал приватную копию этой же 4-строчной логики,
 * т.к. не мог импортировать её из `sdblGenerator.ts` без цикла.
 */
export function joinKeyword(leftAll: boolean, rightAll: boolean): 'ЛЕВОЕ' | 'ПРАВОЕ' | 'ПОЛНОЕ' | 'ВНУТРЕННЕЕ' {
  if (leftAll && rightAll) return 'ПОЛНОЕ';
  if (leftAll && !rightAll) return 'ЛЕВОЕ';
  if (!leftAll && rightAll) return 'ПРАВОЕ';
  return 'ВНУТРЕННЕЕ';
}
