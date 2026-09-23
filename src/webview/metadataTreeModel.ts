import type { MetaField, MetaTable, TableKind } from '../core/metadata/types';
import { t, type MessageKey } from './i18n';

/**
 * Metadata tree grouping and search model shared by the Classic tree
 * (`components/DbTreePanel.tsx`) and the Canvas Source Browser
 * (`webview-canvas/components/MetadataTree.tsx`). Both trees must group, search
 * and highlight the same way; each component only renders.
 */

/** Top-level metadata kinds shown as tree groups, in display order (real 1C taxonomy). */
export const GROUP_KINDS: TableKind[] = [
  'Справочник', 'Документ',
  'ПланОбмена', 'ПланВидовХарактеристик', 'ПланСчетов', 'ПланВидовРасчета',
  'БизнесПроцесс', 'Задача',
  'РегистрСведений', 'РегистрНакопления', 'РегистрБухгалтерии', 'РегистрРасчета',
  'Последовательность', 'ЖурналДокументов', 'КритерийОтбора',
  'Константа', 'Перечисление',
];

/** i18n key (`src/webview/i18n`) of each group's human label. */
export const GROUP_LABEL_KEYS: Record<string, MessageKey> = {
  'Справочник': 'tree.catalogs',
  'Документ': 'tree.documents',
  'ПланОбмена': 'tree.exchangePlans',
  'ПланВидовХарактеристик': 'tree.characteristicPlans',
  'ПланСчетов': 'tree.accountsPlans',
  'ПланВидовРасчета': 'tree.calculationPlans',
  'БизнесПроцесс': 'tree.businessProcesses',
  'Задача': 'tree.tasks',
  'РегистрСведений': 'tree.informationRegisters',
  'РегистрНакопления': 'tree.accumulationRegisters',
  'РегистрБухгалтерии': 'tree.accountingRegisters',
  'РегистрРасчета': 'tree.calculationRegisters',
  'Последовательность': 'tree.sequences',
  'ЖурналДокументов': 'tree.documentJournals',
  'КритерийОтбора': 'tree.filterCriteria',
  'Константа': 'tree.constants',
  'Перечисление': 'tree.enums',
};

/** Human label of a metadata kind (group name), or the kind itself when it is not a tree group. */
export function groupLabel(kind: string): string {
  const key = GROUP_LABEL_KEYS[kind];
  return key ? t(key) : kind;
}

/** Разбивает строку поиска на отдельные ключевые слова («расчет эффектив» → ['расчет','эффектив']) —
 * каждое слово должно найтись где-то в таблице (в её названии или названиях полей), но не обязательно
 * рядом друг с другом и не обязательно в одном и том же слове/поле. */
export function tokenizeSearch(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

function textMatchesToken(text: string, token: string): boolean {
  return text.toLowerCase().includes(token);
}

function textMatchesAllTokens(text: string, tokens: string[]): boolean {
  const lower = text.toLowerCase();
  return tokens.every(tok => lower.includes(tok));
}

/** ВНИМАНИЕ: ищет только среди уже загруженных полей (собственные поля таблицы
 * и её табличных частей) — вложенные поля справочных полей подгружаются лениво
 * по клику, поэтому в поиск не попадают.
 *
 * Кэшируется по ссылке на таблицу — на реальных конфигурациях (сотни таблиц,
 * тысячи полей) пересборка этой строки на каждое нажатие клавиши заметно
 * тормозила ввод; объект метаданных таблицы не меняется, пока не перезагрузят
 * метаданные целиком, поэтому WeakMap безопасен. */
const tableCorpusCache = new WeakMap<MetaTable, string>();
function tableCorpus(table: MetaTable): string {
  const cached = tableCorpusCache.get(table);
  if (cached !== undefined) return cached;
  const parts = [table.name, ...table.fields.map(f => f.name)];
  for (const ts of table.tabularSections ?? []) {
    parts.push(ts.name, ...ts.fields.map(f => f.name));
  }
  const corpus = parts.join(' ').toLowerCase();
  tableCorpusCache.set(table, corpus);
  return corpus;
}

export function tableMatchesQuery(table: MetaTable, tokens: string[]): boolean {
  const corpus = tableCorpus(table);
  return tokens.every(tok => corpus.includes(tok));
}

/** Merged, sorted `[start, end)` ranges of every token occurrence in `text` (for `<mark>` highlighting). */
export function highlightRanges(text: string, tokens: string[]): Array<[number, number]> {
  if (tokens.length === 0) return [];
  const lower = text.toLowerCase();
  const ranges: Array<[number, number]> = [];
  for (const tok of tokens) {
    let from = 0;
    while (true) {
      const idx = lower.indexOf(tok, from);
      if (idx === -1) break;
      ranges.push([idx, idx + tok.length]);
      from = idx + tok.length;
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push(r);
  }
  return merged;
}

/** Одно уже отфильтрованное (при активном поиске) поле, готовое к отрисовке. */
export interface RenderField {
  field: MetaField;
  key: string;
}
export interface RenderTs {
  ts: MetaTable;
  key: string;
  fields: RenderField[];
}
export interface RenderTable {
  table: MetaTable;
  key: string;
  fields: RenderField[];
  tabularSections: RenderTs[];
}
export interface RenderGroup {
  kind: TableKind;
  tables: RenderTable[];
}

/**
 * Единая модель фильтрации дерева под поиск — считается один раз за рендер и
 * используется и для отрисовки, и для сбора списка результатов (навигация
 * вперёд/назад), чтобы обе части не могли разойтись между собой.
 */
export function buildRenderModel(topLevelTables: MetaTable[], tokens: string[], isSearching: boolean): RenderGroup[] {
  return GROUP_KINDS.map(kind => {
    const groupAll = topLevelTables.filter(tb => tb.kind === kind);
    const groupTables = isSearching ? groupAll.filter(tb => tableMatchesQuery(tb, tokens)) : groupAll;
    const tables: RenderTable[] = groupTables.map(table => {
      const nameMatches = isSearching && textMatchesAllTokens(table.name, tokens);
      const fields: RenderField[] = (isSearching
        ? table.fields.filter(f => nameMatches || tokens.some(tok => textMatchesToken(f.name, tok)))
        : table.fields
      ).map(field => ({ field, key: `${table.fullName}#${field.name}` }));
      const tabularSections: RenderTs[] = (table.tabularSections ?? [])
        .filter(ts => !isSearching || nameMatches || textMatchesAllTokens(ts.name, tokens) || ts.fields.some(f => tokens.some(tok => textMatchesToken(f.name, tok))))
        .map(ts => {
          const tsNameMatches = isSearching && textMatchesAllTokens(ts.name, tokens);
          const showAll = nameMatches || tsNameMatches;
          const tsFields: RenderField[] = (isSearching
            ? ts.fields.filter(f => showAll || tokens.some(tok => textMatchesToken(f.name, tok)))
            : ts.fields
          ).map(field => ({ field, key: `${ts.fullName}#${field.name}` }));
          return { ts, key: ts.fullName, fields: tsFields };
        });
      return { table, key: table.fullName, fields, tabularSections };
    });
    return { kind, tables };
  });
}

/** Плоский упорядоченный список ключей результатов (в том же порядке, в каком они отрисованы) —
 * по нему работают кнопки «следующий/предыдущий результат» и счётчик. Гранулярность — таблица/
 * документ целиком (а не каждое совпавшее поле внутри неё по отдельности): если хоть что-то в
 * таблице совпало (имя или любое из её полей), в списке результатов она одна. */
export function collectMatchKeys(groups: RenderGroup[]): string[] {
  const keys: string[] = [];
  for (const g of groups) {
    for (const tb of g.tables) keys.push(tb.key);
  }
  return keys;
}
