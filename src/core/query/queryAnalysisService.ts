import type { MetadataResolver } from './metadataResolver';
import { tryOpenBatch } from './validateBatch';
import { resolveAliases, fieldExpr, synthesizedFieldAlias } from './sdblGenerator';
import { extractQueryParamNames } from './resultProcessingTemplate';
import type { QueryModel, Condition } from './queryModel';

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

export interface QueryAnalysisResult {
  diagnostics: QueryDiagnostic[];
  fields: QueryAnalysisField[];
  sources: QueryAnalysisSource[];
  joins: QueryAnalysisJoin[];
  conditions: QueryAnalysisCondition[];
  parameters: QueryAnalysisParameter[];
}

const EMPTY_RESULT: QueryAnalysisResult = {
  diagnostics: [], fields: [], sources: [], joins: [], conditions: [], parameters: [],
};

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

/**
 * Единая точка правды для read-only анализа текста запроса — панели «Структура»/
 * «Параметры» и статус-бар окна «Текст запроса» (design-док, разделы 7-10, 14).
 * ОБЯЗАНА идти через тот же `tryOpenBatch`, что и реальный `Применить`
 * (`ConstructorView.handleApplyQueryEdit`) — никакого параллельного разбора,
 * иначе результат может разойтись с тем, что реально сделает Apply (design-док,
 * риск п.0.2/0.14 — самый важный пункт этой задачи).
 *
 * v1: показывает МОДЕЛЬ первого запроса пакета / первой ветви объединения
 * (`BatchDocument.members[0].members[0].model`) — пакеты из нескольких запросов и
 * ОБЪЕДИНЕНИЕ построчно в структуре пока не разворачиваются (сам факт синтаксической/
 * семантической корректности при этом учитывает документ целиком — см. `tryOpenBatch`).
 * Параметры извлекаются регэкспом по СЫРОМУ тексту (`extractQueryParamNames`, уже
 * применяется в resultProcessingTemplate.ts), а не по одним лишь `Condition.param` —
 * так учитываются и параметры в произвольных выражениях/условиях связи/виртуальных
 * таблицах, а не только в простых условиях ГДЕ.
 */
export function analyze(text: string, resolver?: MetadataResolver): QueryAnalysisResult {
  const r = tryOpenBatch(text, resolver);
  if (!r.ok) {
    return { ...EMPTY_RESULT, diagnostics: [{ message: r.error }] };
  }

  const model: QueryModel | undefined = r.doc.members[0]?.members[0]?.model;
  if (!model) return EMPTY_RESULT;

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

  const parameters: QueryAnalysisParameter[] = extractQueryParamNames(text).map(name => ({
    name,
    usageCount: (text.match(new RegExp(`&${name}(?![\\p{L}\\p{N}_])`, 'gu')) ?? []).length,
  }));

  return { diagnostics: [], fields, sources, joins, conditions, parameters };
}
