/**
 * Moved from `src/extension/hoverFieldInfo.ts` (v0.1.33-era logic) into
 * `src/core/query` so the semantic-core roadmap's shadow-mode harness
 * (`src/core/semantic/shadowMode.ts`, memory: project-semantic-core-roadmap,
 * Phase 3b) can compare `resolveAliasAt`'s position-aware resolution against
 * this EXACT production algorithm, without `src/core/semantic` importing
 * from `src/extension` (core must not depend on the extension layer — the
 * same reasoning that already moved `repairSelectListsForRecovery` here).
 * Behavior unchanged from the original; `hoverFieldInfo.ts` now imports it
 * from here instead of defining it locally.
 *
 * KNOWN LIMITATION (documented, not hidden — see `docs/development/known-issues.md`
 * and `docs/{en,ru,uk}/limitations.md`): searches ALL tables in the whole
 * batch at once (every union branch, every subquery), first match wins —
 * position-blind, no real scope tree. `resolveAliasAt`
 * (`src/core/semantic/resolveAliasAt.ts`) is the position-aware replacement
 * this limitation motivated; this function stays exactly as-is so
 * shadow-mode has a stable, unmodified baseline to compare against.
 */
import { parseBatch } from './sdblParser';
import type { BatchDocument } from './batchModel';
import type { QueryDocument } from './unionModel';
import type { QueryModel, SelectedTable } from './queryModel';
import { defaultTableAlias } from './queryModel';
import type { MetadataResolver } from './metadataResolver';
import type { MetaTable } from '../metadata/types';
import { repairSelectListsForRecovery } from './selectListRepair';

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
    const repaired = repairSelectListsForRecovery(queryText);
    if (repaired === undefined) return undefined;
    try {
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
