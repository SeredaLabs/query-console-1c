/**
 * Position-aware semantic model for package temporary tables.
 *
 * A temp table is visible only to statements after its `ПОМЕСТИТЬ`, remains
 * visible through `ДОБАВИТЬ`, disappears after `УНИЧТОЖИТЬ`, and a later
 * `ПОМЕСТИТЬ` with the same name starts an independent lifetime/schema.
 *
 * This module deliberately infers only output column names. Their types are
 * unknown (`types: []`), so consumers may resolve a positive field-name match
 * but must not guess reference navigation. An unresolved `*` makes the schema
 * incomplete; negative validation is safe only when `complete === true`.
 */
import type { MetaField, MetaTable } from '../metadata/types';
import type { BatchDocument } from './batchModel';
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

export interface TempTableLifetime {
  name: string;
  createIndex: number;
  appendIndices: number[];
  dropIndex: number | null;
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

  const openAt = (upperName: string, statementIndex: number): TempTableLifetime | undefined =>
    newestLifetimeAt(byName.get(upperName), statementIndex);

  for (let statementIndex = 0; statementIndex < batch.members.length; statementIndex++) {
    const doc = batch.members[statementIndex];
    const carrier = compoundCarrierOf(doc);
    if (!carrier.tempTableName) continue;
    const upperName = carrier.tempTableName.toUpperCase();

    if (carrier.queryType === 'createTemp') {
      const schema = inferCreatedTempTableSchema(doc);
      if (!schema) continue;
      const lifetime: TempTableLifetime = {
        name: carrier.tempTableName,
        createIndex: statementIndex,
        appendIndices: [],
        dropIndex: null,
        schema,
      };
      const list = byName.get(upperName);
      if (list) list.push(lifetime);
      else byName.set(upperName, [lifetime]);
    } else if (carrier.queryType === 'appendTemp') {
      openAt(upperName, statementIndex)?.appendIndices.push(statementIndex);
    } else if (carrier.queryType === 'dropTemp') {
      const lifetime = openAt(upperName, statementIndex);
      if (lifetime) lifetime.dropIndex = statementIndex;
    }
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

/** The newest lifetime created before `statementIndex` and not yet dropped. */
function newestLifetimeAt(
  list: readonly TempTableLifetime[] | undefined,
  statementIndex: number,
): TempTableLifetime | undefined {
  if (!list) return undefined;
  for (let i = list.length - 1; i >= 0; i--) {
    const lifetime = list[i];
    if (
      lifetime.createIndex < statementIndex &&
      (lifetime.dropIndex === null || lifetime.dropIndex >= statementIndex)
    ) {
      return lifetime;
    }
  }
  return undefined;
}
