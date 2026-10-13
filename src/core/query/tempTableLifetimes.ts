import { compoundCarrierOf, type QueryDocument } from './unionModel';

/** Package positions only; column schemas belong to the consumer adapters. */
export interface TempTableLifetime {
  name: string;
  createIndex: number;
  appendIndices: number[];
  dropIndex: number | null;
}

/** A creator is invisible to itself; a drop still sees the table it removes. */
export function newestLifetimeAt<T extends TempTableLifetime>(
  list: readonly T[] | undefined,
  statementIndex: number,
): T | undefined {
  if (!list) return undefined;
  for (let i = list.length - 1; i >= 0; i--) {
    const lifetime = list[i];
    if (lifetime.createIndex < statementIndex &&
        (lifetime.dropIndex === null || lifetime.dropIndex >= statementIndex)) return lifetime;
  }
  return undefined;
}

/**
 * Shared Designer/semantic lifecycle. Each create owns its schema; append does
 * not replace it. Orphan append/drop creates no lifetime. Repeated create without
 * drop is platform-invalid: preserve the existing newest-visible lookup, including
 * its fallback to an older still-open lifetime after the newer one is dropped.
 */
export function deriveTempTableLifetimePositions(members: readonly QueryDocument[]): Map<string, TempTableLifetime[]> {
  const byName = new Map<string, TempTableLifetime[]>();
  members.forEach((doc, statementIndex) => {
    const carrier = compoundCarrierOf(doc);
    if (!carrier.tempTableName) return;
    const upper = carrier.tempTableName.toUpperCase();
    if (carrier.queryType === 'createTemp') {
      const lifetime: TempTableLifetime = {
        name: carrier.tempTableName, createIndex: statementIndex, appendIndices: [], dropIndex: null,
      };
      const list = byName.get(upper);
      if (list) list.push(lifetime);
      else byName.set(upper, [lifetime]);
    } else if (carrier.queryType === 'appendTemp') {
      newestLifetimeAt(byName.get(upper), statementIndex)?.appendIndices.push(statementIndex);
    } else if (carrier.queryType === 'dropTemp') {
      const lifetime = newestLifetimeAt(byName.get(upper), statementIndex);
      if (lifetime) lifetime.dropIndex = statementIndex;
    }
  });
  return byName;
}
