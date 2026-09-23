/**
 * FROZEN REFERENCE, test/tooling only — not shipped, not used by the extension.
 *
 * The flat alias lookup hover/completion used before the semantic-core
 * roadmap (v0.1.33-era logic, previously `src/core/query/findAliasTable.ts`).
 * Production now resolves aliases only via position-aware `resolveAliasAt`
 * (`src/core/semantic/resolveAliasAt.ts`); this copy stays solely as the
 * fixed baseline the corpus shadow-mode sweep (`shadowMode.ts` next to it,
 * `test/fixtures/corpus/shadow-mode-baseline.json`) compares against, so any
 * change in `resolveAliasAt`'s results over the golden corpus still shows up
 * as a reviewable diff. Do not "fix" it: its value is that it never changes.
 *
 * Searches ALL tables in the whole batch at once (every union branch, every
 * subquery), first match wins — position-blind, no real scope tree.
 */
import { parseBatch } from '../../src/core/query/sdblParser';
import type { BatchDocument } from '../../src/core/query/batchModel';
import type { QueryDocument } from '../../src/core/query/unionModel';
import type { QueryModel, SelectedTable } from '../../src/core/query/queryModel';
import { defaultTableAlias } from '../../src/core/query/queryModel';
import type { MetadataResolver } from '../../src/core/query/metadataResolver';
import type { MetaTable } from '../../src/core/metadata/types';
import { repairSelectListsForRecovery } from '../../src/core/query/selectListRepair';

function collectAllTables(doc: BatchDocument): SelectedTable[] {
  const out: SelectedTable[] = [];
  const walkModel = (model: QueryModel): void => {
    for (const t of model.tables) {
      out.push(t);
      if (t.subquery) walkDocument(t.subquery);
    }
  };
  const walkDocument = (qdoc: QueryDocument): void => {
    for (const member of qdoc.members) walkModel(member.model);
  };
  for (const member of doc.members) walkDocument(member);
  return out;
}

/**
 * Розбирає `queryText` і знаходить таблицю, на яку посилається псевдонім `alias`
 * (голова ланцюжка) — спільна частина для `describeChain` і
 * `resolveCompletionTarget`. `meta: undefined` у результаті означає "псевдонім
 * реально резолвиться до таблиці за іменем, але метаданих для неї немає" —
 * ВІДРІЗНЯЄТЬСЯ від "псевдонім взагалі не знайдено" (`undefined` результат
 * цілком) — виклики, яким ця різниця не потрібна (наприклад, автодоповнення),
 * просто трактують обидва випадки як "нічого запропонувати".
 */
export function findAliasTable(
  queryText: string,
  resolver: MetadataResolver,
  alias: string
): { table: SelectedTable; meta: MetaTable | undefined } | undefined {
  let doc: BatchDocument;
  try {
    doc = parseBatch(queryText, resolver);
  } catch {
    // Основний розбір провалився — ймовірно, через незавершений/ламкий SELECT-
    // список ПІД ЧАС редагування (див. repairSelectListsForRecovery). Пробуємо
    // ще раз без нього: нам потрібен лише блок ИЗ, не самі поля.
    try {
      const repaired = repairSelectListsForRecovery(queryText);
      if (repaired === undefined) return undefined;
      doc = parseBatch(repaired, resolver);
    } catch {
      return undefined;
    }
  }

  const head = alias.toUpperCase();
  const table = collectAllTables(doc).find(t => defaultTableAlias(t).toUpperCase() === head);
  if (!table || table.subquery || !table.fullName || table.fullName.startsWith('&')) return undefined;

  return { table, meta: resolver.tableByFullName(table.fullName) };
}
