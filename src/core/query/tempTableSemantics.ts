/**
 * Position-aware semantic model for package temporary tables.
 *
 * A temp table is visible only to statements after its `ПОМЕСТИТЬ`, remains
 * visible through `ДОБАВИТЬ`, disappears after `УНИЧТОЖИТЬ`, and a later
 * `ПОМЕСТИТЬ` with the same name starts an independent lifetime/schema.
 *
 * This module deliberately infers only output column names. Their types are
 * unknown (`types: []`), so consumers may resolve a positive field-name match
 * but must not guess reference navigation. An unresolved `*` or a structurally
 * invalid column expression makes the schema incomplete; negative validation
 * is safe only when `complete === true`.
 */
import type { MetaField, MetaTable } from '../metadata/types';
import type { BatchDocument } from './batchModel';
import { deriveTempTableLifetimePositions, newestLifetimeAt, type TempTableLifetime as LifetimePositions } from './tempTableLifetimes';
import { isStructurallyValidExpression } from './expressionSyntaxCheck';
import {
  compoundCarrierOf,
  elementAlias,
  orderedSelectElements,
  type QueryDocument,
} from './unionModel';

export interface TempTableSchema {
  table: MetaTable;
  /** Every output column name is known; safe for negative field validation. */
  complete: boolean;
}

export interface TempTableLifetime extends LifetimePositions {
  schema: TempTableSchema;
}

export type TempTableLifetimes = ReadonlyMap<string, readonly TempTableLifetime[]>;

/** Infer the result column names of a `ПОМЕСТИТЬ` compound query. */
export function inferCreatedTempTableSchema(doc: QueryDocument): TempTableSchema | undefined {
  const carrier = compoundCarrierOf(doc);
  if (carrier.queryType !== 'createTemp' || !carrier.tempTableName) return undefined;

  // UNION result names are defined by its first member.
  const head = doc.members[0]?.model;
  if (!head) return undefined;
  const elements = orderedSelectElements(head);
  const fields: MetaField[] = [];
  const seen = new Set<string>();
  let complete = elements.length > 0;

  for (const element of elements) {
    const unresolvedStar = element.kind === 'field' && (
      element.field.path === '*' ||
      /(?:^|\.)\*$/u.test(element.field.expression?.trim() ?? '')
    );
    if (unresolvedStar) {
      complete = false;
      continue;
    }
    const baseAlias = elementAlias(element, head);
    // An unexpanded star proves that the parser did not know the complete
    // producer shape. Keep any positive columns we do know, but never use this
    // schema to report a missing-field diagnostic or a complete suggestion set.
    if (!baseAlias || baseAlias === '*') {
      complete = false;
      continue;
    }
    // The tolerant parser keeps unfinished text (`ВЫБОР КОГДА Т.Код`) as a raw
    // expression with an auto alias; it may even have swallowed later columns.
    // Keep the column name (the parser and designer derive the same one), but
    // the schema no longer proves which columns are missing.
    if (
      element.kind === 'field' &&
      element.field.expression !== undefined &&
      !isStructurallyValidExpression(element.field.expression)
    ) {
      complete = false;
    }
    let alias = baseAlias;
    let suffix = 0;
    while (seen.has(alias.toUpperCase())) alias = `${baseAlias}${++suffix}`;
    seen.add(alias.toUpperCase());
    fields.push({ name: alias, kind: 'attribute', types: [] });
  }

  return {
    complete,
    table: {
      kind: 'ВременнаяТаблица',
      name: carrier.tempTableName,
      fullName: carrier.tempTableName,
      fields,
    },
  };
}

/** Build every create/append/drop lifetime in package order. */
export function deriveTempTableLifetimes(batch: BatchDocument): TempTableLifetimes {
  const byName = new Map<string, TempTableLifetime[]>();
  for (const [name, positions] of deriveTempTableLifetimePositions(batch.members)) {
    const lifetimes: TempTableLifetime[] = [];
    for (const lifetime of positions) {
      const schema = inferCreatedTempTableSchema(batch.members[lifetime.createIndex]);
      if (schema) lifetimes.push({ ...lifetime, schema });
    }
    if (lifetimes.length) byName.set(name, lifetimes);
  }
  return byName;
}

/** Resolve the newest lifetime visible at one package statement. */
export function visibleTempTableAt(
  lifetimes: TempTableLifetimes,
  statementIndex: number,
  fullName: string,
): TempTableSchema | undefined {
  return newestLifetimeAt(lifetimes.get(fullName.toUpperCase()), statementIndex)?.schema;
}
