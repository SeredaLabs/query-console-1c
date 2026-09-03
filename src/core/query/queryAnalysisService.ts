import type { MetadataResolver } from './metadataResolver';
import { tryOpenBatch } from './validateBatch';
import { resolveAliases, fieldExpr, synthesizedFieldAlias } from './sdblGenerator';
import { extractQueryParamNames } from './resultProcessingTemplate';
import { getBatchStatementSpans } from './sdblParser';
import type { QueryModel, Condition } from './queryModel';

/** Диапазон в СЫРОМ тексте запроса — см. `getBatchStatementSpans`. */
export interface TextRange {
  start: number;
  end: number;
}

/** Общая сигнатура навигации «клик по элементу структуры/параметру → место в
 * тексте» для `QueryStructurePanel`/`QueryParametersPanel` (design-док, риск п.0.3).
 * `range`, если задан, ограничивает поиск СВОИМ `;`-блоком (см. `QueryAnalysisQuery.
 * textRange`) — параметры (общие для всего пакета) его не передают, поля/источники/
 * соединения/условия (у каждых свой `;`-блок) передают. */
export type NavigateFn = (searchText: string, range?: TextRange) => void;

export interface QueryDiagnostic {
  message: string;
  line?: number;
  col?: number;
}

export interface QueryAnalysisField {
  alias: string;
  expression: string;
}

export interface QueryAnalysisSource {
  alias: string;
  fullName: string;
}

export interface QueryAnalysisJoin {
  /** Русское ключевое слово соединения, как в тексте запроса. */
  keyword: 'ЛЕВОЕ' | 'ПРАВОЕ' | 'ПОЛНОЕ' | 'ВНУТРЕННЕЕ';
  leftAlias: string;
  rightAlias: string;
}

export interface QueryAnalysisCondition {
  text: string;
}

export interface QueryAnalysisParameter {
  name: string;
  usageCount: number;
}

/**
 * Один разбираемый запрос внутри документа: один `;`-блок пакета × одна ветвь
 * `ОБЪЕДИНИТЬ` внутри него (design-док, риск п.0.3 продолжение — реальные пакетные
 * запросы 1С обычно состоят из нескольких `ПОМЕСТИТЬ ВТ_…` блоков, и показ только
 * первого из них вводил в заблуждение — таблица/поля/условия относились к ОДНОМУ
 * временному блоку, а не ко всему запросу).
 */
export interface QueryAnalysisQuery {
  /** Имя временной таблицы (`ПОМЕСТИТЬ`/`ДОБАВИТЬ ВТ_Имя`), если она есть — иначе
   * порядковое имя запроса пакета/ветви объединения («Запрос 2»). */
  name: string;
  /** Диапазон СВОЕГО `;`-блока в исходном тексте — навигация «клик → текст» ищет
   * ТОЛЬКО внутри него, а не по всему пакету (иначе клик по полю «Результата» мог бы
   * подсветить одноимённое поле в чужом временном блоке). `undefined`, только если
   * границы блока не удалось определить (число блоков разошлось с числом диапазонов —
   * не должно происходить, но навигация в этом случае просто ищет по всему тексту). */
  textRange?: TextRange;
  fields: QueryAnalysisField[];
  sources: QueryAnalysisSource[];
  joins: QueryAnalysisJoin[];
  conditions: QueryAnalysisCondition[];
}

export interface QueryAnalysisResult {
  diagnostics: QueryDiagnostic[];
  /** Последний запрос всего пакета — то, что `Запрос.Выполнить()` реально возвращает
   * вызывающему коду. `null` только если документ пуст (пустой текст/только пробелы). */
  result: QueryAnalysisQuery | null;
  /** Промежуточные `ПОМЕСТИТЬ`/`ДОБАВИТЬ ВТ_…` блоки — в порядке появления в тексте,
   * НЕ то, что запрос возвращает, а то, как он вычисляется (design-док риск п.0.3:
   * пользователь явно попросил различать «результат» от «временных таблиц»). */
  tempTables: QueryAnalysisQuery[];
  parameters: QueryAnalysisParameter[];
}

const EMPTY_RESULT: QueryAnalysisResult = { diagnostics: [], result: null, tempTables: [], parameters: [] };

/**
 * Зеркало приватной `joinKeyword` из sdblGenerator.ts (не экспортирована оттуда).
 * Та же тривиальная 4-строчная логика на основе leftAll/rightAll — дублировать
 * безопаснее, чем менять генератор ради экспорта (см. design-док, раздел 21.1:
 * sdblGenerator.ts — файл, которого эта задача не трогает).
 */
function joinKeyword(leftAll: boolean, rightAll: boolean): QueryAnalysisJoin['keyword'] {
  if (leftAll && rightAll) return 'ПОЛНОЕ';
  if (leftAll && !rightAll) return 'ЛЕВОЕ';
  if (!leftAll && rightAll) return 'ПРАВОЕ';
  return 'ВНУТРЕННЕЕ';
}

/**
 * Лучшее из возможного извлечение позиции ошибки из готового текста сообщения —
 * синтаксическая (`sdblLexer`/`sdblParser`: «Ошибка разбора 5:2 — …») и семантическая
 * (`semanticValidator`: «{(5, 2)}: Таблица не найдена…») ошибки форматируют позицию
 * по-разному, единого структурированного объекта ошибки эти модули не отдают (см.
 * design-док, раздел 21.1 — их трогать нельзя). Если ни один формат не совпал —
 * `undefined`, вызывающая сторона показывает сообщение без точной позиции (раздел 6
 * design-дока: маркер — «если возможно», не обязательное условие).
 */
function parseErrorPosition(message: string): { line?: number; col?: number } {
  const syntax = message.match(/Ошибка разбора (\d+):(\d+)/);
  if (syntax) return { line: Number(syntax[1]), col: Number(syntax[2]) };
  const semantic = message.match(/\{\((\d+),\s*(\d+)\)\}/);
  if (semantic) return { line: Number(semantic[1]), col: Number(semantic[2]) };
  return {};
}

/** Человекочитаемый текст условия — только для отображения в панели «Структура»,
 * не претендует на байт-в-байт совпадение с тем, что напечатал бы генератор. */
function conditionText(c: Condition, aliases: Map<string, string>): string {
  if (c.custom || c.expression != null) return c.expression ?? '';
  const alias = c.tableId ? aliases.get(c.tableId) ?? c.tableId : '';
  const lhs = c.path ? `${alias}.${c.path}` : alias;
  const op = c.operator ?? '=';
  const rhs = c.param ?? (c.path ? `&${c.path.split('.').pop()}` : '');
  return `${lhs} ${op} ${rhs}`;
}

/** Разбор ОДНОЙ модели (один `;`-блок пакета × одна ветвь `ОБЪЕДИНИТЬ`) в
 * отображаемые поля/источники/соединения/условия — без параметров и диагностики,
 * те считаются один раз для документа целиком (см. `analyze`). */
function analyzeModel(model: QueryModel): Omit<QueryAnalysisQuery, 'name'> {
  const aliases = resolveAliases(model.tables);

  const fields: QueryAnalysisField[] = [...model.fields, ...(model.trailingFields ?? [])].map(f => ({
    alias: f.alias ?? synthesizedFieldAlias(model, f),
    expression: fieldExpr(model, f),
  }));

  const sources: QueryAnalysisSource[] = model.tables.map(t => ({
    alias: aliases.get(t.id) ?? t.id,
    fullName: t.fullName,
  }));

  const joins: QueryAnalysisJoin[] = (model.joins ?? []).map(j => ({
    keyword: joinKeyword(j.leftAll, j.rightAll),
    leftAlias: aliases.get(j.leftTableId) ?? j.leftTableId,
    rightAlias: aliases.get(j.rightTableId) ?? j.rightTableId,
  }));

  const conditions: QueryAnalysisCondition[] = (model.conditions ?? []).map(c => ({
    text: conditionText(c, aliases),
  }));

  return { fields, sources, joins, conditions };
}

/**
 * Единая точка правды для read-only анализа текста запроса — панели «Структура»/
 * «Параметры» и статус-бар окна «Текст запроса» (design-док, разделы 7-10, 14).
 * ОБЯЗАНА идти через тот же `tryOpenBatch`, что и реальный `Применить`
 * (`ConstructorView.handleApplyQueryEdit`) — никакого параллельного разбора,
 * иначе результат может разойтись с тем, что реально сделает Apply (design-док,
 * риск п.0.2/0.14 — самый важный пункт этой задачи).
 *
 * Реальные пакетные запросы 1С почти всегда состоят из НЕСКОЛЬКИХ `;`-блоков
 * (`ПОМЕСТИТЬ ВТ_…`) — по факту это порядок ВЫЧИСЛЕНИЯ, а не то, что запрос
 * ВОЗВРАЩАЕТ. Поэтому результат разбит на `result` (последний запрос пакета — то,
 * что реально возвращает `Запрос.Выполнить()`) и `tempTables` (всё остальное, по
 * порядку появления). Имя временной таблицы (`ПОМЕСТИТЬ`/`ДОБАВИТЬ ВТ_Имя`) парсер
 * ставит только на ПЕРВУЮ ветвь `ОБЪЕДИНИТЬ` внутри `;`-блока (проверено — вторая
 * ветвь несёт `tempTableName: undefined`), поэтому имя ищется по ВСЕМ ветвям блока,
 * а не только по текущей — иначе вторая и следующие ветви объединения теряли бы
 * привязку к своей временной таблице в отображаемом имени.
 *
 * Параметры извлекаются регэкспом по СЫРОМУ тексту ЦЕЛИКОМ (`extractQueryParamNames`,
 * уже применяется в resultProcessingTemplate.ts), а не из моделей — так учитываются
 * параметры из ЛЮБОГО `;`-блока и в произвольных выражениях/условиях связи/
 * виртуальных таблицах, а не только простые условия ГДЕ первого блока.
 */
export function analyze(text: string, resolver?: MetadataResolver): QueryAnalysisResult {
  const r = tryOpenBatch(text, resolver);
  if (!r.ok) {
    return { ...EMPTY_RESULT, diagnostics: [{ message: r.error, ...parseErrorPosition(r.error) }] };
  }

  const spans = getBatchStatementSpans(text);
  const spansMatch = spans.length === r.doc.members.length;

  const queries: QueryAnalysisQuery[] = [];
  r.doc.members.forEach((doc, blockIndex) => {
    const textRange = spansMatch ? spans[blockIndex] : undefined;
    const multiUnion = doc.members.length > 1;
    const blockTempName = doc.members.find(m => m.model.tempTableName)?.model.tempTableName;
    for (const member of doc.members) {
      const base = blockTempName ?? `Запрос ${queries.length + 1}`;
      const name = multiUnion ? `${base} · ${member.name}` : base;
      queries.push({ name, textRange, ...analyzeModel(member.model) });
    }
  });

  const parameters: QueryAnalysisParameter[] = extractQueryParamNames(text).map(name => ({
    name,
    usageCount: (text.match(new RegExp(`&${name}(?![\\p{L}\\p{N}_])`, 'gu')) ?? []).length,
  }));

  return {
    diagnostics: [],
    result: queries.length > 0 ? queries[queries.length - 1] : null,
    tempTables: queries.slice(0, -1),
    parameters,
  };
}
