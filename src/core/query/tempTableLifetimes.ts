import { compoundCarrierOf, type QueryDocument } from './unionModel';

/** Package positions only; column schemas belong to the consumer adapters. */
export interface TempTableLifetime {
  name: string;
  createIndex: number;
  appendIndices: number[];
  dropIndex: number | null;
}

/**
 * A creator is invisible to itself; a drop still sees the table it removes.
 * The latest preceding create shadows older schemas even after it is dropped.
 */
export function newestLifetimeAt<T extends TempTableLifetime>(
  list: readonly T[] | undefined,
  statementIndex: number,
): T | undefined {
  if (!list) return undefined;
  for (let i = list.length - 1; i >= 0; i--) {
    const lifetime = list[i];
    if (lifetime.createIndex >= statementIndex) continue;
    return lifetime.dropIndex === null || lifetime.dropIndex >= statementIndex ? lifetime : undefined;
  }
  return undefined;
}

/**
 * Advance after parsing/observing a statement. The caller reads the registry
 * before this call, so a creator cannot see itself and a drop sees its target.
 * Payloads belong to adapters; even an unknown schema must have an entry.
 * Returns the affected entry, including the entry removed by a drop.
 */
export function advanceTempTableRegistry<T>(
  active: Map<string, T>,
  doc: QueryDocument,
  create: (name: string) => T,
): T | undefined {
  const { queryType, tempTableName } = compoundCarrierOf(doc);
  if (!tempTableName) return undefined;
  const key = tempTableName.toUpperCase();
  if (queryType === 'createTemp') {
    const entry = create(tempTableName);
    active.set(key, entry);
    return entry;
  }
  if (queryType !== 'appendTemp' && queryType !== 'dropTemp') return undefined;
  const entry = active.get(key);
  if (queryType === 'dropTemp') active.delete(key);
  return entry;
}

/**
 * Shared package lifecycle, driven by the same transitions as the parser.
 * Each create owns its schema; append does not replace it. Orphan append/drop
 * creates no lifetime. Repeated create without drop is platform-invalid; editor
 * recovery shadows the older lifetime permanently instead of reviving it later.
 */
export function deriveTempTableLifetimePositions(members: readonly QueryDocument[]): Map<string, TempTableLifetime[]> {
  const byName = new Map<string, TempTableLifetime[]>();
  const active = new Map<string, TempTableLifetime>();
  members.forEach((doc, statementIndex) => {
    const lifetime = advanceTempTableRegistry(active, doc, name => {
      const created: TempTableLifetime = {
        name, createIndex: statementIndex, appendIndices: [], dropIndex: null,
      };
      const upper = name.toUpperCase();
      const list = byName.get(upper);
      if (list) list.push(created);
      else byName.set(upper, [created]);
      return created;
    });
    if (!lifetime) return;
    const { queryType } = compoundCarrierOf(doc);
    if (queryType === 'appendTemp') lifetime.appendIndices.push(statementIndex);
    else if (queryType === 'dropTemp') lifetime.dropIndex = statementIndex;
  });
  return byName;
}
